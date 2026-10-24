/**
 * Essential mutex / notify ordering tests for deferred resolution playback consultation.
 */

import * as assert from 'assert';
import {
  clearDeferredPlaybackConsultPending,
  handleNotifyResolutionPlaybackComplete,
  hasDeferredPlaybackConsultPending,
  peekPendingPlaybackConsult,
  releaseDeferredConsultSlot,
  setPendingMeleeResolveConsult,
  setPendingStrategicReadyConsult,
  setPendingTacticalBeatConsult,
  type DeferredStrategicResolutionConsultArgs,
  type DeferredTacticalBeatConsultArgs,
} from './deferredResolutionPlaybackConsult';
import { cancelModelCalls, modelCallsBegun } from '../openRouter/modelCallControl';
import { resetCommanderPool } from '../openRouter/commanderPool';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { listGameMaps } from '../gameMap/listGameMaps';
import { withSeatedTempGameDbAsync } from '../testSupport/withSeatedTempGameDb';
import { advanceMatchGeneration } from '../matchGeneration';
import { IPC_GAME, IPC_OPENROUTER } from '../../shared/ipc/channels';
import { DEFERRED_PLAYBACK_CONSULT_ABANDONED_LOG } from '../../shared/ipc/deferredPlaybackConsultAbandoned';
import type { ReadyResult } from '../../shared/ipcTypes';

const minimalResolution: ReadyResult = {
  success: true,
};

/**
 * Builds consult args that skip LLM work so notify tests only cover mutex and push wiring.
 *
 * Purpose: Shared fixture for strategic and melee pending-consult tests.
 * When to use: Only inside this test file when arming `setPending*` helpers.
 * Expected outcome: `runEventDrivenAfterResolutionConsultation` completes without calling a model.
 * Exceptions: None.
 */
function minimalConsultArgs(): DeferredStrategicResolutionConsultArgs {
  return {
    useEventDrivenConsultation: false,
    resolutionSuccess: true,
    aiPlanningRunEnabled: true,
    opponentState: {} as never,
    resolution: minimalResolution,
    modelId: '',
    enabledToolNames: [],
    hasKey: () => false,
    requestOrders: async () => ({ success: true, orders: [] }),
    timeoutMs: 1000,
    errorLogMessage: 'test',
  };
}

/**
 * Captures `webContents.send` channel names and last payload per channel.
 *
 * Purpose: Lets tests assert consult pushes and OpenRouter log lines without a real BrowserWindow.
 * When to use: Each notify test that expects `IPC_GAME.postResolutionConsultation` and/or `IPC_OPENROUTER.log`.
 * Expected outcome: `getChannel` is the last `send` channel; `getPayload` returns that channel's last message.
 * Exceptions: None.
 */
function createCaptureSender(): {
  sender: { send: (ch: string, msg: unknown) => void };
  getChannel: () => string;
  getPayload: (channel: string) => unknown;
} {
  const byChannel = new Map<string, unknown>();
  let channel = '';
  return {
    sender: {
      send(ch: string, msg: unknown): void {
        channel = ch;
        byChannel.set(ch, msg);
      },
    },
    getChannel: () => channel,
    getPayload: (ch: string) => byChannel.get(ch),
  };
}

/**
 * Defines the `testNotifyClearsMutexStrategic` function shape.
 *
 * Purpose: Ensures `notifyResolutionPlaybackComplete` drains pending state after push on the strategic path.
 * When to use: Node main-process suite (`npm test`).
 * Expected outcome: `hasDeferredPlaybackConsultPending` false after successful invoke handling.
 * Exceptions: None.
 */
