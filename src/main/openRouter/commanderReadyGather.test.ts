/**
 * Ready gathers one order set for each active AI seat.
 *
 * Purpose: A stored plan, a plan that finishes during the wait, and standing orders for a seat with no model.
 * When to use: `node dist/main/openRouter/commanderReadyGather.test.js`.
 * Expected outcome: Throws on failure.
 * Exceptions: Skips when no regional map with three side groups is installed.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { AI_SEAT_IDS, type AiSeatId } from '../../shared/seatIds';
import { dbGetAll, dbGetOne, dbRun, getGameState, getGameStateForPlayer } from '../gameDb';
import { setAiPendingOrders } from '../gameDb';
import { writeOperationsForSeat } from '../gameDb/operationMemory';
import type { Operation } from '../../shared/operationTypes';
import { listGameMaps } from '../gameMap/listGameMaps';
import { withSeatedTempGameDbAsync } from '../testSupport/withSeatedTempGameDb';
import { resetCommanderPool, setCommanderConsultRunnerForTests, startStrategicPlanning } from './commanderPool';
import { emptyConsultOutcome } from './commanderPoolSupport';
import { gatherCommanderOrdersForReady, buildUnconsultedCommanderOrders } from './commanderReadyGather';

/**
 * The first regional map with at least three side groups.
 *
 * Purpose: The seats need real group ids.
 * When to use: Before the gather case.
 * Expected outcome: The map id and three group ids, or null.
 * Exceptions: None.
 */
function regionalMap(): { id: string; sideGroupIds: string[] } | null {
  const map = listGameMaps().find((entry) => entry.sideGroups.length >= 3);
  if (!map) return null;
  return { id: map.id, sideGroupIds: map.sideGroups.slice(0, 3).map((group) => group.id) };
}

/**
 * One AI seat, with a model unless `modelId` is null.
 *
 * Purpose: The third seat has no model and must not be consulted.
 * When to use: Building the match.
 * Expected outcome: A new-game seat row.
 * Exceptions: None.
 */
function aiSeat(sideGroupId: string, modelId: string | null): NewGameSeatInput {
  return {
    kind: 'ai',
    sideGroupId,
    commander: { modelId, reasoningEffort: null, providerSort: 'throughput', doctrineChoice: 'balanced', nickname: '' },
  };
}

/**
 * Three seats: a stored plan, a plan that arrives while Ready waits, and standing orders.
 *
 * Purpose: Ready must not start a second timeout, and a seat with no model still gets an entry.
 * When to use: This file.
 * Expected outcome: The map has those three seat ids.
 * Exceptions: Skips when no regional map is installed.
 */
test('ready gathers a stored plan, a late plan, and standing orders', async (t) => {
  const map = regionalMap();
  if (!map) {
    t.skip('no regional map with three side groups is extracted');
    return;
  }
  const seats = [
    aiSeat(map.sideGroupIds[0] ?? '', 'model-a'),
    aiSeat(map.sideGroupIds[1] ?? '', 'model-a'),
    aiSeat(map.sideGroupIds[2] ?? '', null),
  ];
  await withSeatedTempGameDbAsync('aw-ready-gather-', { gameMapId: map.id, fogOfWarEnabled: false, seats }, async () => {
    const storedSeat: AiSeatId = AI_SEAT_IDS[0];
    const lateSeat: AiSeatId = AI_SEAT_IDS[1];
    const standingSeat: AiSeatId = AI_SEAT_IDS[2];
    setAiPendingOrders(storedSeat, {
      movementOrders: [{ unitId: 'stored-unit', toH3Index: '8129fffffffffff' }],
      rangedOrders: [],
      airStrikeOrders: [],
      ferryOrders: [],
      embarkOrders: [],
      missileLaunchOrders: [],
    });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    setCommanderConsultRunnerForTests(async (request) => {
      if (request.seatId === lateSeat) await gate;
      return {
        ...emptyConsultOutcome(),
        finished: true,
        movementOrders: [{ unitId: `late-${request.seatId}`, toH3Index: '8129fffffffffff' }],
        modelId: 'model-a',
      };
    });
    startStrategicPlanning([lateSeat]);
    const gathering = gatherCommanderOrdersForReady({
      useEventDriven: true,
      turnNumber: 1,
      aiPlanningRunEnabled: true,
      hasKey: true,
      getGameStateForPlayer: (seatId) => getGameStateForPlayer(seatId),
    });
    release();
    const orders = await gathering;
    assert.equal(orders.get(storedSeat)?.movementOrders[0]?.unitId, 'stored-unit');
    assert.equal(orders.get(lateSeat)?.movementOrders[0]?.unitId, `late-${lateSeat}`);
    assert.ok(orders.get(standingSeat));
    assert.equal(orders.get(standingSeat)?.movementOrders.some((order) => order.unitId.startsWith('late-')), false);
    setCommanderConsultRunnerForTests(null);
    resetCommanderPool([]);
  });
});

