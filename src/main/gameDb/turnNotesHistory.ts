import { logDebug, logError, logTrace } from '../logger';
import type { AiSeatId } from '../../shared/seatIds';
import type { GuardedDbOps } from './dbOps';

/**
 * Scope for persisted turn/beat notes (strategic game vs one tactical battle).
 */
export type TurnNotesScope = 'strategic' | 'tactical';

/**
 * How many prior turns or beats a commander prompt includes.
 *
 * Purpose: One limit for strategic briefings and tactical beat prompts.
 * When to use: The default of `getRecentTurnNotes`, and the prompt section builder.
 * Expected outcome: At most ten rows, strictly before the turn being planned.
 * Exceptions: None. A caller may pass a smaller limit.
 */
export const RECENT_TURN_NOTES_LIMIT = 10;

/**
 * One row from `turn_notes_history` returned to prompt builders.
 *
 * Purpose: Carries strategy text and serialized loss JSON for recent-turn prompt sections.
 * When to use: Output of `getRecentTurnNotes`; consumed by `buildRecentTurnNotesSection`.
 * Expected outcome: `turnNumber` is ascending within the returned batch.
 * Exceptions: None.
 */
export interface TurnNoteRow {
  /**
   * Strategic turn number or tactical beat number for this row.
   *
   * Contract: Matches the turn/beat when strategy was captured or losses were recorded.
   * When to use: Labels prompt entries as `Turn N` or `Beat N`.
   * Expected outcome: Unique per `(scope, battle_id)` primary key.
   * Exceptions: None.
   */
  turnNumber: number;
  /**
   * AI strategy text from the consultation that planned this turn/beat, if any.
   *
   * Contract: Nullable; empty/null treated as `(none)` in prompt formatting.
   * When to use: Recent-turn prompt `Strategy:` bullet.
   * Expected outcome: Updated independently from loss JSON via upsert.
   * Exceptions: None.
   */
  strategyText: string | null;
  /**
   * JSON blob of human {@link PlayerLossSummary} buckets for this turn/beat.
   *
   * Contract: Serialized via `serializePlayerLossSummary`; nullable until losses are recorded.
   * When to use: Recent-turn prompt `Human Losses:` bullet.
   * Expected outcome: Parsed with `parsePlayerLossSummaryJson` before formatting.
   * Exceptions: None.
   */
  humanLossJson: string | null;
  /**
   * JSON blob of AI/opponent {@link PlayerLossSummary} buckets for this turn/beat.
   *
   * Contract: Serialized via `serializePlayerLossSummary`; nullable until losses are recorded.
   * When to use: Recent-turn prompt `AI Losses:` bullet.
   * Expected outcome: Parsed with `parsePlayerLossSummaryJson` before formatting.
   * Exceptions: None.
   */
  aiLossJson: string | null;
}

type TurnNotesDbOps = GuardedDbOps;

/**
 * Strategy text written at consultation time.
 *
 * Purpose: The strategy note is one named field so a caller cannot pass a bare string.
 * When to use: Argument to `upsertTurnStrategyNote`.
 * Expected outcome: `strategyText` may be null. `message_text` is not written. The column stays so an older save still opens.
 * Exceptions: None.
 */
export interface TurnConsultationNoteTexts {
  /**
   * Strategy summary from the consultation, or null when omitted.
   *
   * Contract: Stored in `strategy_text`. Empty and null are equivalent for the prompt's `(none)`.
   * When to use: Always pass this key, even when the model omitted a strategy.
   * Expected outcome: Overwrites any prior strategy on the same turn row. A stored `message_text` from an older build is left as it is.
   * Exceptions: None.
   */
  strategyText: string | null | undefined;
}

/**
 * Inserts or updates strategy and message text for one turn/beat row, preserving existing loss JSON columns.
 *
 * Purpose: Captures the strategy at a successful consultation. `message_text` is no longer written and is kept so older saves and older builds still open the file.
 * When to use: `requestOrdersFlow` after `markSuccessfulConsultation`.
 * Expected outcome: The row's `strategy_text` is updated. Loss columns and `message_text` are left as they were.
 * Exceptions: Logs at error and skips when DB unavailable; does not throw to callers.
 */
