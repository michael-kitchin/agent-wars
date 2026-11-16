/**
 * Builds the attribution context for a tactical beat from the beat's outcome records.
 */

import type { AirDropAnimationMove } from '../../shared/ipc/airDropTypes';
import type { AirStrikeAnimationMove } from '../../shared/ipc/ordersTypes';
import type { RemovedUnitSnapshot } from '../../shared/ipc/readyTypes';
import { logDebug, logTrace } from '../logger';
import {
  killerIdsByVictim,
  type LossAttributionContext,
  type LossAttributionFallback,
  type LossUnitFact,
} from './lossAttributionCore';

/**
 * A kill edge reduced to what attribution reads.
 *
 * Purpose: Tactical resolution records killers per victim in several lists with the same shape.
 * When to use: The edge lists of `TacticalLossAttributionInput`.
 * Expected outcome: A victim id and its killer ids when recorded.
 * Exceptions: None.
 */
export interface TacticalKillEdge {
  /**
   * Sub-unit that was destroyed.
   *
   * Contract: A sub-unit id.
   * When to use: Keying the killers.
   * Expected outcome: Matches a removed-unit snapshot id.
   * Exceptions: None.
   */
  readonly victimId: string;
  /**
   * Sub-units that destroyed it.
   *
   * Contract: Side-level for ranged and melee edges. A single sub-unit for an air strike or an anti-air shot.
   * When to use: Naming the responsible side and the killer types.
   * Expected outcome: Sub-unit ids.
   * Exceptions: None.
   */
  readonly killerIds?: readonly string[];
}

/**
 * A battle sub-unit reduced to what attribution reads.
 *
 * Purpose: Survivors and casualties both give fight-time owners and cargo links.
 * When to use: `TacticalLossAttributionInput.subUnitsBeforeFerry` and `subUnitsAfter`.
 * Expected outcome: Owner, type, and the carrier the sub-unit sat on.
 * Exceptions: None.
 */
export interface TacticalSubUnitFact {
  /**
   * Sub-unit id.
   *
   * Contract: Unique inside the battle.
   * When to use: Keying facts.
   * Expected outcome: The id prompts use.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * Owner of the sub-unit.
   *
   * Contract: A seat id or the Neutral owner id.
   * When to use: Naming sides.
   * Expected outcome: The `player` field of the snapshot.
   * Exceptions: None.
   */
  readonly player: string;
  /**
   * Unit type of the sub-unit.
   *
   * Contract: A unit type string.
   * When to use: Killer type counts.
   * Expected outcome: The `unitType` field of the snapshot.
   * Exceptions: None.
   */
  readonly unitType: string;
  /**
   * Carrier this sub-unit was aboard, when any.
   *
   * Contract: A sub-unit id, null, or undefined.
   * When to use: Linking cargo to its carrier.
   * Expected outcome: Set for embarked cargo.
   * Exceptions: None.
   */
  readonly embarkedOnSubUnitId?: string | null;
}

/**
 * The records of one tactical beat that attribution reads.
 *
 * Purpose: One object keeps the builder under the argument limit.
 * When to use: `buildTacticalLossAttributionContext`.
 * Expected outcome: Every list is complete for the beat. Empty lists are fine.
 * Exceptions: None.
 */
