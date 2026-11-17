/**
 * Inserts and reads `match_records` rows.
 *
 * Purpose: The recorder and the export share one place that knows the column list.
 * When to use: After the table exists. Callers that must not throw wrap these calls.
 * Expected outcome: Rows in `record_id` order, with payloads decoded.
 * Exceptions: Propagates a SQLite error or a payload that cannot be encoded or decoded.
 */

import type { BasicDbOps } from '../gameDb/dbOps';
import { logDebug, logError, logTrace } from '../logger';
import {
  MATCH_EVENT_FORMAT_VERSIONS,
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
 * Lists the events of one type in write order, failing on the first bad payload.
 *
 * Purpose: A strict read of one event type that does not decode frames or other types.
 * When to use: Tests, and a reader for which one bad row must fail the whole read. The match charts use `listReadableMatchEventsOfType`.
 * Expected outcome: Only rows with that `record_type`, ordered by `record_id`, payloads decoded.
 * Exceptions: Throws when a payload cannot be decoded.
 */
export function listMatchEventsOfType(ops: BasicDbOps, recordType: MatchEventType): MatchRecord[] {
  const rows = ops.getAll<StoredMatchRecordRow>(
    `SELECT ${RECORD_COLUMNS} FROM match_records WHERE kind = 'event' AND record_type = ? ORDER BY record_id ASC`,
    [recordType]
  );
  logTrace('matchRecordStore listMatchEventsOfType', { recordType, count: rows.length });
  return rows.map(toMatchRecord);
}

/**
 * Lists the events of one type that this build can read, skipping the rest.
 *
 * Purpose: A chart series must survive one damaged or newer row. `listMatchEventsOfType` throws on the first bad payload, which would empty every chart.
 * When to use: A reader that shows whatever it can, such as the statistics history. Use `listMatchEventsOfType` when one bad row must fail the read.
 * Expected outcome: Rows with that `record_type` whose `format_version` is `MATCH_EVENT_FORMAT_VERSIONS[recordType]` and whose payload decodes, ordered by `record_id`. A row of another version is skipped and logged at debug level. A payload that fails to decode is skipped and logged at error level with its record id.
 * Exceptions: Propagates a SQLite error. A decode error is caught per row.
 */
export function listReadableMatchEventsOfType(ops: BasicDbOps, recordType: MatchEventType): MatchRecord[] {
  const supportedVersion = MATCH_EVENT_FORMAT_VERSIONS[recordType];
  const rows = ops.getAll<StoredMatchRecordRow>(
    `SELECT ${RECORD_COLUMNS} FROM match_records WHERE kind = 'event' AND record_type = ? ORDER BY record_id ASC`,
    [recordType]
  );
  logDebug('matchRecordStore listReadableMatchEventsOfType', { recordType, supportedVersion, count: rows.length });
  return readableRows(rows, recordType, 'listReadableMatchEventsOfType');
}

/**
 * Lists the events of one type at one step that this build can read, skipping the rest.
 *
 * Purpose: A replay step must survive one damaged or newer row. `listMatchEventsAtStep` throws on the first bad payload, which would refuse the whole step.
 * When to use: Replay's dialog readers. Use `listMatchEventsAtStep` when one bad row must fail the read.
 * Expected outcome: Rows with that `record_type` and `step_key` that `readableRows` keeps, ordered by `record_id`.
 * Exceptions: Propagates a SQLite error. A decode error is caught per row.
 */
export function listReadableMatchEventsAtStep(ops: BasicDbOps, recordType: MatchEventType, stepKey: string): MatchRecord[] {
  const rows = ops.getAll<StoredMatchRecordRow>(
    `SELECT ${RECORD_COLUMNS} FROM match_records WHERE kind = 'event' AND record_type = ? AND step_key = ? ORDER BY record_id ASC`,
    [recordType, stepKey]
  );
  logDebug('matchRecordStore listReadableMatchEventsAtStep', { recordType, stepKey, count: rows.length });
  return readableRows(rows, recordType, 'listReadableMatchEventsAtStep');
}

/**
 * Decodes the stored rows this build can read and skips the others.
 *
 * Purpose: The tolerant readers share one rule for which rows they keep and how a skipped row is logged.
 * When to use: From `listReadableMatchEventsOfType` and `listReadableMatchEventsAtStep`, with the name of the caller for the log.
 * Expected outcome: The rows whose `format_version` is `MATCH_EVENT_FORMAT_VERSIONS[recordType]` and whose payload decodes, in the given order. A row of another version is logged at debug level, and a payload that fails to decode at error level with its record id.
 * Exceptions: None. A decode error is caught per row.
 */
function readableRows(rows: readonly StoredMatchRecordRow[], recordType: MatchEventType, caller: string): MatchRecord[] {
  const supportedVersion = MATCH_EVENT_FORMAT_VERSIONS[recordType];
  return rows.flatMap((row) => {
    if (row.format_version !== supportedVersion) {
      logDebug(`matchRecordStore ${caller}: skipped a row of another format version`, {
        recordType,
        recordId: row.record_id,
        formatVersion: row.format_version,
        supportedVersion,
      });
      return [];
    }
    try {
      return [toMatchRecord(row)];
    } catch (err) {
      logError(`matchRecordStore ${caller}: skipped a payload that could not be decoded`, {
        recordType,
        recordId: row.record_id,
        err,
      });
      return [];
    }
  });
}

/**
 * A history row without its payload.
 *
 * Contract: Every `MatchRecord` field except `payload`.
 * When to use: Listing a long series by step without decoding it, as the replay timeline does.
 * Expected outcome: The stored columns in camel case.
 * Exceptions: None.
 */
export type MatchRecordHeader = Omit<MatchRecord, 'payload'>;

/**
 * Lists the events of one type in write order without their payloads.
 *
 * Purpose: A timeline needs each snapshot's id, step, and visibility, and decoding every snapshot to get them would cost far too much.
 * When to use: When only the columns matter, such as building the replay timeline.
 * Expected outcome: Only rows with that `record_type`, ordered by `record_id`, with no payload field.
 * Exceptions: Propagates a SQLite error.
 */
export function listMatchRecordHeadersOfType(ops: BasicDbOps, recordType: MatchEventType): MatchRecordHeader[] {
  const rows = ops.getAll<Omit<StoredMatchRecordRow, 'payload'>>(
    `SELECT record_id, kind, record_type, format_version, step_key, scope, turn_number,
      battle_id, beat_number, visibility, display_text, recorded_at
     FROM match_records WHERE kind = 'event' AND record_type = ? ORDER BY record_id ASC`,
    [recordType]
  );
  logTrace('matchRecordStore listMatchRecordHeadersOfType', { recordType, count: rows.length });
  return rows.map((row) => ({
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
  }));
}

/**
 * The id of the newest event of one type.
 *
 * Purpose: A step needs to know whether an event of this type already follows the latest frame, without decoding any payload.
 * When to use: The replay recorder, before it writes a view snapshot.
 * Expected outcome: The highest `record_id` with that `record_type`, or null when there is none.
 * Exceptions: Propagates a SQLite error.
 */
export function lastRecordIdOfType(ops: BasicDbOps, recordType: MatchEventType): number | null {
  const row = ops.getOne<{ id: number | null }>(
    "SELECT MAX(record_id) AS id FROM match_records WHERE kind = 'event' AND record_type = ?",
    [recordType]
  );
  const id = row?.id ?? null;
  logTrace('matchRecordStore lastRecordIdOfType', { recordType, recordId: id });
  return id;
}

/**
 * The id and step of the newest frame.
 *
 * Purpose: The replay recorder pairs its snapshots with the latest frame's step, read without the frame's payload.
 * When to use: After a step boundary.
 * Expected outcome: The newest frame's `record_id`, its `step_key` text, and the same step as a `StepKey`, or null when no frame exists.
 * Exceptions: Propagates a SQLite error.
 */
export function lastFrameHeader(ops: BasicDbOps): { recordId: number; stepKey: string; step: StepKey } | null {
  const row = ops.getOne<{
    record_id: number;
    step_key: string;
    scope: 'strategic' | 'tactical';
    turn_number: number;
    battle_id: string;
    beat_number: number;
  }>(
    'SELECT record_id, step_key, scope, turn_number, battle_id, beat_number FROM match_records WHERE kind = ? ORDER BY record_id DESC LIMIT 1',
    ['frame']
  );
  logTrace('matchRecordStore lastFrameHeader', { found: row !== undefined });
  if (!row) return null;
  const step: StepKey = {
    scope: row.scope,
    turnNumber: row.turn_number,
    battleId: row.battle_id,
    beatNumber: row.beat_number,
  };
  return { recordId: row.record_id, stepKey: row.step_key, step };
}

/**
 * Reads one history row with its payload decoded.
 *
 * Purpose: Replay loads one snapshot without decoding every record of its type.
 * When to use: When the caller has a record id.
 * Expected outcome: The row, or null when the id is not in the table.
 * Exceptions: Throws when the payload cannot be decoded.
 */
export function readMatchRecord(ops: BasicDbOps, recordId: number): MatchRecord | null {
  const row = ops.getOne<StoredMatchRecordRow>(`SELECT ${RECORD_COLUMNS} FROM match_records WHERE record_id = ?`, [recordId]);
  logTrace('matchRecordStore readMatchRecord', { recordId, found: row !== undefined });
  return row ? toMatchRecord(row) : null;
}

/**
 * Lists the events of one type at one step, in write order, failing on the first bad payload.
 *
 * Purpose: A strict read of one step's events of one type.
 * When to use: Tests, and a reader for which one bad row must fail the whole read. Replay's dialog readers use `listReadableMatchEventsAtStep`.
 * Expected outcome: Only events with that `record_type` and `step_key`, ordered by `record_id`, payloads decoded.
 * Exceptions: Throws when a payload cannot be decoded.
 */
export function listMatchEventsAtStep(ops: BasicDbOps, recordType: MatchEventType, stepKey: string): MatchRecord[] {
  const rows = ops.getAll<StoredMatchRecordRow>(
    `SELECT ${RECORD_COLUMNS} FROM match_records WHERE kind = 'event' AND record_type = ? AND step_key = ? ORDER BY record_id ASC`,
    [recordType, stepKey]
  );
  logTrace('matchRecordStore listMatchEventsAtStep', { recordType, stepKey, count: rows.length });
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