export function upsertTurnStrategyNote(
  ops: TurnNotesDbOps,
  seatId: AiSeatId,
  scope: TurnNotesScope,
  battleId: string,
  turnNumber: number,
  texts: TurnConsultationNoteTexts
): void {
  logDebug('turnNotesHistory upsertTurnStrategyNote', {
    seatId,
    scope,
    battleId,
    turnNumber,
    hasStrategy: !!texts.strategyText?.trim(),
  });
  if (!ops.hasDb()) return;
  try {
    ops.run(
      `INSERT INTO turn_notes_history (seat_id, scope, battle_id, turn_number, strategy_text)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(seat_id, scope, battle_id, turn_number) DO UPDATE SET
         strategy_text = excluded.strategy_text`,
      [seatId, scope, battleId, turnNumber, texts.strategyText ?? null]
    );
  } catch (err) {
    logError('turnNotesHistory upsertTurnStrategyNote failed', { seatId, scope, battleId, turnNumber, err });
  }
}

/**
 * Inserts or updates loss JSON for one turn/beat row, preserving existing strategy text.
 *
 * Purpose: Captures full loss summaries after turn/beat resolution on main process.
 * When to use: Strategic finalize and tactical beat commit paths.
 * Expected outcome: Row exists with updated loss columns; strategy column unchanged when already set.
 * Exceptions: Logs at error and skips when DB unavailable; does not throw to callers.
 */
export function upsertTurnLossNote(
  ops: TurnNotesDbOps,
  seatId: AiSeatId,
  scope: TurnNotesScope,
  battleId: string,
  turnNumber: number,
  ownLossJson: string,
  enemyLossJson: string
): void {
  logDebug('turnNotesHistory upsertTurnLossNote', { seatId, scope, battleId, turnNumber });
  if (!ops.hasDb()) return;
  try {
    ops.run(
      `INSERT INTO turn_notes_history (seat_id, scope, battle_id, turn_number, own_loss_json, enemy_loss_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(seat_id, scope, battle_id, turn_number) DO UPDATE SET
         own_loss_json = excluded.own_loss_json,
         enemy_loss_json = excluded.enemy_loss_json`,
      [seatId, scope, battleId, turnNumber, ownLossJson, enemyLossJson]
    );
  } catch (err) {
    logError('turnNotesHistory upsertTurnLossNote failed', { seatId, scope, battleId, turnNumber, err });
  }
}

/**
 * Reads the most recent turn/beat notes strictly before `beforeTurnNumber`.
 *
 * Purpose: Supplies the ten-entry window for recent-turn prompt sections.
 * When to use: Strategic briefing and tactical operational map prompt assembly.
 * Expected outcome: Up to `limit` rows ordered ascending by `turn_number` after a descending query.
 * Exceptions: Returns empty array when DB unavailable.
 */
export function getRecentTurnNotes(
  ops: TurnNotesDbOps,
  seatId: AiSeatId,
  scope: TurnNotesScope,
  battleId: string,
  beforeTurnNumber: number,
  limit = RECENT_TURN_NOTES_LIMIT
): TurnNoteRow[] {
  logTrace('turnNotesHistory getRecentTurnNotes', { seatId, scope, battleId, beforeTurnNumber, limit });
  if (!ops.hasDb()) return [];
  const rows = ops.getAll<{
    turn_number: number;
    strategy_text: string | null;
    own_loss_json: string | null;
    enemy_loss_json: string | null;
  }>(
    `SELECT turn_number, strategy_text, own_loss_json, enemy_loss_json
     FROM turn_notes_history
     WHERE seat_id = ? AND scope = ? AND battle_id = ? AND turn_number < ?
     ORDER BY turn_number DESC
     LIMIT ?`,
    [seatId, scope, battleId, beforeTurnNumber, limit]
  );
  return rows
    .map((r) => ({
      turnNumber: r.turn_number,
      strategyText: r.strategy_text,
      humanLossJson: r.enemy_loss_json,
      aiLossJson: r.own_loss_json,
    }))
    .reverse();
}

