/**
 * Stores one closed talk round and records each message and stance change.
 *
 * Purpose: Messages, stances, and agreements become visible at the moment the round closes, in one transaction.
 * When to use: The `persist` callback of `openTalkRound`, before `whenClosed` resolves.
 * Expected outcome: Sent rows, stance rows, agreement rows, and one recorder event each. An empty map when the match has changed or the database is closed.
 * Exceptions: None. A SQLite error rolls the transaction back and returns an empty map.
 */

import { logDebug, logError } from '../../logger';
import { gameDbOps, getDbHandle, hasDbHandle } from '../../gameDb/dbConnection';
import { readSeatRoster } from '../../gameDb/seatRosterStore';
import { insertSentSideMessage, upsertSideStance } from '../../gameDb/sideMessageStore';
import { getMatchGeneration } from '../../matchGeneration';
import { persistTalkAgreements } from '../../sideAgreements/sideAgreementTalkPersistence';
import { recordSideMessageSent, recordSideStanceDeclared } from '../../recorder/matchRecordingEvents';
import { AI_SEAT_IDS, isSeatId, type AiSeatId } from '../../../shared/seatIds';
import { isSeatActive } from '../../../shared/seatRoster';
import type { StepKey } from '../../../shared/matchRecording';
import type { TalkSeatResult } from './requestTalk';
import type { StoredTalkMessage } from './talkRound';

/**
 * Seats still in the match.
 *
 * Purpose: A message to a seat that left during the round is not stored.
 * When to use: Once per persist.
 * Expected outcome: The active seat ids.
 * Exceptions: Propagates a SQLite error into the transaction catch.
 */
function activeSeatIds(): Set<string> {
  return new Set(readSeatRoster(gameDbOps).filter((seat) => isSeatActive(seat)).map((seat) => seat.seatId));
}

/**
 * Writes the messages and stances of one closed round.
 *
 * Purpose: The orders stage reads these rows as soon as the round's promise resolves.
 * When to use: From the round's close, with the generation captured when the round opened.
 * Expected outcome: A map of stored messages per seat. A strategic reply's agreements are stored in the same transaction, after its stances. Nothing is written when the generation has moved or the database is not open. A message whose recipient has left is skipped.
 * Exceptions: None. A failure rolls back and returns an empty map.
 */
export function persistTalkRound(
  step: StepKey,
  results: ReadonlyMap<AiSeatId, TalkSeatResult>,
  matchGenerationAtOpen: number
): ReadonlyMap<AiSeatId, readonly StoredTalkMessage[]> {
  logDebug('talkRoundPersistence persistTalkRound', { stepTurn: step.turnNumber, seatCount: results.size, matchGenerationAtOpen });
  if (!hasDbHandle() || getMatchGeneration() !== matchGenerationAtOpen) return new Map();
  const ownTransaction = getDbHandle()?.inTransaction !== true;
  try {
    if (ownTransaction) gameDbOps.run('BEGIN');
    const active = activeSeatIds();
    const stored = new Map<AiSeatId, StoredTalkMessage[]>();
    const seats = [...results.keys()].sort((left, right) => AI_SEAT_IDS.indexOf(left) - AI_SEAT_IDS.indexOf(right));
    for (const seatId of seats) {
      const result = results.get(seatId);
      if (!result || result.kind !== 'spoke') continue;
      const messages: StoredTalkMessage[] = [];
      for (const message of result.reply.messages) {
        if (message.toSeatId === seatId || !active.has(message.toSeatId)) continue;
        const messageId = insertSentSideMessage(gameDbOps, {
          fromSeatId: seatId,
          toSeatId: message.toSeatId,
          body: message.text,
          step,
        });
        recordSideMessageSent({ step, messageId, fromSeatId: seatId, toSeatId: message.toSeatId, text: message.text });
        messages.push({ messageId, toSeatId: message.toSeatId, text: message.text });
      }
      for (const stance of result.reply.stances) {
        if (!isSeatId(stance.towardSeatId) || stance.towardSeatId === seatId) continue;
        const written = upsertSideStance(gameDbOps, {
          seatId,
          towardSeatId: stance.towardSeatId,
          stance: stance.stance,
          reason: stance.reason,
          trust: stance.trust,
          threat: stance.threat,
          turnNumber: step.turnNumber,
        });
        if (written.changed) {
          recordSideStanceDeclared({
            step,
            seatId,
            towardSeatId: stance.towardSeatId,
            stance: stance.stance,
            reason: stance.reason,
            trust: stance.trust,
            threat: stance.threat,
            previousStance: written.previousStance,
          });
        }
      }
      if (step.scope === 'strategic' && result.reply.agreements.length > 0) {
        persistTalkAgreements({ seatId, step, agreements: result.reply.agreements, activeSeatIds: active });
      }
      if (messages.length > 0) stored.set(seatId, messages);
    }
    if (ownTransaction) gameDbOps.run('COMMIT');
    return stored;
  } catch (err) {
    if (ownTransaction) {
      try {
        gameDbOps.run('ROLLBACK');
      } catch (rollbackErr) {
        logError('talkRoundPersistence persistTalkRound: rollback failed', { err: rollbackErr });
      }
    }
    logError('talkRoundPersistence persistTalkRound failed', { seatCount: results.size, err });
    return new Map();
  }
}
