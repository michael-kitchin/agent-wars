/**
 * Runs a manual save or load, including the dialogs supplied by the caller.
 *
 * Purpose: The main process owns the file, the database swap, and the in-memory reset. The renderer only asks.
 * When to use: The `game:saveGame` and `game:loadGame` handlers.
 * Expected outcome: A saved file, a loaded match, a cancel, or one player-facing sentence. The open match is unchanged when a load is refused or canceled.
 * Exceptions: None. Database and file errors become a failed result. A rollback that cannot reopen the previous match returns that sentence.
 */

import * as fs from 'fs';
import * as path from 'path';
import { activeGameMap } from '../../shared/activeGameMap';
import type { LoadGameResult, SaveGameResult } from '../../shared/ipc/saveLoadTypes';
import { replaceGameDatabaseWithStagedFile, DATABASE_REPLACE_ROLLBACK_FAILED_MESSAGE } from '../gameDb/databaseReplace';
import { dbGetOne } from '../gameDb';
import { readTurnStateRow } from '../gameDb/turnStateReads';
import { logDebug, logError } from '../logger';
import { deleteSqliteFileSet } from './sqliteFileSet';
import { getActiveTacticalBattleSnapshot } from '../tacticalBattle/tacticalBattleSession';
import { rememberCurrentAutoSaveTurnKey } from './autoSave';
import { stageSaveFileForLoad } from './loadStaging';
import { resetMatchMemoryAfterDatabaseReplace } from './matchMemoryReset';
import {
  autosaveDirectory,
  isInsideDirectory,
  loadStagingPath,
  readRememberedSaveDirectory,
  saveStagingPath,
  suggestedSaveFileName,
  writeRememberedSaveDirectory,
} from './saveGamePaths';
import {
  isSaveFileFormatMessage,
  LOAD_BUSY_MESSAGE,
  LOAD_FAILED_MESSAGE,
  SAVE_BUSY_MESSAGE,
  SAVE_FAILED_MESSAGE,
  SAVE_FILE_EXTENSION,
  SAVE_LOAD_IN_PROGRESS_MESSAGE,
} from './saveFileFormat';
import { matchSaveBlocker, writeSaveFileFromOpenDatabase } from './saveFileWrite';
import { endSaveLoadOperation, tryBeginSaveLoadOperation } from './saveLoadGate';

export {
  LOAD_BUSY_MESSAGE,
  LOAD_FAILED_MESSAGE,
  SAVE_FAILED_MESSAGE,
  SAVE_LOAD_IN_PROGRESS_MESSAGE,
} from './saveFileFormat';
export { isSaveOrLoadInProgress } from './saveLoadGate';

/**
 * App paths and dialogs for one save or load.
 *
 * Purpose: The pipeline stays free of Electron. The handler fills this in.
 * When to use: `runSaveGame` and `runLoadGame`.
 * Expected outcome: Directories, the version stored in a save, and dialogs that return a path or null when canceled.
 * Exceptions: None.
 */
export interface SaveLoadDeps {
  /**
   * The app data directory.
   *
   * Contract: The directory that holds staging files and automatic saves.
   * When to use: Every save and load.
   * Expected outcome: Staging and settings paths are under it.
   * Exceptions: None.
   */
  readonly userDataDir: string;
  /**
   * The player's documents folder.
   *
   * Contract: Used when no remembered folder exists.
   * When to use: The Save dialog's default directory.
   * Expected outcome: The dialog opens there.
   * Exceptions: None.
   */
  readonly documentsDir: string;
  /**
   * The app version stored in a save.
   *
   * Contract: The running app's version string.
   * When to use: The `save_app_version` row.
   * Expected outcome: Inspection can name this app.
   * Exceptions: None.
   */
  readonly appVersion: string;
  /**
   * The open match database path.
   *
   * Contract: The file `getCanonicalDbPath` returns in production.
   * When to use: Replacing the match on load.
   * Expected outcome: That file becomes the loaded match, or is restored on failure.
   * Exceptions: None.
   */
  readonly canonicalDbPath: string;
  /**
   * Shows the Save dialog.
   *
   * Contract: Resolves the chosen path, or null when the player cancels.
   * When to use: After the match is known to be saveable.
   * Expected outcome: A path or null. It does not write the file.
   * Exceptions: None.
   */
  readonly showSaveDialog: (defaultPath: string) => Promise<string | null>;
  /**
   * Shows the Open dialog.
   *
   * Contract: Resolves the chosen path, or null when the player cancels.
   * When to use: After Ready is known to be idle.
   * Expected outcome: A path or null. It does not load the file.
   * Exceptions: None.
   */
  readonly showOpenDialog: (defaultDirectory: string) => Promise<string | null>;
  /**
   * Stops opponent planning before the database is swapped.
   *
   * Contract: Advances the match generation the same way a new match does.
   * When to use: After a file has been accepted and before the swap. No await follows until the memory reset has finished.
   * Expected outcome: In-flight consults cannot write the loaded match.
   * Exceptions: None.
   */
  readonly stopModelWorkForLoad: () => void;
  /**
   * Reports whether Ready or melee resolution is still running.
   *
   * Contract: True only during those handlers.
   * When to use: Before a dialog and again after it closes.
   * Expected outcome: Save and load are refused while it is true.
   * Exceptions: None.
   */
  readonly isReadyInFlight: () => boolean;
}

