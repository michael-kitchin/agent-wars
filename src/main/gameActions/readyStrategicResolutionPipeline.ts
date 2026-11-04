/**
 * Strategic WEGO `ready` resolution from phase flip through air/ranged/movement/ferry and melee branch or finalize.
 *
 * Contract: Callers must run `readyStrategicGuards` and planning-phase checks before invoking; mutates DB like legacy `ready`.
 * When to use: Only from `gameActions.ready` after preconditions succeed.
 * Expected outcome: Same `ReadyResult` shapes as the pre-extraction monolithic implementation.
 * Exceptions: Propagates unexpected errors to the caller for outer `try/catch` handling.
 */

import { dbGetAll, dbGetOne, dbRun, getGameSeed, getGameStateForPlayer, getSeatRoster, listUnitsForSnapshot } from '../gameDb';
import { readAiOnlyBattles } from '../gameDb/gameConfigKv';
import { buildSightCuesForReady } from '../sightCues/sightCueReadyStage';
import { buildAiOnlyBattleOffer } from './aiOnlyBattleOffer';
import { withoutStrategicHeadOnHolderMoves } from './strategicHeadOnContact';
import { buildLatLngCoordinateMap, getOrderedHexList } from '../mapData';
import { createCombatRng, runMeleePhase, runRangedPhase, type CombatUnit } from '../combatResolution';
import { logDebug, logError } from '../logger';
import type { ReadyResult, AirStrikeTargetType } from '../../shared/ipcTypes';
import { resolveAirStrikePhase } from './airStrikeResolution';
import { resolveStrategicFerryOrders, airCargoFollowMoves } from './airFerryResolution';
import { resolveAirDropPhase, reconcileHumanAirActions } from './airDropResolution';
import { resolveMissileLaunchPhase } from './missileLaunchResolution';
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
  shouldSkipEmbarkedLandIndependentMove,
  syncEmbarkedLandUnitPositionsWithNaval,
} from './sealift';
import { landUnitSitsOutCombat } from './airlift';
import { rememberStrategicHexBeforeMove } from '../strategicUnitPreviousHex';
import { createStrategicFortificationHooks } from './fortificationCombatLedger';
import type { FortificationLossTally } from '../fortificationCombat';
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
 * Projects one snapshot unit into the combat-phase row.
 *
 * Purpose: Air, ranged, and melee all read the same five fields.
 * When to use: At each combat-unit list built from `listUnitsForSnapshot`.
 * Expected outcome: A `CombatUnit` with the unit's id, owner, type, hex, and display order.
 * Exceptions: None.
 */
function toCombatUnit(unit: {
  readonly id: string;
  readonly player: string;
  readonly unitType: CombatUnit['unitType'];
  readonly h3Index: string;
  readonly displayOrder?: CombatUnit['displayOrder'];
}): CombatUnit {
  return {
    id: unit.id,
    player: unit.player,
    unitType: unit.unitType,
    h3Index: unit.h3Index,
    displayOrder: unit.displayOrder,
  };
}

/**
 * Drops land units that sit out this combat.
 *
 * Purpose: Ranged fire and post-move melee ignore ship cargo on water and air cargo on every terrain.
 * When to use: Immediately before projecting those lists to `CombatUnit`.
 * Expected outcome: Non-land rows pass through. Land rows stay only when `landUnitSitsOutCombat` is false.
 * Exceptions: None.
 */
