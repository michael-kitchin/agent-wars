/**
 * Builds the attribution context for a strategic turn from the records the resolution phases produced.
 */

import type { AirDropAnimationMove } from '../../shared/ipc/airDropTypes';
import type { MissileLaunchRecord } from '../../shared/ipc/missileTypes';
import type { AirStrikeAnimationMove } from '../../shared/ipc/ordersTypes';
import type { InfrastructureDestroyedEvent, RemovedUnitSnapshot } from '../../shared/ipc/readyTypes';
import type { CombatUnit } from '../combatUnitTypes';
import { logDebug } from '../logger';
import {
  killerIdsByVictim,
  type LossAttributionContext,
  type LossAttributionFallback,
  type LossUnitFact,
} from './lossAttributionCore';

/**
 * A kill edge reduced to what attribution reads.
 *
 * Purpose: Strategic resolution has two kill edge types that differ only in whether killers are required.
 * When to use: The edge lists of `StrategicLossAttributionInput`.
 * Expected outcome: A victim id and its killer ids when recorded.
 * Exceptions: None.
 */
export interface StrategicKillEdge {
  /**
   * Unit that was destroyed.
   *
   * Contract: A unit id.
   * When to use: Keying the killers.
   * Expected outcome: Matches a removed-unit snapshot id.
   * Exceptions: None.
   */
  readonly victimId: string;
  /**
   * Units on the other side of the fight.
   *
   * Contract: Side-level: every unit of the side that fought the victim, not the one that landed the hit.
   * When to use: Naming the responsible side and the killer types.
   * Expected outcome: Unit ids, possibly including units that also died.
   * Exceptions: None.
   */
  readonly killerIds?: readonly string[];
}

/**
 * A change of hex controller during end-of-turn control resolution.
 *
 * Purpose: A hex that changed hands is the cause of an air unit lost to an invalid base.
 * When to use: `StrategicLossAttributionInput.controlTransitions`.
 * Expected outcome: The hex and the controllers before and after.
 * Exceptions: None.
 */
export interface StrategicControlTransition {
  /**
   * Hex that changed controller.
   *
   * Contract: A strategic H3 index.
   * When to use: Matching a base-loss hex.
   * Expected outcome: One entry per changed hex.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Controller before, or null for none.
   *
   * Contract: An owner id or null.
   * When to use: Not read by attribution today.
   * Expected outcome: The previous controller.
   * Exceptions: None.
   */
  readonly fromControllerPlayerId: string | null;
  /**
   * Controller after, or null for none.
   *
   * Contract: An owner id or null.
   * When to use: Crediting a base loss to the side that took the hex.
   * Expected outcome: The new controller.
   * Exceptions: None.
   */
  readonly toControllerPlayerId: string | null;
}

/**
 * The records of one strategic turn that attribution reads.
 *
 * Purpose: One object keeps the builder under the argument limit.
 * When to use: `buildStrategicLossAttributionContext`.
 * Expected outcome: Every list is complete for the turn. Empty lists are fine.
 * Exceptions: None.
 */