export interface TacticalLossAttributionInput {
  /**
   * Direct-fire kill edges.
   *
   * Contract: May be empty.
   * When to use: Ranged victims.
   * Expected outcome: Side-level killers.
   * Exceptions: None.
   */
  readonly killsByDirectFire: readonly TacticalKillEdge[];
  /**
   * Return-fire kill edges, including anti-air shots.
   *
   * Contract: May be empty.
   * When to use: Victims lost to return fire.
   * Expected outcome: Killers of the defending side.
   * Exceptions: None.
   */
  readonly killsByReturnFire: readonly TacticalKillEdge[];
  /**
   * Melee kill edges.
   *
   * Contract: May be empty.
   * When to use: Melee victims.
   * Expected outcome: Side-level killers.
   * Exceptions: None.
   */
  readonly killsByMelee: readonly TacticalKillEdge[];
  /**
   * Air-strike kill edges.
   *
   * Contract: May be empty.
   * When to use: Air-strike victims.
   * Expected outcome: The single striker of each victim.
   * Exceptions: None.
   */
  readonly killsByAirStrike: readonly TacticalKillEdge[];
  /**
   * Every removed-unit snapshot the note writer receives.
   *
   * Contract: Includes melee casualties.
   * When to use: Fight-time owners and loss hexes.
   * Expected outcome: One snapshot per lost sub-unit.
   * Exceptions: None.
   */
  readonly removedUnits: readonly RemovedUnitSnapshot[];
  /**
   * Sub-units after movement and before ferries.
   *
   * Contract: Includes casualties of the ranged phase when present.
   * When to use: Fight-time owners, and cargo links.
   * Expected outcome: Facts with owner, type, and carrier.
   * Exceptions: None.
   */
  readonly subUnitsBeforeFerry: readonly TacticalSubUnitFact[];
  /**
   * Sub-units still standing after the beat.
   *
   * Contract: Survivors.
   * When to use: Fight-time owners of surviving killers.
   * Expected outcome: Facts with owner and type.
   * Exceptions: None.
   */
  readonly subUnitsAfter: readonly TacticalSubUnitFact[];
  /**
   * Air-strike animation rows.
   *
   * Contract: One row per striker.
   * When to use: Where a lost striker fell, and strikers lost without an edge.
   * Expected outcome: Rows with target and whether the striker returned.
   * Exceptions: None.
   */
  readonly airStrikeMoves: readonly AirStrikeAnimationMove[];
  /**
   * Air-drop animation rows.
   *
   * Contract: One row per attempted drop.
   * When to use: Where a shot-down carrier fell.
   * Expected outcome: Rows with target and whether the carrier returned.
   * Exceptions: None.
   */
  readonly airDropMoves: readonly AirDropAnimationMove[];
}

/**
 * Builds the fight-time owner and type of every sub-unit that took part.
 *
 * Purpose: Killers may still be alive, so owners come from the beat's rosters, not from removed snapshots alone.
 * When to use: First step of the context builder.
 * Expected outcome: Pre-ferry sub-units, then survivors, then casualties; a later source overwrites an earlier one.
 * Exceptions: None.
 */
function buildUnitFacts(input: TacticalLossAttributionInput): Map<string, LossUnitFact> {
  const facts = new Map<string, LossUnitFact>();
  for (const unit of input.subUnitsBeforeFerry) facts.set(unit.id, { ownerId: unit.player, unitType: unit.unitType });
  for (const unit of input.subUnitsAfter) facts.set(unit.id, { ownerId: unit.player, unitType: unit.unitType });
  for (const unit of input.removedUnits) facts.set(unit.id, { ownerId: unit.player, unitType: unit.unitType });
  return facts;
}

/**
 * Maps each lost cargo sub-unit to the carrier it sat on.
 *
 * Purpose: Cargo lost with its carrier is credited like the carrier.
 * When to use: Second step of the context builder.
 * Expected outcome: Entries only when both the cargo and its carrier were removed.
 * Exceptions: None.
 */
function buildCarrierMap(input: TacticalLossAttributionInput): Map<string, string> {
  const removedIds = new Set(input.removedUnits.map((unit) => unit.id));
  const carriers = new Map<string, string>();
  for (const unit of input.subUnitsBeforeFerry) {
    const carrierId = unit.embarkedOnSubUnitId;
    if (carrierId && removedIds.has(unit.id) && removedIds.has(carrierId)) carriers.set(unit.id, carrierId);
  }
  return carriers;
}

/**
 * Credits strikers and drop carriers lost with no kill edge to the other sides in the battle.
 *
 * Purpose: An infrastructure counter-fire kills a striker with no unit shooting. The side opposing the striker is responsible.
 * When to use: Third step of the context builder.
 * Expected outcome: One fallback per lost striker or carrier that no kill edge names. Null when no other owner took part.
 * Exceptions: None.
 */
function buildFallbacks(input: TacticalLossAttributionInput, facts: ReadonlyMap<string, LossUnitFact>): Map<string, LossAttributionFallback> {
  const named = new Set<string>();
  for (const list of [input.killsByDirectFire, input.killsByReturnFire, input.killsByMelee, input.killsByAirStrike]) {
    for (const edge of list) named.add(edge.victimId);
  }
  const lostMoves = [
    ...input.airStrikeMoves.filter((move) => !move.returnsToBase),
    ...input.airDropMoves.filter((move) => !move.returnsToBase),
  ];
  const fallbacks = new Map<string, LossAttributionFallback>();
  for (const move of lostMoves) {
    if (named.has(move.unitId)) continue;
    const owners = new Set<string>();
    for (const fact of facts.values()) if (fact.ownerId !== move.player) owners.add(fact.ownerId);
    fallbacks.set(move.unitId, { responsibleOwnerIds: owners.size > 0 ? [...owners] : null, killerIds: [] });
  }
  return fallbacks;
}

