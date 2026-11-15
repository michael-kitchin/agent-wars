/**
 * IPC for reading, staging, and cancelling the player's messages.
 *
 * Purpose: The chat panel asks the main process, which applies the visibility rule before anything is sent.
 * When to use: `registerIpcHandlers`.
 * Expected outcome: A snapshot the viewer may see, or a stage result. Message text is never logged.
 * Exceptions: A database error is logged and returned as a refusal or an empty cancel. It is not thrown to the renderer.
 */

import type { IpcMain } from 'electron';
import { activeHumanSeatId } from '../../shared/observeModeControls';
import { IPC_GAME } from '../../shared/ipc/channels';
import { activeAiSeatIds } from '../../shared/seatRoster';
import { sideMessageVisibleTo } from '../../shared/sideMessages';
import type { SideMessageThreadSnapshot, SideMessageView } from '../../shared/sideMessageView';
import { getSeatRoster } from '../gameDb';
import { gameDbOps, hasDbHandle } from '../gameDb/dbConnection';
import { isFogOfWarEnabled } from '../gameDb/fogState';
import { listSentSideMessages, listStagedSideMessages, type SideMessageRow } from '../gameDb/sideMessageStore';
import { logDebug, logError, logTrace } from '../logger';
import { cancelStagedHumanSideMessage, stageHumanSideMessage, type StageSideMessageResult } from '../sideMessages/humanSideMessages';

/**
 * The refusal for a payload that is not a stage or cancel request.
 *
 * Purpose: The renderer can show this sentence. It is not a stored message.
 * When to use: `stageSideMessage` when `toSeatId` or `text` is missing.
 * Expected outcome: The string `Invalid message.`
 * Exceptions: None.
 */
const INVALID_SIDE_MESSAGE = 'Invalid message.';

/**
 * An empty snapshot for a closed database.
 *
 * Purpose: The panel can render before a match is open.
 * When to use: `buildSideMessageThreadSnapshot` when `hasDbHandle` is false.
 * Expected outcome: No viewer, no send, and no rows.
 * Exceptions: None.
 */
const EMPTY_SIDE_MESSAGE_SNAPSHOT: SideMessageThreadSnapshot = {
  viewerSeatId: null,
  canSend: false,
  recipientSeatIds: [],
  messages: [],
  staged: [],
};

/**
 * Copies one stored row into the view the renderer is allowed to hold.
 *
 * Purpose: The step columns are named on `row.step`, and the text column is `body`.
 * When to use: After `sideMessageVisibleTo` has accepted the row.
 * Expected outcome: A view with the stored text and step.
 * Exceptions: None.
 */
function viewFromRow(row: SideMessageRow): SideMessageView {
  return {
    messageId: row.messageId,
    fromSeatId: row.fromSeatId,
    toSeatId: row.toSeatId,
    text: row.body,
    scope: row.step.scope,
    turnNumber: row.step.turnNumber,
    beatNumber: row.step.beatNumber,
  };
}

/**
 * Reads the thread the current viewer may see.
 *
 * Purpose: The renderer never receives a message the viewer may not see.
 * When to use: `game:readSideMessages`.
 * Expected outcome: Sent messages oldest first, the viewer's drafts, and the AI sides still in the match. An observer gets every sent message and cannot send. A closed database returns the empty snapshot.
 * Exceptions: None. A closed database does not touch the store.
 */
