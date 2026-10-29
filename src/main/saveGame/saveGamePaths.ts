/**
 * Paths and file names for manual saves and automatic saves.
 *
 * Purpose: Save, load, and automatic save share one settings file, one staging name, and one way to recognize the automatic-save folder.
 * When to use: Building a dialog's default path and deciding whether a chosen file is an automatic save.
 * Expected outcome: Paths under the app data directory, plus a suggested file name for the Save dialog.
 * Exceptions: A missing settings file reads as null. A failed settings write is logged and does not throw.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError } from '../logger';
import { AUTOSAVE_DIRECTORY_NAME, SAVE_FILE_EXTENSION } from './saveFileFormat';

/** Settings file under the app data directory that remembers the last manual save folder. */
export const SAVE_GAME_SETTINGS_FILE_NAME = 'save-game-settings.json';

/** Staging file name for a manual or automatic save, beside the match database. */
export const SAVE_STAGING_FILE_NAME = 'save-staging.agentwars';

/** Staging file name for a load, beside the match database. */
export const LOAD_STAGING_FILE_NAME = 'load-staging.agentwars';

/**
 * The folder that holds automatic saves.
 *
 * Purpose: Automatic saves stay out of the folder the player last chose.
 * When to use: Creating that folder and recognizing a file inside it.
 * Expected outcome: `userDataDir/autosaves`.
 * Exceptions: None.
 */
export function autosaveDirectory(userDataDir: string): string {
  logDebug('saveGamePaths autosaveDirectory', { userDataDir });
  return path.join(userDataDir, AUTOSAVE_DIRECTORY_NAME);
}

/**
 * The temporary file a save writes before it replaces the target.
 *
 * Purpose: Manual save and automatic save share this one file, so they cannot run together.
 * When to use: `writeSaveFileFromOpenDatabase` from either caller.
 * Expected outcome: The staging path under `userDataDir`.
 * Exceptions: None.
 */
export function saveStagingPath(userDataDir: string): string {
  logDebug('saveGamePaths saveStagingPath', { userDataDir });
  return path.join(userDataDir, SAVE_STAGING_FILE_NAME);
}

/**
 * The temporary file a load prepares before it replaces the match.
 *
 * Purpose: The prepared copy stays under the app data directory until the load finishes.
 * When to use: `stageSaveFileForLoad`.
 * Expected outcome: The staging path under `userDataDir`.
 * Exceptions: None.
 */
export function loadStagingPath(userDataDir: string): string {
  logDebug('saveGamePaths loadStagingPath', { userDataDir });
  return path.join(userDataDir, LOAD_STAGING_FILE_NAME);
}

/**
 * Reads the folder the player last used for a manual save or load.
 *
 * Purpose: The next dialog opens there when the folder still exists.
 * When to use: Before showing a Save or Open dialog.
 * Expected outcome: The stored directory, or null when the file is missing, unreadable, or has no string `lastDirectory`.
 * Exceptions: None. A missing file is normal and is logged at debug.
 */
export function readRememberedSaveDirectory(userDataDir: string): string | null {
  const filePath = path.join(userDataDir, SAVE_GAME_SETTINGS_FILE_NAME);
  logDebug('saveGamePaths readRememberedSaveDirectory', { filePath });
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { lastDirectory?: unknown };
    if (!parsed || typeof parsed.lastDirectory !== 'string' || parsed.lastDirectory.length === 0) {
      logDebug('saveGamePaths readRememberedSaveDirectory malformed', { filePath });
      return null;
    }
    return parsed.lastDirectory;
  } catch (err) {
    logDebug('saveGamePaths readRememberedSaveDirectory unavailable', { filePath, err });
    return null;
  }
}

/**
 * Stores the folder the player last used for a manual save or load.
 *
 * Purpose: The next dialog can open in that folder.
 * When to use: After a manual save or load whose file is outside the automatic-save folder.
 * Expected outcome: The settings file contains `{ "lastDirectory": directory }`. A failed write is logged.
 * Exceptions: None. A write failure does not throw.
 */
export function writeRememberedSaveDirectory(userDataDir: string, directory: string): void {
  const filePath = path.join(userDataDir, SAVE_GAME_SETTINGS_FILE_NAME);
  logDebug('saveGamePaths writeRememberedSaveDirectory', { filePath });
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ lastDirectory: directory }), 'utf8');
  } catch (err) {
    logError('saveGamePaths writeRememberedSaveDirectory failed', { filePath, err });
  }
}

/**
 * The file name offered in the Save dialog.
 *
 * Purpose: The name tells the player which map and turn the file holds.
 * When to use: Before `showSaveDialog`.
 * Expected outcome: `Map turn N.agentwars`, or `Map turn N battle turn T.agentwars` during a battle. Characters that are illegal in a file name become `-`, and trailing dots and spaces are removed from the stem.
 * Exceptions: None.
 */
export function suggestedSaveFileName(args: {
  readonly mapDisplayName: string;
  readonly turnNumber: number;
  readonly tacticalTurnNumber: number | null;
}): string {
  const battle = args.tacticalTurnNumber === null ? '' : ` battle turn ${args.tacticalTurnNumber}`;
  const stem = sanitizeSaveStem(`${args.mapDisplayName} turn ${args.turnNumber}${battle}`);
  logDebug('saveGamePaths suggestedSaveFileName', { stem });
  return `${stem}.${SAVE_FILE_EXTENSION}`;
}

/**
 * Replaces characters a file name cannot contain, and trailing dots and spaces.
 *
 * Purpose: The Save dialog's suggested name has to be a legal file name.
 * When to use: `suggestedSaveFileName`.
 * Expected outcome: `< > : " / \\ | ? *` and control characters become `-`. Trailing dots and spaces are removed.
 * Exceptions: None.
 */
function sanitizeSaveStem(stem: string): string {
  let cleaned = '';
  for (const char of stem) {
    const code = char.charCodeAt(0);
    cleaned += code < 32 || '<>:"/\\|?*'.includes(char) ? '-' : char;
  }
  return cleaned.replace(/[. ]+$/g, '');
}

/**
 * Reports whether `filePath` is `directory` or a file inside it.
 *
 * Purpose: A manual save outside the automatic-save folder is the folder to remember.
 * When to use: After the player picks a file.
 * Expected outcome: True when the resolved file is the directory or nested under it. The comparison ignores case on Windows.
 * Exceptions: None.
 */
export function isInsideDirectory(filePath: string, directory: string): boolean {
  const resolvedDirectory = path.resolve(directory);
  const resolvedFile = path.resolve(filePath);
  const from = process.platform === 'win32' ? resolvedDirectory.toLowerCase() : resolvedDirectory;
  const to = process.platform === 'win32' ? resolvedFile.toLowerCase() : resolvedFile;
  const relative = path.relative(from, to);
  const inside = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  logDebug('saveGamePaths isInsideDirectory', { inside });
  return inside;
}
