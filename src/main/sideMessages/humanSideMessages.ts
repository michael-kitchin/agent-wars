/**
 * Holds a message the human player has written and sends it when a turn or a beat is committed.
 *
 * Purpose: The main process can stage a draft before the chat panel exists.
 * When to use: A commit of strategic orders or a tactical beat, and a test of that staging.
 * Expected outcome: One staged draft per recipient. Sending marks those rows sent and records one event each.
 * Exceptions: Staging returns a reason. Sending never throws.
 */

import { logDebug, logError } from '../logger';
import { gameDbOps, getDbHandle, hasDbHandle } from '../gameDb/dbConnection';
import { readSeatRoster } from '../gameDb/seatRosterStore';
import {
  deleteStagedSideMessage,
  listStagedSideMessages,
  replaceStagedSideMessage,
  sendStagedSideMessages,
} from '../gameDb/sideMessageStore';
import { readTurnNumberOrFirst } from '../gameDb/turnStateReads';
import { recordSideMessageSent } from '../recorder/matchRecordingEvents';
import { strategicStep, type StepKey } from '../../shared/matchRecording';
import { activeHumanSeatId } from '../../shared/observeModeControls';
import { isAiSeatId } from '../../shared/seatIds';
import { isSeatActive } from '../../shared/seatRoster';
import { cleanSideMessageText, SIDE_MESSAGE_MAX_CHARS } from '../../shared/sideMessages';

/**
 * Why a player cannot stage a message.
 *
 * Purpose: The chat panel can show this sentence.
 * When to use: The failure from `stageHumanSideMessage` when no human seat is in the match.
 * Expected outcome: That sentence.
 * Exceptions: None.
 */
export const SIDE_MESSAGE_NO_PLAYER = 'Only a player in the match can send messages.';

/**
 * Why a recipient cannot take a message.
 *
 * Purpose: The chat panel can show this sentence.
 * When to use: The failure from `stageHumanSideMessage` when the recipient is not an AI seat still in the match.
 * Expected outcome: That sentence.
 * Exceptions: None.
 */
export const SIDE_MESSAGE_RECIPIENT_GONE = 'That side is no longer in the match.';

/**
 * Why blank text is refused.
 *
 * Purpose: The chat panel can show this sentence.
 * When to use: The failure from `stageHumanSideMessage` when cleaning leaves nothing.
 * Expected outcome: That sentence.
 * Exceptions: None.
 */
export const SIDE_MESSAGE_EMPTY = 'Type a message first.';

/**
 * The result of staging one draft.
 *
 * Contract: `reason` is one of the three exported sentences.
 * When to use: The caller of `stageHumanSideMessage`.
 * Expected outcome: Success, or the sentence that explains the refusal.
 * Exceptions: None.
 */
export type StageSideMessageResult = { readonly success: true } | { readonly success: false; readonly reason: string };

/**
 * Stores one draft from the human player to one AI seat.
 *
 * Purpose: The player can rewrite a draft until the turn or beat is committed.
 * When to use: Before `sendStagedHumanSideMessages`.
 * Expected outcome: Success replaces any staged draft to that recipient. A refusal returns one of the three sentences.
 * Exceptions: Propagates a SQLite error.
 */