/**
 * Names one `turn_notes_history` row.
 *
 * Purpose: Four values make the primary key, and callers read or write by them together.
 * When to use: The argument of `getTurnLossNoteColumns`.
 * Expected outcome: Matches the primary key of the table.
 * Exceptions: None.
 */
export interface TurnNoteKey {
  /**
   * The commander the row belongs to.
   *
   * Contract: An AI seat id.
   * When to use: The `seat_id` column.
   * Expected outcome: One commander's notes only.
   * Exceptions: None.
   */
  readonly seatId: AiSeatId;
  /**
   * Whether the row is a strategic turn or a tactical beat.
   *
   * Contract: A member of `TurnNotesScope`.
   * When to use: The `scope` column.
   * Expected outcome: Strategic rows and tactical rows stay apart.
   * Exceptions: None.
   */
  readonly scope: TurnNotesScope;
  /**
   * The battle the row belongs to.
   *
   * Contract: Empty for a strategic turn's own row; a battle id for a tactical row or a strategic battle-loss row.
   * When to use: The `battle_id` column.
   * Expected outcome: A battle-loss row never collides with the turn's own row.
   * Exceptions: None.
   */
  readonly battleId: string;
  /**
   * The strategic turn or tactical beat.
   *
   * Contract: A positive integer.
   * When to use: The `turn_number` column.
   * Expected outcome: Matches the key used when the row was written.
   * Exceptions: None.
   */
  readonly turnNumber: number;
}

/**
 * The two loss columns of one row.
 *
 * Purpose: Lets a writer merge new losses into a row without touching its strategy text.
 * When to use: The result of `getTurnLossNoteColumns`.
 * Expected outcome: Each field holds stored JSON, or null when the column is empty.
 * Exceptions: None.
 */
export interface TurnLossNoteColumns {
  /**
   * The commander's own losses.
   *
   * Contract: JSON written by `serializePlayerLossSummary`, or null.
   * When to use: The `own_loss_json` column.
   * Expected outcome: Parse with `parsePlayerLossSummaryJson`.
   * Exceptions: None.
   */
  readonly ownLossJson: string | null;
  /**
   * The losses of every other owner.
   *
   * Contract: JSON written by `serializePlayerLossSummary`, or null.
   * When to use: The `enemy_loss_json` column.
   * Expected outcome: Parse with `parsePlayerLossSummaryJson`.
   * Exceptions: None.
   */
  readonly otherLossJson: string | null;
}

/**
 * Reads the loss columns of one row.
 *
 * Purpose: The battle-loss writer merges new units into what is already stored.
 * When to use: Before `upsertTurnLossNote` rewrites a row that may already hold units.
 * Expected outcome: The stored columns, or null when the row does not exist or the database is unavailable.
 * Exceptions: Propagates a SQLite error.
 */
export function getTurnLossNoteColumns(ops: TurnNotesDbOps, key: TurnNoteKey): TurnLossNoteColumns | null {
  logTrace('turnNotesHistory getTurnLossNoteColumns', { ...key });
  if (!ops.hasDb()) return null;
  const row = ops.getOne<{ own_loss_json: string | null; enemy_loss_json: string | null }>(
    `SELECT own_loss_json, enemy_loss_json FROM turn_notes_history
     WHERE seat_id = ? AND scope = ? AND battle_id = ? AND turn_number = ?`,
    [key.seatId, key.scope, key.battleId, key.turnNumber]
  );
  if (!row) return null;
  return { ownLossJson: row.own_loss_json, otherLossJson: row.enemy_loss_json };
}

/**
 * One strategic row that holds units destroyed in a tactical battle.
 *
 * Purpose: Carries a battle's losses to the Recent Turn Notes window and the combat record.
 * When to use: The result of `listStrategicBattleLossRows`.
 * Expected outcome: One row per battle and turn, with the loss columns as stored.
 * Exceptions: None.
 */
