/**
 * Writes a strategic turn's loss notes with attribution.
 */

import type { AirDropAnimationMove } from '../../shared/ipc/airDropTypes';
import type { MissileLaunchRecord } from '../../shared/ipc/missileTypes';
import type { AirStrikeAnimationMove } from '../../shared/ipc/ordersTypes';
import type { InfrastructureDestroyedEvent, RemovedUnitSnapshot } from '../../shared/ipc/readyTypes';
import type { UnitDisplayIdentity } from '../../shared/unitDisplayNames';
import type { CombatUnit } from '../combatUnitTypes';
import { getHexController } from '../gameDb';
import {
  buildStrategicLossAttributionContext,
  type StrategicControlTransition,
  type StrategicKillEdge,
} from '../lossAttribution/strategicLossAttribution';
import { logDebug, logTrace } from '../logger';
import { captureTurnLossNoteFromResolution } from './captureTurnLossNote';
import { mergeCarrierMaps } from './transportCargoLoss';

/**
 * Reads who controlled each strike and drop target hex.
 *
 * Purpose: A striker lost where no enemy unit stood is credited to the hex's controller. Control changes later in the turn, so this must run before control resolves.
 * When to use: In the finalize step, before `resolveStrategicControlAfterCombatAndMovement`.
 * Expected outcome: A map from each distinct target hex to its controller, or null for none.
 * Exceptions: Propagates database errors.
 */
export function readLossHexControllers(args: {
  readonly airStrikeMoves: readonly AirStrikeAnimationMove[];
  readonly airDropMoves: readonly AirDropAnimationMove[];
}): ReadonlyMap<string, string | null> {
  const hexes = new Set<string>([
    ...args.airStrikeMoves.map((move) => move.targetH3Index),
    ...args.airDropMoves.map((move) => move.targetH3Index),
  ]);
  logTrace('strategicLossNoteCapture readLossHexControllers', { hexCount: hexes.size });
  const controllers = new Map<string, string | null>();
  for (const hex of hexes) controllers.set(hex, getHexController(hex));
  return controllers;
}

/**
 * The records of one strategic turn that the loss note writer reads.
 *
 * Purpose: One object keeps the writer under the argument limit.
 * When to use: `captureStrategicTurnLossNote`, once per turn.
 * Expected outcome: Every list is complete for the turn. Empty lists are fine.
 * Exceptions: None.
 */
