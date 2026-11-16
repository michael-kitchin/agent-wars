/**
 * IPC for replay.
 *
 * Purpose: Replay reads the recorded timeline and one recorded step. Neither channel changes the match.
 * When to use: `registerIpcHandlers`.
 * Expected outcome: `game:readReplayTimeline` returns the timeline, and `game:readReplayStep` returns one step's view or null.
 * Exceptions: None. A malformed step request returns null.
 */

import type { IpcMain } from 'electron';
import { IPC_GAME } from '../../shared/ipc/channels';
import { logDebug } from '../logger';
import { readReplayStep, readReplayTimeline } from '../replay/replayReading';

/**
 * Registers the two replay channels.
 *
 * Purpose: Keeps the handlers out of the main process entry file.
 * When to use: Once, from `registerIpcHandlers`, next to `registerMatchChartsIpcHandler`.
 * Expected outcome: `ipcMain.handle` for `game:readReplayTimeline` and `game:readReplayStep`. The second needs an object with a whole-number `recordId` and returns null otherwise.
 * Exceptions: None.
 */
export function registerReplayIpcHandler(ipcMain: IpcMain): void {
  logDebug('replayIpcHandler register');
  ipcMain.handle(IPC_GAME.readReplayTimeline, () => readReplayTimeline());
  ipcMain.handle(IPC_GAME.readReplayStep, (_event, payload: unknown) => {
    const recordId = (payload as { recordId?: unknown } | null)?.recordId;
    if (typeof payload !== 'object' || payload === null || typeof recordId !== 'number' || !Number.isInteger(recordId)) return null;
    return readReplayStep(recordId);
  });
}