function withoutEmbarkedLandOnWater<T extends { readonly id: string; readonly unitType: string }>(
  units: readonly T[]
): T[] {
  return units.filter((u) => {
    if (u.unitType !== 'infantry' && u.unitType !== 'armor') return true;
    return !landUnitSitsOutCombat(u.id);
  });
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
  const planningUnits = listUnitsForSnapshot();
  const sightCues = buildSightCuesForReady({ units: planningUnits, hexList });
  prepareNeutralTransportsForTurn(buildLatLngCoordinateMap(hexList));
  const unitsBeforeMove = listUnitsForSnapshot();
  const combatUnitsBefore: CombatUnit[] = unitsBeforeMove.map(toCombatUnit);
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
  const humanMissileLaunches = dbGetAll<{ unit_id: string; target_h3_index: string }>(
    'SELECT unit_id, target_h3_index FROM pending_missile_launches ORDER BY unit_id'
  ).map((row) => ({ unitId: row.unit_id, targetH3Index: row.target_h3_index }));
  const humanFerryOrders = dbGetAll<{ unit_id: string; destination_h3_index: string }>(
    'SELECT unit_id, destination_h3_index FROM pending_ferry_orders ORDER BY unit_id, destination_h3_index'
  ).map((r) => ({ unitId: r.unit_id, destinationH3Index: r.destination_h3_index }));
  const humanDropOrders = dbGetAll<{ unit_id: string; target_h3_index: string }>(
    'SELECT unit_id, target_h3_index FROM pending_air_drop_orders ORDER BY unit_id'
  ).map((row) => ({ unitId: row.unit_id, targetH3Index: row.target_h3_index }));
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
  const humanAir = reconcileHumanAirActions({
    generatedStrikes: generatedHuman.airStrikes,
    explicitStrikes: humanAirStrikes,
    ferryOrders: humanFerryOrders,
    dropOrders: humanDropOrders,
  });
  const neutralOrders = buildNeutralTurnOrders({ latLngByH3, resolveToH3 });
  if (
    neutralOrders.movementOrders.length > 0
    || neutralOrders.rangedOrders.length > 0
    || neutralOrders.airStrikeOrders.length > 0
  ) {
    ordersForOwners.set(NEUTRAL_OWNER_ID, keepOrdersOfOwnedUnits(NEUTRAL_OWNER_ID, neutralOrders, unitOwnerById));
  }
  const allAirStrikes = listsInResolutionOrder(humanAir.strikes, ordersForOwners, (orders) => orders.airStrikeOrders);
  const allMissileLaunches = listsInResolutionOrder(
    humanMissileLaunches,
    ordersForOwners,
    (orders) => orders.missileLaunchOrders
  );
  const strikeUnitIds = new Set(allAirStrikes.map((s) => s.unitId));
  const mergedDropOrders = listsInResolutionOrder(humanAir.dropOrders, ordersForOwners, (orders) => orders.airDropOrders ?? []);
  const allDropOrders = mergedDropOrders.filter((drop) => !strikeUnitIds.has(drop.unitId));
  const droppedDropForStrikeCount = mergedDropOrders.length - allDropOrders.length;
  if (droppedDropForStrikeCount > 0) {
    logDebug('ready: dropped air drop orders for units that also strike', {
      droppedDropForStrikeCount,
      strikeUnitCount: strikeUnitIds.size,
    });
  }
  const dropUnitIds = new Set(allDropOrders.map((drop) => drop.unitId));
  const mergedFerryOrders = listsInResolutionOrder(humanAir.ferryOrders, ordersForOwners, (orders) => orders.ferryOrders);
  const ferriesAfterStrikes = mergedFerryOrders.filter((ferry) => !strikeUnitIds.has(ferry.unitId));
  const allFerryOrders = ferriesAfterStrikes.filter((ferry) => !dropUnitIds.has(ferry.unitId));
  const droppedFerryForStrikeCount = mergedFerryOrders.length - ferriesAfterStrikes.length;
  const droppedFerryForDropCount = ferriesAfterStrikes.length - allFerryOrders.length;
  if (droppedFerryForStrikeCount > 0) {
    logDebug('ready: dropped ferry orders for units that also strike', {
      droppedFerryForStrikeCount,
      strikeUnitCount: strikeUnitIds.size,
    });
  }
  if (droppedFerryForDropCount > 0) {
    logDebug('ready: dropped ferry orders for units that also drop', {
      droppedFerryForDropCount,
      dropUnitCount: dropUnitIds.size,
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
  const fortificationTally: FortificationLossTally = new Map();
  const fortificationHooks = createStrategicFortificationHooks({ next, tally: fortificationTally });
  logDebug('ready: combat resolution', { turnNumber, gameSeed, combatSeed: seed });
  const missileLaunchResult = resolveMissileLaunchPhase(allMissileLaunches, next, fortificationTally);

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
  const airStrikeResult = resolveAirStrikePhase(
    allAirStrikes,
    next,
    originHitBonusAt,
    targetCoverAt,
    techHitBonusAt,
    { hooks: fortificationHooks, tally: fortificationTally }
  );
  const airStrikeTransportLosses = applyTransportOutcomeForRemovedStrategicUnits(
    airStrikeResult.removedUnitIds,
    airStrikeResult.removedUnits
  );
  const airDropResult = resolveAirDropPhase(allDropOrders, next, originHitBonusAt, techHitBonusAt);
  for (const roll of airDropResult.diceRolls) airStrikeResult.diceRolls.push(roll);
  const removedBeforeRanged = new Set<string>([
    ...missileLaunchResult.removedUnitIds,
    ...airStrikeResult.removedUnitIds,
    ...airStrikeTransportLosses.map((unit) => unit.id),
    ...airDropResult.removedUnitIds,
  ]);
  const listedForRanged = listUnitsForSnapshot().filter((unit) => !removedBeforeRanged.has(unit.id));
  const rangedInputUnits = withTechHitBonus(withOriginHitBonus(
    withoutEmbarkedLandOnWater(listedForRanged).map(toCombatUnit),
    originHitBonusAt
  ).map((unit) => {
    const source = listedForRanged.find((candidate) => candidate.id === unit.id);
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
    {
      returnFireContext: { theater: 'strategic', hasIntactAirportAtAirBase: hasIntactAirportAtStrategicAirBase },
      targetCoverAt,
      fortification: fortificationHooks,
    }
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
  const humanMovementOrders = Array.from(mergedHuman.entries()).map(([unitId, toH3Index]) => ({ unitId, toH3Index }));
  const unitsAtMovement = listUnitsForSnapshot();
  const headOn = withoutStrategicHeadOnHolderMoves({
    orders: listsInResolutionOrder(humanMovementOrders, ordersForOwners, (orders) => orders.movementOrders),
    unitsAtMovement,
    turnNumber,
    gameSeed,
  });
  const allOrders = headOn.orders;
  const humanMoves: Array<{
    unitId: string;
    fromH3Index: string;
    toH3Index: string;
    pathH3Indexes?: readonly string[];
  }> = Array.from(mergedHuman.entries())
    .filter(([unitId]) => !headOn.cancelledUnitIds.has(unitId))
    .map(([unitId, toH3Index]) => {
      const unit = unitsBeforeMove.find((u) => u.id === unitId);
      if (!unit || unit.unitType === 'air' || unit.h3Index === toH3Index) return null;
      return { unitId, fromH3Index: unit.h3Index, toH3Index };
    })
    .filter((m): m is { unitId: string; fromH3Index: string; toH3Index: string } => m !== null);
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
  const unitsBeforeMovementAfterCombat = unitsAtMovement.map((u) => ({
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
  const aiMoves: Array<{
    unitId: string;
    fromH3Index: string;
    toH3Index: string;
    player?: string;
    pathH3Indexes?: readonly string[];
  }> = allOrders.flatMap((order) => {
    const unit = unitsBeforeMove.find((candidate) => candidate.id === order.unitId);
    if (!unit || unit.player === HUMAN_SEAT_ID || unit.unitType === 'air' || unit.h3Index === order.toH3Index) return [];
    return [{ unitId: order.unitId, fromH3Index: unit.h3Index, toH3Index: order.toH3Index, player: unit.player }];
  });
  for (const order of allOrders) {
    const movingUnit = unitsBeforeMove.find((unit) => unit.id === order.unitId);
    if (movingUnit?.unitType === 'air') {
      logDebug('readyStrategicResolutionPipeline skip air ground move', { unitId: order.unitId });
      continue;
    }
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

  const resolvedFerryMoves = resolveStrategicFerryOrders(allFerryOrders);
  const airCargo = airCargoFollowMoves(resolvedFerryMoves);
  humanMoves.push(...airCargo.humanMoves);
  aiMoves.push(...airCargo.aiMoves);
  syncEmbarkedLandUnitPositionsWithNaval();

  const unitsAfterMove = listUnitsForSnapshot();
  const rangedRemovedSet = new Set(rangedResult.removedUnitIds);
  const combatUnitsAfter: CombatUnit[] = withTechHitBonus(withOriginHitBonus(
    withoutEmbarkedLandOnWater(unitsAfterMove.filter((u) => !rangedRemovedSet.has(u.id))).map(toCombatUnit),
    originHitBonusAt
  ), techHitBonusAt);

  const rawMeleeHexes = listMeleeCandidateHexes(combatUnitsAfter, hexList);
  const roster = getSeatRoster();
  const human = findHumanSeat(roster);
  const observing = human == null || !isSeatActive(human);
  const partySeats = roster.map((seat) => ({ seatId: seat.seatId, seatOrder: seat.seatOrder }));
  const aiOnlyMode = observing ? readAiOnlyBattles({ getOne: dbGetOne, run: dbRun }) : 'none';
  let aiOnlyChosen: string | null = null;
  let meleeInterceptCandidates;
  let candidateHexes: string[];
  if (observing && aiOnlyMode !== 'none') {
    const offered = buildAiOnlyBattleOffer({
      hexes: rawMeleeHexes,
      units: combatUnitsAfter,
      partySeats,
      roster,
      mode: aiOnlyMode,
      seed: getGameSeed(),
      turnNumber,
    });
    meleeInterceptCandidates = offered.candidates;
    aiOnlyChosen = offered.chosenH3Index;
    candidateHexes = aiOnlyChosen ? [aiOnlyChosen] : [];
  } else {
    const visibleHexes = observing ? new Set<string>() : new Set(getGameStateForPlayer(HUMAN_SEAT_ID).visibleHexes ?? []);
    const seenHexes = observing ? [] : rawMeleeHexes.filter((hex) => visibleHexes.has(hex));
    meleeInterceptCandidates = buildMeleeInterceptCandidateRows(seenHexes, combatUnitsAfter, partySeats);
    const placeable = new Set(filterMeleeCandidateHexesWithTacticalEntry(
      meleeInterceptCandidates.filter((row) => row.tacticalEligible).map((row) => row.h3Index),
      { allowDuringStrategicResolution: true }
    ));
    meleeInterceptCandidates = meleeInterceptCandidates.map((row) =>
      row.tacticalEligible && !placeable.has(row.h3Index) ? { ...row, tacticalEligible: false } : row
    );
    candidateHexes = meleeInterceptCandidates.filter((row) => row.tacticalEligible).map((row) => row.h3Index);
  }
  if ((!observing && candidateHexes.length > 0) || aiOnlyChosen) {
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
      airDropResult,
      missileLaunchResult,
      sightCues,
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
      fortificationTally,
    };
    setMeleeInterceptPendingSnapshot(snapshot);
    logDebug('ready: awaiting melee intercept decision', {
      turnNumber,
      candidateHexCount: candidateHexes.length,
      rngInvocationsBeforeMelee,
      aiOnlyMode,
      aiOnlyChosen,
    });
    return {
      success: true,
      awaitingMeleeDecision: true,
      meleeDecisionToken: decisionToken,
      meleeInterceptCandidates,
      ...(aiOnlyChosen ? { aiOnlyBattleH3Index: aiOnlyChosen } : {}),
    };
  }

  const meleeResult = runMeleePhase(combatUnitsAfter, hexList, next, { fortification: fortificationHooks });
  return finalizeReadyTurnAfterMelee({
    meleeResult,
    rangedResult,
    airStrikeResult,
    airDropResult,
    missileLaunchResult,
    sightCues,
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
    fortificationTally,
  });
}