export function buildSideMessageThreadSnapshot(): SideMessageThreadSnapshot {
  if (!hasDbHandle()) {
    logTrace('sideMessageIpcHandler buildSideMessageThreadSnapshot', { viewerKind: 'none', messageCount: 0, stagedCount: 0 });
    return EMPTY_SIDE_MESSAGE_SNAPSHOT;
  }
  const roster = getSeatRoster();
  const viewerSeatId = activeHumanSeatId(roster);
  const viewer = viewerSeatId === null
    ? { kind: 'observer' as const }
    : { kind: 'player' as const, seatId: viewerSeatId };
  const fogOfWarEnabled = isFogOfWarEnabled(gameDbOps);
  const messages = listSentSideMessages(gameDbOps)
    .filter((row) => sideMessageVisibleTo({
      viewer,
      fogOfWarEnabled,
      fromSeatId: row.fromSeatId,
      toSeatId: row.toSeatId,
    }))
    .map(viewFromRow);
  const staged = viewerSeatId === null
    ? []
    : listStagedSideMessages(gameDbOps, viewerSeatId).map(viewFromRow);
  const recipientSeatIds = activeAiSeatIds(roster);
  logTrace('sideMessageIpcHandler buildSideMessageThreadSnapshot', {
    viewerKind: viewer.kind,
    messageCount: messages.length,
    stagedCount: staged.length,
  });
  return {
    viewerSeatId,
    canSend: viewerSeatId !== null && recipientSeatIds.length > 0,
    recipientSeatIds,
    messages,
    staged,
  };
}

/**
 * Reads `toSeatId` and `text` when both are strings.
 *
 * Purpose: A renderer bug must not reach `stageHumanSideMessage`.
 * When to use: `game:stageSideMessage`.
 * Expected outcome: The two strings, or null.
 * Exceptions: None.
 */
function stageRequest(payload: unknown): { readonly toSeatId: string; readonly text: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as { toSeatId?: unknown; text?: unknown };
  if (typeof row.toSeatId !== 'string' || typeof row.text !== 'string') return null;
  return { toSeatId: row.toSeatId, text: row.text };
}

/**
 * Reads `toSeatId` when it is a string.
 *
 * Purpose: Cancel ignores a payload that names no recipient.
 * When to use: `game:cancelStagedSideMessage`.
 * Expected outcome: The seat id, or null.
 * Exceptions: None.
 */
function cancelRequest(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const toSeatId = (payload as { toSeatId?: unknown }).toSeatId;
  return typeof toSeatId === 'string' ? toSeatId : null;
}

/**
 * Registers the three message channels.
 *
 * Purpose: Keeps the handlers out of the main process entry file.
 * When to use: Once, from `registerIpcHandlers`, next to `registerEndMatchIpcHandler`.
 * Expected outcome: `ipcMain.handle` for read, stage, and cancel. Stage returns the store's result or `Invalid message.` Cancel resolves void.
 * Exceptions: A thrown store error is logged and does not reject the channel.
 */
export function registerSideMessageIpcHandler(ipcMain: IpcMain): void {
  logDebug('sideMessageIpcHandler register');
  ipcMain.handle(IPC_GAME.readSideMessages, () => buildSideMessageThreadSnapshot());
  ipcMain.handle(IPC_GAME.stageSideMessage, (_event, payload: unknown): StageSideMessageResult => {
    const request = stageRequest(payload);
    if (!request) {
      logDebug('sideMessageIpcHandler stageSideMessage refused', { reason: 'payload' });
      return { success: false, reason: INVALID_SIDE_MESSAGE };
    }
    try {
      const result = stageHumanSideMessage(request.toSeatId, request.text);
      logDebug('sideMessageIpcHandler stageSideMessage', { toSeatId: request.toSeatId, success: result.success });
      return result;
    } catch (err) {
      logError('sideMessageIpcHandler stageSideMessage failed', err);
      return { success: false, reason: INVALID_SIDE_MESSAGE };
    }
  });
  ipcMain.handle(IPC_GAME.cancelStagedSideMessage, (_event, payload: unknown): void => {
    const toSeatId = cancelRequest(payload);
    if (!toSeatId) {
      logDebug('sideMessageIpcHandler cancelStagedSideMessage skipped');
      return;
    }
    try {
      cancelStagedHumanSideMessage(toSeatId);
      logDebug('sideMessageIpcHandler cancelStagedSideMessage', { toSeatId });
    } catch (err) {
      logError('sideMessageIpcHandler cancelStagedSideMessage failed', err);
    }
  });
}
