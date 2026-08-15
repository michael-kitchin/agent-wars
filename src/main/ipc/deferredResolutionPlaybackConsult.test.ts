/**
 * Essential mutex / notify ordering tests for deferred resolution playback consultation.
 */

import * as assert from 'assert';
import {
  clearDeferredPlaybackConsultPending,
  handleNotifyResolutionPlaybackComplete,
  hasDeferredPlaybackConsultPending,
  setPendingMeleeResolveConsult,
  setPendingStrategicReadyConsult,
  type DeferredStrategicResolutionConsultArgs,
} from './deferredResolutionPlaybackConsult';
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

async function runAll(): Promise<void> {
  await testNotifyClearsMutexStrategic();
  await testMismatchedNotifyAbandonsPendingMeleeConsult();
  console.log('OK deferredResolutionPlaybackConsult tests');
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
