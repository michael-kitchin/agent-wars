/**
 * Inserts and reads `match_records` rows.
 *
 * Purpose: The recorder and the export share one place that knows the column list.
 * When to use: After the table exists. Callers that must not throw wrap these calls.
 * Expected outcome: Rows in `record_id` order, with payloads decoded.
 * Exceptions: Propagates a SQLite error or a payload that cannot be encoded or decoded.
 */

import type { BasicDbOps } from '../gameDb/dbOps';
import { logDebug, logTrace } from '../logger';
import {
  stepKeyText,
  visibilityText,
  type MatchEventType,
  type MatchRecord,
  type RecordVisibility,
  type StepKey,
} from '../../shared/matchRecording';
import { decodeRecordPayload, encodeRecordPayload } from './matchRecordCodec';

/**
 * The fields of a row that are not assigned by SQLite.
 *
 * Contract: `kind` is `frame` or `event`. `payload` is encoded by the insert.
 * When to use: `insertMatchRecord`.
 * Expected outcome: One new row.
 * Exceptions: None. The insert throws when the row is illegal.
 */
export interface NewMatchRecord {
  /**
   * Whether the row is a snapshot or an event.
   *
   * Contract: `frame` or `event`.
   * When to use: The insert.
   * Expected outcome: The `kind` column.
   * Exceptions: None.
   */
  readonly kind: 'frame' | 'event';
  /**
   * The frame type or the event type.
   *
   * Contract: `state` for a frame.
   * When to use: The insert.
   * Expected outcome: The `record_type` column.
   * Exceptions: None.
   */
  readonly recordType: string;
  /**
   * The payload format version.
   *
   * Contract: At least 1.
   * When to use: The insert.
   * Expected outcome: The `format_version` column.
   * Exceptions: None.
   */
  readonly formatVersion: number;
  /**
   * The step the row belongs to.
   *
   * Contract: A `StepKey`.
   * When to use: The insert. The columns are filled from this value.
   * Expected outcome: The step columns.
   * Exceptions: None.
   */
  readonly step: StepKey;
  /**
   * Who may be shown the row.
   *
   * Contract: A `RecordVisibility`.
   * When to use: The insert.
   * Expected outcome: The visibility text.
   * Exceptions: None.
   */
  readonly visibility: RecordVisibility;
  /**
   * Text shown to a player, or null.
   *
   * Contract: Null when the main process did not have display text.
   * When to use: A strategy event.
   * Expected outcome: The `display_text` column.
   * Exceptions: None.
   */
  readonly displayText: string | null;
  /**
   * When the row was written, as ISO text.
   *
   * Contract: The recorder clock.
   * When to use: The insert.
   * Expected outcome: The `recorded_at` column.
   * Exceptions: None.
   */
  readonly recordedAt: string;
  /**
   * The JSON value to store.
   *
   * Contract: A value `JSON.stringify` can express.
   * When to use: The insert.
   * Expected outcome: The compressed `payload` column.
   * Exceptions: None. Encoding throws for a function or `undefined`.
   */
  readonly payload: unknown;
}

/**
 * The columns a list reads back, in the order the mapper expects.
 *
 * Purpose: One select list for every read of a full row.
 * When to use: `listMatchRecords` and the latest-frame read.
 * Expected outcome: The stored columns, with `payload` still compressed.
 * Exceptions: None.
 */
const RECORD_COLUMNS = `record_id, kind, record_type, format_version, step_key, scope, turn_number,
  battle_id, beat_number, visibility, display_text, recorded_at, payload`;

/**
 * A row as SQLite returns it, before the payload is decoded.
 *
 * Contract: `payload` is a blob. `display_text` is null when the column is null.
 * When to use: The mapper inside this file.
 * Expected outcome: One stored row.
 * Exceptions: None.
 */