export interface StrategicTurnLossNoteArgs {
  /**
   * Strategic turn number whose resolution produced the losses.
   *
   * Contract: A positive integer.
   * When to use: The note row key.
   * Expected outcome: Matches the strategy note of the same turn.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * Ranged and melee kill edges together.
   *
   * Contract: The finalize step's `allKills`.
   * When to use: Melee victims.
   * Expected outcome: Passed on unchanged.
   * Exceptions: None.
   */
  readonly allKills: readonly StrategicKillEdge[];
  /**
   * Direct-fire kill edges, when any.
   *
   * Contract: May be undefined.
   * When to use: Ranged victims.
   * Expected outcome: Passed on unchanged.
   * Exceptions: None.
   */
  readonly killsByDirectFire: readonly StrategicKillEdge[] | undefined;
  /**
   * Return-fire kill edges, when any.
   *
   * Contract: May be undefined.
   * When to use: Victims lost to return fire.
   * Expected outcome: Passed on unchanged.
   * Exceptions: None.
   */
  readonly killsByReturnFire: readonly StrategicKillEdge[] | undefined;
  /**
   * Every removed unit the finalize step collected.
   *
   * Contract: Does not include air-drop losses. This writer adds them.
   * When to use: The loss roster.
   * Expected outcome: One snapshot per lost unit.
   * Exceptions: None.
   */
  readonly allRemovedUnits: readonly CombatUnit[];
  /**
   * Air units destroyed on the ground by missiles.
   *
   * Contract: A subset of `allRemovedUnits`.
   * When to use: The missile-strike cause.
   * Expected outcome: Passed on unchanged.
   * Exceptions: None.
   */
  readonly missileRemovedUnits: readonly CombatUnit[];
  /**
   * Missile launch records.
   *
   * Contract: One record per launch.
   * When to use: Crediting missile losses.
   * Expected outcome: Read by the context builder.
   * Exceptions: None.
   */
  readonly missileLaunches: readonly MissileLaunchRecord[];
  /**
   * Infrastructure destroyed by missiles.
   *
   * Contract: One event per hex and type.
   * When to use: Crediting invalid-base losses.
   * Expected outcome: Read by the context builder.
   * Exceptions: None.
   */
  readonly missileInfrastructureEvents: readonly InfrastructureDestroyedEvent[];
  /**
   * Units removed by air-strike resolution.
   *
   * Contract: A subset of `allRemovedUnits`.
   * When to use: The air-strike cause.
   * Expected outcome: Passed on, with shot-down drop carriers added.
   * Exceptions: None.
   */
  readonly airStrikeRemovedUnits: readonly CombatUnit[];
  /**
   * Air-strike animation rows.
   *
   * Contract: One row per striker.
   * When to use: Strikers lost to anti-air fire, and striker owners.
   * Expected outcome: Passed on, with drop rows added.
   * Exceptions: None.
   */
  readonly airStrikeMoves: readonly AirStrikeAnimationMove[];
  /**
   * Infrastructure destroyed by air strikes.
   *
   * Contract: One event per hex and type.
   * When to use: Crediting invalid-base losses.
   * Expected outcome: Read by the context builder.
   * Exceptions: None.
   */
  readonly airStrikeInfrastructureEvents: readonly InfrastructureDestroyedEvent[];
  /**
   * Units lost in air drops.
   *
   * Contract: Shot-down drop carriers and their infantry.
   * When to use: Adding the drop losses that never reached the note.
   * Expected outcome: Carriers are filed with the air-strike losses and infantry with the rest.
   * Exceptions: None.
   */
  readonly airDropRemovedUnits: readonly CombatUnit[];
  /**
   * Air-drop animation rows.
   *
   * Contract: One row per attempted drop.
   * When to use: Telling shot-down carriers from returning ones.
   * Expected outcome: A row with `returnsToBase` false is a lost carrier.
   * Exceptions: None.
   */
  readonly airDropMoves: readonly AirDropAnimationMove[];
  /**
   * Display roster for kill labels.
   *
   * Contract: The roster the ready result carries.
   * When to use: Display names of victims.
   * Expected outcome: Passed on unchanged.
   * Exceptions: None.
   */
  readonly killLabelUnits: readonly UnitDisplayIdentity[];
  /**
   * Every unit at the start of the turn.
   *
   * Contract: Owners before any fight.
   * When to use: Fight-time owners and hex defenders.
   * Expected outcome: Passed to the context builder.
   * Exceptions: None.
   */
  readonly combatUnitsBefore: readonly CombatUnit[];
  /**
   * Every unit just before melee.
   *
   * Contract: Owners before melee.
   * When to use: Fight-time owners of melee killers.
   * Expected outcome: Passed to the context builder.
   * Exceptions: None.
   */
  readonly combatUnitsAfter: readonly CombatUnit[];
  /**
   * Hexes whose controller changed this turn.
   *
   * Contract: From end-of-turn control resolution.
   * When to use: Crediting invalid-base losses.
   * Expected outcome: Passed to the context builder.
   * Exceptions: None.
   */
  readonly controlTransitions: readonly StrategicControlTransition[];
  /**
   * Units removed because their air base became invalid.
   *
   * Contract: A subset of `allRemovedUnits`.
   * When to use: Crediting invalid-base losses.
   * Expected outcome: Their ids are passed to the context builder.
   * Exceptions: None.
   */
  readonly baseLossRemoved: readonly CombatUnit[];
  /**
   * Controller of each strike and drop target hex before control resolved.
   *
   * Contract: From `readLossHexControllers`.
   * When to use: Crediting strikers lost where no enemy stood.
   * Expected outcome: Passed to the context builder.
   * Exceptions: None.
   */
  readonly controllerBeforeControlByHex: ReadonlyMap<string, string | null>;
  /**
   * The carrier each cargo unit lost in the air-strike, ranged, and melee phases was aboard.
   *
   * Contract: Merged by the caller.
   * When to use: Crediting cargo like its carrier.
   * Expected outcome: Merged here with the air-drop carriers.
   * Exceptions: None.
   */
  readonly transportCarrierIdByCargoId: ReadonlyMap<string, string>;
  /**
   * The carrier each infantry unit lost in an air drop was aboard.
   *
   * Contract: From the air-drop phase result.
   * When to use: Crediting dropped infantry like its shot-down carrier.
   * Expected outcome: Merged here with the other carrier maps.
   * Exceptions: None.
   */
  readonly airDropCarrierIdByCargoId: ReadonlyMap<string, string>;
}

