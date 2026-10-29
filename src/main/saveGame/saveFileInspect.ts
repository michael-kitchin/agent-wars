/**
 * Reads a save file without changing the open match.
 *
 * Purpose: Load can refuse a text file, a raw database, a different database version, an empty save, or an unknown map before it replaces the match.
 * When to use: Before copying a chosen file into the load staging area.
 * Expected outcome: A summary of a usable save, or a player-facing reason it cannot be loaded.
 * Exceptions: None. An unreadable file is reported as not a save.
 */

import Database from 'better-sqlite3';
import { REGIONAL_RULES_BY_ID } from '../../shared/regionalRulesCatalog';
import { EXPECTED_USER_VERSION } from '../gameDb';
import { validateGameDatabaseOrThrow } from '../gameDb/databaseValidation';
import { logDebug, logError } from '../logger';
import {
  SAVE_APPLICATION_ID,
  SAVE_APP_VERSION_CONFIG_KEY,
  SAVE_NO_MATCH_MESSAGE,
  SAVE_NOT_A_SAVE_MESSAGE,
  SAVE_UNKNOWN_MAP_MESSAGE,
  saveWrongVersionMessage,
} from './saveFileFormat';

/**
 * What `inspectSaveFile` reports.
 *
 * Purpose: Load can accept a save or show the first reason it cannot.
 * When to use: The return value of `inspectSaveFile`.
 * Expected outcome: The map id and turn when the file can be loaded. Otherwise one player-facing sentence.
 * Exceptions: None.
 */
export type SaveFileInspection =
  | { readonly ok: true; readonly gameMapId: string; readonly turnNumber: number }
  | { readonly ok: false; readonly message: string };

/**
 * Reads a save file and reports whether this build can load it.
 *
 * Purpose: The checks run in a fixed order so a raw database and a wrong version get the sentence that matches the first failure.
 * When to use: Before staging a load.
 * Expected outcome: A summary, or the first failing check's sentence. The open match is not touched.
 * Exceptions: None.
 */
export function inspectSaveFile(filePath: string, currentAppVersion: string): SaveFileInspection {
  logDebug('saveFileInspect inspectSaveFile', { filePath, currentAppVersion });
  let db: InstanceType<typeof Database> | null = null;
  try {
    db = new Database(filePath, { readonly: true, fileMustExist: true });
    const applicationId = Number(db.pragma('application_id', { simple: true }));
    if (applicationId !== SAVE_APPLICATION_ID) return failure(SAVE_NOT_A_SAVE_MESSAGE, 'application id');
    const savedBy = readSavedBy(db);
    const userVersion = Number(db.pragma('user_version', { simple: true }));
    if (userVersion !== EXPECTED_USER_VERSION) {
      return failure(saveWrongVersionMessage(savedBy, currentAppVersion), 'user version');
    }
    try {
      validateGameDatabaseOrThrow(db, EXPECTED_USER_VERSION);
    } catch (err) {
      logDebug('saveFileInspect schema check failed', { err });
      return failure(SAVE_NOT_A_SAVE_MESSAGE, 'schema');
    }
    const counts = db.prepare(
      'SELECT (SELECT COUNT(*) FROM hexes) AS hexes, (SELECT COUNT(*) FROM seats) AS seats',
    ).get() as { hexes: number; seats: number } | undefined;
    const turn = db.prepare('SELECT turn_number FROM turn_state WHERE id = 1').get() as { turn_number: number } | undefined;
    if (!counts || counts.hexes < 1 || counts.seats < 1 || !turn) return failure(SAVE_NO_MATCH_MESSAGE, 'empty match');
    const storedMapId = readConfig(db, 'game_map_id');
    const gameMapId = storedMapId && storedMapId.length > 0 ? storedMapId : 'global';
    if (gameMapId !== 'global' && !(gameMapId in REGIONAL_RULES_BY_ID)) {
      return failure(SAVE_UNKNOWN_MAP_MESSAGE, 'map id');
    }
    logDebug('saveFileInspect accepted save', { filePath, gameMapId, turnNumber: turn.turn_number });
    return { ok: true, gameMapId, turnNumber: turn.turn_number };
  } catch (err) {
    logError('saveFileInspect could not read the file', { filePath, err });
    return failure(SAVE_NOT_A_SAVE_MESSAGE, 'unreadable');
  } finally {
    if (db) {
      try {
        db.close();
      } catch (err) {
        logError('saveFileInspect could not close the file', { filePath, err });
      }
    }
  }
}

/**
 * Reads the app version recorded in the save.
 *
 * Purpose: An older file may not have the metadata table, and that is still a version mismatch rather than a broken read.
 * When to use: Before comparing `user_version`.
 * Expected outcome: The stored version, or null when the row or the table cannot be read.
 * Exceptions: None. A failed read is logged and returned as null.
 */
function readSavedBy(db: InstanceType<typeof Database>): string | null {
  try {
    return readConfig(db, SAVE_APP_VERSION_CONFIG_KEY);
  } catch (err) {
    logDebug('saveFileInspect could not read the recorded app version', { err });
    return null;
  }
}

/**
 * Reads one `game_config` value.
 *
 * Purpose: Inspection needs the map id and the recorded app version.
 * When to use: From `inspectSaveFile` after the file has opened.
 * Expected outcome: The stored string, or null when the row is missing.
 * Exceptions: Throws when the query fails.
 */
function readConfig(db: InstanceType<typeof Database>, key: string): string | null {
  const row = db.prepare('SELECT value FROM game_config WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/**
 * Builds a failed inspection and logs which check failed.
 *
 * Purpose: A load failure can be traced without logging the file contents.
 * When to use: Each failed check in `inspectSaveFile`.
 * Expected outcome: `{ ok: false, message }`.
 * Exceptions: None.
 */
function failure(message: string, check: string): SaveFileInspection {
  logDebug('saveFileInspect rejected file', { check });
  return { ok: false, message };
}
