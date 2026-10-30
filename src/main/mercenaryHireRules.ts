/**
 * Decides where one seat may hire, from a snapshot alone.
 *
 * Purpose: The hire panel, placement, and the end of the turn share one reading of the board.
 * When to use: Build the context once per snapshot, then evaluate each hex.
 * Expected outcome: A blocked hex has no options and no candidates. A raise option fits the hex's capacity.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../shared/ipc/gameStateTypes';
import type { HireRaiseOption, HireRehireRow } from '../shared/ipc/mercenaryTypes';
import { isHexExploredInSnapshot } from '../shared/fortificationSnapshotRules';
import { unitCostFor } from '../shared/gameRules';
import { isNeutralBorderHex } from '../shared/h3Resolutions';
import {
  HIRE_REASON_NOT_ACTIVE,
  HIRE_REASON_NOT_EXPLORED,
  HIRE_REASON_OTHER_HOME,
  RAISE_REASON_FORTIFIED,
  RAISE_REASON_NO_CAPACITY,
  RAISE_REASON_OCCUPIED,
  isHireableUnitType,
  mercenaryHireFee,
  mercenaryUpkeepFor,
  raiseCapacityForHex,
} from '../shared/mercenaryRules';
import { NEUTRAL_OWNER_ID, type SeatId } from '../shared/seatIds';
import { buildStrategicUnitDisplayLabelResolver } from '../shared/unitDisplayNames';
import { logTrace } from './logger';
import { getAvailableBuildUnitTypes } from './productionRules';
import { techLevelForBirthHex } from './techBonus/techLevelForBirthHex';

/**
 * Lookups built once for one seat's snapshot.
 *
 * Purpose: Evaluating every explored hex must not rebuild unit and home indexes.
 * When to use: `evaluateHexHire` and `listHireEntryHexes`.
 * Expected outcome: The seat, whether it is still in the match, and the maps those functions read.
 * Exceptions: None.
 */
export interface HireContext {
  /**
   * The snapshot the seat can see.
   *
   * Contract: Units the seat cannot see are already absent.
   * When to use: Exploration and the display-name resolver.
   * Expected outcome: The snapshot passed to `buildHireContext`.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * The seat these rules are for.
   *
   * Contract: A seat id. Neutral is never a requester.
   * When to use: Occupancy and home-region checks.
   * Expected outcome: The seat passed to `buildHireContext`.
   * Exceptions: None.
   */
  readonly seatId: SeatId;
  /**
   * Whether this seat is still in the match.
   *
   * Contract: A missing seat list counts every seat that has a home-region entry as active.
   * When to use: The first block check.
   * Expected outcome: False when the seat's `outTurn` is set.
   * Exceptions: None.
   */
  readonly seatActive: boolean;
  /**
   * Whether upkeep uses the advanced tier.
   *
   * Contract: True only when the snapshot says the tech bonus is on.
   * When to use: Pricing a raise or a rehire.
   * Expected outcome: The snapshot flag.
   * Exceptions: None.
   */
  readonly techBonusEnabled: boolean;
  /**
   * Units grouped by the hex they stand on.
   *
   * Contract: Built from the snapshot's units.
   * When to use: Occupancy and rehire candidates.
   * Expected outcome: An empty list for a hex with no units.
   * Exceptions: None.
   */
  readonly unitsByHex: ReadonlyMap<string, readonly GameStateSnapshot['units'][number][]>;
  /**
   * Cargo unit ids aboard each ship.
   *
   * Contract: Built from `embarkedOnNavalUnitId`.
   * When to use: Rejecting a loaded ship and a unit that is aboard one.
   * Expected outcome: Empty when the ship has no cargo in the snapshot.
   * Exceptions: None.
   */
  readonly cargoByShip: ReadonlyMap<string, readonly string[]>;
  /**
   * Controller of each hex, or null when the snapshot names none.
   *
   * Contract: Missing rows are absent from the map.
   * When to use: The fortification check.
   * Expected outcome: The `controllerPlayerId` from strategic control.
   * Exceptions: None.
   */
  readonly controllerByHex: ReadonlyMap<string, string | null>;
  /**
   * City cells, ports, and fortified cells of each hex.
   *
   * Contract: A missing row is treated as zeros by the evaluator.
   * When to use: Capacity and the types a hex can raise.
   * Expected outcome: Counts from strategic infrastructure.
   * Exceptions: None.
   */
  readonly infrastructureByHex: ReadonlyMap<string, HexInfrastructure>;
  /**
   * Hexes in the home region of another seat that is still active.
   *
   * Contract: A knocked-out seat's home is not included.
   * When to use: The other-home block.
   * Expected outcome: The union of those home sets.
   * Exceptions: None.
   */
  readonly otherActiveHomeHexes: ReadonlySet<string>;
  /**
   * Display name of a unit on this snapshot.
   *
   * Contract: The same labels the map uses.
   * When to use: A rehire candidate's row.
   * Expected outcome: A non-empty name.
   * Exceptions: None.
   */
  readonly displayName: (unitId: string) => string;
}