export interface StrategicLossAttributionInput {
  /**
   * Ranged and melee kill edges together.
   *
   * Contract: The finalize step's `allKills`.
   * When to use: Melee victims. Ranged victims are claimed first by their own lists.
   * Expected outcome: Every removed unit of those phases has an edge.
   * Exceptions: None.
   */
  readonly kills: readonly StrategicKillEdge[];
  /**
   * Direct-fire kill edges.
   *
   * Contract: May be undefined when empty.
   * When to use: Ranged victims.
   * Expected outcome: Killers are the surviving attackers of the engagement.
   * Exceptions: None.
   */
  readonly killsByDirectFire: readonly StrategicKillEdge[] | undefined;
  /**
   * Return-fire kill edges.
   *
   * Contract: May be undefined when empty.
   * When to use: Victims lost to return fire.
   * Expected outcome: Killers may belong to more than one owner.
   * Exceptions: None.
   */
  readonly killsByReturnFire: readonly StrategicKillEdge[] | undefined;
  /**
   * Every removed-unit snapshot the note writer receives.
   *
   * Contract: Includes air-drop losses.
   * When to use: Fight-time owners and loss hexes.
   * Expected outcome: One snapshot per lost unit.
   * Exceptions: None.
   */
  readonly removedUnits: readonly RemovedUnitSnapshot[];
  /**
   * Every unit at the start of the turn.
   *
   * Contract: Owners as they were before any fight.
   * When to use: Fight-time owners, and defenders on a hex.
   * Expected outcome: Rows with `player` and `unitType`.
   * Exceptions: None.
   */
  readonly combatUnitsBefore: readonly CombatUnit[];
  /**
   * Every unit just before melee.
   *
   * Contract: Owners as they were before melee.
   * When to use: Fight-time owners of melee killers.
   * Expected outcome: Rows with `player` and `unitType`.
   * Exceptions: None.
   */
  readonly combatUnitsAfter: readonly CombatUnit[];
  /**
   * Air-strike animation rows.
   *
   * Contract: One row per striker.
   * When to use: Naming strikers by target hex, and lost strikers.
   * Expected outcome: Rows with owner, target, and whether the striker returned.
   * Exceptions: None.
   */
  readonly airStrikeMoves: readonly AirStrikeAnimationMove[];
  /**
   * Ids removed by air-strike resolution.
   *
   * Contract: Includes strikers lost to anti-air fire.
   * When to use: Finding air-strike victims.
   * Expected outcome: Unit ids.
   * Exceptions: None.
   */
  readonly airStrikeVictimIds: readonly string[];
  /**
   * Air-drop animation rows.
   *
   * Contract: One row per attempted drop.
   * When to use: Shot-down drop carriers.
   * Expected outcome: Rows with owner, target, and whether the carrier returned.
   * Exceptions: None.
   */
  readonly airDropMoves: readonly AirDropAnimationMove[];
  /**
   * Missile launch records.
   *
   * Contract: One record per launch.
   * When to use: Air units destroyed on the ground by a missile.
   * Expected outcome: Records with owner, target, and destroyed air ids.
   * Exceptions: None.
   */
  readonly missileLaunches: readonly MissileLaunchRecord[];
  /**
   * Infrastructure destroyed by air strikes.
   *
   * Contract: One event per target hex and type.
   * When to use: Crediting an air unit lost to an invalid base.
   * Expected outcome: Events with hex and target type.
   * Exceptions: None.
   */
  readonly airStrikeInfrastructureEvents: readonly InfrastructureDestroyedEvent[];
  /**
   * Infrastructure destroyed by missiles.
   *
   * Contract: One event per target hex and type.
   * When to use: Crediting an air unit lost to an invalid base.
   * Expected outcome: Events with hex and target type.
   * Exceptions: None.
   */
  readonly missileInfrastructureEvents: readonly InfrastructureDestroyedEvent[];
  /**
   * Hexes whose controller changed this turn.
   *
   * Contract: From end-of-turn control resolution.
   * When to use: Crediting an air unit lost to an invalid base.
   * Expected outcome: Entries with the new controller.
   * Exceptions: None.
   */
  readonly controlTransitions: readonly StrategicControlTransition[];
  /**
   * Ids removed because their air base became invalid.
   *
   * Contract: Includes the cargo of those air units.
   * When to use: Choosing which victims get a base-loss cause.
   * Expected outcome: Unit ids.
   * Exceptions: None.
   */
  readonly baseLossUnitIds: readonly string[];
  /**
   * Controller of each strike and drop target hex before control resolved.
   *
   * Contract: Null for no controller. A hex with no entry is unknown.
   * When to use: Crediting a striker lost where no enemy unit stood.
   * Expected outcome: The owner that held the hex when the fight happened.
   * Exceptions: None.
   */
  readonly controllerBeforeControlByHex: ReadonlyMap<string, string | null>;
  /**
   * The carrier each lost cargo unit was aboard.
   *
   * Contract: Includes air-drop cargo.
   * When to use: Crediting cargo like its carrier.
   * Expected outcome: Cargo id to carrier id.
   * Exceptions: None.
   */
  readonly carrierIdByCargoId: ReadonlyMap<string, string>;
}

