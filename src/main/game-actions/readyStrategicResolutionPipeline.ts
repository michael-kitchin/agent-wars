/**
 * Strategic WEGO `ready` resolution from phase flip through air/ranged/movement/ferry and melee branch or finalize.
 *
 * Contract: Callers must run `readyStrategicGuards` and planning-phase checks before invoking; mutates DB like legacy `ready`.
 * When to use: Only from `gameActions.ready` after preconditions succeed.
 * Expected outcome: Same `ReadyResult` shapes as the pre-extraction monolithic implementation.
 * Exceptions: Propagates unexpected errors to the caller for outer `try/catch` handling.
 */

import { dbGetAll, dbGetOne, dbRun, getGameSeed, getHexController, getGameStateForPlayer, getRes1InfrastructureForHex, listUnitsForSnapshot } from '../gameDb';
import { buildLatLngCoordinateMap, getOrderedHexList } from '../mapData';
import { createCombatRng, runMeleePhase, runRangedPhase, type CombatUnit } from '../combatResolution';
import { logDebug } from '../logger';
import type {
  AirStrikeOrder,
  EmbarkOrder,
  FerryAnimationMove,
  FerryOrder,
  MovementOrder,
  RangedAttackOrder,
  ReadyResult,
  AirStrikeTargetType,
} from '../../shared/ipcTypes';
import { resolveAirStrikePhase } from './airStrikeResolution';
import {
  applyEmbarkOrdersForPlayer,
  applyTransportOutcomeForRemovedStrategicUnits,
  autoDisembarkIndependentLandMoves,
  isEmbarkedLandUnitOnWater,
  syncEmbarkedLandUnitPositionsWithNaval,
} from './sealift';
import { rememberStrategicHexBeforeMove } from '../strategicUnitPreviousHex';
import { finalizeReadyTurnAfterMelee } from './meleeInterceptReadyFinalize';
import {
  buildMeleeInterceptCandidateRows,
  filterMeleeCandidateHexesWithTacticalEntry,
  listMeleeCandidateHexes,
} from './meleeInterceptCandidates';
import {
  newMeleeDecisionToken,
  setMeleeInterceptPendingSnapshot,
  type MeleeInterceptReadyPauseSnapshot,
} from './meleeInterceptPendingState';
import { collectTraversedHexesByPlayer } from './controlAndProduction';
import { generateOrdersForStandingOrders } from '../tools/tool5StandingOrders';
import { isWithinAirFerryGridRange } from './gridRange';

/**
 * Planning identity constants injected from `gameActions` so this module stays free of duplicate literals.
 *
 * Contract: `validPhase` must match `turn_state.phase` while human orders are being collected.
 * When to use: Passed on every `executeReadyStrategicTurn` call from the `ready` export.
 * Expected outcome: Standing-order generation and order merges target the configured human id.
 * Exceptions: None.
 */
export type ReadyStrategicPlanningConstants = {
  humanPlayerId: 'human' | 'opponent';
  validPhase: string;
  /**
   * Strategic turn index captured while `turn_state.phase` was still `validPhase` (planning).
   *
   * Contract: Must match the row read in `gameActions.ready` immediately before flipping to `resolution`.
   * When to use: Passed into melee pause snapshots and finalize helpers for consistent turn metadata.
   * Expected outcome: Same `turnNumber` semantics as the legacy inline `ready` implementation.
   * Exceptions: None.
   */
  turnNumber: number;
};

/**
 * Reads hex/unit/pending-order tables for pre-move strategic snapshots used during `ready`.
 *
 * Purpose: Replaces the former `gameActions.dbBackedStateSnapshot` helper with identical SQL column aliases.
 * When to use: Building `preMoveState` before merging standing orders with `pending_orders`.
 * Expected outcome: Structural snapshot suitable for `buildLatLngCoordinateMap` and traversal helpers.
 * Exceptions: None; relies on DB invariants established before this pipeline runs.
 */
