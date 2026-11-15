/**
 * Reads and writes `side_messages` and `side_stances`.
 *
 * Purpose: The talk round, the orders prompt, and the human player's drafts share one SQL surface.
 * When to use: After `ensureSideMessageTables`. Callers that must not throw wrap these calls.
 * Expected outcome: Rows in `message_id` order, with a step rebuilt from the step columns.
 * Exceptions: Propagates a SQLite error, including the check that a seat cannot message itself.
 */

import type { BasicDbOps } from './dbOps';
import { logDebug, logTrace } from '../logger';
import type { SideStance } from '../../shared/sideMessages';
import type { StepKey } from '../../shared/matchRecording';

/**
 * One stored message.
 *
 * Contract: `status` is `staged` or `sent`. `step` is the step stored on the row.
 * When to use: Every list this module returns.
 * Expected outcome: The columns a caller filters with `sideMessageVisibleTo`.
 * Exceptions: None.
 */
export interface SideMessageRow {
  /**
   * The assigned id.
   *
   * Contract: The `message_id` primary key.
   * When to use: Marking a message seen and recording it.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly messageId: number;
  /**
   * The seat that wrote the message.
   *
   * Contract: A seat id, different from `toSeatId`.
   * When to use: Visibility and the message event.
   * Expected outcome: The stored sender.
   * Exceptions: None.
   */
  readonly fromSeatId: string;
  /**
   * The seat the message is addressed to.
   *
   * Contract: A seat id, different from `fromSeatId`.
   * When to use: Visibility and the unread list.
   * Expected outcome: The stored recipient.
   * Exceptions: None.
   */
  readonly toSeatId: string;
  /**
   * Whether the message has been sent.
   *
   * Contract: `staged` for a player's unsent draft. `sent` after delivery.
   * When to use: Choosing which list a row belongs in.
   * Expected outcome: One of the two words.
   * Exceptions: None.
   */
  readonly status: 'staged' | 'sent';
  /**
   * The cleaned message text.
   *
   * Contract: The stored body. This module does not clean it.
   * When to use: A prompt or a recording event.
   * Expected outcome: The text that was inserted.
   * Exceptions: None.
   */
  readonly body: string;
  /**
   * The step stored on the row.
   *
   * Contract: A `StepKey`. A staged draft may hold a placeholder until send overwrites it.
   * When to use: Recording the step a message was sent in.
   * Expected outcome: The scope, turn, battle, and beat columns.
   * Exceptions: None.
   */
  readonly step: StepKey;
  /**
   * Whether the recipient's orders consult has shown this message.
   *
   * Contract: True after `markSideMessagesSeen`.
   * When to use: Deciding which lines are new.
   * Expected outcome: False for a newly sent message.
   * Exceptions: None.
   */
  readonly seenByRecipient: boolean;
}

/**
 * One stored stance.
 *
 * Contract: The current stance of one seat toward another. History is a recorder event, not this row.
 * When to use: A talk prompt and an orders prompt.
 * Expected outcome: The latest stance and its reason.
 * Exceptions: None.
 */
export interface SideStanceRow {
  /**
   * The seat that holds the stance.
   *
   * Contract: A seat id.
   * When to use: Listing one commander's stances.
   * Expected outcome: The stored seat.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The seat the stance is about.
   *
   * Contract: A different seat id.
   * When to use: The stance line in a prompt.
   * Expected outcome: The stored target.
   * Exceptions: None.
   */
  readonly towardSeatId: string;
  /**
   * The private stance.
   *
   * Contract: A `SideStance`.
   * When to use: The prompt and the recorder event.
   * Expected outcome: One of the five words.
   * Exceptions: None.
   */
  readonly stance: SideStance;
  /**
   * The one-sentence reason.
   *
   * Contract: Text, possibly empty.
   * When to use: The prompt. Do not log it.
   * Expected outcome: The stored reason.
   * Exceptions: None.
   */
  readonly reason: string;
  /**
   * The strategic turn this stance was written.
   *
   * Contract: The turn passed to `upsertSideStance`.
   * When to use: A later reader of the row.
   * Expected outcome: The stored turn.
   * Exceptions: None.
   */
  readonly updatedTurn: number;
}

/**
 * A message row as SQLite returns it.
 *
 * Contract: `seen_by_recipient` is 0 or 1.
 * When to use: The mapper inside this file.
 * Expected outcome: One stored message.
 * Exceptions: None.
 */