/**
 * Builds the fight-time owner and type of every unit that took part.
 *
 * Purpose: A killer that survived may have changed owner, so owners come from turn-time rosters, not the final roster.
 * When to use: First step of the context builder.
 * Expected outcome: A map where a later source overwrites an earlier one: turn start, pre-melee, strikers, droppers, missiles, then casualties.
 * Exceptions: None.
 */
function buildUnitFacts(input: StrategicLossAttributionInput): Map<string, LossUnitFact> {
  const facts = new Map<string, LossUnitFact>();
  for (const unit of input.combatUnitsBefore) facts.set(unit.id, { ownerId: unit.player, unitType: unit.unitType });
  for (const unit of input.combatUnitsAfter) facts.set(unit.id, { ownerId: unit.player, unitType: unit.unitType });
  for (const move of input.airStrikeMoves) facts.set(move.unitId, { ownerId: move.player, unitType: move.unitType });
  for (const move of input.airDropMoves) facts.set(move.unitId, { ownerId: move.player, unitType: 'air' });
  for (const launch of input.missileLaunches) facts.set(launch.unitId, { ownerId: launch.player, unitType: 'missile' });
  for (const unit of input.removedUnits) facts.set(unit.id, { ownerId: unit.player, unitType: unit.unitType });
  return facts;
}

/**
 * Names the sides that held units on a hex, or else its controller.
 *
 * Purpose: A striker or drop carrier lost to anti-air fire is credited to the defenders of the target hex.
 * When to use: Lost strikers and lost drop carriers.
 * Expected outcome: Owners of turn-start units on the hex other than the victim's side. When none, the controller before control resolved if it is another side. Otherwise null.
 * Exceptions: None.
 */
function hexDefenders(hex: string, victimOwnerId: string, input: StrategicLossAttributionInput): readonly string[] | null {
  const owners = new Set<string>();
  for (const unit of input.combatUnitsBefore) {
    if (unit.h3Index === hex && unit.player !== victimOwnerId) owners.add(unit.player);
  }
  if (owners.size > 0) return [...owners];
  const controller = input.controllerBeforeControlByHex.get(hex);
  return controller && controller !== victimOwnerId ? [controller] : null;
}

/**
 * Finds who caused an air unit's base to become invalid.
 *
 * Purpose: Nobody fires on a stranded air unit. The side that took the hex or destroyed its airport is responsible.
 * When to use: Victims whose id is in `baseLossUnitIds`.
 * Expected outcome: The new controller when another side took the hex. Otherwise the owners and ids of strikers or missiles that destroyed the airport there. Otherwise an empty list, for no side responsible.
 * Exceptions: None.
 */
function baseLossCause(hex: string, victimOwnerId: string, input: StrategicLossAttributionInput): LossAttributionFallback {
  const taken = input.controlTransitions.find(
    (transition) => transition.h3Index === hex && transition.toControllerPlayerId && transition.toControllerPlayerId !== victimOwnerId
  );
  if (taken?.toControllerPlayerId) return { responsibleOwnerIds: [taken.toControllerPlayerId], killerIds: [] };
  const airportHit = (events: readonly InfrastructureDestroyedEvent[]): boolean =>
    events.some((event) => event.h3Index === hex && event.targetType === 'airport');
  const actors: Array<{ id: string; player: string }> = [];
  if (airportHit(input.airStrikeInfrastructureEvents)) {
    for (const move of input.airStrikeMoves) {
      if (move.targetH3Index === hex) actors.push({ id: move.unitId, player: move.player });
    }
  }
  if (airportHit(input.missileInfrastructureEvents)) {
    for (const launch of input.missileLaunches) {
      if (launch.targetH3Index === hex) actors.push({ id: launch.unitId, player: launch.player });
    }
  }
  const foreign = actors.filter((actor) => actor.player !== victimOwnerId);
  return { responsibleOwnerIds: [...new Set(foreign.map((actor) => actor.player))], killerIds: foreign.map((actor) => actor.id) };
}

