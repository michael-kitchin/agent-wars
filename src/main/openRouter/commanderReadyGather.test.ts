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
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { AI_SEAT_IDS, type AiSeatId } from '../../shared/seatIds';
import { getGameStateForPlayer } from '../gameDb';
import { setAiPendingOrders } from '../gameDb';
import { listGameMaps } from '../gameMap/listGameMaps';
import { withSeatedTempGameDbAsync } from '../testSupport/withSeatedTempGameDb';
import { resetCommanderPool, setCommanderConsultRunnerForTests, startStrategicPlanning } from './commanderPool';
import { emptyConsultOutcome } from './commanderPoolSupport';
import { gatherCommanderOrdersForReady } from './commanderReadyGather';

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
    commander: { modelId, reasoningEffort: null, doctrineChoice: 'balanced' },
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