export interface StrategicBattleLossRow {
  /**
   * The strategic turn the battle was fought in.
   *
   * Contract: A positive integer.
   * When to use: Matches the battle's losses to that turn's block.
   * Expected outcome: One of the turns asked for.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The battle the losses belong to.
   *
   * Contract: A non-empty battle id.
   * When to use: Tells two battles in one turn apart.
   * Expected outcome: Rows are ordered by this after the turn.
   * Exceptions: None.
   */
  readonly battleId: string;
  /**
   * The commander's own battle losses.
   *
   * Contract: JSON written by `serializePlayerLossSummary`, or null.
   * When to use: Parsed with `parsePlayerLossSummaryJson`.
   * Expected outcome: Holds this commander's destroyed parents in the `other` bucket.
   * Exceptions: None.
   */
  readonly ownLossJson: string | null;
  /**
   * Every other owner's battle losses.
   *
   * Contract: JSON written by `serializePlayerLossSummary`, or null.
   * When to use: Parsed with `parsePlayerLossSummaryJson`.
   * Expected outcome: Holds the other party's destroyed parents in the `other` bucket.
   * Exceptions: None.
   */
  readonly otherLossJson: string | null;
}

/**
 * Lists the battle-loss rows of one commander for some turns.
 *
 * Purpose: The strategic loss window reads the units each battle destroyed, which the turn's own row does not hold.
 * When to use: `readStrategicBattleLossesByTurn`, with the turn numbers of the Recent Turn Notes window.
 * Expected outcome: Strategic rows with a non-empty battle id, ordered by turn and then battle id. Empty when no turn is asked for or the database is unavailable.
 * Exceptions: Propagates a SQLite error.
 */
export function listStrategicBattleLossRows(
  ops: TurnNotesDbOps,
  seatId: AiSeatId,
  turnNumbers: readonly number[]
): StrategicBattleLossRow[] {
  logTrace('turnNotesHistory listStrategicBattleLossRows', { seatId, turnCount: turnNumbers.length });
  if (!ops.hasDb() || turnNumbers.length === 0) return [];
  const placeholders = turnNumbers.map(() => '?').join(', ');
  const rows = ops.getAll<{
    turn_number: number;
    battle_id: string;
    own_loss_json: string | null;
    enemy_loss_json: string | null;
  }>(
    `SELECT turn_number, battle_id, own_loss_json, enemy_loss_json
     FROM turn_notes_history
     WHERE seat_id = ? AND scope = 'strategic' AND battle_id <> '' AND turn_number IN (${placeholders})
     ORDER BY turn_number ASC, battle_id ASC`,
    [seatId, ...turnNumbers]
  );
  return rows.map((row) => ({
    turnNumber: row.turn_number,
    battleId: row.battle_id,
    ownLossJson: row.own_loss_json,
    otherLossJson: row.enemy_loss_json,
  }));
}

/**
 * Deletes tactical turn-note rows, optionally scoped to one battle id.
 *
 * Purpose: Resets tactical history when a new battle starts.
 * When to use: `startTacticalBattleForEnclosingStrategicHex` after installing a fresh battle snapshot.
 * Expected outcome: All `scope='tactical'` rows removed, or only rows for the given `battleId` when provided.
 * Exceptions: Logs at error on failure; does not throw.
 */
export function clearTacticalTurnNotes(ops: TurnNotesDbOps, battleId?: string): void {
  logDebug('turnNotesHistory clearTacticalTurnNotes', { battleId: battleId ?? '(all)' });
  if (!ops.hasDb()) return;
  try {
    if (battleId) {
      ops.run(`DELETE FROM turn_notes_history WHERE scope = 'tactical' AND battle_id = ?`, [battleId]);
    } else {
      ops.run(`DELETE FROM turn_notes_history WHERE scope = 'tactical'`);
    }
  } catch (err) {
    logError('turnNotesHistory clearTacticalTurnNotes failed', { battleId, err });
  }
}
