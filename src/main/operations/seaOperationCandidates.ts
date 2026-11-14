/**
 * Chooses the sea landings a seat could start.
 *
 * Purpose: The turn advance launches the first clear row. A later menu can show the same list.
 * When to use: Once per seat on a turn that still has a free operation slot.
 * Expected outcome: At most `OPERATION_MENU_SIZE` candidates, clear cities first. An empty list when the seat cannot land.
 * Exceptions: None. A missing path is a skipped city, not a throw.
 */

import { getRange } from '../combatConstants';
import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logTrace } from '../logger';
import { knownCampaignCities } from '../openRouter/campaignTargetSelection';
import { isWithinGridRangePure } from '../../shared/h3GridRangePure';
import { getLandStepDistances, type LandMassByH3 } from '../../shared/landTraversalStrategic';
import type { Operation, OperationCandidate } from '../../shared/operationTypes';
import { LIFT_OBJECTIVE_CLEAR_RADIUS, liftGroundCap, rankLiftCities, shipsNeeded, type LiftCity } from './liftRules';
import type { LiftTerrain } from './liftTerrain';
import {
  OPERATION_MENU_SIZE,
  OPERATION_MIN_GROUND_UNITS,
  OPERATION_MUSTER_CANDIDATE_LIMIT,
  OPERATION_MUSTER_MAX_LAND_STEPS,
  OPERATION_OBJECTIVE_TEST_LIMIT,
} from './operationRules';

type UnitRow = GameStateSnapshot['units'][number];

/**
 * Orders two ids by their raw string order.
 *
 * Purpose: `localeCompare` follows the machine locale and can reorder ids between runs.
 * When to use: Unit ids, ship ids, and hex ids in this file.
 * Expected outcome: Negative when `left` is first, positive when `right` is first, zero when equal.
 * Exceptions: None.
 */
function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * True when the unit is infantry or armor.
 *
 * Purpose: Only those types board a landing.
 * When to use: While counting the seat's ground force and the units that can muster.
 * Expected outcome: True for infantry and armor.
 * Exceptions: None.
 */
function isGroundUnit(unit: UnitRow): boolean {
  return unit.unitType === 'infantry' || unit.unitType === 'armor';
}

/**
 * Known enemy cities for one seat.
 *
 * Purpose: A landing targets the same cities the campaign would, including a city known only because it sits in one enemy home.
 * When to use: Once per candidate search and once per turn advance. Do not call `campaignInputsFromState`; that function also drops units that are already in an operation.
 * Expected outcome: Enemy cities in an unspecified order. Ranking is the caller's job. An empty list when the seat has no active enemy.
 * Exceptions: None.
 */