test('an air operation in transit replaces that carrier tempo strike with a drop', async (t) => {
  const map = regionalMap();
  if (!map) {
    t.skip('no regional map with three side groups is extracted');
    return;
  }
  const seats = [
    aiSeat(map.sideGroupIds[0] ?? '', null),
    aiSeat(map.sideGroupIds[1] ?? '', null),
  ];
  await withSeatedTempGameDbAsync(
    'aw-ready-air-drop-',
    { gameMapId: map.id, fogOfWarEnabled: false, seats },
    async () => {
      const seatId: AiSeatId = AI_SEAT_IDS[0];
      const enemySeat: AiSeatId = AI_SEAT_IDS[1];
      const airport = dbGetAll<{ h3Index: string }>(
        'SELECT h3_index AS h3Index FROM res_s_infrastructure WHERE airport_count > 0'
      )
        .map((row) => row.h3Index)
        .find((h3Index) => !isNeutralBorderHex(h3Index));
      assert.ok(airport, 'expected an airport that is not a neutral border');
      const onMap = new Set(getGameState().hexes.map((hex) => hex.h3Index));
      const enemyHex = gridDisk(airport, AIR_STRIKE_RANGE_HEXES).find((hex) => hex !== airport && onMap.has(hex));
      assert.ok(enemyHex, 'expected an enemy hex inside air strike range');
      dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', ['air-op', seatId, 'air', airport]);
      dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', ['inf-op', seatId, 'infantry', airport]);
      dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', ['enemy-1', enemySeat, 'infantry', enemyHex]);
      dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['inf-op', 'air-op']);
      const operation: Operation = {
        id: `${seatId}-op1`,
        method: 'air',
        objectiveH3: 'city-hex',
        musterH3: airport,
        landingH3: airport,
        unitIds: ['inf-op'],
        carrierIds: ['air-op'],
        phase: 'transit',
        source: 'engine',
        launchedTurn: 1,
        phaseTurn: 1,
      };
      writeOperationsForSeat({ getOne: dbGetOne, run: dbRun }, seatId, [operation]);
      const unconsulted = buildUnconsultedCommanderOrders(seatId, getGameStateForPlayer(seatId));
      assert.equal(unconsulted.airStrikeOrders.some((strike) => strike.unitId === 'air-op'), true);
      const orders = await gatherCommanderOrdersForReady({
        useEventDriven: true,
        turnNumber: 1,
        aiPlanningRunEnabled: false,
        hasKey: false,
        getGameStateForPlayer: (id) => getGameStateForPlayer(id),
      });
      const seatOrders = orders.get(seatId);
      assert.ok(seatOrders);
      assert.equal(seatOrders.airDropOrders?.some((order) => order.unitId === 'air-op' && order.targetH3Index === 'city-hex'), true);
      assert.equal(seatOrders.airStrikeOrders.some((order) => order.unitId === 'air-op'), false);
      resetCommanderPool([]);
    }
  );
});

test('a state read that throws while adding operation orders keeps that seat pending orders', async () => {
  const map = regionalMap();
  assert.ok(map, 'a regional map with three side groups is required');
  const seats = [
    aiSeat(map.sideGroupIds[0] ?? '', null),
    aiSeat(map.sideGroupIds[1] ?? '', null),
    { kind: 'human' as const, sideGroupId: map.sideGroupIds[2] ?? '' },
  ];
  await withSeatedTempGameDbAsync('aw-ready-gather-throw-', { gameMapId: map.id, fogOfWarEnabled: false, seats }, async () => {
    const keptSeat: AiSeatId = AI_SEAT_IDS[0];
    const otherSeat: AiSeatId = AI_SEAT_IDS[1];
    const pending = (unitId: string) => ({
      movementOrders: [{ unitId, toH3Index: '8129fffffffffff' }],
      rangedOrders: [],
      airStrikeOrders: [],
      ferryOrders: [],
      embarkOrders: [],
      missileLaunchOrders: [],
    });
    setAiPendingOrders(keptSeat, pending('kept-unit'));
    setAiPendingOrders(otherSeat, pending('other-unit'));
    const orders = await gatherCommanderOrdersForReady({
      useEventDriven: true,
      turnNumber: 1,
      aiPlanningRunEnabled: false,
      hasKey: false,
      getGameStateForPlayer: (seatId) => {
        if (seatId === keptSeat) throw new Error('state unavailable');
        return getGameStateForPlayer(seatId);
      },
    });
    assert.equal(orders.get(keptSeat)?.movementOrders[0]?.unitId, 'kept-unit');
    assert.equal(orders.get(otherSeat)?.movementOrders[0]?.unitId, 'other-unit');
    resetCommanderPool([]);
  });
});
