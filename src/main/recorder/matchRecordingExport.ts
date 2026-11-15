/**
 * Writes a finished match to a standalone recording file.
 *
 * Purpose: A finished match cannot be saved as a match file. This file is the copy that leaves the database.
 * When to use: After the match has ended and no deferred consult is still pending, and before a new match deletes the rows.
 * Expected outcome: One gzip file under `userData/recordings`. A second call with no new rows leaves the file untouched.
 * Exceptions: None from `exportFinishedMatchRecordingIfNeeded`. `writeMatchRecordingFile` throws on a file error.
 */

import * as fs from 'fs';
import * as path from 'path';
import { gzipSync } from 'node:zlib';
import type { BasicDbOps } from '../gameDb/dbOps';
import { gameDbOps, hasDbHandle } from '../gameDb/dbConnection';
import { readMatchId } from '../gameDb/gameConfigKv';
import { selectGameConfigValue } from '../gameDb/gameConfigRows';
import { logDebug, logError } from '../logger';
import { RECORDING_FILE_EXTENSION, RECORDING_FILE_FORMAT, RECORDING_FILE_FORMAT_VERSION } from '../../shared/matchRecording';
import { readMatchTable } from './matchFrameCapture';
import { readRecordingFile } from './matchRecordingFile';
import { isRecorderEnabled, refreshCurrentFramePayload } from './matchRecorder';
import { countMatchRecords, listMatchRecords, matchHasEventOfType } from './matchRecordStore';

/**
 * What the finished-match export needs from the app.
 *
 * Contract: `deferredConsultPending` is true only while a playback consult can still add rows.
 * When to use: `exportFinishedMatchRecordingIfNeeded`.
 * Expected outcome: The directory, the version, the clock, and whether to wait.
 * Exceptions: None.
 */
export interface FinishedMatchExportDeps {
  /**
   * The app's user-data directory.
   *
   * Contract: The directory that contains `recordings`.
   * When to use: The export.
   * Expected outcome: Files are written under `recordings` inside it.
   * Exceptions: None.
   */
  readonly userDataDir: string;
  /**
   * The app version stored in the header.
   *
   * Contract: `app.getVersion()`, or a test string.
   * When to use: The header line.
   * Expected outcome: That version.
   * Exceptions: None.
   */
  readonly appVersion: string;
  /**
   * The clock for `exportedAt`.
   *
   * Contract: Returns the current time.
   * When to use: The header line.
   * Expected outcome: An ISO timestamp.
   * Exceptions: None.
   */
  readonly now: () => Date;
  /**
   * Whether a deferred consult can still add rows.
   *
   * Contract: True while the pending slot is held. Callers pass false when the match is about to be deleted.
   * When to use: The export. This module does not import the consult module.
   * Expected outcome: The export waits when this is true.
   * Exceptions: None.
   */
  readonly deferredConsultPending: boolean;
}

/**
 * A file name that is safe on Windows.
 *
 * Purpose: A match id is usually a UUID, and a surprising character must not become a path.
 * When to use: The export path.
 * Expected outcome: `recording-{id}.agentwars-recording`, with characters outside letters, digits, and hyphen replaced by a hyphen.
 * Exceptions: None.
 */
export function recordingFileName(matchId: string): string {
  const safe = matchId.replace(/[^A-Za-z0-9-]/g, '-');
  return `recording-${safe}.${RECORDING_FILE_EXTENSION}`;
}

/**
 * Writes one recording file.
 *
 * Purpose: Tests and the finished-match helper share the line layout and the atomic replace.
 * When to use: When the caller has already decided the file should be written.
 * Expected outcome: Gzip-compressed JSON lines at `targetPath`. The write lands in a temporary file and then replaces the target.
 * Exceptions: Throws when the database read or the file write fails. The temporary file is removed after a failed replace.
 */