export function listKnownEnemyCities(state: GameStateSnapshot, seatId: string): LiftCity[] {
  const activeEnemySeatIds = new Set<string>(
    (state.seats ?? []).filter((seat) => seat.seatId !== seatId && seat.outTurn == null).map((seat) => seat.seatId)
  );
  const homeSeatByH3 = new Map<string, string>();
  const inSeveralHomes = new Set<string>();
  for (const enemySeatId of activeEnemySeatIds) {
    for (const h3Index of state.homeRegionHexesBySeat?.[enemySeatId] ?? []) {
      if (homeSeatByH3.has(h3Index)) inSeveralHomes.add(h3Index);
      homeSeatByH3.set(h3Index, enemySeatId);
    }
  }
  for (const h3Index of inSeveralHomes) homeSeatByH3.delete(h3Index);
  const controllerByH3 = new Map((state.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
  const explored = new Set(state.exploredHexes ?? state.hexes.map((hex) => hex.h3Index));
  const cities = knownCampaignCities({
    activeEnemySeatIds,
    infrastructure: state.strategicInfrastructure ?? [],
    controllerByH3,
    explored,
    homeSeatByH3,
  }).map((city) => ({
    h3Index: city.h3Index,
    urbanHexCount: city.urbanHexCount,
    inEnemyHome: city.inEnemyHome,
    knownFortifiedCount: city.knownFortifiedCount,
  }));
  logTrace('seaOperationCandidates listKnownEnemyCities', { seatId, cityCount: cities.length });
  return cities;
}

/**
 * One port's force after the cap and the ship count have been applied.
 *
 * Purpose: The port choice compares these rows.
 * When to use: Inside `listSeaOperationCandidates` only.
 * Expected outcome: Units and ships that can meet at `port`.
 * Exceptions: None.
 */
interface PortForce {
  /**
   * Muster port hex.
   *
   * Contract: A seaport the chosen units can reach by land and at least one chosen ship can reach by sea.
   * When to use: The candidate's `musterH3`.
   * Expected outcome: A hex id.
   * Exceptions: None.
   */
  readonly port: string;
  /**
   * Ground units that will embark.
   *
   * Contract: Nearest first, infantry before armor, then id. No more than the lift cap, and no more than the ships can carry.
   * When to use: The candidate's `unitIds`.
   * Expected outcome: At least two units when this row is kept.
   * Exceptions: None.
   */
  readonly units: readonly UnitRow[];
  /**
   * Ships that will carry those units.
   *
   * Contract: Fewest sail turns first, then id. The length is `shipsNeeded` for `units`.
   * When to use: The candidate's `carrierIds` and the muster time.
   * Expected outcome: One or more ships.
   * Exceptions: None.
   */
  readonly ships: readonly UnitRow[];
  /**
   * Sum of the land steps of the chosen units.
   *
   * Contract: Used only to break a tie between ports with the same unit count.
   * When to use: The port sort.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly totalSteps: number;
  /**
   * Turns until every chosen unit and ship can be at the port.
   *
   * Contract: The larger of the farthest unit's step count and the slowest chosen ship's sail.
   * When to use: `etaTurns`.
   * Expected outcome: A non-negative integer. Armor uses the same step count as infantry.
   * Exceptions: None.
   */
  readonly musterTurns: number;
}

/**
 * Builds one port's force, or null when the ships there cannot carry two units.
 *
 * Purpose: Each candidate port is scored the same way.
 * When to use: Once per port that the ground units can reach.
 * Expected outcome: The force, or null when no ship can sail there or the carryable force is under the minimum.
 * Exceptions: None.
 */
function forceAtPort(args: {
  readonly port: string;
  readonly available: readonly UnitRow[];
  readonly freeShips: readonly UnitRow[];
  readonly cap: number;
  readonly hexSet: ReadonlySet<string>;
  readonly landMass: LandMassByH3;
  readonly terrain: LiftTerrain;
}): PortForce | null {
  const steps = getLandStepDistances({
    originH3s: [args.port],
    hexSet: args.hexSet,
    data: args.landMass,
    maxDepth: OPERATION_MUSTER_MAX_LAND_STEPS,
  });
  const sailByShip = new Map<string, number>();
  for (const ship of args.freeShips) {
    const turns = args.terrain.sailTurns(ship.h3Index, args.port);
    if (turns !== null) sailByShip.set(ship.id, turns);
  }
  if (sailByShip.size === 0) return null;
  const ordered = args.available
    .filter((unit) => steps.has(unit.h3Index))
    .sort((left, right) => {
      const stepDelta = (steps.get(left.h3Index) ?? 0) - (steps.get(right.h3Index) ?? 0);
      if (stepDelta !== 0) return stepDelta;
      const typeDelta = (left.unitType === 'infantry' ? 0 : 1) - (right.unitType === 'infantry' ? 0 : 1);
      if (typeDelta !== 0) return typeDelta;
      return compareIds(left.id, right.id);
    });
  let chosen = ordered.slice(0, args.cap);
  const shipsHere = args.freeShips.filter((ship) => sailByShip.has(ship.id));
  while (chosen.length > 0 && shipsNeeded(chosen.map((unit) => unit.unitType)) > shipsHere.length) {
    chosen = chosen.slice(0, -1);
  }
  if (chosen.length < OPERATION_MIN_GROUND_UNITS) return null;
  const needed = shipsNeeded(chosen.map((unit) => unit.unitType));
  const ships = [...shipsHere]
    .sort((left, right) => {
      const turnDelta = (sailByShip.get(left.id) ?? 0) - (sailByShip.get(right.id) ?? 0);
      if (turnDelta !== 0) return turnDelta;
      return compareIds(left.id, right.id);
    })
    .slice(0, needed);
  const totalSteps = chosen.reduce((sum, unit) => sum + (steps.get(unit.h3Index) ?? 0), 0);
  const farthestUnit = chosen.reduce((max, unit) => Math.max(max, steps.get(unit.h3Index) ?? 0), 0);
  const slowestShip = ships.reduce((max, ship) => Math.max(max, sailByShip.get(ship.id) ?? 0), 0);
  return { port: args.port, units: chosen, ships, totalSteps, musterTurns: Math.max(farthestUnit, slowestShip) };
}

/**
 * Enemy ground units that could arrive after the landing starts and are not already defenders.
 *
 * Purpose: A later menu can show the reinforcements without a path search per unit.
 * When to use: Once per candidate city.
 * Expected outcome: Infantry and armor of other sides inside `etaTurns` and outside the clear radius.
 * Exceptions: None.
 */
function countReinforcers(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly cityH3: string;
  readonly etaTurns: number;
}): number {
  let count = 0;
  for (const unit of args.state.units) {
    if (unit.player === args.seatId || !isGroundUnit(unit)) continue;
    if (!isWithinGridRangePure(args.cityH3, unit.h3Index, args.etaTurns)) continue;
    if (isWithinGridRangePure(args.cityH3, unit.h3Index, LIFT_OBJECTIVE_CLEAR_RADIUS)) continue;
    count += 1;
  }
  return count;
}

/**
 * Lists the sea landings this seat could launch.
 *
 * Purpose: One search produces the engine's launch and, later, the commander's menu.
 * When to use: When the seat has a free slot. Pass the terrain built from the full unit list so a hidden defender still blocks a city. Ids in `protectedUnitIds`, ground units and ships, are not chosen.
 * Expected outcome: Clear cities first, then the rest, each in rank order. Empty when there is no free ship, fewer than two available units, or no reachable city. At most `OPERATION_MENU_SIZE` rows, after testing at most `OPERATION_OBJECTIVE_TEST_LIMIT` cities. `onlyObjectiveH3` tests that one city, clear or not, and skips both caps.
 * Exceptions: None.
 */
export function listSeaOperationCandidates(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly landMass: LandMassByH3;
  readonly terrain: LiftTerrain;
  readonly active: readonly Operation[];
  readonly protectedUnitIds: ReadonlySet<string>;
  readonly hasCampaignPlan: boolean;
  readonly onlyObjectiveH3?: string;
}): OperationCandidate[] {
  const finish = (candidates: readonly OperationCandidate[]): OperationCandidate[] => {
    logDebug('seaOperationCandidates listSeaOperationCandidates', {
      seatId: args.seatId,
      candidateCount: candidates.length,
      routeChecks: args.terrain.routeChecks(),
    });
    return [...candidates];
  };
  const busy = new Set<string>();
  for (const operation of args.active) {
    for (const unitId of operation.unitIds) busy.add(unitId);
    for (const carrierId of operation.carrierIds) busy.add(carrierId);
  }
  const own = args.state.units.filter((unit) => unit.player === args.seatId);
  const freeShips = own
    .filter(
      (unit) =>
        unit.unitType === 'naval' &&
        !busy.has(unit.id) &&
        !args.protectedUnitIds.has(unit.id) &&
        !args.state.units.some((cargo) => cargo.embarkedOnCarrierUnitId === unit.id) &&
        args.terrain.enemyUnitsWithin(unit.h3Index, getRange('naval')) === 0
    )
    .sort((left, right) => compareIds(left.id, right.id));
  if (freeShips.length === 0) return finish([]);
  const available = own.filter(
    (unit) => isGroundUnit(unit) && !unit.embarkedOnCarrierUnitId && !busy.has(unit.id) && !args.protectedUnitIds.has(unit.id)
  );
  if (available.length < OPERATION_MIN_GROUND_UNITS) return finish([]);
  const groundUnits = own.filter(isGroundUnit);
  const committedCount = groundUnits.filter((unit) => unit.embarkedOnCarrierUnitId != null || busy.has(unit.id)).length;
  const cap = liftGroundCap({
    groundUnitCount: groundUnits.length,
    committedCount,
    hasCampaignPlan: args.hasCampaignPlan,
  });
  if (cap < OPERATION_MIN_GROUND_UNITS) return finish([]);
  const hexSet = new Set(args.state.hexes.map((hex) => hex.h3Index));
  const controlByHex = new Map((args.state.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
  const seaportByHex = new Map((args.state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row.seaportCount]));
  const fromTroops = getLandStepDistances({
    originH3s: available.map((unit) => unit.h3Index),
    hexSet,
    data: args.landMass,
    maxDepth: OPERATION_MUSTER_MAX_LAND_STEPS,
  });
  const ports = args.state.hexes
    .map((hex) => hex.h3Index)
    .filter(
      (h3Index) =>
        controlByHex.get(h3Index) === args.seatId &&
        (seaportByHex.get(h3Index) ?? 0) > 0 &&
        args.terrain.embarkLegal(h3Index) &&
        args.terrain.shipCanEnter(h3Index) &&
        fromTroops.has(h3Index)
    )
    .sort((left, right) => {
      const stepDelta = (fromTroops.get(left) ?? 0) - (fromTroops.get(right) ?? 0);
      if (stepDelta !== 0) return stepDelta;
      return compareIds(left, right);
    })
    .slice(0, OPERATION_MUSTER_CANDIDATE_LIMIT);
  const forces = ports
    .map((port) =>
      forceAtPort({
        port,
        available,
        freeShips,
        cap,
        hexSet,
        landMass: args.landMass,
        terrain: args.terrain,
      })
    )
    .filter((force): force is PortForce => force !== null)
    .sort((left, right) => {
      if (left.units.length !== right.units.length) return right.units.length - left.units.length;
      if (left.totalSteps !== right.totalSteps) return left.totalSteps - right.totalSteps;
      return compareIds(left.port, right.port);
    });
  const force = forces[0];
  if (!force) return finish([]);
  const ranked = rankLiftCities(listKnownEnemyCities(args.state, args.seatId));
  const named = args.onlyObjectiveH3;
  const pool = named === undefined ? ranked : ranked.filter((city) => city.h3Index === named);
  const clearIds = new Set(
    pool.filter((city) => args.terrain.enemyUnitsWithin(city.h3Index, LIFT_OBJECTIVE_CLEAR_RADIUS) === 0).map((city) => city.h3Index)
  );
  const ordered = named === undefined
    ? [...pool.filter((city) => clearIds.has(city.h3Index)), ...pool.filter((city) => !clearIds.has(city.h3Index))]
    : pool;
  const candidates: OperationCandidate[] = [];
  let tested = 0;
  for (const city of ordered) {
    if (named === undefined && (candidates.length >= OPERATION_MENU_SIZE || tested >= OPERATION_OBJECTIVE_TEST_LIMIT)) break;
    tested += 1;
    let landing: { readonly hex: string; readonly turns: number } | null = null;
    for (const hex of args.terrain.landingHexes(city.h3Index)) {
      const turns = args.terrain.sailTurns(force.port, hex);
      if (turns === null) continue;
      if (landing === null || turns < landing.turns || (turns === landing.turns && hex < landing.hex)) {
        landing = { hex, turns };
      }
    }
    if (landing === null) continue;
    const etaTurns = force.musterTurns + landing.turns + 1;
    const defenders = args.terrain.enemyUnitsWithin(city.h3Index, LIFT_OBJECTIVE_CLEAR_RADIUS);
    candidates.push({
      method: 'sea',
      objectiveH3: city.h3Index,
      musterH3: force.port,
      landingH3: landing.hex,
      unitIds: force.units.map((unit) => unit.id),
      carrierIds: force.ships.map((ship) => ship.id),
      etaTurns,
      urbanHexCount: city.urbanHexCount,
      inEnemyHome: city.inEnemyHome,
      knownFortifiedCount: city.knownFortifiedCount,
      defenders,
      reinforcers: countReinforcers({ state: args.state, seatId: args.seatId, cityH3: city.h3Index, etaTurns }),
      clear: defenders === 0,
    });
  }
  return finish(candidates);
}
