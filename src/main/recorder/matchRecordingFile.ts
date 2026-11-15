/**
 * Reads a recording file. This module does not open the match database.
 *
 * Purpose: The summary command and the export test share one parser.
 * When to use: A `.agentwars-recording` file, or the uncompressed fixture text.
 * Expected outcome: A header, the hex grid, and the history rows.
 * Exceptions: Throws `Error` with a plain sentence when the text is not a recording this build can read.
 */

import * as fs from 'fs';
import { gunzipSync } from 'node:zlib';
import {
  RECORDING_FILE_FORMAT,
  RECORDING_FILE_FORMAT_VERSION,
  type MatchRecord,
  type ParsedRecording,
  type RecordingHeader,
  type RecordingStatic,
} from '../../shared/matchRecording';

/**
 * Parses recording text.
 *
 * Purpose: The fixture is stored uncompressed, and the file reader parses the same lines after gunzip.
 * When to use: One JSON object per line. Empty lines are skipped.
 * Expected outcome: The header, the static hex line, and every record line in order.
 * Exceptions: Throws when the first line is not a header of this format, when the file version is newer than this build, or when a line is not JSON. The message names the line number.
 */
export function parseRecordingLines(text: string): ParsedRecording {
  const lines = text.split('\n').filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error('The recording is empty.');
  const header = parseHeader(lines[0]!, 1);
  const staticData = parseStatic(lines[1], 2);
  const records = lines.slice(2).map((line, index) => parseRecord(line, index + 3));
  return { header, staticData, records };
}

/**
 * Reads a gzip-compressed recording file.
 *
 * Purpose: Recordings on disk are compressed. The fixture is not, and is parsed with `parseRecordingLines`.
 * When to use: A path from the export or from the summary command.
 * Expected outcome: The parsed recording.
 * Exceptions: Throws when the file cannot be read, is not gzip, or is not a recording this build can read.
 */
export function readRecordingFile(filePath: string): ParsedRecording {
  const bytes = fs.readFileSync(filePath);
  const text = gunzipSync(bytes).toString('utf8');
  return parseRecordingLines(text);
}

/**
 * Parses the header line.
 *
 * Purpose: A different format or a newer layout is refused before any record is trusted.
 * When to use: The first non-empty line.
 * Expected outcome: The header.
 * Exceptions: Throws a plain sentence when the line is not this format or the version is newer.
 */
function parseHeader(line: string, lineNumber: number): RecordingHeader {
  const value = parseLine(line, lineNumber);
  if (!isRecord(value) || value.line !== 'header' || value.format !== RECORDING_FILE_FORMAT) {
    throw new Error('The recording does not start with an Agent Wars recording header.');
  }
  const formatVersion = value.formatVersion;
  if (typeof formatVersion !== 'number' || formatVersion > RECORDING_FILE_FORMAT_VERSION) {
    throw new Error('This recording was written by a newer Agent Wars.');
  }
  return {
    line: 'header',
    format: RECORDING_FILE_FORMAT,
    formatVersion,
    appVersion: typeof value.appVersion === 'string' ? value.appVersion : '',
    matchId: typeof value.matchId === 'string' ? value.matchId : '',
    playthroughId: typeof value.playthroughId === 'string' ? value.playthroughId : '',
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
  };
}

/**
 * Parses the static hex line.
 *
 * Purpose: The hex grid is written once, ahead of the history.
 * When to use: The second non-empty line.
 * Expected outcome: The hex table. A missing line is an empty table.
 * Exceptions: Throws when the line is not JSON.
 */
function parseStatic(line: string | undefined, lineNumber: number): RecordingStatic {
  if (line === undefined) return { line: 'static', hexes: { columns: [], rows: [] } };
  const value = parseLine(line, lineNumber);
  if (!isRecord(value) || value.line !== 'static' || !isRecord(value.hexes)) {
    throw new Error(`Line ${lineNumber} is not the hex grid.`);
  }
  const columns = Array.isArray(value.hexes.columns) ? value.hexes.columns.filter((column) => typeof column === 'string') : [];
  const rows = Array.isArray(value.hexes.rows) ? value.hexes.rows.filter(Array.isArray) : [];
  return { line: 'static', hexes: { columns, rows } };
}

/**
 * Parses one history line.
 *
 * Purpose: Each record line is one `match_records` row with a decoded payload.
 * When to use: Every line after the header and the hex grid.
 * Expected outcome: A `MatchRecord`.
 * Exceptions: Throws when the line is not JSON or is not a record line.
 */
function parseRecord(line: string, lineNumber: number): MatchRecord {
  const value = parseLine(line, lineNumber);
  if (!isRecord(value) || value.line !== 'record') throw new Error(`Line ${lineNumber} is not a history record.`);
  const kind = value.kind === 'frame' || value.kind === 'event' ? value.kind : 'event';
  const scope = value.scope === 'tactical' ? 'tactical' : 'strategic';
  return {
    recordId: typeof value.recordId === 'number' ? value.recordId : 0,
    kind,
    recordType: typeof value.recordType === 'string' ? value.recordType : '',
    formatVersion: typeof value.formatVersion === 'number' ? value.formatVersion : 1,
    stepKey: typeof value.stepKey === 'string' ? value.stepKey : '',
    scope,
    turnNumber: typeof value.turnNumber === 'number' ? value.turnNumber : 0,
    battleId: typeof value.battleId === 'string' ? value.battleId : '',
    beatNumber: typeof value.beatNumber === 'number' ? value.beatNumber : 0,
    visibility: typeof value.visibility === 'string' ? value.visibility : 'engine',
    displayText: typeof value.displayText === 'string' ? value.displayText : null,
    recordedAt: typeof value.recordedAt === 'string' ? value.recordedAt : '',
    payload: value.payload,
  };
}

/**
 * Parses one line of JSON.
 *
 * Purpose: The error names the line so a broken fixture is easy to find.
 * When to use: Every non-empty line.
 * Expected outcome: The JSON value.
 * Exceptions: Throws when the line is not JSON.
 */
function parseLine(line: string, lineNumber: number): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    throw new Error(`Line ${lineNumber} is not valid JSON.`);
  }
}

/**
 * Narrows a JSON value to an object record.
 *
 * Purpose: The line parsers read fields without assuming the value is an object.
 * When to use: After `parseLine`.
 * Expected outcome: True for a non-null object.
 * Exceptions: None.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