/**
 * Saves the open match to a file the player chooses.
 *
 * Purpose: The dialog is skipped when the match cannot be saved, and it is checked again after the dialog because Ready may have started.
 * When to use: `game:saveGame`.
 * Expected outcome: `saved` with the base name, `canceled`, or `failed` with one sentence.
 * Exceptions: None.
 */
export async function runSaveGame(deps: SaveLoadDeps): Promise<SaveGameResult> {
  logDebug('saveLoadPipeline runSaveGame', { userDataDir: deps.userDataDir });
  if (!tryBeginSaveLoadOperation()) return failedSave(SAVE_LOAD_IN_PROGRESS_MESSAGE);
  try {
    return await saveBody(deps);
  } finally {
    endSaveLoadOperation();
  }
}

/**
 * Loads a file the player chooses in place of the open match.
 *
 * Purpose: The stretch after the dialog does not await. A queued commander write runs on a microtask, and it is dropped only after the commander pool generation moves. An await in that stretch would let the write land on the loaded database first. No other handler can run in that stretch either.
 * When to use: `game:loadGame`.
 * Expected outcome: `loaded` with the base name, `canceled`, or `failed`. The load staging file is deleted either way.
 * Exceptions: None.
 */
export async function runLoadGame(deps: SaveLoadDeps): Promise<LoadGameResult> {
  logDebug('saveLoadPipeline runLoadGame', { userDataDir: deps.userDataDir });
  if (!tryBeginSaveLoadOperation()) return failedLoad(SAVE_LOAD_IN_PROGRESS_MESSAGE);
  const stagingPath = loadStagingPath(deps.userDataDir);
  try {
    return await loadBody(deps, stagingPath);
  } finally {
    deleteQuietly(stagingPath);
    endSaveLoadOperation();
  }
}

/**
 * The save steps after the in-progress flag is held.
 *
 * Purpose: Keeps the flag's `finally` outside the dialog and the write.
 * When to use: `runSaveGame` only.
 * Expected outcome: The same result `runSaveGame` returns.
 * Exceptions: None.
 */