type MessageSqlRow = {
  readonly message_id: number;
  readonly from_seat_id: string;
  readonly to_seat_id: string;
  readonly status: 'staged' | 'sent';
  readonly body: string;
  readonly scope: 'strategic' | 'tactical';
  readonly turn_number: number;
  readonly battle_id: string;
  readonly beat_number: number;
  readonly seen_by_recipient: number;
};

const MESSAGE_COLUMNS = `message_id, from_seat_id, to_seat_id, status, body, scope, turn_number, battle_id, beat_number, seen_by_recipient`;

/**
 * Rebuilds a message row from the columns SQLite returns.
 *
 * Purpose: Callers see a `StepKey` rather than four columns.
 * When to use: Every message query in this file.
 * Expected outcome: One `SideMessageRow`.
 * Exceptions: None.
 */
function toMessageRow(row: MessageSqlRow): SideMessageRow {
  return {
    messageId: row.message_id,
    fromSeatId: row.from_seat_id,
    toSeatId: row.to_seat_id,
    status: row.status,
    body: row.body,
    step: {
      scope: row.scope,
      turnNumber: row.turn_number,
      battleId: row.battle_id,
      beatNumber: row.beat_number,
    },
    seenByRecipient: row.seen_by_recipient === 1,
  };
}

/**
 * Inserts one sent message.
 *
 * Purpose: A closed talk round and a committed player draft both deliver a message this way.
 * When to use: After the recipient has been checked.
 * Expected outcome: The new `message_id`. A seat messaging itself fails the table check.
 * Exceptions: Propagates a SQLite error.
 */
export function insertSentSideMessage(
  ops: BasicDbOps,
  args: { readonly fromSeatId: string; readonly toSeatId: string; readonly body: string; readonly step: StepKey }
): number {
  logDebug('sideMessageStore insertSentSideMessage', {
    fromSeatId: args.fromSeatId,
    toSeatId: args.toSeatId,
    bodyLength: args.body.length,
    turnNumber: args.step.turnNumber,
  });
  ops.run(
    `INSERT INTO side_messages (from_seat_id, to_seat_id, status, body, scope, turn_number, battle_id, beat_number, seen_by_recipient)
     VALUES (?, ?, 'sent', ?, ?, ?, ?, ?, 0)`,
    [args.fromSeatId, args.toSeatId, args.body, args.step.scope, args.step.turnNumber, args.step.battleId, args.step.beatNumber]
  );
  return ops.getOne<{ id: number }>('SELECT last_insert_rowid() AS id')?.id ?? 0;
}

/**
 * Replaces the staged draft from one seat to one recipient.
 *
 * Purpose: A player has at most one unsent message per recipient.
 * When to use: When the player writes or rewrites a draft.
 * Expected outcome: Any previous staged row for the pair is gone, and one staged row holds `body`.
 * Exceptions: Propagates a SQLite error.
 */
export function replaceStagedSideMessage(
  ops: BasicDbOps,
  args: { readonly fromSeatId: string; readonly toSeatId: string; readonly body: string; readonly step: StepKey }
): void {
  logDebug('sideMessageStore replaceStagedSideMessage', {
    fromSeatId: args.fromSeatId,
    toSeatId: args.toSeatId,
    bodyLength: args.body.length,
  });
  ops.run(
    `DELETE FROM side_messages WHERE from_seat_id = ? AND to_seat_id = ? AND status = 'staged'`,
    [args.fromSeatId, args.toSeatId]
  );
  ops.run(
    `INSERT INTO side_messages (from_seat_id, to_seat_id, status, body, scope, turn_number, battle_id, beat_number, seen_by_recipient)
     VALUES (?, ?, 'staged', ?, ?, ?, ?, ?, 0)`,
    [args.fromSeatId, args.toSeatId, args.body, args.step.scope, args.step.turnNumber, args.step.battleId, args.step.beatNumber]
  );
}

/**
 * Deletes the staged draft from one seat to one recipient.
 *
 * Purpose: The player cancelled that draft.
 * When to use: A cancel, and before send when the recipient has left the match.
 * Expected outcome: No staged row for the pair. A missing row is unchanged.
 * Exceptions: Propagates a SQLite error.
 */