function dbBackedStateSnapshot(): {
  hexes: Array<{ h3Index: string; terrain: string; terrainKind: string }>;
  units: Array<{ id: string; player: string; unitType: string; h3Index: string }>;
  phase: string;
  turnNumber: number;
  pendingOrders: Array<{ unitId: string; toH3Index: string }>;
} {
  return {
    hexes: dbGetAll<{ h3Index: string; terrain: string; terrainKind: string }>(
      'SELECT h3_index AS h3Index, terrain, terrain_kind AS terrainKind FROM hexes'
    ),
    units: dbGetAll<{ id: string; player: string; unitType: string; h3Index: string }>(
      'SELECT id, player, unit_type AS unitType, h3_index AS h3Index FROM units'
    ),
    phase: dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1')?.phase ?? 'planning',
    turnNumber: dbGetOne<{ turnNumber: number }>('SELECT turn_number AS turnNumber FROM turn_state WHERE id = 1')?.turnNumber ?? 1,
    pendingOrders: dbGetAll<{ unitId: string; toH3Index: string }>(
      'SELECT unit_id AS unitId, to_h3_index AS toH3Index FROM pending_orders'
    ),
  };
}

/**
 * Executes air strike, ranged, merged movement, ferry resolution, then melee pause or finalize.
 *
 * Purpose: Owns the heavy `ready` pipeline while `gameActions.ready` keeps guards and planning-phase checks.
 * When to use: `gameActions.ready` after `failIfDatabaseNotReady`, tactical, melee-pending, and phase checks succeed.
 * Expected outcome: `awaitingMeleeDecision` early return or completed `finalizeReadyTurnAfterMelee` result.
 * Exceptions: Unexpected throws bubble to `gameActions.ready` catch.
 */
