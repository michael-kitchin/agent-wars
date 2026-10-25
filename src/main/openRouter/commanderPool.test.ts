/**
 * The commander pool starts one consult per AI seat and keeps each seat's plan.
 *
 * Purpose: Confirms concurrent starts, per-seat orders and cost, a missing model, a timeout, and a single-seat cancel.
 * When to use: `node dist/main/openRouter/commanderPool.test.js`.
 * Expected outcome: Throws on failure.
 * Exceptions: Skips when no regional map with three side groups is installed.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, test } from 'node:test';
import { resetActiveGameMap } from '../../shared/activeGameMap';
import { setLoadedStrategicFootprint } from '../../shared/loadedStrategicFootprint';
import { formatModelOptionLabel } from '../../shared/openRouterModelDisplay';
import { AI_SEAT_IDS, type AiSeatId } from '../../shared/seatIds';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import {
  closeGameDatabaseForTests,
  dbGetOne,
  getAiPendingOrders,
  getGameState,
  getSeatRoster,
  openGameDatabaseAtPathForTests,
  resetGameForNewMatch,
} from '../gameDb';
import type { ResetGameForNewMatchOptions } from '../gameDb/resetGame';
import { listGameMaps } from '../gameMap/listGameMaps';
import { clearLoadedGameMapForTests } from '../gameMap/loadGameMap';
import { setRegionPackUserDataRootForTests } from '../gameMap/regionPackExtract';
import { clearScenarioRegionCache, installSideGroupHomes } from '../regionScenario';
import { clearTerrainClassificationCache } from '../terrainClassificationCache';
import { setActiveTerrainPackDirectory } from '../terrainMetadataPaths';
import { clearTacticalBirthCountryCache } from '../unitOrigin/tacticalBirthCountryCache';
import { clearTacticalOriginAreas } from '../unitOrigin/tacticalOriginAreas';
import { clearWeatherPackCache } from '../weather/weatherPackLoad';
import {
  cancelSeatPlanning,
  readCommanderPoolSnapshot,
  resetCommanderPool,
  setCommanderConsultRunnerForTests,
  setCommanderPoolTimingForTests,
  startStrategicPlanning,
  waitForSeatsSettled,
} from './commanderPool';
import { emptyConsultOutcome, type CommanderConsultOutcome, type CommanderConsultRequest } from './commanderPoolSupport';
import { rememberOpenRouterModels, resetOpenRouterModelCapabilitiesForTests } from './openRouterModelCapabilities';

const SEAT_IDS: readonly AiSeatId[] = [AI_SEAT_IDS[0], AI_SEAT_IDS[1], AI_SEAT_IDS[2]];
const STRATEGY = 'Hold the ridge';

/**
 * The first regional map with at least three side groups.
 *
 * Purpose: The seats need real group ids.
 * When to use: Before opening a match in this file.
 * Expected outcome: The map id and three group ids, or null when none is installed.
 * Exceptions: None.
 */
function regionalMap(): { id: string; sideGroupIds: string[] } | null {
  const map = listGameMaps().find((entry) => entry.sideGroups.length >= 3);
  if (!map) return null;
  return { id: map.id, sideGroupIds: map.sideGroups.slice(0, 3).map((group) => group.id) };
}

/**
 * One AI seat with the given model, or none.
 *
 * Purpose: The pool consults a seat only when `modelId` is set.
 * When to use: Building the three-seat roster.
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
 * A finished consult for one seat.
 *
 * Purpose: The fake returns the same shape the production runner returns.
 * When to use: Seats that should store orders.
 * Expected outcome: Movement, prose, cost, and the model id. No tactical plan.
 * Exceptions: None.
 */
function finishedConsult(seatId: AiSeatId): CommanderConsultOutcome {
  return {
    ...emptyConsultOutcome(),
    finished: true,
    movementOrders: [{ unitId: `move-${seatId}`, toH3Index: '8129fffffffffff' }],
    message: 'You cannot hide.',
    strategy: STRATEGY,
    costUsd: 1.25,
    modelId: 'model-a',
  };
}

/**
 * Lets queued database writes finish.
 *
 * Purpose: The pool writes on a microtask so consults can start together.
 * When to use: After a start, before reading orders.
 * Expected outcome: Resolves after several turns of the microtask queue.
 * Exceptions: None.
 */