/**
 * City, port, and fortification counts for one hex.
 *
 * Purpose: Raise capacity and the fortification block read one row.
 * When to use: Inside `HireContext`.
 * Expected outcome: Non-negative counts. A missing fortified count is 0.
 * Exceptions: None.
 */
interface HexInfrastructure {
  /**
   * City cells on the hex.
   *
   * Contract: The infrastructure row's urban count.
   * When to use: Raise capacity and which types the hex can build.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly urbanHexCount: number;
  /**
   * Seaports on the hex.
   *
   * Contract: Naval raising needs the seaport minimum.
   * When to use: `getAvailableBuildUnitTypes`.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly seaportCount: number;
  /**
   * Airports on the hex.
   *
   * Contract: Air raising needs an airport.
   * When to use: `getAvailableBuildUnitTypes`.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly airportCount: number;
  /**
   * Fortified city cells on the hex.
   *
   * Contract: A missing count was stored as 0.
   * When to use: The fortification block.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly fortifiedCount: number;
}

/**
 * A Neutral unit the seat may rehire, plus the hex it stands on.
 *
 * Purpose: The end of the turn evaluates the unit's hex. The panel view drops the hex before it reaches the model.
 * When to use: `HexHireEvaluation.rehireCandidates`.
 * Expected outcome: A `HireRehireRow` plus `h3Index`.
 * Exceptions: None.
 */
export interface RehireCandidate extends HireRehireRow {
  /**
   * Hex the unit occupies.
   *
   * Contract: The unit's snapshot hex.
   * When to use: Placement stores this hex on the order. The panel omits it.
   * Expected outcome: A strategic hex index.
   * Exceptions: None.
   */
  readonly h3Index: string;
}

/**
 * What one seat may hire on one hex.
 *
 * Purpose: The view and the end-of-turn fill both start from this result.
 * When to use: After `buildHireContext`.
 * Expected outcome: A blocked hex has empty options and candidates. A raise block clears the options.
 * Exceptions: None.
 */
export interface HexHireEvaluation {
  /**
   * The hex that was evaluated.
   *
   * Contract: The index passed in, whether or not it is on the map.
   * When to use: Pairing the result with the request.
   * Expected outcome: The requested hex.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Why no hire is possible on this hex.
   *
   * Contract: Null when the seat may raise or rehire here. Set before the raise-only reasons.
   * When to use: The panel's blocked message and the fill check.
   * Expected outcome: A player-facing sentence, or null.
   * Exceptions: None.
   */
  readonly blockedReason: string | null;
  /**
   * Why raising is impossible while rehiring may still be possible.
   *
   * Contract: Null when at least one raise option remains. A blocked hex leaves this null and clears the options.
   * When to use: The raise section.
   * Expected outcome: A player-facing sentence, or null.
   * Exceptions: None.
   */
  readonly raiseBlockedReason: string | null;
  /**
   * Production points this hex can raise this turn, before orders.
   *
   * Contract: Twice the city-cell count, or 0 on a neutral border.
   * When to use: Capacity left after this seat's raise orders.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly raiseCapacityPerTurn: number;
  /**
   * Types that fit the capacity.
   *
   * Contract: Empty when the hex is blocked or raising is blocked.
   * When to use: The raise select and the fill check.
   * Expected outcome: Hireable types whose unit cost is within capacity.
   * Exceptions: None.
   */
  readonly raiseOptions: readonly HireRaiseOption[];
  /**
   * Neutral units here that can be rehired.
   *
   * Contract: Empty when the hex is blocked. Missiles, embarked units, loaded ships, and another side's fortification are omitted.
   * When to use: The rehire list.
   * Expected outcome: One candidate per eligible unit.
   * Exceptions: None.
   */
  readonly rehireCandidates: readonly RehireCandidate[];
}

/**
 * Indexes one snapshot for hire checks.
 *
 * Purpose: The panel and the end of the turn must not disagree about homes, cargo, or tech.
 * When to use: Once per snapshot per seat. Pass the seat's own snapshot for placement, and the full board at the end of the turn.
 * Expected outcome: A context. A missing seat list treats every home-region entry as an active seat.
 * Exceptions: None.
 */
export function buildHireContext(state: GameStateSnapshot, seatId: SeatId): HireContext {
  logTrace('mercenaryHireRules buildHireContext', { seatId, unitCount: state.units.length });
  const unitsByHex = new Map<string, GameStateSnapshot['units'][number][]>();
  const cargoByShip = new Map<string, string[]>();
  for (const unit of state.units) {
    const list = unitsByHex.get(unit.h3Index) ?? [];
    list.push(unit);
    unitsByHex.set(unit.h3Index, list);
    const shipId = unit.embarkedOnNavalUnitId;
    if (shipId) {
      const cargo = cargoByShip.get(shipId) ?? [];
      cargo.push(unit.id);
      cargoByShip.set(shipId, cargo);
    }
  }
  const controllerByHex = new Map<string, string | null>();
  for (const row of state.strategicControl ?? []) controllerByHex.set(row.h3Index, row.controllerPlayerId);
  const infrastructureByHex = new Map<string, HexInfrastructure>();
  for (const row of state.strategicInfrastructure ?? []) {
    infrastructureByHex.set(row.h3Index, {
      urbanHexCount: row.urbanHexCount,
      seaportCount: row.seaportCount,
      airportCount: row.airportCount,
      fortifiedCount: row.fortifiedCount ?? 0,
    });
  }
  return {
    state,
    seatId,
    seatActive: requesterIsActive(state, seatId),
    techBonusEnabled: state.techBonusEnabled === true,
    unitsByHex,
    cargoByShip,
    controllerByHex,
    infrastructureByHex,
    otherActiveHomeHexes: otherActiveHomes(state, seatId),
    displayName: buildStrategicUnitDisplayLabelResolver(state.units),
  };
}

/**
 * Evaluates raising and rehiring on one hex.
 *
 * Purpose: Placement and the end of the turn reject a hex for the same reason the panel shows.
 * When to use: With a context from the snapshot that should judge the hex.
 * Expected outcome: See `HexHireEvaluation`. A blocked hex returns no options and no candidates.
 * Exceptions: None.
 */
export function evaluateHexHire(context: HireContext, h3Index: string): HexHireEvaluation {
  logTrace('mercenaryHireRules evaluateHexHire', { seatId: context.seatId, h3Index });
  const infra = context.infrastructureByHex.get(h3Index);
  const urban = infra?.urbanHexCount ?? 0;
  const raiseCapacityPerTurn = raiseCapacityForHex(urban, isNeutralBorderHex(h3Index));
  const blockedReason = hexBlockedReason(context, h3Index);
  if (blockedReason) {
    return {
      h3Index,
      blockedReason,
      raiseBlockedReason: null,
      raiseCapacityPerTurn,
      raiseOptions: [],
      rehireCandidates: [],
    };
  }
  const tier = context.techBonusEnabled ? techLevelForBirthHex(h3Index) : undefined;
  const options = getAvailableBuildUnitTypes(isNeutralBorderHex(h3Index) ? 0 : urban, infra?.seaportCount ?? 0, infra?.airportCount ?? 0)
    .filter(isHireableUnitType)
    .filter((unitType) => unitCostFor(unitType) <= raiseCapacityPerTurn)
    .map((unitType): HireRaiseOption => {
      const upkeep = mercenaryUpkeepFor(unitType, tier === 'advanced' ? 'advanced' : undefined);
      return { unitType, unitCost: unitCostFor(unitType), fee: mercenaryHireFee('raise', upkeep), upkeep };
    });
  const units = context.unitsByHex.get(h3Index) ?? [];
  const occupied = units.some((unit) => unit.player !== context.seatId);
  const fortifiedByOther = (infra?.fortifiedCount ?? 0) > 0 && context.controllerByHex.get(h3Index) !== context.seatId;
  const raiseBlockedReason = occupied
    ? RAISE_REASON_OCCUPIED
    : fortifiedByOther
      ? RAISE_REASON_FORTIFIED
      : options.length === 0
        ? RAISE_REASON_NO_CAPACITY
        : null;
  return {
    h3Index,
    blockedReason: null,
    raiseBlockedReason,
    raiseCapacityPerTurn,
    raiseOptions: raiseBlockedReason ? [] : options,
    rehireCandidates: rehireCandidates(context, h3Index, units, fortifiedByOther),
  };
}

/**
 * Lists hexes that can show a Hire marker.
 *
 * Purpose: The marker layer asks once instead of evaluating hexes it will not draw.
 * When to use: With the human snapshot. An absent explored list uses every hex on the snapshot.
 * Expected outcome: Sorted hexes that are not blocked and that have a raise option or a rehire candidate.
 * Exceptions: None.
 */
export function listHireEntryHexes(context: HireContext): string[] {
  logTrace('mercenaryHireRules listHireEntryHexes', { seatId: context.seatId });
  const explored = context.state.exploredHexes ?? context.state.hexes.map((hex) => hex.h3Index);
  const listed: string[] = [];
  for (const h3Index of explored) {
    const evaluation = evaluateHexHire(context, h3Index);
    if (evaluation.blockedReason) continue;
    if (evaluation.raiseOptions.length === 0 && evaluation.rehireCandidates.length === 0) continue;
    listed.push(h3Index);
  }
  return listed.sort();
}

/**
 * Whether the requesting seat is still playing.
 *
 * Purpose: A knocked-out seat cannot place or fill a hire.
 * When to use: While building the context.
 * Expected outcome: False when the seat's roster row has an out turn. True when the snapshot has no seat list and no home map.
 * Exceptions: None.
 */
function requesterIsActive(state: GameStateSnapshot, seatId: SeatId): boolean {
  if (state.seats) {
    const seat = state.seats.find((row) => row.seatId === seatId);
    return seat != null && seat.outTurn === null;
  }
  const homes = state.homeRegionHexesBySeat;
  if (!homes) return true;
  return Object.prototype.hasOwnProperty.call(homes, seatId);
}

/**
 * Home hexes of the other seats that are still active.
 *
 * Purpose: Hiring in another side's home is blocked. A knocked-out side's home is not.
 * When to use: While building the context.
 * Expected outcome: A set of hex indexes. The requester's own home is omitted.
 * Exceptions: None.
 */
function otherActiveHomes(state: GameStateSnapshot, seatId: SeatId): Set<string> {
  const homes = state.homeRegionHexesBySeat ?? {};
  const hexes = new Set<string>();
  if (state.seats) {
    for (const seat of state.seats) {
      if (seat.seatId === seatId || seat.outTurn !== null) continue;
      for (const h3Index of homes[seat.seatId] ?? []) hexes.add(h3Index);
    }
    return hexes;
  }
  for (const [otherId, otherHomes] of Object.entries(homes)) {
    if (otherId === seatId) continue;
    for (const h3Index of otherHomes) hexes.add(h3Index);
  }
  return hexes;
}

/**
 * The first reason the whole hex rejects hiring.
 *
 * Purpose: The three block checks stay in one order.
 * When to use: At the start of an evaluation.
 * Expected outcome: Not active, then unexplored, then another side's home. Null when none apply.
 * Exceptions: None.
 */
function hexBlockedReason(context: HireContext, h3Index: string): string | null {
  if (!context.seatActive) return HIRE_REASON_NOT_ACTIVE;
  if (!isHexExploredInSnapshot(context.state, h3Index)) return HIRE_REASON_NOT_EXPLORED;
  if (context.otherActiveHomeHexes.has(h3Index)) return HIRE_REASON_OTHER_HOME;
  return null;
}

/**
 * Neutral units on the hex that pass the rehire rules.
 *
 * Purpose: Raising and rehiring share the fortification block and nothing else.
 * When to use: When the hex itself is not blocked.
 * Expected outcome: Candidates with fee, upkeep, and display name. Empty when the hex is fortified by someone else.
 * Exceptions: None.
 */
function rehireCandidates(
  context: HireContext,
  h3Index: string,
  units: readonly GameStateSnapshot['units'][number][],
  fortifiedByOther: boolean
): RehireCandidate[] {
  if (fortifiedByOther) return [];
  const candidates: RehireCandidate[] = [];
  for (const unit of units) {
    if (unit.player !== NEUTRAL_OWNER_ID) continue;
    if (!isHireableUnitType(unit.unitType)) continue;
    if (unit.embarkedOnNavalUnitId) continue;
    if ((context.cargoByShip.get(unit.id)?.length ?? 0) > 0) continue;
    const techLevel = context.techBonusEnabled && unit.techLevel === 'advanced' ? 'advanced' : undefined;
    const upkeep = mercenaryUpkeepFor(unit.unitType, techLevel);
    candidates.push({
      unitId: unit.id,
      unitType: unit.unitType,
      displayName: context.displayName(unit.id),
      fee: mercenaryHireFee('rehire', upkeep),
      upkeep,
      h3Index,
    });
  }
  return candidates;
}