export function executeReadyStrategicTurn(
  aiOrders: MovementOrder[],
  aiRangedOrders: RangedAttackOrder[],
  aiAirStrikeOrders: AirStrikeOrder[],
  aiFerryOrders: FerryOrder[],
  aiEmbarkOrders: EmbarkOrder[],
  constants: ReadyStrategicPlanningConstants
): ReadyResult {
  logDebug('executeReadyStrategicTurn', {
    aiOrderCount: aiOrders.length,
    aiRangedCount: aiRangedOrders.length,
    aiAirStrikeCount: aiAirStrikeOrders.length,
    aiFerryCount: aiFerryOrders.length,
    aiEmbarkCount: aiEmbarkOrders.length,
    turnNumber: constants.turnNumber,
  });

  dbRun('UPDATE turn_state SET phase = ? WHERE id = 1', ['resolution']);

  const hexList = getOrderedHexList();
  const unitsBeforeMove = listUnitsForSnapshot();
  const combatUnitsBefore: CombatUnit[] = unitsBeforeMove.map((u) => ({
    id: u.id,
    player: u.player,
    unitType: u.unitType,
    h3Index: u.h3Index,
    displayOrder: u.displayOrder,
  }));

  const humanRanged = dbGetAll<{ unit_id: string; target_h3_index: string }>(
    'SELECT unit_id, target_h3_index FROM pending_ranged_orders ORDER BY unit_id, target_h3_index'
  ).map((r) => ({ unitId: r.unit_id, targetH3Index: r.target_h3_index }));
  const humanAirStrikes = dbGetAll<{ unit_id: string; target_h3_index: string; target_type: AirStrikeTargetType }>(
    'SELECT unit_id, target_h3_index, target_type FROM pending_air_orders ORDER BY unit_id, target_h3_index'
  ).map((r) => ({ unitId: r.unit_id, targetH3Index: r.target_h3_index, targetType: r.target_type }));
  const humanFerryOrders = dbGetAll<{ unit_id: string; destination_h3_index: string }>(
    'SELECT unit_id, destination_h3_index FROM pending_ferry_orders ORDER BY unit_id, destination_h3_index'
  ).map((r) => ({ unitId: r.unit_id, destinationH3Index: r.destination_h3_index }));
  const humanOrders = dbGetAll<{ unit_id: string; to_h3_index: string }>('SELECT unit_id, to_h3_index FROM pending_orders');
  const preMoveState = dbBackedStateSnapshot();
  const preMoveHexList = preMoveState.hexes.map((h) => h.h3Index);
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(preMoveHexList);
  const preMoveStateForHuman = getGameStateForPlayer(constants.humanPlayerId, { maskUnexploredTerrain: false });
  const generatedHuman = generateOrdersForStandingOrders(constants.humanPlayerId, preMoveStateForHuman, latLngByH3, resolveToH3);
  const mergedHumanRanged = new Map<string, string>();
  for (const r of generatedHuman.rangedAttacks) mergedHumanRanged.set(r.unitId, r.targetH3Index);
  for (const r of humanRanged) mergedHumanRanged.set(r.unitId, r.targetH3Index);
  const mergedHumanRangedOrders = [...mergedHumanRanged.entries()].map(([unitId, targetH3Index]) => ({
    unitId,
    targetH3Index,
  }));
  const mergedHumanAir = new Map<string, { targetH3Index: string; targetType: AirStrikeTargetType }>();
  for (const a of generatedHuman.airStrikes) {
    mergedHumanAir.set(a.unitId, { targetH3Index: a.targetH3Index, targetType: a.targetType });
  }
  for (const a of humanAirStrikes) {
    mergedHumanAir.set(a.unitId, { targetH3Index: a.targetH3Index, targetType: a.targetType });
  }
  const mergedHumanAirStrikes = [...mergedHumanAir.entries()].map(([unitId, strike]) => ({
    unitId,
    targetH3Index: strike.targetH3Index,
    targetType: strike.targetType,
  }));
  const allAirStrikes = [...mergedHumanAirStrikes, ...aiAirStrikeOrders];
  const strikeUnitIds = new Set(allAirStrikes.map((s) => s.unitId));
  const mergedFerryOrders = [...humanFerryOrders, ...aiFerryOrders];
  const allFerryOrders = mergedFerryOrders.filter((f) => !strikeUnitIds.has(f.unitId));
  const droppedFerryForStrikeCount = mergedFerryOrders.length - allFerryOrders.length;
  if (droppedFerryForStrikeCount > 0) {
    logDebug('ready: dropped ferry orders for units that also strike', {
      droppedFerryForStrikeCount,
      strikeUnitCount: strikeUnitIds.size,
    });
  }
  applyEmbarkOrdersForPlayer(aiEmbarkOrders, 'opponent');
  const allRanged = [...mergedHumanRangedOrders, ...aiRangedOrders];

  const turnNumber = constants.turnNumber;
  const gameSeed = getGameSeed();
  const seed = (gameSeed + turnNumber * 7919) >>> 0;
  const rawCombatRng = createCombatRng(seed);
  let rngInvocationsBeforeMelee = 0;
  const next = (): number => {
    rngInvocationsBeforeMelee += 1;
    return rawCombatRng();
  };
  logDebug('ready: combat resolution', { turnNumber, gameSeed, combatSeed: seed });

  const airStrikeResult = resolveAirStrikePhase(allAirStrikes, next);
  const airStrikeTransportLosses = applyTransportOutcomeForRemovedStrategicUnits(
    airStrikeResult.removedUnitIds,
    airStrikeResult.removedUnits
  );
  const rangedInputUnits = listUnitsForSnapshot()
    .filter((u) => {
      if (u.unitType !== 'infantry' && u.unitType !== 'armor') return true;
      return !isEmbarkedLandUnitOnWater(u.id);
    })
    .map((u) => ({
      id: u.id,
      player: u.player,
      unitType: u.unitType,
      h3Index: u.h3Index,
      displayOrder: u.displayOrder,
    }));
  const rangedResult = runRangedPhase(rangedInputUnits, hexList, allRanged, next);
  for (const id of rangedResult.removedUnitIds) {
    dbRun('DELETE FROM units WHERE id = ?', [id]);
  }
  const rangedTransportLosses = applyTransportOutcomeForRemovedStrategicUnits(
    rangedResult.removedUnitIds,
    rangedResult.removedUnits
  );

  const mergedHuman = new Map<string, string>();
  for (const o of generatedHuman.movementOrders) mergedHuman.set(o.unitId, o.toH3Index);
  for (const o of humanOrders) mergedHuman.set(o.unit_id, o.to_h3_index);
  const humanMoves = Array.from(mergedHuman.entries())
    .map(([unitId, toH3Index]) => {
      const fromH3Index = unitsBeforeMove.find((u) => u.id === unitId)?.h3Index;
      if (!fromH3Index || fromH3Index === toH3Index) return null;
      return { unitId, fromH3Index, toH3Index };
    })
    .filter((m): m is { unitId: string; fromH3Index: string; toH3Index: string } => m !== null);
  const allOrders = [
    ...Array.from(mergedHuman.entries()).map(([unitId, toH3Index]) => ({ unitId, toH3Index })),
    ...aiOrders,
  ];
  autoDisembarkIndependentLandMoves(allOrders);
  const orderDestinationByUnitId = new Map(allOrders.map((order) => [order.unitId, order.toH3Index]));
  const movingNavalUnitIds = allOrders
    .filter((order) => unitsBeforeMove.find((unit) => unit.id === order.unitId)?.unitType === 'naval')
    .map((order) => order.unitId);
  const embarkedFollowMoves: Array<{ unitId: string; fromH3Index: string; toH3Index: string }> = [];
  if (movingNavalUnitIds.length > 0) {
    const placeholders = movingNavalUnitIds.map(() => '?').join(', ');
    const embarkedRows = dbGetAll<{ landUnitId: string; landH3Index: string; navalUnitId: string }>(
      `SELECT uta.land_unit_id AS landUnitId,
              lu.h3_index AS landH3Index,
              uta.naval_unit_id AS navalUnitId
       FROM unit_transport_assignments uta
       JOIN units lu ON lu.id = uta.land_unit_id
       WHERE uta.naval_unit_id IN (${placeholders})`,
      movingNavalUnitIds
    );
    for (const row of embarkedRows) {
      const destination = orderDestinationByUnitId.get(row.navalUnitId);
      if (!destination || destination === row.landH3Index) continue;
      embarkedFollowMoves.push({
        unitId: row.landUnitId,
        fromH3Index: row.landH3Index,
        toH3Index: destination,
      });
    }
  }
  const unitsBeforeMovementAfterCombat = listUnitsForSnapshot().map((u) => ({
    id: u.id,
    player: u.player,
    h3Index: u.h3Index,
    unitType: u.unitType,
  }));
  const traversedHexesByPlayer = collectTraversedHexesByPlayer(allOrders, unitsBeforeMovementAfterCombat);
  const opponentHadStrategicMarchResolution =
    traversedHexesByPlayer.opponent.size > 0 ||
    aiOrders.some((o) => {
      const u = unitsBeforeMove.find((x) => x.id === o.unitId);
      return u?.player === 'opponent' && u.h3Index !== o.toH3Index;
    });
  for (const order of allOrders) {
    const prevUnit = unitsBeforeMove.find((u) => u.id === order.unitId);
    if (prevUnit && prevUnit.h3Index !== order.toH3Index) {
      rememberStrategicHexBeforeMove(order.unitId, prevUnit.h3Index, order.toH3Index);
    }
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [order.toH3Index, order.unitId]);
  }
  syncEmbarkedLandUnitPositionsWithNaval();

  const resolvedFerryMoves: FerryAnimationMove[] = [];
  for (const ferry of allFerryOrders) {
    const unit = dbGetOne<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>(
      'SELECT id, player, unit_type, h3_index, display_order FROM units WHERE id = ?',
      [ferry.unitId]
    );
    if (!unit || unit.unit_type !== 'air') continue;
    const originH3Index = unit.h3_index;
    const withinFerryRange = isWithinAirFerryGridRange(originH3Index, ferry.destinationH3Index, 'ready ferry');
    if (!withinFerryRange) continue;
    const destinationInfra = getRes1InfrastructureForHex(ferry.destinationH3Index);
    const destinationController = getHexController(ferry.destinationH3Index);
    if (destinationInfra.airportCount > 0 && destinationController === unit.player) {
      rememberStrategicHexBeforeMove(ferry.unitId, originH3Index, ferry.destinationH3Index);
      dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [ferry.destinationH3Index, ferry.unitId]);
      resolvedFerryMoves.push({
        unitId: ferry.unitId,
        player: unit.player,
        fromH3Index: originH3Index,
        toH3Index: ferry.destinationH3Index,
      });
      continue;
    }
    const originInfra = getRes1InfrastructureForHex(originH3Index);
    const originController = getHexController(originH3Index);
    if (!(originInfra.airportCount > 0 && originController === unit.player)) {
      dbRun('DELETE FROM units WHERE id = ?', [ferry.unitId]);
    }
  }

  const unitsAfterMove = listUnitsForSnapshot();
  const rangedRemovedSet = new Set(rangedResult.removedUnitIds);
  const combatUnitsAfter: CombatUnit[] = unitsAfterMove
    .filter((u) => !rangedRemovedSet.has(u.id))
    .filter((u) => {
      if (u.unitType !== 'infantry' && u.unitType !== 'armor') return true;
      return !isEmbarkedLandUnitOnWater(u.id);
    })
    .map((u) => ({
      id: u.id,
      player: u.player,
      unitType: u.unitType,
      h3Index: u.h3Index,
      displayOrder: u.displayOrder,
    }));

  const rawMeleeHexes = listMeleeCandidateHexes(combatUnitsAfter, hexList);
  const candidateHexes = filterMeleeCandidateHexesWithTacticalEntry(rawMeleeHexes, {
    allowDuringStrategicResolution: true,
  });
  if (candidateHexes.length > 0) {
    const decisionToken = newMeleeDecisionToken();
    const meleeInterceptCandidates = buildMeleeInterceptCandidateRows(candidateHexes, combatUnitsAfter);
    const snapshot: MeleeInterceptReadyPauseSnapshot = {
      decisionToken,
      turnNumber,
      combatSeed: seed,
      rngInvocationsBeforeMelee,
      hexList: [...hexList],
      combatUnitsAfter: combatUnitsAfter.map((u) => ({ ...u })),
      combatUnitsBefore: combatUnitsBefore.map((u) => ({ ...u })),
      rangedResult,
      airStrikeResult,
      airStrikeTransportLosses,
      rangedTransportLosses,
      humanMoves: [...humanMoves],
      embarkedFollowMoves: [...embarkedFollowMoves],
      resolvedFerryMoves: [...resolvedFerryMoves],
      traversedHexesByPlayer: {
        human: new Set(traversedHexesByPlayer.human),
        opponent: new Set(traversedHexesByPlayer.opponent),
      },
      opponentHadStrategicMarchResolution,
      allRanged: [...allRanged],
      aiRangedOrders: [...aiRangedOrders],
      candidateHexes: [...candidateHexes],
      meleeInterceptCandidates,
    };
    setMeleeInterceptPendingSnapshot(snapshot);
    logDebug('ready: awaiting melee intercept decision', {
      turnNumber,
      candidateHexCount: candidateHexes.length,
      rngInvocationsBeforeMelee,
    });
    return {
      success: true,
      awaitingMeleeDecision: true,
      meleeDecisionToken: decisionToken,
      meleeInterceptCandidates,
    };
  }

  const meleeResult = runMeleePhase(combatUnitsAfter, hexList, next);
  return finalizeReadyTurnAfterMelee({
    meleeResult,
    rangedResult,
    airStrikeResult,
    airStrikeTransportLosses,
    rangedTransportLosses,
    combatUnitsAfter,
    combatUnitsBefore,
    humanMoves,
    embarkedFollowMoves,
    resolvedFerryMoves,
    traversedHexesByPlayer,
    opponentHadStrategicMarchResolution,
    turnNumber,
    allRanged,
    aiRangedOrders,
  });
}