async function saveBody(deps: SaveLoadDeps): Promise<SaveGameResult> {
  if (deps.isReadyInFlight()) return failedSave(SAVE_BUSY_MESSAGE);
  const blocker = matchSaveBlocker();
  if (blocker) return failedSave(blocker);
  const directory = existingDirectory(readRememberedSaveDirectory(deps.userDataDir), deps.documentsDir);
  const turn = readTurnStateRow(dbGetOne);
  const battle = getActiveTacticalBattleSnapshot();
  const defaultPath = path.join(directory, suggestedSaveFileName({
    mapDisplayName: activeGameMap().displayName,
    turnNumber: turn?.turn_number ?? 1,
    tacticalTurnNumber: battle?.tacticalTurnNumber ?? null,
  }));
  const chosen = await deps.showSaveDialog(defaultPath);
  if (!chosen) return { status: 'canceled' };
  const targetPath = withSaveExtension(chosen);
  if (deps.isReadyInFlight()) return failedSave(SAVE_BUSY_MESSAGE);
  const blockerAfterDialog = matchSaveBlocker();
  if (blockerAfterDialog) return failedSave(blockerAfterDialog);
  try {
    writeSaveFileFromOpenDatabase({
      targetPath,
      stagingPath: saveStagingPath(deps.userDataDir),
      appVersion: deps.appVersion,
      writtenAtIso: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isSaveFileFormatMessage(message)) return failedSave(message);
    logError('saveLoadPipeline could not write the save', { targetPath, err });
    return failedSave(SAVE_FAILED_MESSAGE);
  }
  if (!isInsideDirectory(targetPath, autosaveDirectory(deps.userDataDir))) {
    writeRememberedSaveDirectory(deps.userDataDir, path.dirname(targetPath));
  }
  return { status: 'saved', fileName: path.basename(targetPath) };
}

/**
 * The load steps after the in-progress flag is held.
 *
 * Purpose: The dialog is the only await. The swap, the memory reset, and the remembered automatic-save key stay synchronous.
 * When to use: `runLoadGame` only.
 * Expected outcome: The same result `runLoadGame` returns.
 * Exceptions: None.
 */
async function loadBody(deps: SaveLoadDeps, stagingPath: string): Promise<LoadGameResult> {
  if (deps.isReadyInFlight()) return failedLoad(LOAD_BUSY_MESSAGE);
  const directory = existingDirectory(readRememberedSaveDirectory(deps.userDataDir), autosaveDirectory(deps.userDataDir));
  if (directory === autosaveDirectory(deps.userDataDir)) fs.mkdirSync(directory, { recursive: true });
  const chosen = await deps.showOpenDialog(directory);
  if (!chosen) return { status: 'canceled' };
  if (deps.isReadyInFlight()) return failedLoad(LOAD_BUSY_MESSAGE);
  const staged = stageSaveFileForLoad(chosen, stagingPath, deps.appVersion);
  if (!staged.ok) return failedLoad(staged.message);
  // No await from here through the remembered automatic-save key. See `runLoadGame`.
  deps.stopModelWorkForLoad();
  try {
    const replaced = replaceGameDatabaseWithStagedFile(deps.canonicalDbPath, stagingPath);
    if (!replaced.ok) return failedLoad(replaced.mapLoadError ?? LOAD_FAILED_MESSAGE);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === DATABASE_REPLACE_ROLLBACK_FAILED_MESSAGE) return failedLoad(message);
    logError('saveLoadPipeline could not replace the match', { stagingPath, err });
    return failedLoad(LOAD_FAILED_MESSAGE);
  }
  resetMatchMemoryAfterDatabaseReplace();
  rememberCurrentAutoSaveTurnKey();
  if (!isInsideDirectory(chosen, autosaveDirectory(deps.userDataDir))) {
    writeRememberedSaveDirectory(deps.userDataDir, path.dirname(chosen));
  }
  return { status: 'loaded', fileName: path.basename(chosen) };
}

/**
 * Appends the save extension when the chosen path does not already end with it.
 *
 * Purpose: A file chosen without the extension is still a save file.
 * When to use: After the Save dialog returns.
 * Expected outcome: A path whose extension is `agentwars`, without a second copy of that extension.
 * Exceptions: None.
 */
function withSaveExtension(filePath: string): string {
  if (path.extname(filePath).toLowerCase() === `.${SAVE_FILE_EXTENSION}`) return filePath;
  return `${filePath}.${SAVE_FILE_EXTENSION}`;
}

/**
 * Uses `preferred` when it is a directory that is still on disk.
 *
 * Purpose: A remembered folder that was deleted should not be offered as the dialog default.
 * When to use: Before the Save dialog.
 * Expected outcome: `preferred` or `fallback`.
 * Exceptions: None.
 */
function existingDirectory(preferred: string | null, fallback: string): string {
  if (preferred) {
    try {
      if (fs.statSync(preferred).isDirectory()) return preferred;
      logDebug('saveLoadPipeline remembered path is not a directory');
    } catch (err) {
      logDebug('saveLoadPipeline remembered directory is not available', { err });
    }
  }
  return fallback;
}

/**
 * Builds a failed save result.
 *
 * Purpose: Every failure has the same shape.
 * When to use: Any refused or failed save.
 * Expected outcome: `{ status: 'failed', message }`.
 * Exceptions: None.
 */
function failedSave(message: string): SaveGameResult {
  return { status: 'failed', message };
}

/**
 * Builds a failed load result.
 *
 * Purpose: Every failure has the same shape.
 * When to use: Any refused or failed load.
 * Expected outcome: `{ status: 'failed', message }`.
 * Exceptions: None.
 */
function failedLoad(message: string): LoadGameResult {
  return { status: 'failed', message };
}

/**
 * Deletes the load staging file when it is still present.
 *
 * Purpose: The staging file holds this machine's keys and must not be left behind.
 * When to use: The `finally` of `runLoadGame`.
 * Expected outcome: The path and any journal files beside it are absent, or the failure is logged. This does not replace the load's result.
 * Exceptions: None.
 */
function deleteQuietly(filePath: string): void {
  deleteSqliteFileSet(filePath, {
    quiet: true,
    failureLogMessage: 'saveLoadPipeline failed to delete the load staging file',
  });
}
