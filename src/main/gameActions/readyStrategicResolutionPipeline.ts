/**
 * Strategic WEGO `ready` resolution from phase flip through air/ranged/movement/ferry and melee branch or finalize.
 *
 * Contract: Callers must run `readyStrategicGuards` and planning-phase checks before invoking; mutates DB like legacy `ready`.
 * When to use: Only from `gameActions.ready` after preconditions succeed.
 * Expected outcome: Same `ReadyResult` shapes as the pre-extraction monolithic implementation.
 * Exceptions: Propagates unexpected errors to the caller for outer `try/catch` handling.
 */

import { dbGetAll, dbGetOne, dbRun, getGameSeed, getHexController, getGameStateForPlayer, getSeatRoster, getStrategicInfrastructureForHex, listUnitsForSnapshot } from '../gameDb';
import { buildLatLngCoordinateMap, getOrderedHexList } from '../mapData';
import { createCombatRng, runMeleePhase, runRangedPhase, type CombatUnit } from '../combatResolution';
import { logDebug, logError } from '../logger';
import type { FerryAnimationMove, ReadyResult, AirStrikeTargetType } from '../../shared/ipcTypes';
import { resolveAirStrikePhase } from './airStrikeResolution';
import { withOriginHitBonus } from '../originBonus/originHitBonusLookup';
import { withTechHitBonus } from '../techBonus/techHitBonusLookup';
import { buildTechHitBonusLookupFromDb } from '../techBonus/techHitBonusLookupDb';
import { readPersistedOriginBonusSettings } from '../gameDb/originBonusConfig';
import { weatherPenaltyForRoll } from '../weather/weatherMatch';
import { weatherBonusLevelOf } from '../../shared/weatherBonusRules';
import { weatherTagsForBirthHex } from '../weather/weatherPackLoad';
import { techLevelForBirthHex } from '../techBonus/techLevelForBirthHex';
import { buildLossFlagFacts } from '../../shared/lossFlagFacts';
import { buildStrategicOriginHitBonusLookupFromDb } from '../originBonus/originHitBonusLookupDb';
import { createStrategicTerrainCoverLookup } from '../terrainCover/terrainCoverLookup';
import {
  applyEmbarkOrdersForPlayer,
  applyTransportOutcomeForRemovedStrategicUnits,
  autoDebarkNonHumanLandUnitIfMovingIndependently,
  isEmbarkedLandUnitOnWater,
  shouldSkipEmbarkedLandIndependentMove,
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
  traversalSetsToRecord,
  type MeleeInterceptReadyPauseSnapshot,
} from './meleeInterceptPendingState';
import { collectTraversedHexesByPlayer } from './controlAndProduction';
import { activeAiSeats } from '../../shared/seatRoster';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, isAiSeatId, NEUTRAL_OWNER_ID, type OwnerId } from '../../shared/seatIds';
import { findHumanSeat, isSeatActive } from '../../shared/seatRoster';
import {
  keepOrdersOfOwnedUnits,
  listsInResolutionOrder,
  ownersInResolutionOrder,
  type TurnOrdersByOwner,
} from './ownerTurnOrders';
import { buildNeutralTurnOrders, prepareNeutralTransportsForTurn } from './neutralTurn';
import { generateOrdersForStandingOrders } from '../tools/standingOrders';
import { isWithinAirFerryGridRange } from './gridRange';
import { strategicFerryRangeOnState } from '../weather/weatherMatch';
import { hasIntactAirportAtStrategicAirBase } from '../returnFireAirportLookup';

/**
 * Planning identity constants injected from `gameActions` so this module stays free of duplicate literals.
 *
 * Contract: `validPhase` must match `turn_state.phase` while human orders are being collected.
 * When to use: Passed on every `executeReadyStrategicTurn` call from the `ready` export.
 * Expected outcome: Standing-order generation and order merges target the configured human id.
 * Exceptions: None.
 */