async function testNotifyClearsMutexStrategic(): Promise<void> {
  clearDeferredPlaybackConsultPending();
  const { sender, getChannel, getPayload } = createCaptureSender();
  setPendingStrategicReadyConsult(42, minimalConsultArgs());
  const r = await handleNotifyResolutionPlaybackComplete(sender as never, {
    kind: 'strategic',
    planningTurnNumber: 42,
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(hasDeferredPlaybackConsultPending(), false);
  assert.strictEqual(getChannel(), IPC_GAME.postResolutionConsultation);
  assert.deepStrictEqual(getPayload(IPC_GAME.postResolutionConsultation), { planningTurnNumber: 42 });
}

/**
 * Defines the `testMismatchedNotifyAbandonsPendingMeleeConsult` function shape.
 *
 * Purpose: A leftover tactical playback-complete notify must release the melee mutex and unlatch planning.
 * When to use: Regression for stuck strategic AI planning after a stale tactical notify.
 * Expected outcome: Mutex cleared; abandoned consult push; error line on `openRouter:log`.
 * Exceptions: None.
 */
async function testMismatchedNotifyAbandonsPendingMeleeConsult(): Promise<void> {
  clearDeferredPlaybackConsultPending();
  const { sender, getPayload } = createCaptureSender();
  setPendingMeleeResolveConsult(6, minimalConsultArgs());
  const mismatch = await handleNotifyResolutionPlaybackComplete(sender as never, {
    kind: 'tactical',
    battleId: 'tb-stale',
  });
  assert.strictEqual(mismatch.ok, false);
  assert.strictEqual(hasDeferredPlaybackConsultPending(), false);
  assert.deepStrictEqual(getPayload(IPC_OPENROUTER.log), {
    line: DEFERRED_PLAYBACK_CONSULT_ABANDONED_LOG,
    isError: true,
  });
  assert.deepStrictEqual(getPayload(IPC_GAME.postResolutionConsultation), {
    planningTurnNumber: 6,
    abandoned: true,
  });
}

/**
 * A stop before notify must not start the consult.
 *
 * Purpose: Run off during playback skips the model call and still unlatches Ready.
 * When to use: This file's runner.
 * Expected outcome: `requestOrders` is not reached, because the runner is not entered. The empty push still happens.
 * Exceptions: None.
 */
async function testCancelBeforeNotifySkipsConsult(): Promise<void> {
  clearDeferredPlaybackConsultPending();
  const before = modelCallsBegun();
  const { sender, getPayload } = createCaptureSender();
  setPendingStrategicReadyConsult(9, {
    ...minimalConsultArgs(),
    useEventDrivenConsultation: true,
    resolutionSuccess: true,
    aiPlanningRunEnabled: true,
    hasKey: () => true,
    modelId: 'm',
  });
  cancelModelCalls('run_off', 'all', 'all');
  const result = await handleNotifyResolutionPlaybackComplete(sender as never, {
    kind: 'strategic',
    planningTurnNumber: 9,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(modelCallsBegun(), before);
  assert.strictEqual(hasDeferredPlaybackConsultPending(), false);
  assert.deepStrictEqual(getPayload(IPC_GAME.postResolutionConsultation), { planningTurnNumber: 9 });
}

/**
 * A late tactical completion must not clear a newer strategic consult.
 *
 * Purpose: Exit Battle can clear the tactical slot while that consult is still finishing.
 * When to use: This file's runner.
 * Expected outcome: The newer strategic record stays pending and the late tactical record does not push.
 * Exceptions: None.
 */
async function testLateTacticalCompletionLeavesNewerStrategicPending(): Promise<void> {
  clearDeferredPlaybackConsultPending();
  setPendingTacticalBeatConsult('battle-1', {} as DeferredTacticalBeatConsultArgs);
  const tactical = peekPendingPlaybackConsult();
  assert.ok(tactical);
  const generationAtStart = tactical.generationAtStart;
  clearDeferredPlaybackConsultPending();
  setPendingStrategicReadyConsult(3, minimalConsultArgs());
  assert.strictEqual(releaseDeferredConsultSlot(tactical, generationAtStart), 'drop');
  assert.strictEqual(peekPendingPlaybackConsult()?.tag, 'strategic-ready');
  advanceMatchGeneration('new_game');
  const strategic = peekPendingPlaybackConsult();
  assert.ok(strategic);
  assert.strictEqual(releaseDeferredConsultSlot(strategic, strategic.generationAtStart), 'drop');
  assert.strictEqual(peekPendingPlaybackConsult(), null);
}

/**
 * One deferred slot consults every active AI seat.
 *
 * Purpose: Playback completion runs each commander's post-resolution consult, not only the first seat.
 * When to use: This file's runner.
 * Expected outcome: Both seats' requestOrders calls finish, and the mutex clears.
 * Exceptions: None. The installed regional map has at least two side groups.
 */
async function testDeferredConsultFinishesTwoSeats(): Promise<void> {
  const map = listGameMaps().find((entry) => entry.sideGroups.length >= 2);
  assert.ok(map, 'a regional map with two side groups is installed');
  const seats: NewGameSeatInput[] = [0, 1].map((index) => ({
    kind: 'ai',
    sideGroupId: map.sideGroups[index]?.id ?? '',
    commander: { modelId: 'model-a', reasoningEffort: null, doctrineChoice: 'balanced' },
  }));
  const called: string[] = [];
  await withSeatedTempGameDbAsync('aw-deferred-two-', { gameMapId: map.id, fogOfWarEnabled: false, seats }, async () => {
    clearDeferredPlaybackConsultPending();
    setPendingStrategicReadyConsult(4, {
      ...minimalConsultArgs(),
      useEventDrivenConsultation: true,
      resolutionSuccess: true,
      aiPlanningRunEnabled: true,
      hasKey: () => true,
      modelId: 'model-a',
      timeoutMs: 15000,
      requestOrders: async (_state, _modelId, options) => {
        called.push(options.seatId);
        return { success: true, orders: [] };
      },
    });
    const { sender } = createCaptureSender();
    const result = await handleNotifyResolutionPlaybackComplete(sender as never, {
      kind: 'strategic',
      planningTurnNumber: 4,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(hasDeferredPlaybackConsultPending(), false);
    assert.deepStrictEqual(called.slice().sort(), [AI_SEAT_IDS[0], AI_SEAT_IDS[1]].slice().sort());
    resetCommanderPool([]);
  });
}

async function runAll(): Promise<void> {
  await testNotifyClearsMutexStrategic();
  await testMismatchedNotifyAbandonsPendingMeleeConsult();
  await testCancelBeforeNotifySkipsConsult();
  await testLateTacticalCompletionLeavesNewerStrategicPending();
  await testDeferredConsultFinishesTwoSeats();
  console.log('OK deferredResolutionPlaybackConsult tests');
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