/**
 * Builds the credit for victims that have no kill edge.
 *
 * Purpose: Missiles, anti-air fire, air strikes, and invalid bases are credited from their own records.
 * When to use: Second step of the context builder.
 * Expected outcome: Entries are written from the weakest rule to the strongest, so a later rule replaces an earlier one: base loss, air-strike victim, lost striker or drop carrier, missile.
 * Exceptions: None.
 */
function buildFallbacks(
  input: StrategicLossAttributionInput,
  facts: ReadonlyMap<string, LossUnitFact>,
  lossHexByVictimId: ReadonlyMap<string, string>
): Map<string, LossAttributionFallback> {
  const fallbacks = new Map<string, LossAttributionFallback>();
  const ownerOf = (unitId: string): string | undefined => facts.get(unitId)?.ownerId;
  for (const victimId of input.baseLossUnitIds) {
    const hex = lossHexByVictimId.get(victimId);
    const owner = ownerOf(victimId);
    if (hex && owner) fallbacks.set(victimId, baseLossCause(hex, owner, input));
  }
  for (const victimId of input.airStrikeVictimIds) {
    const hex = lossHexByVictimId.get(victimId);
    const owner = ownerOf(victimId);
    if (!owner) continue;
    const strikers = hex ? input.airStrikeMoves.filter((move) => move.targetH3Index === hex && move.player !== owner) : [];
    fallbacks.set(victimId, {
      responsibleOwnerIds: strikers.length > 0 ? [...new Set(strikers.map((move) => move.player))] : null,
      killerIds: strikers.map((move) => move.unitId),
    });
  }
  const lost = [
    ...input.airStrikeMoves.filter((move) => !move.returnsToBase),
    ...input.airDropMoves.filter((move) => !move.returnsToBase),
  ];
  for (const move of lost) {
    fallbacks.set(move.unitId, { responsibleOwnerIds: hexDefenders(move.targetH3Index, move.player, input), killerIds: [] });
  }
  for (const launch of input.missileLaunches) {
    for (const victimId of launch.destroyedAirUnitIds) {
      fallbacks.set(victimId, { responsibleOwnerIds: [launch.player], killerIds: [launch.unitId] });
    }
  }
  return fallbacks;
}

/**
 * Builds the attribution context for one strategic turn.
 *
 * Purpose: Turns the turn's resolution records into the lookups the attribution step reads, without touching the database.
 * When to use: `captureStrategicTurnLossNote`, once per turn.
 * Expected outcome: Fight-time owners, kill-edge killers for ranged, return-fire, and melee victims, loss hexes, the carrier map, and the fallbacks. Air-strike victims get no kill-edge entry because strategic resolution records no striker per victim.
 * Exceptions: None.
 */
export function buildStrategicLossAttributionContext(input: StrategicLossAttributionInput): LossAttributionContext {
  const unitFacts = buildUnitFacts(input);
  const lossH3ByVictimId = new Map<string, string>();
  for (const unit of input.removedUnits) lossH3ByVictimId.set(unit.id, unit.h3Index);
  for (const move of input.airDropMoves) {
    if (!move.returnsToBase) lossH3ByVictimId.set(move.unitId, move.targetH3Index);
  }
  const fallbackByVictimId = buildFallbacks(input, unitFacts, lossH3ByVictimId);
  logDebug('strategicLossAttribution buildStrategicLossAttributionContext', {
    unitFactCount: unitFacts.size,
    lossHexCount: lossH3ByVictimId.size,
    fallbackCount: fallbackByVictimId.size,
    cargoCount: input.carrierIdByCargoId.size,
  });
  return {
    unitFacts,
    killerIdsByCause: {
      ranged: killerIdsByVictim(input.killsByDirectFire),
      returnFire: killerIdsByVictim(input.killsByReturnFire),
      melee: killerIdsByVictim(input.kills),
    },
    lossH3ByVictimId,
    carrierIdByCargoId: input.carrierIdByCargoId,
    fallbackByVictimId,
  };
}