export function stageHumanSideMessage(toSeatId: string, rawText: unknown): StageSideMessageResult {
  const humanSeatId = activeHumanSeatId(readSeatRoster(gameDbOps));
  if (!humanSeatId) {
    logDebug('humanSideMessages stageHumanSideMessage refused', { reason: 'no-player' });
    return { success: false, reason: SIDE_MESSAGE_NO_PLAYER };
  }
  const recipient = readSeatRoster(gameDbOps).find((seat) => seat.seatId === toSeatId);
  if (!recipient || !isAiSeatId(recipient.seatId) || !isSeatActive(recipient)) {
    logDebug('humanSideMessages stageHumanSideMessage refused', { toSeatId, reason: 'recipient' });
    return { success: false, reason: SIDE_MESSAGE_RECIPIENT_GONE };
  }
  const body = cleanSideMessageText(rawText, SIDE_MESSAGE_MAX_CHARS);
  if (body.length === 0) {
    logDebug('humanSideMessages stageHumanSideMessage refused', { toSeatId, reason: 'empty' });
    return { success: false, reason: SIDE_MESSAGE_EMPTY };
  }
  replaceStagedSideMessage(gameDbOps, {
    fromSeatId: humanSeatId,
    toSeatId,
    body,
    step: strategicStep(readTurnNumberOrFirst(gameDbOps.getOne.bind(gameDbOps))),
  });
  logDebug('humanSideMessages stageHumanSideMessage', { toSeatId, bodyLength: body.length });
  return { success: true };
}

/**
 * Drops the staged draft to one recipient.
 *
 * Purpose: The player changed their mind before the commit.
 * When to use: A cancel. A missing draft is unchanged.
 * Expected outcome: No staged row from the human seat to that recipient.
 * Exceptions: Propagates a SQLite error.
 */
export function cancelStagedHumanSideMessage(toSeatId: string): void {
  const humanSeatId = activeHumanSeatId(readSeatRoster(gameDbOps));
  logDebug('humanSideMessages cancelStagedHumanSideMessage', { toSeatId, hasPlayer: humanSeatId !== null });
  if (!humanSeatId) return;
  deleteStagedSideMessage(gameDbOps, humanSeatId, toSeatId);
}

/**
 * Sends the human player's staged drafts at this step.
 *
 * Purpose: A committed turn or beat delivers the drafts the player wrote.
 * When to use: Directly after the recorder writes that commit.
 * Expected outcome: The count of messages sent. A draft to a side that has left is deleted and not sent. Nothing is sent when no human seat is in the match.
 * Exceptions: None. A SQLite error rolls back when this call opened the transaction, logs a failed rollback, and returns 0.
 */
export function sendStagedHumanSideMessages(step: StepKey): number {
  if (!hasDbHandle()) {
    logDebug('humanSideMessages sendStagedHumanSideMessages', { sent: 0, hasPlayer: false });
    return 0;
  }
  const ownTransaction = getDbHandle()?.inTransaction !== true;
  try {
    const humanSeatId = activeHumanSeatId(readSeatRoster(gameDbOps));
    if (!humanSeatId) {
      logDebug('humanSideMessages sendStagedHumanSideMessages', { sent: 0, hasPlayer: false });
      return 0;
    }
    if (ownTransaction) gameDbOps.run('BEGIN');
    const active = new Set<string>(readSeatRoster(gameDbOps).filter((seat) => isSeatActive(seat)).map((seat) => seat.seatId));
    for (const staged of listStagedSideMessages(gameDbOps, humanSeatId)) {
      if (!active.has(staged.toSeatId)) deleteStagedSideMessage(gameDbOps, humanSeatId, staged.toSeatId);
    }
    const sent = sendStagedSideMessages(gameDbOps, humanSeatId, step);
    for (const row of sent) {
      recordSideMessageSent({
        step,
        messageId: row.messageId,
        fromSeatId: row.fromSeatId,
        toSeatId: row.toSeatId,
        text: row.body,
      });
    }
    if (ownTransaction) gameDbOps.run('COMMIT');
    logDebug('humanSideMessages sendStagedHumanSideMessages', { sent: sent.length, turnNumber: step.turnNumber });
    return sent.length;
  } catch (err) {
    if (ownTransaction) {
      try {
        gameDbOps.run('ROLLBACK');
      } catch (rollbackErr) {
        logError('humanSideMessages rollback failed', { err: rollbackErr });
      }
    }
    logError('humanSideMessages sendStagedHumanSideMessages failed', err);
    return 0;
  }
}
