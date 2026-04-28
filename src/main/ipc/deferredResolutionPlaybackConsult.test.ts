/**
 * Essential mutex / notify ordering tests for deferred resolution playback consultation.
 */

import * as assert from 'assert';
import {
  clearDeferredPlaybackConsultPending,
  handleNotifyResolutionPlaybackComplete,
  hasDeferredPlaybackConsultPending,
  setPendingStrategicReadyConsult,
} from './deferredResolutionPlaybackConsult';
import { IPC_GAME } from '../../shared/ipc/channels';
import type { ReadyResult } from '../../shared/ipcTypes';

const minimalResolution: ReadyResult = {
  success: true,
};

/**
 * Defines the `testNotifyClearsMutexStrategic` function shape.

 * Purpose: Ensures `notifyResolutionPlaybackComplete` drains pending state after push on the strategic path.
 * When to use: Node main-process suite (`npm test`).
 * Expected outcome: `hasDeferredPlaybackConsultPending` false after successful invoke handling.
 * Exceptions: None.
 */
async function testNotifyClearsMutexStrategic(): Promise<void> {
  clearDeferredPlaybackConsultPending();
  let channel = '';
  const sender = {
    send(ch: string, msg: unknown): void {
      channel = ch;
      void msg;
    },
  };
  setPendingStrategicReadyConsult(42, {
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
  });
  const r = await handleNotifyResolutionPlaybackComplete(sender as never, {
    kind: 'strategic',
    planningTurnNumber: 42,
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(hasDeferredPlaybackConsultPending(), false);
  assert.strictEqual(channel, IPC_GAME.postResolutionConsultation);
}

async function runAll(): Promise<void> {
  await testNotifyClearsMutexStrategic();
  console.log('OK deferredResolutionPlaybackConsult tests');
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