export function writeMatchRecordingFile(args: {
  ops: BasicDbOps;
  targetPath: string;
  appVersion: string;
  exportedAt: string;
}): void {
  logDebug('matchRecordingExport writeMatchRecordingFile', { directory: path.dirname(args.targetPath) });
  const matchId = readMatchId(args.ops) ?? '';
  const header = {
    line: 'header',
    format: RECORDING_FILE_FORMAT,
    formatVersion: RECORDING_FILE_FORMAT_VERSION,
    appVersion: args.appVersion,
    matchId,
    exportedAt: args.exportedAt,
  };
  const hexes = readMatchTable(args.ops, 'hexes');
  const staticLine = { line: 'static', hexes };
  const records = listMatchRecords(args.ops).map((record) => ({
    line: 'record',
    recordId: record.recordId,
    kind: record.kind,
    recordType: record.recordType,
    formatVersion: record.formatVersion,
    stepKey: record.stepKey,
    scope: record.scope,
    turnNumber: record.turnNumber,
    battleId: record.battleId,
    beatNumber: record.beatNumber,
    visibility: record.visibility,
    displayText: record.displayText,
    recordedAt: record.recordedAt,
    payload: record.payload,
  }));
  const text = [header, staticLine, ...records].map((line) => JSON.stringify(line)).join('\n');
  const tmp = `${args.targetPath}.tmp`;
  fs.mkdirSync(path.dirname(args.targetPath), { recursive: true });
  fs.writeFileSync(tmp, gzipSync(Buffer.from(text, 'utf8')));
  try {
    if (fs.existsSync(args.targetPath)) fs.rmSync(args.targetPath);
    fs.renameSync(tmp, args.targetPath);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/**
 * Writes the recording of a finished match when it is missing or stale.
 *
 * Purpose: The file is written once the match is over and no deferred consult is still adding rows, then rewritten if more rows arrive.
 * When to use: After an automatic save, after the player ends the match, after a deferred consult, and before a new match deletes a finished one.
 * Expected outcome: Nothing while the match is running or a consult is pending. Otherwise one file, replaced only when the database has more rows. The latest frame is refreshed before a write.
 * Exceptions: None. A failure is logged with the directory only.
 */
export function exportFinishedMatchRecordingIfNeeded(deps: FinishedMatchExportDeps): void {
  const directory = path.join(deps.userDataDir, 'recordings');
  try {
    logDebug('matchRecordingExport exportFinishedMatchRecordingIfNeeded', {
      directory,
      deferredConsultPending: deps.deferredConsultPending,
    });
    if (!isRecorderEnabled() || !hasDbHandle() || deps.deferredConsultPending) return;
    if (selectGameConfigValue(gameDbOps, 'game_over') !== '1') return;
    if (!listHasMatchEnded()) return;
    const matchId = readMatchId(gameDbOps) ?? '';
    const targetPath = path.join(directory, recordingFileName(matchId));
    const count = countMatchRecords(gameDbOps);
    if (fs.existsSync(targetPath) && recordingRecordCount(targetPath) === count) return;
    refreshCurrentFramePayload();
    writeMatchRecordingFile({
      ops: gameDbOps,
      targetPath,
      appVersion: deps.appVersion,
      exportedAt: deps.now().toISOString(),
    });
  } catch (err) {
    logError('matchRecordingExport could not write the recording', { directory, err });
  }
}

/**
 * Whether the history already contains the match end.
 *
 * Purpose: The export waits until `match_ended` exists, so the file is not a partial ending.
 * When to use: `exportFinishedMatchRecordingIfNeeded`.
 * Expected outcome: True when a `match_ended` row exists.
 * Exceptions: Propagates a SQLite error, which the export catches.
 */
function listHasMatchEnded(): boolean {
  return matchHasEventOfType(gameDbOps, 'match_ended');
}

/**
 * How many history rows a recording file contains.
 *
 * Purpose: A file is rewritten only when the database has more rows than the file.
 * When to use: Before deciding to replace an existing file.
 * Expected outcome: The record count, or -1 when the file cannot be parsed, so it is rewritten.
 * Exceptions: None. A bad file returns -1.
 */
function recordingRecordCount(filePath: string): number {
  try {
    return readRecordingFile(filePath).records.length;
  } catch {
    return -1;
  }
}
