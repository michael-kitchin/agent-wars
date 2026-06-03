import { logDebug, logError, logTrace } from '../logger';
import type { GuardedDbOps } from './dbOps';

/**
 * Scope for persisted turn/beat notes (strategic game vs one tactical battle).
 */
export type TurnNotesScope = 'strategic' | 'tactical';

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
 * Inserts or updates strategy text for one turn/beat row, preserving existing loss JSON columns.
 *
 * Purpose: Captures AI strategy at successful consultation time.
 * When to use: `requestOrdersFlow` after `markSuccessfulConsultation`.
 * Expected outcome: Row exists with updated `strategy_text`; loss columns unchanged when already set.
 * Exceptions: Logs at error and skips when DB unavailable; does not throw to callers.
 */
export function upsertTurnStrategyNote(
  ops: TurnNotesDbOps,
  scope: TurnNotesScope,
  battleId: string,
  turnNumber: number,
  strategyText: string | null | undefined
): void {
  logDebug('turnNotesHistory upsertTurnStrategyNote', { scope, battleId, turnNumber, hasStrategy: !!strategyText?.trim() });
  if (!ops.hasDb()) return;
  try {
    ops.run(
      `INSERT INTO turn_notes_history (scope, battle_id, turn_number, strategy_text)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(scope, battle_id, turn_number) DO UPDATE SET strategy_text = excluded.strategy_text`,
      [scope, battleId, turnNumber, strategyText ?? null]
    );
  } catch (err) {
    logError('turnNotesHistory upsertTurnStrategyNote failed', { scope, battleId, turnNumber, err });
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
  scope: TurnNotesScope,
  battleId: string,
  turnNumber: number,
  humanLossJson: string,
  aiLossJson: string
): void {
  logDebug('turnNotesHistory upsertTurnLossNote', { scope, battleId, turnNumber });
  if (!ops.hasDb()) return;
  try {
    ops.run(
      `INSERT INTO turn_notes_history (scope, battle_id, turn_number, human_loss_json, ai_loss_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(scope, battle_id, turn_number) DO UPDATE SET
         human_loss_json = excluded.human_loss_json,
         ai_loss_json = excluded.ai_loss_json`,
      [scope, battleId, turnNumber, humanLossJson, aiLossJson]
    );
  } catch (err) {
    logError('turnNotesHistory upsertTurnLossNote failed', { scope, battleId, turnNumber, err });
  }
}

/**
 * Reads the most recent turn/beat notes strictly before `beforeTurnNumber`.
 *
 * Purpose: Supplies the three-entry window for recent-turn prompt sections.
 * When to use: Strategic briefing and tactical operational map prompt assembly.
 * Expected outcome: Up to `limit` rows ordered ascending by `turn_number` after a descending query.
 * Exceptions: Returns empty array when DB unavailable.
 */
export function getRecentTurnNotes(
  ops: TurnNotesDbOps,
  scope: TurnNotesScope,
  battleId: string,
  beforeTurnNumber: number,
  limit = 3
): TurnNoteRow[] {
  logTrace('turnNotesHistory getRecentTurnNotes', { scope, battleId, beforeTurnNumber, limit });
  if (!ops.hasDb()) return [];
  const rows = ops.getAll<{
    turn_number: number;
    strategy_text: string | null;
    human_loss_json: string | null;
    ai_loss_json: string | null;
  }>(
    `SELECT turn_number, strategy_text, human_loss_json, ai_loss_json
     FROM turn_notes_history
     WHERE scope = ? AND battle_id = ? AND turn_number < ?
     ORDER BY turn_number DESC
     LIMIT ?`,
    [scope, battleId, beforeTurnNumber, limit]
  );
  return rows
    .map((r) => ({
      turnNumber: r.turn_number,
      strategyText: r.strategy_text,
      humanLossJson: r.human_loss_json,
      aiLossJson: r.ai_loss_json,
    }))
    .reverse();
}

/**
 * Deletes tactical turn-note rows, optionally scoped to one battle id.
 *
 * Purpose: Resets tactical history when a new battle starts.
 * When to use: `startTacticalBattleForEnclosingRes1Hex` after installing a fresh battle snapshot.
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
