/**
 * IPC for saving one AI seat's commander during a match.
 *
 * Purpose: The Commanders tab writes model, effort, doctrine, key, and nickname without growing the main entry file.
 * When to use: `registerIpcHandlers`.
 * Expected outcome: The updated seat snapshot. A model or effort change cancels that seat's consult. A nickname change does not.
 * Exceptions: Throws when the seat cannot be updated or the payload is not a commander.
 */

import type { IpcMain } from 'electron';
import { aiIndexForSeatId, isAiSeatId, isSeatId } from '../../shared/seatIds';
import { DOCTRINE_CHOICES, toSeatSnapshot, type DoctrineChoice } from '../../shared/seatRoster';
import { normalizeSideNickname, storedAiNickname } from '../../shared/sideNicknames';
import { IPC_GAME } from '../../shared/ipc/channels';
import { dbGetAll, dbRun, getGameState, getSeatRoster } from '../gameDb';
import { readSeatHasApiKey } from '../gameDb/seatApiKeyFlags';
import { updateSeatCommander, updateSeatNickname } from '../gameDb/seatRosterStore';
import { logDebug } from '../logger';
import { cancelModelCalls } from '../openRouter/modelCallControl';
import { readSeatApiKey, updateRememberedCommander, writeSeatApiKey } from '../openRouter/commanderKeyMemory';
import { loadKey } from '../openRouter/openRouter';

/**
 * Registers the in-match commander save.
 *
 * Purpose: Preload calls this by the channel constant.
 * When to use: Once, from `registerIpcHandlers`.
 * Expected outcome: A valid patch returns the updated snapshot. An omitted nickname leaves the stored one.
 *   A nickname that only repeats the short home name stores null. An omitted key leaves the stored key.
 *   Only a model or effort change cancels planning.
 * Exceptions: Throws `Invalid commander update`, `Invalid commander model`, `Invalid commander effort`,
 *   `Invalid commander key`, `Invalid commander doctrine`, or `Invalid commander nickname`.
 *   A missing, human, or knocked-out seat throws from the roster update.
 */
export function registerSeatCommanderIpcHandler(ipcMain: IpcMain): void {
  logDebug('seatCommanderIpcHandler register');
  ipcMain.handle(IPC_GAME.setSeatCommander, (_event, seatId: unknown, commander: unknown) => {
    if (typeof seatId !== 'string' || !isSeatId(seatId) || !isAiSeatId(seatId)) {
      throw new Error(`Cannot update a commander for ${String(seatId)}`);
    }
    if (!commander || typeof commander !== 'object') throw new Error('Invalid commander update');
    const patch = commander as {
      modelId?: unknown;
      reasoningEffort?: unknown;
      doctrineChoice?: unknown;
      apiKey?: unknown;
      nickname?: unknown;
    };
    if (patch.modelId !== null && typeof patch.modelId !== 'string') throw new Error('Invalid commander model');
    if (patch.reasoningEffort !== null && typeof patch.reasoningEffort !== 'string') throw new Error('Invalid commander effort');
    if (patch.apiKey !== undefined && typeof patch.apiKey !== 'string') throw new Error('Invalid commander key');
    if (patch.nickname !== undefined && typeof patch.nickname !== 'string') throw new Error('Invalid commander nickname');
    if (!(DOCTRINE_CHOICES as readonly string[]).includes(String(patch.doctrineChoice))) {
      throw new Error('Invalid commander doctrine');
    }
    const before = getSeatRoster().find((row) => row.seatId === seatId);
    const ops = { run: dbRun, getAll: dbGetAll };
    let updated = updateSeatCommander(ops, seatId, {
      modelId: patch.modelId,
      reasoningEffort: patch.reasoningEffort,
      doctrineChoice: patch.doctrineChoice as DoctrineChoice,
    });
    if (typeof patch.nickname === 'string') {
      updated = updateSeatNickname(ops, seatId, storedAiNickname(patch.nickname, updated.homeRegion, seatId));
    }
    const suppliedKey = typeof patch.apiKey === 'string' ? patch.apiKey : null;
    if (suppliedKey !== null) writeSeatApiKey(seatId, suppliedKey, loadKey());
    const aiNumber = aiIndexForSeatId(seatId);
    if (aiNumber !== null) {
      updateRememberedCommander(aiNumber, {
        modelId: typeof patch.modelId === 'string' ? patch.modelId : null,
        reasoningEffort: typeof patch.reasoningEffort === 'string' ? patch.reasoningEffort : null,
        doctrineChoice: patch.doctrineChoice as DoctrineChoice,
        apiKey: suppliedKey ?? readSeatApiKey(seatId, loadKey()),
        nickname: normalizeSideNickname(updated.nickname ?? ''),
      });
    }
    const modelChanged = (before?.commander?.modelId ?? null) !== patch.modelId;
    const effortChanged = (before?.commander?.reasoningEffort ?? null) !== patch.reasoningEffort;
    if (modelChanged || effortChanged) cancelModelCalls('model_changed', 'all', seatId);
    const hasApiKey = readSeatHasApiKey(seatId);
    const nicknameChanged = (before?.nickname ?? null) !== (updated.nickname ?? null);
    logDebug('seatCommanderIpcHandler setSeatCommander', { seatId, modelChanged, effortChanged, nicknameChanged, hasApiKey });
    return toSeatSnapshot(updated, getGameState().gameOver === true, hasApiKey);
  });
}
