/**
 * IPC that ends a match still being played.
 *
 * Purpose: The knocked-out dialog's End game control ranks the seats that are still active.
 * When to use: `registerIpcHandlers`.
 * Expected outcome: `game:endMatch` stores `ended_by_human` and returns the snapshot. A finished match is left as it is.
 * Exceptions: Propagates a database error after logging it.
 */

import { app, type IpcMain } from 'electron';
import { endMatchByHuman } from '../gameActions/endOfTurnOutcome';
import { getGameState } from '../gameDb';
import { exportFinishedMatchRecordingIfNeeded } from '../recorder/matchRecordingExport';
import { recordStepBoundary } from '../recorder/matchRecorder';
import { currentStepKey } from '../recorder/recorderStepKey';
import { recordReplayViewsIfNeeded } from '../replay/replayRecording';
import { readMatchSnapshot } from './matchViewSnapshot';
import { IPC_GAME } from '../../shared/ipc/channels';
import { logDebug, logError } from '../logger';

/**
 * Registers `game:endMatch`.
 *
 * Purpose: Keeps the handler body out of the main process entry file.
 * When to use: Once, from `registerIpcHandlers`.
 * Expected outcome: The channel ends the current match and returns the human snapshot. The recording export receives the live deferred-consult flag.
 * Exceptions: A database error is logged and rethrown.
 */
export function registerEndMatchIpcHandler(
  ipcMain: IpcMain,
  deps: { readonly isDeferredConsultPending: () => boolean }
): void {
  logDebug('endMatchIpcHandler register');
  ipcMain.handle(IPC_GAME.endMatch, () => {
    const state = getGameState();
    if (state.hexes.length === 0 || state.gameOver) {
      logDebug('endMatchIpcHandler skipped', { turnNumber: state.turnNumber, gameOver: state.gameOver === true });
      return readMatchSnapshot(undefined);
    }
    try {
      endMatchByHuman(state.turnNumber);
    } catch (err) {
      logError('endMatchIpcHandler failed', { turnNumber: state.turnNumber, err });
      throw err;
    }
    logDebug('endMatchIpcHandler ended the match', { turnNumber: state.turnNumber });
    const appVersion = app.getVersion();
    recordStepBoundary(currentStepKey(), appVersion);
    recordReplayViewsIfNeeded();
    exportFinishedMatchRecordingIfNeeded({
      userDataDir: app.getPath('userData'),
      appVersion,
      now: () => new Date(),
      deferredConsultPending: deps.isDeferredConsultPending(),
    });
    return readMatchSnapshot(undefined);
  });
}