type StoredMatchRecordRow = {
  /**
   * The assigned id.
   *
   * Contract: The primary key.
   * When to use: The mapper.
   * Expected outcome: `record_id`.
   * Exceptions: None.
   */
  readonly record_id: number;
  /**
   * The stored kind.
   *
   * Contract: `frame` or `event`.
   * When to use: The mapper.
   * Expected outcome: The column.
   * Exceptions: None.
   */
  readonly kind: 'frame' | 'event';
  /**
   * The stored type.
   *
   * Contract: The `record_type` text.
   * When to use: The mapper.
   * Expected outcome: The column.
   * Exceptions: None.
   */
  readonly record_type: string;
  /**
   * The stored format version.
   *
   * Contract: An integer of at least 1.
   * When to use: The mapper.
   * Expected outcome: The column.
   * Exceptions: None.
   */
  readonly format_version: number;
  /**
   * The stored step text.
   *
   * Contract: The `step_key` text.
   * When to use: The mapper.
   * Expected outcome: The column.
   * Exceptions: None.
   */
  readonly step_key: string;
  /**
   * The stored scope.
   *
   * Contract: `strategic` or `tactical`.
   * When to use: The mapper.
   * Expected outcome: The column.
   * Exceptions: None.
   */
  readonly scope: 'strategic' | 'tactical';
  /**
   * The stored strategic turn.
   *
   * Contract: An integer.
   * When to use: The mapper.
   * Expected outcome: The column.
   * Exceptions: None.
   */
  readonly turn_number: number;
  /**
   * The stored battle id.
   *
   * Contract: Text, empty on a strategic step.
   * When to use: The mapper.
   * Expected outcome: The column.
   * Exceptions: None.
   */
  readonly battle_id: string;
  /**
   * The stored beat number.
   *
   * Contract: An integer, 0 on a strategic step.
   * When to use: The mapper.
   * Expected outcome: The column.
   * Exceptions: None.
   */
  readonly beat_number: number;
  /**
   * The stored visibility text.
   *
   * Contract: The column text.
   * When to use: The mapper.
   * Expected outcome: The column.
   * Exceptions: None.
   */
  readonly visibility: string;
  /**
   * The stored display text.
   *
   * Contract: Null when the column is null.
   * When to use: The mapper.
   * Expected outcome: The column.
   * Exceptions: None.
   */
  readonly display_text: string | null;
  /**
   * The stored timestamp.
   *
   * Contract: ISO text.
   * When to use: The mapper.
   * Expected outcome: The column.
   * Exceptions: None.
   */
  readonly recorded_at: string;
  /**
   * The compressed payload.
   *
   * Contract: A blob.
   * When to use: `decodeRecordPayload`.
   * Expected outcome: The column.
   * Exceptions: None.
   */
  readonly payload: Buffer;
}

/**
 * Inserts one history row.
 *
 * Purpose: Frames and events share this statement.
 * When to use: From the recorder, inside the caller's synchronous sequence.
 * Expected outcome: One new row. The payload is compressed.
 * Exceptions: Throws when the payload cannot be encoded or the row violates the table.
 */