export function deleteStagedSideMessage(ops: BasicDbOps, fromSeatId: string, toSeatId: string): void {
  logDebug('sideMessageStore deleteStagedSideMessage', { fromSeatId, toSeatId });
  ops.run(
    `DELETE FROM side_messages WHERE from_seat_id = ? AND to_seat_id = ? AND status = 'staged'`,
    [fromSeatId, toSeatId]
  );
}

/**
 * Lists the staged drafts one seat has written.
 *
 * Purpose: The player can review what has not been sent.
 * When to use: Before a commit, and in a test.
 * Expected outcome: Staged rows from that sender, in `message_id` order.
 * Exceptions: Propagates a SQLite error.
 */
export function listStagedSideMessages(ops: BasicDbOps, fromSeatId: string): SideMessageRow[] {
  const rows = ops.getAll<MessageSqlRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM side_messages WHERE from_seat_id = ? AND status = 'staged' ORDER BY message_id`,
    [fromSeatId]
  );
  logTrace('sideMessageStore listStagedSideMessages', { fromSeatId, count: rows.length });
  return rows.map(toMessageRow);
}

/**
 * Sends every staged draft from one seat.
 *
 * Purpose: Committing a turn or a beat delivers the player's drafts at that step.
 * When to use: After drafts to seats that have left the match have been deleted.
 * Expected outcome: Those rows become `sent` at `step`, and the returned rows are the sent copies. No staged row remains for the sender.
 * Exceptions: Propagates a SQLite error.
 */
export function sendStagedSideMessages(ops: BasicDbOps, fromSeatId: string, step: StepKey): SideMessageRow[] {
  const staged = listStagedSideMessages(ops, fromSeatId);
  logDebug('sideMessageStore sendStagedSideMessages', { fromSeatId, count: staged.length, turnNumber: step.turnNumber });
  if (staged.length === 0) return [];
  ops.run(
    `UPDATE side_messages
     SET status = 'sent', scope = ?, turn_number = ?, battle_id = ?, beat_number = ?
     WHERE from_seat_id = ? AND status = 'staged'`,
    [step.scope, step.turnNumber, step.battleId, step.beatNumber, fromSeatId]
  );
  return staged.map((row) => ({ ...row, status: 'sent' as const, step }));
}

/**
 * Lists sent messages a seat has not yet been shown.
 *
 * Purpose: An unread message is a reason to consult that seat for orders.
 * When to use: Before deciding whether a seat that the policy would skip still gets an orders consult.
 * Expected outcome: Sent rows addressed to that seat with `seen_by_recipient` 0, in `message_id` order.
 * Exceptions: Propagates a SQLite error.
 */
export function listUnseenInboundSideMessages(ops: BasicDbOps, toSeatId: string): SideMessageRow[] {
  const rows = ops.getAll<MessageSqlRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM side_messages
     WHERE to_seat_id = ? AND status = 'sent' AND seen_by_recipient = 0
     ORDER BY message_id`,
    [toSeatId]
  );
  logTrace('sideMessageStore listUnseenInboundSideMessages', { toSeatId, count: rows.length });
  return rows.map(toMessageRow);
}

/**
 * Marks messages as shown to their recipient.
 *
 * Purpose: A successful orders consult is what makes a message stop counting as unread.
 * When to use: After that consult, with the ids of the new lines the prompt showed.
 * Expected outcome: Those rows have `seen_by_recipient` 1. An empty list does nothing.
 * Exceptions: Propagates a SQLite error.
 */
export function markSideMessagesSeen(ops: BasicDbOps, messageIds: readonly number[]): void {
  logDebug('sideMessageStore markSideMessagesSeen', { count: messageIds.length });
  if (messageIds.length === 0) return;
  const placeholders = messageIds.map(() => '?').join(', ');
  ops.run(`UPDATE side_messages SET seen_by_recipient = 1 WHERE message_id IN (${placeholders})`, [...messageIds]);
}

/**
 * Lists the latest sent messages between two seats.
 *
 * Purpose: A prompt shows one thread per other side.
 * When to use: Building a talk prompt or an orders prompt. Callers still filter with `sideMessageVisibleTo`.
 * Expected outcome: The last `limit` sent rows in either direction, oldest first. `limit` 1 returns the newer row.
 * Exceptions: Propagates a SQLite error.
 */