export type ReadyStrategicPlanningConstants = {
  humanPlayerId: typeof HUMAN_SEAT_ID;
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
  ordersByOwner: TurnOrdersByOwner,
  constants: ReadyStrategicPlanningConstants
): ReadyResult {
  logDebug('executeReadyStrategicTurn', { ownerCount: ordersByOwner.size, turnNumber: constants.turnNumber });

  dbRun('UPDATE turn_state SET phase = ? WHERE id = 1', ['resolution']);

  const hexList = getOrderedHexList();
  prepareNeutralTransportsForTurn(buildLatLngCoordinateMap(hexList));
  const unitsBeforeMove = listUnitsForSnapshot();
  const combatUnitsBefore: CombatUnit[] = unitsBeforeMove.map((u) => ({
    id: u.id,
    player: u.player,
    unitType: u.unitType,
    h3Index: u.h3Index,
    displayOrder: u.displayOrder,
  }));
  const unitOwnerById = new Map(unitsBeforeMove.map((unit) => [unit.id, unit.player]));
  const ordersForOwners = new Map<OwnerId, ReturnType<typeof keepOrdersOfOwnedUnits>>();
  for (const [owner, orders] of ordersByOwner) {
    if (owner === HUMAN_SEAT_ID) continue;
    if (owner === NEUTRAL_OWNER_ID) {
      logError('executeReadyStrategicTurn ignored Neutral orders from the caller', { owner });
      continue;
    }
    ordersForOwners.set(owner, keepOrdersOfOwnedUnits(owner, orders, unitOwnerById));
  }
  const firstAiOrders = ordersForOwners.get(AI_SEAT_IDS[0]);

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
  const neutralOrders = buildNeutralTurnOrders({ latLngByH3, resolveToH3 });
  if (
    neutralOrders.movementOrders.length > 0
    || neutralOrders.rangedOrders.length > 0
    || neutralOrders.airStrikeOrders.length > 0
  ) {
    ordersForOwners.set(NEUTRAL_OWNER_ID, keepOrdersOfOwnedUnits(NEUTRAL_OWNER_ID, neutralOrders, unitOwnerById));
  }
  const allAirStrikes = listsInResolutionOrder(mergedHumanAirStrikes, ordersForOwners, (orders) => orders.airStrikeOrders);
  const strikeUnitIds = new Set(allAirStrikes.map((s) => s.unitId));
  const mergedFerryOrders = listsInResolutionOrder(humanFerryOrders, ordersForOwners, (orders) => orders.ferryOrders);
  const allFerryOrders = mergedFerryOrders.filter((f) => !strikeUnitIds.has(f.unitId));
  const droppedFerryForStrikeCount = mergedFerryOrders.length - allFerryOrders.length;
  if (droppedFerryForStrikeCount > 0) {
    logDebug('ready: dropped ferry orders for units that also strike', {
      droppedFerryForStrikeCount,
      strikeUnitCount: strikeUnitIds.size,
    });
  }
  for (const owner of ownersInResolutionOrder(ordersForOwners)) {
    const embarkOrders = ordersForOwners.get(owner)?.embarkOrders ?? [];
    if (embarkOrders.length === 0) continue;
    applyEmbarkOrdersForPlayer([...embarkOrders], owner);
  }
  const allRanged = listsInResolutionOrder(mergedHumanRangedOrders, ordersForOwners, (orders) => orders.rangedOrders);
  const aiRangedOrders = [...(firstAiOrders?.rangedOrders ?? [])];

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

  const originHitBonusAt = buildStrategicOriginHitBonusLookupFromDb();
  const weatherSettings = readPersistedOriginBonusSettings({ getOne: dbGetOne, hasDb: () => true });
  const lossFlagFactsByUnitId = buildLossFlagFacts(unitsBeforeMove, {
    weatherEnabled: weatherSettings.weatherBonusEnabled === true,
    techEnabled: weatherSettings.techBonusEnabled === true,
    weatherTagsFor: weatherTagsForBirthHex,
    techLevelFor: techLevelForBirthHex,
  });
  logDebug('executeReadyStrategicTurn loss flag facts', {
    unitCount: unitsBeforeMove.length,
    withOrigin: lossFlagFactsByUnitId.size,
  });
  const listedForWeather = listUnitsForSnapshot();
  const techHitBonusAt = buildTechHitBonusLookupFromDb(listedForWeather);
  const targetCoverAt = createStrategicTerrainCoverLookup(preMoveState.hexes);
  const airStrikeResult = resolveAirStrikePhase(allAirStrikes, next, originHitBonusAt, targetCoverAt, techHitBonusAt);
  const airStrikeTransportLosses = applyTransportOutcomeForRemovedStrategicUnits(
    airStrikeResult.removedUnitIds,
    airStrikeResult.removedUnits
  );
  const rangedInputUnits = withTechHitBonus(withOriginHitBonus(
    listedForWeather
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
      })),
    originHitBonusAt
  ).map((unit) => {
    const source = listedForWeather.find((candidate) => candidate.id === unit.id);
    const penalty = weatherPenaltyForRoll({
      unitType: unit.unitType,
      kind: 'ranged',
      level: weatherBonusLevelOf(weatherSettings),
      turnNumber,
      startMonth: weatherSettings.startMonth ?? 1,
      unitH3Index: unit.h3Index,
      tags: weatherTagsForBirthHex(source?.origin?.birthH3Index),
    });
    return penalty === 0 ? unit : { ...unit, weatherAttackPenalty: penalty };
  }), techHitBonusAt);
  const rangedResult = runRangedPhase(
    rangedInputUnits,
    hexList,
    allRanged,
    next,
    { theater: 'strategic', hasIntactAirportAtAirBase: hasIntactAirportAtStrategicAirBase },
    targetCoverAt
  );
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
  const humanMovementOrders = Array.from(mergedHuman.entries()).map(([unitId, toH3Index]) => ({ unitId, toH3Index }));
  const allOrders = listsInResolutionOrder(humanMovementOrders, ordersForOwners, (orders) => orders.movementOrders);
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
  const hadStrategicMarchResolutionBySeat: Record<string, boolean> = {};
  for (const seat of activeAiSeats(getSeatRoster())) {
    if (!isAiSeatId(seat.seatId)) continue;
    const traversed = (traversedHexesByPlayer.get(seat.seatId)?.size ?? 0) > 0;
    const marched = allOrders.some((order) => {
      const unit = unitsBeforeMove.find((candidate) => candidate.id === order.unitId);
      return unit?.player === seat.seatId && unit.h3Index !== order.toH3Index;
    });
    hadStrategicMarchResolutionBySeat[seat.seatId] = traversed || marched;
  }
  const aiMoves = allOrders.flatMap((order) => {
    const unit = unitsBeforeMove.find((candidate) => candidate.id === order.unitId);
    if (!unit || unit.player === HUMAN_SEAT_ID || unit.h3Index === order.toH3Index) return [];
    return [{ unitId: order.unitId, fromH3Index: unit.h3Index, toH3Index: order.toH3Index }];
  });
  for (const order of allOrders) {
    autoDebarkNonHumanLandUnitIfMovingIndependently(order.unitId, order.toH3Index);
    if (shouldSkipEmbarkedLandIndependentMove(order.unitId, order.toH3Index)) {
      logDebug('readyStrategicResolutionPipeline skip embarked independent move', {
        unitId: order.unitId,
        toH3Index: order.toH3Index,
      });
      continue;
    }
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
    const birth = dbGetOne<{ birth_h3_index: string | null }>('SELECT birth_h3_index FROM units WHERE id = ?', [ferry.unitId])?.birth_h3_index;
    const ferryRange = strategicFerryRangeOnState(
      { weatherTags: weatherTagsForBirthHex(birth) },
      ferry.destinationH3Index,
      { weatherBonusEnabled: weatherSettings.weatherBonusEnabled, turnNumber, startMonth: weatherSettings.startMonth }
    );
    const withinFerryRange = isWithinAirFerryGridRange(originH3Index, ferry.destinationH3Index, 'ready ferry', ferryRange);
    if (!withinFerryRange) continue;
    const destinationInfra = getStrategicInfrastructureForHex(ferry.destinationH3Index);
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
    const originInfra = getStrategicInfrastructureForHex(originH3Index);
    const originController = getHexController(originH3Index);
    if (!(originInfra.airportCount > 0 && originController === unit.player)) {
      dbRun('DELETE FROM units WHERE id = ?', [ferry.unitId]);
    }
  }

  const unitsAfterMove = listUnitsForSnapshot();
  const rangedRemovedSet = new Set(rangedResult.removedUnitIds);
  const combatUnitsAfter: CombatUnit[] = withTechHitBonus(withOriginHitBonus(
    unitsAfterMove
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
      })),
    originHitBonusAt
  ), techHitBonusAt);

  const rawMeleeHexes = listMeleeCandidateHexes(combatUnitsAfter, hexList);
  const human = findHumanSeat(getSeatRoster());
  const observing = human == null || !isSeatActive(human);
  const visibleHexes = observing ? new Set<string>() : new Set(getGameStateForPlayer(HUMAN_SEAT_ID).visibleHexes ?? []);
  const seenHexes = observing ? [] : rawMeleeHexes.filter((hex) => visibleHexes.has(hex));
  const partySeats = getSeatRoster().map((seat) => ({ seatId: seat.seatId, seatOrder: seat.seatOrder }));
  let meleeInterceptCandidates = buildMeleeInterceptCandidateRows(seenHexes, combatUnitsAfter, partySeats);
  const placeable = new Set(filterMeleeCandidateHexesWithTacticalEntry(
    meleeInterceptCandidates.filter((row) => row.tacticalEligible).map((row) => row.h3Index),
    { allowDuringStrategicResolution: true }
  ));
  meleeInterceptCandidates = meleeInterceptCandidates.map((row) =>
    row.tacticalEligible && !placeable.has(row.h3Index) ? { ...row, tacticalEligible: false } : row
  );
  const candidateHexes = meleeInterceptCandidates.filter((row) => row.tacticalEligible).map((row) => row.h3Index);
  if (!observing && candidateHexes.length > 0) {
    const decisionToken = newMeleeDecisionToken();
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
      aiMoves: [...aiMoves],
      embarkedFollowMoves: [...embarkedFollowMoves],
      resolvedFerryMoves: [...resolvedFerryMoves],
      traversedHexesByPlayer: traversalSetsToRecord(traversedHexesByPlayer),
      hadStrategicMarchResolutionBySeat,
      allRanged: [...allRanged],
      aiRangedOrders: [...aiRangedOrders],
      candidateHexes: [...candidateHexes],
      meleeInterceptCandidates,
      lossFlagFactsByUnitId,
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
    aiMoves,
    embarkedFollowMoves,
    resolvedFerryMoves,
    traversedHexesByPlayer,
    hadStrategicMarchResolutionBySeat,
    turnNumber,
    allRanged,
    aiRangedOrders,
    knockoutCoordinates: { latLngByH3, resolveToH3 },
    lossFlagFactsByUnitId,
  });
}
