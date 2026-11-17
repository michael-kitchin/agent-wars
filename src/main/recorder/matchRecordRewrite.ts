/**
 * Rewrites the payload of a stored history row.
 *
 * Purpose: History is written once, except for the final step of a finished match, whose frame and statistics are brought up to the ended database before its recording is written. Keeping the two updates here keeps them apart from the insert-and-read store.
 * When to use: From `refreshCurrentFramePayload` only.
 * Expected outcome: An updated payload on an existing row. No row is inserted.
 * Exceptions: Propagates a SQLite error or a payload that cannot be encoded.
 */

import type { BasicDbOps } from '../gameDb/dbOps';
import { logDebug } from '../logger';
import { encodeRecordPayload } from './matchRecordCodec';

/**
 * Replaces the payload of the newest frame.
 *
 * Purpose: A finished match has no later frame, so the last snapshot is updated to the ended database.
 * When to use: Immediately before writing a recording of a finished match. This and `replaceEventPayload` on that step's statistics are the only updates of a history row.
 * Expected outcome: The newest frame's payload is the new snapshot. No row is inserted. A match with no frame is unchanged.
 * Exceptions: Throws when the payload cannot be encoded or the update fails.
 */
export function replaceLatestFramePayload(ops: BasicDbOps, payload: unknown): void {
  const row = ops.getOne<{ record_id: number }>('SELECT record_id FROM match_records WHERE kind = ? ORDER BY record_id DESC LIMIT 1', [
    'frame',
  ]);
  logDebug('matchRecordRewrite replaceLatestFramePayload', { found: row !== undefined });
  if (!row) return;
  ops.run('UPDATE match_records SET payload = ? WHERE record_id = ?', [encodeRecordPayload(payload), row.record_id]);
}

/**
 * Replaces the payload of one event row.
 *
 * Purpose: The final step's statistics event is brought up to date with its refreshed frame, so a late consult's cost and stances reach the recording.
 * When to use: From `refreshCurrentFramePayload` only, on the current step's `side_statistics` event.
 * Expected outcome: The event's payload is the new value. No row is inserted. An id that is not an event is unchanged.
 * Exceptions: Throws when the payload cannot be encoded or the update fails.
 */
export function replaceEventPayload(ops: BasicDbOps, recordId: number, payload: unknown): void {
  logDebug('matchRecordRewrite replaceEventPayload', { recordId });
  ops.run(`UPDATE match_records SET payload = ? WHERE record_id = ? AND kind = 'event'`, [encodeRecordPayload(payload), recordId]);
}