export function listSideMessageThread(ops: BasicDbOps, seatA: string, seatB: string, limit: number): SideMessageRow[] {
  const rows = ops.getAll<MessageSqlRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM (
       SELECT ${MESSAGE_COLUMNS} FROM side_messages
       WHERE status = 'sent'
         AND ((from_seat_id = ? AND to_seat_id = ?) OR (from_seat_id = ? AND to_seat_id = ?))
       ORDER BY message_id DESC
       LIMIT ?
     ) ORDER BY message_id ASC`,
    [seatA, seatB, seatB, seatA, limit]
  );
  logTrace('sideMessageStore listSideMessageThread', { seatA, seatB, limit, count: rows.length });
  return rows.map(toMessageRow);
}

/**
 * Lists every sent message.
 *
 * Purpose: The chat history shows this list as it stands. A prompt filters it with `sideMessageVisibleTo`.
 * When to use: When the caller is not already asking for one thread.
 * Expected outcome: Sent rows in `message_id` order.
 * Exceptions: Propagates a SQLite error.
 */
export function listSentSideMessages(ops: BasicDbOps): SideMessageRow[] {
  const rows = ops.getAll<MessageSqlRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM side_messages WHERE status = 'sent' ORDER BY message_id`
  );
  logTrace('sideMessageStore listSentSideMessages', { count: rows.length });
  return rows.map(toMessageRow);
}

/**
 * Writes one seat's current stance toward another.
 *
 * Purpose: The stance table holds the current view. A recorder event is written only when this reports a change.
 * When to use: When a closed talk round stores a stance.
 * Expected outcome: `changed` is false when the stance and the reason are both unchanged, and then nothing is written. Otherwise the row is replaced and `previousStance` is the old stance, or null the first time.
 * Exceptions: Propagates a SQLite error.
 */
export function upsertSideStance(
  ops: BasicDbOps,
  args: {
    readonly seatId: string;
    readonly towardSeatId: string;
    readonly stance: SideStance;
    readonly reason: string;
    readonly turnNumber: number;
  }
): { readonly changed: boolean; readonly previousStance: SideStance | null } {
  const existing = ops.getOne<{ stance: SideStance; reason: string }>(
    `SELECT stance, reason FROM side_stances WHERE seat_id = ? AND toward_seat_id = ?`,
    [args.seatId, args.towardSeatId]
  );
  if (existing && existing.stance === args.stance && existing.reason === args.reason) {
    logDebug('sideMessageStore upsertSideStance', { seatId: args.seatId, towardSeatId: args.towardSeatId, changed: false });
    return { changed: false, previousStance: existing.stance };
  }
  logDebug('sideMessageStore upsertSideStance', {
    seatId: args.seatId,
    towardSeatId: args.towardSeatId,
    changed: true,
    hadPrevious: existing !== undefined,
  });
  ops.run(
    `INSERT INTO side_stances (seat_id, toward_seat_id, stance, reason, updated_turn)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (seat_id, toward_seat_id) DO UPDATE SET
       stance = excluded.stance,
       reason = excluded.reason,
       updated_turn = excluded.updated_turn`,
    [args.seatId, args.towardSeatId, args.stance, args.reason, args.turnNumber]
  );
  return { changed: true, previousStance: existing?.stance ?? null };
}

/**
 * Lists one seat's current stances.
 *
 * Purpose: A prompt prints the commander's private view of each other side.
 * When to use: Building a talk prompt or an orders prompt.
 * Expected outcome: That seat's rows, ordered by `toward_seat_id`.
 * Exceptions: Propagates a SQLite error.
 */
export function listSideStances(ops: BasicDbOps, seatId: string): SideStanceRow[] {
  const rows = ops.getAll<{
    seat_id: string;
    toward_seat_id: string;
    stance: SideStance;
    reason: string;
    updated_turn: number;
  }>(
    `SELECT seat_id, toward_seat_id, stance, reason, updated_turn
     FROM side_stances WHERE seat_id = ? ORDER BY toward_seat_id`,
    [seatId]
  );
  logTrace('sideMessageStore listSideStances', { seatId, count: rows.length });
  return rows.map((row) => ({
    seatId: row.seat_id,
    towardSeatId: row.toward_seat_id,
    stance: row.stance,
    reason: row.reason,
    updatedTurn: row.updated_turn,
  }));
}