/**
 * Writes the loss notes of one strategic turn, with who was responsible for each loss.
 *
 * Purpose: Gives every AI commander's notes the attribution, and adds the air-drop losses the note writer used to miss.
 * When to use: The finalize step, once per turn, after control and base losses are known.
 * Expected outcome: One note row per active AI seat. A shot-down drop carrier is filed under return fire through the air-strike attacker-loss rule, and its infantry under other losses, credited through the carrier.
 * Exceptions: None; the note writer logs a database failure.
 */
export function captureStrategicTurnLossNote(args: StrategicTurnLossNoteArgs): void {
  const droppedCarrierIds = new Set(args.airDropMoves.filter((move) => !move.returnsToBase).map((move) => move.unitId));
  const dropCarriers = args.airDropRemovedUnits.filter((unit) => droppedCarrierIds.has(unit.id));
  const dropCargo = args.airDropRemovedUnits.filter((unit) => !droppedCarrierIds.has(unit.id));
  logDebug('strategicLossNoteCapture captureStrategicTurnLossNote', {
    turnNumber: args.turnNumber,
    removedCount: args.allRemovedUnits.length,
    dropCarrierCount: dropCarriers.length,
    dropCargoCount: dropCargo.length,
  });
  const removedUnits: RemovedUnitSnapshot[] = [...args.allRemovedUnits, ...dropCargo];
  const airStrikeRemovedUnits: RemovedUnitSnapshot[] = [...args.airStrikeRemovedUnits, ...dropCarriers];
  const airStrikeMoves = [...args.airStrikeMoves, ...args.airDropMoves];
  captureTurnLossNoteFromResolution({
    scope: 'strategic',
    battleId: '',
    turnNumber: args.turnNumber,
    kills: args.allKills,
    killsByDirectFire: args.killsByDirectFire,
    killsByReturnFire: args.killsByReturnFire,
    removedUnits,
    missileStrikeRemovedUnits: args.missileRemovedUnits,
    airStrikeRemovedUnits,
    labelUnits: args.killLabelUnits,
    airStrikeMoves,
    attribution: buildStrategicLossAttributionContext({
      kills: args.allKills,
      killsByDirectFire: args.killsByDirectFire,
      killsByReturnFire: args.killsByReturnFire,
      removedUnits,
      combatUnitsBefore: args.combatUnitsBefore,
      combatUnitsAfter: args.combatUnitsAfter,
      airStrikeMoves: args.airStrikeMoves,
      airStrikeVictimIds: args.airStrikeRemovedUnits.map((unit) => unit.id),
      airDropMoves: args.airDropMoves,
      missileLaunches: args.missileLaunches,
      airStrikeInfrastructureEvents: args.airStrikeInfrastructureEvents,
      missileInfrastructureEvents: args.missileInfrastructureEvents,
      controlTransitions: args.controlTransitions,
      baseLossUnitIds: args.baseLossRemoved.map((unit) => unit.id),
      controllerBeforeControlByHex: args.controllerBeforeControlByHex,
      carrierIdByCargoId: mergeCarrierMaps(args.transportCarrierIdByCargoId, args.airDropCarrierIdByCargoId),
    }),
  });
}