async function flushWrites(): Promise<void> {
  for (let step = 0; step < 12; step += 1) await Promise.resolve();
}

/**
 * Opens a three-seat match and closes it after the case.
 *
 * Purpose: The shared database helper returns before an async case finishes.
 * When to use: Every test in this file.
 * Expected outcome: `runCase` sees the match. The pool and the database are cleared afterward.
 * Exceptions: Propagates a case error after cleanup.
 */
async function withMatch(modelIds: readonly (string | null)[], runCase: () => Promise<void>): Promise<void> {
  const map = regionalMap();
  if (!map) throw new Error('no regional map');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-commander-pool-'));
  const options: ResetGameForNewMatchOptions = {
    gameMapId: map.id,
    fogOfWarEnabled: false,
    seats: modelIds.map((modelId, index) => aiSeat(map.sideGroupIds[index] ?? '', modelId)),
  };
  fs.mkdirSync(path.join(dir, 'user-data'));
  setRegionPackUserDataRootForTests(path.join(dir, 'user-data'));
  try {
    openGameDatabaseAtPathForTests(path.join(dir, 't.sqlite'));
    resetGameForNewMatch(options);
    resetCommanderPool(getSeatRoster());
    await runCase();
  } finally {
    setCommanderConsultRunnerForTests(null);
    setCommanderPoolTimingForTests(null);
    resetCommanderPool([]);
    await flushWrites();
    resetOpenRouterModelCapabilitiesForTests();
    setRegionPackUserDataRootForTests(null);
    closeGameDatabaseForTests();
    clearTerrainClassificationCache();
    clearWeatherPackCache();
    clearTacticalBirthCountryCache();
    clearScenarioRegionCache();
    clearLoadedGameMapForTests();
    setActiveTerrainPackDirectory(null);
    setLoadedStrategicFootprint(null);
    installSideGroupHomes(null);
    clearTacticalOriginAreas();
    resetActiveGameMap();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('commander pool', { concurrency: 1 }, () => {
  /**
   * Three commanders start before any consult resolves, then each stores its own plan.
   *
   * Purpose: A lock around the whole consult would let only one seat start.
   * When to use: The pool's start path.
   * Expected outcome: Three pending plans, three dispatches, and one counted consult each. Prose stays off the order row.
   * Exceptions: Skips when no regional map is installed.
   */
  test('three commanders plan together and each keeps its own orders', async (t) => {
    if (!regionalMap()) {
      t.skip('no regional map with three side groups is extracted');
      return;
    }
    await withMatch(['model-a', 'model-a', 'model-a'], async () => {
      rememberOpenRouterModels([{ id: 'model-a', name: 'Model A' }]);
      const starts: AiSeatId[] = [];
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      setCommanderConsultRunnerForTests(async (request) => {
        starts.push(request.seatId);
        await gate;
        return finishedConsult(request.seatId);
      });
      startStrategicPlanning();
      assert.deepEqual(starts, [...SEAT_IDS]);
      const planning = readCommanderPoolSnapshot(false);
      assert.deepEqual(
        planning.statuses.map((row) => row.status),
        ['planning', 'planning', 'planning']
      );
      release();
      await waitForSeatsSettled(SEAT_IDS, 5_000);
      const label = formatModelOptionLabel({ id: 'model-a', name: 'Model A' });
      for (const seatId of SEAT_IDS) {
        const pending = getAiPendingOrders(seatId);
        assert.equal(pending?.movementOrders[0]?.unitId, `move-${seatId}`);
        const stored = dbGetOne<{ strategy_text: string | null }>(
          'SELECT strategy_text FROM ai_pending_orders WHERE player_id = ?',
          [seatId]
        );
        const strategyText = stored?.strategy_text ?? '';
        assert.equal(strategyText.includes(STRATEGY), false);
        const extra = JSON.parse(strategyText) as { airStrikeOrders?: unknown };
        assert.ok(Array.isArray(extra.airStrikeOrders));
      }
      const roster = getSeatRoster();
      for (const seatId of SEAT_IDS) {
        const seat = roster.find((row) => row.seatId === seatId);
        assert.equal(seat?.consultationCount, 1);
        assert.equal(seat?.costUsd, 1.25);
      }
      const peeked = readCommanderPoolSnapshot(false);
      assert.deepEqual(
        peeked.statuses.map((row) => row.status),
        ['ready', 'ready', 'ready']
      );
      assert.equal(peeked.dispatches.length, 3);
      assert.deepEqual(
        peeked.dispatches.map((row) => row.strategy),
        [STRATEGY, STRATEGY, STRATEGY]
      );
      assert.ok(peeked.dispatches.every((row) => row.modelLabel === label));
      const drained = readCommanderPoolSnapshot(true);
      assert.equal(drained.dispatches.length, 3);
      assert.equal(readCommanderPoolSnapshot(true).dispatches.length, 0);
    });
  });

  /**
   * A follow-up consult does not finish with orders, and its prose still has to reach the screen.
   *
   * Purpose: An unfinished result used to drop the message.
   * When to use: After `applyConsultOutcome` changes.
   * Expected outcome: A draining read has the message and the strategy. An error and a blank message store nothing.
   * Exceptions: Skips when no regional map is installed.
   */
  test('an unfinished consult keeps its message and a blank one does not', async (t) => {
    if (!regionalMap()) {
      t.skip('no regional map with three side groups is extracted');
      return;
    }
    await withMatch(['model-a', 'model-a'], async () => {
      setCommanderConsultRunnerForTests(async () =>
        emptyConsultOutcome({
          finished: false,
          message: 'You cannot hide.',
          strategy: 'Hold the coast.',
          costUsd: 0,
          modelId: 'model-a',
        })
      );
      startStrategicPlanning();
      await waitForSeatsSettled([AI_SEAT_IDS[0], AI_SEAT_IDS[1]], 5_000);
      const drained = readCommanderPoolSnapshot(true);
      assert.equal(drained.dispatches.length, 2);
      assert.equal(drained.dispatches[0]?.message, 'You cannot hide.');
      assert.equal(drained.dispatches[0]?.strategy, 'Hold the coast.');
    });
    await withMatch(['model-a', 'model-a'], async () => {
      setCommanderConsultRunnerForTests(async () => emptyConsultOutcome({ finished: false, errorMessage: 'nope' }));
      startStrategicPlanning();
      await waitForSeatsSettled([AI_SEAT_IDS[0], AI_SEAT_IDS[1]], 5_000);
      assert.equal(readCommanderPoolSnapshot(true).dispatches.length, 0);
    });
    await withMatch(['model-a', 'model-a'], async () => {
      setCommanderConsultRunnerForTests(async () =>
        emptyConsultOutcome({ finished: false, message: '   ', strategy: null })
      );
      startStrategicPlanning();
      await waitForSeatsSettled([AI_SEAT_IDS[0], AI_SEAT_IDS[1]], 5_000);
      assert.equal(readCommanderPoolSnapshot(true).dispatches.length, 0);
    });
  });

  /**
   * A seat with no model is not consulted.
   *
   * Purpose: Standing orders are that seat's whole turn.
   * When to use: When one commander has no model id.
   * Expected outcome: Status `no_model` and the fake is not called for that seat.
   * Exceptions: Skips when no regional map is installed.
   */
  test('a seat with no model is not consulted', async (t) => {
    if (!regionalMap()) {
      t.skip('no regional map with three side groups is extracted');
      return;
    }
    await withMatch(['model-a', 'model-a', null], async () => {
      const starts: AiSeatId[] = [];
      setCommanderConsultRunnerForTests(async (request) => {
        starts.push(request.seatId);
        return finishedConsult(request.seatId);
      });
      startStrategicPlanning();
      await waitForSeatsSettled(SEAT_IDS, 5_000);
      assert.deepEqual(starts, [AI_SEAT_IDS[0], AI_SEAT_IDS[1]]);
      const snapshot = readCommanderPoolSnapshot(false);
      assert.equal(snapshot.statuses.find((row) => row.seatId === AI_SEAT_IDS[2])?.status, 'no_model');
      assert.equal(getAiPendingOrders(AI_SEAT_IDS[2]), null);
    });
  });

  /**
   * A consult that never returns times out that seat only.
   *
   * Purpose: The other commanders still store their plans.
   * When to use: The wall-clock timer.
   * Expected outcome: The hung seat is `timed_out` and its pending orders are cleared. The other seats stay ready.
   * Exceptions: Skips when no regional map is installed.
   */
  test('a hung consult times out only that seat', async (t) => {
    if (!regionalMap()) {
      t.skip('no regional map with three side groups is extracted');
      return;
    }
    await withMatch(['model-a', 'model-a', 'model-a'], async () => {
      const timers: { at: number; fn: () => void; cancelled: boolean }[] = [];
      let now = 1_000;
      setCommanderPoolTimingForTests({
        nowMs: () => now,
        wallClockMs: 40,
        waitTimeoutMs: 5_000,
        schedule: (fn, delayMs) => {
          const timer = { at: now + delayMs, fn, cancelled: false };
          timers.push(timer);
          return { cancel: () => { timer.cancelled = true; } };
        },
      });
      setCommanderConsultRunnerForTests(async (request) => {
        if (request.seatId === AI_SEAT_IDS[1]) await new Promise<void>(() => undefined);
        return finishedConsult(request.seatId);
      });
      startStrategicPlanning();
      await flushWrites();
      assert.equal(readCommanderPoolSnapshot(false).statuses.find((row) => row.seatId === AI_SEAT_IDS[0])?.status, 'ready');
      assert.equal(readCommanderPoolSnapshot(false).statuses.find((row) => row.seatId === AI_SEAT_IDS[2])?.status, 'ready');
      now += 40;
      for (const timer of [...timers]) {
        if (!timer.cancelled && timer.at <= now) {
          timer.cancelled = true;
          timer.fn();
        }
      }
      await flushWrites();
      const snapshot = readCommanderPoolSnapshot(false);
      const hung = snapshot.statuses.find((row) => row.seatId === AI_SEAT_IDS[1]);
      assert.equal(hung?.status, 'timed_out');
      assert.equal(hung?.timedOutTurn, getGameState().turnNumber);
      assert.equal(getAiPendingOrders(AI_SEAT_IDS[1]), null);
      assert.equal(getAiPendingOrders(AI_SEAT_IDS[0])?.movementOrders.length, 1);
      assert.equal(getAiPendingOrders(AI_SEAT_IDS[2])?.movementOrders.length, 1);
    });
  });

  /**
   * Cancelling one seat aborts only that seat's controller.
   *
   * Purpose: A model change on one commander must leave the others planning.
   * When to use: `cancelSeatPlanning`.
   * Expected outcome: That signal is aborted. The other seats store orders. The cancelled seat stores none.
   * Exceptions: Skips when no regional map is installed.
   */
  test('cancelling one commander aborts only that consult', async (t) => {
    if (!regionalMap()) {
      t.skip('no regional map with three side groups is extracted');
      return;
    }
    await withMatch(['model-a', 'model-a', 'model-a'], async () => {
      const signals = new Map<AiSeatId, AbortSignal>();
      setCommanderConsultRunnerForTests(async (request: CommanderConsultRequest) => {
        signals.set(request.seatId, request.signal);
        if (request.seatId === AI_SEAT_IDS[1]) {
          await new Promise<void>((resolve) => {
            if (request.signal.aborted) resolve();
            else request.signal.addEventListener('abort', () => resolve(), { once: true });
          });
          return emptyConsultOutcome();
        }
        return finishedConsult(request.seatId);
      });
      startStrategicPlanning();
      assert.equal(signals.size, 3);
      cancelSeatPlanning(AI_SEAT_IDS[1], 'model_changed');
      assert.equal(signals.get(AI_SEAT_IDS[1])?.aborted, true);
      assert.equal(signals.get(AI_SEAT_IDS[0])?.aborted, false);
      assert.equal(signals.get(AI_SEAT_IDS[2])?.aborted, false);
      await waitForSeatsSettled(SEAT_IDS, 5_000);
      assert.equal(getAiPendingOrders(AI_SEAT_IDS[1]), null);
      assert.equal(getAiPendingOrders(AI_SEAT_IDS[0])?.movementOrders.length, 1);
      assert.equal(getAiPendingOrders(AI_SEAT_IDS[2])?.movementOrders.length, 1);
      assert.equal(
        readCommanderPoolSnapshot(false).statuses.find((row) => row.seatId === AI_SEAT_IDS[1])?.status,
        'ready'
      );
    });
  });
});