/**
 * Selects the removed units the note files as air-strike losses.
 *
 * Purpose: Replaces a rule that treated every human air unit that was not a ranged victim as an air-strike loss, which misfiled a failed ferry and ignored an AI striker lost to counter-fire.
 * When to use: `captureTacticalBeatLossNote`, before building the note.
 * Expected outcome: Units named as victims of an air strike, plus strikers lost without returning, except ranged victims. The same rule applies to every owner.
 * Exceptions: None.
 */
export function lossNoteAirStrikeRemovedUnits(args: {
  /**
   * Removed sub-units the beat recorded.
   *
   * Contract: The merged list capture receives.
   * When to use: The pool this function filters.
   * Expected outcome: One snapshot per lost sub-unit.
   * Exceptions: None.
   */
  readonly removedUnits: readonly RemovedUnitSnapshot[];
  /**
   * Air-strike kill edges.
   *
   * Contract: May be empty. An edge with no killers is still a victim.
   * When to use: Units a striker destroyed.
   * Expected outcome: Those victims are included.
   * Exceptions: None.
   */
  readonly killsByAirStrike: readonly TacticalKillEdge[];
  /**
   * Direct-fire kill edges.
   *
   * Contract: May be empty.
   * When to use: Excluding a lost striker that ranged fire already claimed.
   * Expected outcome: A ranged victim is not included only because it failed to return.
   * Exceptions: None.
   */
  readonly killsByDirectFire: readonly TacticalKillEdge[];
  /**
   * Air-strike animation rows.
   *
   * Contract: `returnsToBase === false` marks a striker that did not come home.
   * When to use: Including those strikers for every owner.
   * Expected outcome: A lost striker is included unless ranged fire already claimed it.
   * Exceptions: None.
   */
  readonly airStrikeMoves: readonly AirStrikeAnimationMove[];
}): RemovedUnitSnapshot[] {
  logTrace('tacticalLossAttribution lossNoteAirStrikeRemovedUnits', { removedCount: args.removedUnits.length });
  const victimIds = new Set(args.killsByAirStrike.map((kill) => kill.victimId));
  const rangedVictimIds = new Set(args.killsByDirectFire.map((kill) => kill.victimId));
  const lostStrikerIds = new Set(args.airStrikeMoves.filter((move) => !move.returnsToBase).map((move) => move.unitId));
  return args.removedUnits.filter((unit) => victimIds.has(unit.id) || (lostStrikerIds.has(unit.id) && !rangedVictimIds.has(unit.id)));
}

/**
 * Builds the attribution context for one tactical beat.
 *
 * Purpose: Turns the beat's records into the lookups the attribution step reads, without touching the database.
 * When to use: `captureTacticalBeatLossNote`, once per beat.
 * Expected outcome: Kill-edge killers for every cause, fight-time owners, loss hexes with lost strikers and carriers placed at their target, cargo links, and fallbacks for strikers lost with no edge.
 * Exceptions: None.
 */
export function buildTacticalLossAttributionContext(input: TacticalLossAttributionInput): LossAttributionContext {
  const unitFacts = buildUnitFacts(input);
  const lossH3ByVictimId = new Map<string, string>();
  for (const unit of input.removedUnits) lossH3ByVictimId.set(unit.id, unit.h3Index);
  for (const move of input.airStrikeMoves) {
    if (!move.returnsToBase) lossH3ByVictimId.set(move.unitId, move.targetH3Index);
  }
  for (const move of input.airDropMoves) {
    if (!move.returnsToBase) lossH3ByVictimId.set(move.unitId, move.targetH3Index);
  }
  const carrierIdByCargoId = buildCarrierMap(input);
  const fallbackByVictimId = buildFallbacks(input, unitFacts);
  logDebug('tacticalLossAttribution buildTacticalLossAttributionContext', {
    unitFactCount: unitFacts.size,
    cargoCount: carrierIdByCargoId.size,
    fallbackCount: fallbackByVictimId.size,
  });
  return {
    unitFacts,
    killerIdsByCause: {
      ranged: killerIdsByVictim(input.killsByDirectFire),
      returnFire: killerIdsByVictim(input.killsByReturnFire),
      melee: killerIdsByVictim(input.killsByMelee),
      airStrike: killerIdsByVictim(input.killsByAirStrike),
    },
    lossH3ByVictimId,
    carrierIdByCargoId,
    fallbackByVictimId,
  };
}