export function insertMatchRecord(ops: BasicDbOps, record: NewMatchRecord): void {
  logDebug('matchRecordStore insertMatchRecord', {
    kind: record.kind,
    recordType: record.recordType,
    step: stepKeyText(record.step),
  });
  ops.run(
    `INSERT INTO match_records (
      kind, record_type, format_version, step_key, scope, turn_number, battle_id, beat_number,
      visibility, display_text, recorded_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.kind,
      record.recordType,
      record.formatVersion,
      stepKeyText(record.step),
      record.step.scope,
      record.step.turnNumber,
      record.step.battleId,
      record.step.beatNumber,
      visibilityText(record.visibility),
      record.displayText,
      record.recordedAt,
      encodeRecordPayload(record.payload),
    ]
  );
}

/**
 * Replaces the payload of the newest frame.
 *
 * Purpose: A finished match has no later frame, so the last snapshot is updated to the ended database.
 * When to use: Immediately before writing a recording of a finished match. This is the only update of a history row.
 * Expected outcome: The newest frame's payload is the new snapshot. No row is inserted. A match with no frame is unchanged.
 * Exceptions: Throws when the payload cannot be encoded or the update fails.
 */
export function replaceLatestFramePayload(ops: BasicDbOps, payload: unknown): void {
  const row = ops.getOne<{ record_id: number }>('SELECT record_id FROM match_records WHERE kind = ? ORDER BY record_id DESC LIMIT 1', [
    'frame',
  ]);
  logDebug('matchRecordStore replaceLatestFramePayload', { found: row !== undefined });
  if (!row) return;
  ops.run('UPDATE match_records SET payload = ? WHERE record_id = ?', [encodeRecordPayload(payload), row.record_id]);
}

/**
 * Lists every history row in write order.
 *
 * Purpose: The export and the tests read the whole table through one mapper.
 * When to use: When the caller needs decoded payloads.
 * Expected outcome: Rows ordered by `record_id`, payloads decoded.
 * Exceptions: Throws when a payload cannot be decoded.
 */
export function listMatchRecords(ops: BasicDbOps): MatchRecord[] {
  const rows = ops.getAll<StoredMatchRecordRow>(`SELECT ${RECORD_COLUMNS} FROM match_records ORDER BY record_id ASC`);
  logTrace('matchRecordStore listMatchRecords', { count: rows.length });
  return rows.map(toMatchRecord);
}

/**
 * The step text of the newest frame.
 *
 * Purpose: A boundary writes a frame only when the step has changed.
 * When to use: `recordStepBoundary`.
 * Expected outcome: The newest frame's `step_key`, or null when no frame exists.
 * Exceptions: Propagates a SQLite error.
 */
export function lastFrameStepKeyText(ops: BasicDbOps): string | null {
  const row = ops.getOne<{ step_key: string }>(
    'SELECT step_key FROM match_records WHERE kind = ? ORDER BY record_id DESC LIMIT 1',
    ['frame']
  );
  logTrace('matchRecordStore lastFrameStepKeyText', { found: row !== undefined });
  return row?.step_key ?? null;
}

/**
 * Reports whether an event type has been written.
 *
 * Purpose: Match start and match end are written once.
 * When to use: Before inserting `match_ended`.
 * Expected outcome: True when at least one row has that `record_type`.
 * Exceptions: Propagates a SQLite error.
 */
export function matchHasEventOfType(ops: BasicDbOps, recordType: MatchEventType): boolean {
  const row = ops.getOne<{ found: number }>('SELECT 1 AS found FROM match_records WHERE record_type = ? LIMIT 1', [recordType]);
  const found = row !== undefined;
  logTrace('matchRecordStore matchHasEventOfType', { recordType, found });
  return found;
}

/**
 * The highest history row id.
 *
 * Purpose: A recording is current only when its last record id matches the database, not only its row count.
 * When to use: The finished-match export, next to `countMatchRecords`.
 * Expected outcome: The maximum `record_id`, or null when the table is empty. The trace logs that id. A match id is not logged.
 * Exceptions: Propagates a SQLite error.
 */
export function lastMatchRecordId(ops: BasicDbOps): number | null {
  const row = ops.getOne<{ id: number | null }>('SELECT MAX(record_id) AS id FROM match_records');
  const id = row?.id ?? null;
  logTrace('matchRecordStore lastMatchRecordId', { recordId: id });
  return id;
}

/**
 * Counts history rows.
 *
 * Purpose: An empty table is a match that has not been recorded yet, and the export compares this with the file.
 * When to use: The boundary and the export.
 * Expected outcome: The number of rows.
 * Exceptions: Propagates a SQLite error.
 */
export function countMatchRecords(ops: BasicDbOps): number {
  const row = ops.getOne<{ count: number }>('SELECT COUNT(*) AS count FROM match_records');
  const count = row?.count ?? 0;
  logTrace('matchRecordStore countMatchRecords', { count });
  return count;
}

/**
 * Decodes one stored row.
 *
 * Purpose: List and export share the column mapping.
 * When to use: From `listMatchRecords` only.
 * Expected outcome: A `MatchRecord` with a decoded payload.
 * Exceptions: Throws when the payload cannot be decoded.
 */
function toMatchRecord(row: StoredMatchRecordRow): MatchRecord {
  return {
    recordId: row.record_id,
    kind: row.kind,
    recordType: row.record_type,
    formatVersion: row.format_version,
    stepKey: row.step_key,
    scope: row.scope,
    turnNumber: row.turn_number,
    battleId: row.battle_id,
    beatNumber: row.beat_number,
    visibility: row.visibility,
    displayText: row.display_text,
    recordedAt: row.recorded_at,
    payload: decodeRecordPayload(row.payload),
  };
}
