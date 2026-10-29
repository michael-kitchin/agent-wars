/**
 * Writes one automatic save at the start of a strategic turn or a tactical turn.
 *
 * Purpose: The newest five automatic saves stay in their own folder. A failed automatic save never fails the turn.
 * When to use: After a handler that can start a turn has finished, and once after launch or a load so that open match is not copied again.
 * Expected outcome: At most one new file per turn key. The folder never keeps more than the requested count of automatic saves.
 * Exceptions: `maybeWriteTurnStartAutoSave` catches its own errors. The pure helpers do not throw.
 */

import * as fs from 'fs';
import * as path from 'path';
import { dbGetOne } from '../gameDb';
import { readTurnStateRow } from '../gameDb/turnStateReads';
import { logDebug, logError } from '../logger';
import { getActiveTacticalBattleSnapshot } from '../tacticalBattle/tacticalBattleSession';
import { isSaveOrLoadInProgress } from './saveLoadGate';
import { autosaveDirectory, saveStagingPath } from './saveGamePaths';
import { AUTOSAVE_FILE_PREFIX, AUTOSAVE_KEEP_COUNT, SAVE_FILE_EXTENSION } from './saveFileFormat';
import { matchSaveBlocker, writeSaveFileFromOpenDatabase } from './saveFileWrite';

/**
 * What an automatic save needs from the app.
 *
 * Purpose: Tests pass a fixed clock and a temporary directory.
 * When to use: `maybeWriteTurnStartAutoSave`.
 * Expected outcome: The directory, the version stored in the file, and the clock used in the file name.
 * Exceptions: None.
 */
export interface AutoSaveDeps {
  /**
   * The app data directory that holds the automatic-save folder.
   *
   * Contract: An absolute or relative directory the process can create.
   * When to use: `maybeWriteTurnStartAutoSave`.
   * Expected outcome: Automatic saves are written under `autosaves` inside it.
   * Exceptions: None.
   */
  readonly userDataDir: string;
  /**
   * The app version stored in the automatic save.
   *
   * Contract: The same string a manual save would store.
   * When to use: `maybeWriteTurnStartAutoSave`.
   * Expected outcome: The `save_app_version` row.
   * Exceptions: None.
   */
  readonly appVersion: string;
  /**
   * The clock used in the file name and the written-at row.
   *
   * Contract: Returns the current time. Tests return a fixed time.
   * When to use: Once per write.
   * Expected outcome: A `Date` in local time for the file name.
   * Exceptions: None.
   */
  readonly now: () => Date;
}

/** The turn key of the last automatic save, launch, or load. Null until one of those runs. */
let rememberedAutoSaveTurnKey: string | null = null;

/**
 * Builds the key that says which turn an automatic save belongs to.
 *
 * Purpose: The same strategic turn is not saved twice, and a battle turn is a different key from the strategic turn around it.
 * When to use: Before writing an automatic save, and when remembering the open match.
 * Expected outcome: `s12` outside a battle, or `s12-b<battleId>-t3` inside one.
 * Exceptions: None.
 */
export function turnStartKey(
  turnNumber: number,
  battleId: string | null,
  tacticalTurnNumber: number | null,
): string {
  if (battleId === null || tacticalTurnNumber === null) return `s${turnNumber}`;
  return `s${turnNumber}-b${battleId}-t${tacticalTurnNumber}`;
}

/**
 * Builds an automatic-save file name that sorts by time as text.
 *
 * Purpose: Rotation can keep the newest names without reading each file.
 * When to use: When an automatic save is written.
 * Expected outcome: `autosave-YYYYMMDD-HHMMSS-mmm-turn-N.agentwars`, with `-battle-turn-T` during a battle, in local time.
 * Exceptions: None.
 */
export function autoSaveFileName(now: Date, turnNumber: number, tacticalTurnNumber: number | null): string {
  const pad = (value: number, width: number): string => String(value).padStart(width, '0');
  const stamp = [
    `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`,
    `${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`,
    pad(now.getMilliseconds(), 3),
  ].join('-');
  const battle = tacticalTurnNumber === null ? '' : `-battle-turn-${tacticalTurnNumber}`;
  return `${AUTOSAVE_FILE_PREFIX}${stamp}-turn-${turnNumber}${battle}.${SAVE_FILE_EXTENSION}`;
}

/**
 * Deletes automatic saves beyond `keep`, oldest names first.
 *
 * Purpose: The folder holds a fixed number of the newest automatic saves and nothing else is removed.
 * When to use: After a successful automatic save.
 * Expected outcome: The first `keep` names in descending order remain. A failed delete is logged and the loop continues.
 * Exceptions: Throws when the directory cannot be read. A single delete failure does not throw.
 */
export function pruneAutoSaves(directory: string, keep: number): void {
  logDebug('autoSave pruneAutoSaves', { directory, keep });
  const names = fs.readdirSync(directory)
    .filter((name) => name.startsWith(AUTOSAVE_FILE_PREFIX) && name.endsWith(`.${SAVE_FILE_EXTENSION}`))
    .sort((left, right) => (left < right ? 1 : left > right ? -1 : 0));
  for (const name of names.slice(Math.max(0, keep))) {
    try {
      fs.rmSync(path.join(directory, name));
    } catch (err) {
      logError('autoSave failed to delete an old automatic save', { directory, name, err });
    }
  }
}

/**
 * Writes an automatic save when the open turn has not been saved yet.
 *
 * Purpose: Each strategic turn and each tactical turn gets one file, and a failure stays in the log.
 * When to use: After a handler that starts a turn returns, outside any database transaction.
 * Expected outcome: One new file when the turn key changed and the match can be saved. Otherwise no file. Never throws.
 * Exceptions: None. Errors are logged.
 */
export function maybeWriteTurnStartAutoSave(deps: AutoSaveDeps): void {
  logDebug('autoSave maybeWriteTurnStartAutoSave', { userDataDir: deps.userDataDir });
  if (isSaveOrLoadInProgress()) return;
  const blocker = matchSaveBlocker();
  if (blocker) {
    logDebug('autoSave skipped', { blocker });
    return;
  }
  try {
    const key = currentAutoSaveTurnKey();
    if (key === null || key === rememberedAutoSaveTurnKey) return;
    const turn = readTurnStateRow(dbGetOne);
    if (!turn) return;
    const battle = getActiveTacticalBattleSnapshot();
    const directory = autosaveDirectory(deps.userDataDir);
    fs.mkdirSync(directory, { recursive: true });
    const fileName = autoSaveFileName(deps.now(), turn.turn_number, battle?.tacticalTurnNumber ?? null);
    writeSaveFileFromOpenDatabase({
      targetPath: path.join(directory, fileName),
      stagingPath: saveStagingPath(deps.userDataDir),
      appVersion: deps.appVersion,
      writtenAtIso: deps.now().toISOString(),
    });
    pruneAutoSaves(directory, AUTOSAVE_KEEP_COUNT);
    rememberedAutoSaveTurnKey = key;
  } catch (err) {
    logError('autoSave could not write the automatic save', { userDataDir: deps.userDataDir, err });
  }
}

/**
 * Remembers the open turn so it is not copied again.
 *
 * Purpose: Launch and load should not write an automatic save of the match they just opened.
 * When to use: After the persisted battle is restored at launch, and immediately after a load resets match memory.
 * Expected outcome: The remembered key matches the open turn. A missing turn row leaves the key unchanged.
 * Exceptions: None.
 */
export function rememberCurrentAutoSaveTurnKey(): void {
  const key = currentAutoSaveTurnKey();
  logDebug('autoSave rememberCurrentAutoSaveTurnKey', { hasKey: key !== null });
  if (key === null) return;
  rememberedAutoSaveTurnKey = key;
}

/**
 * Forgets the last automatic-save turn.
 *
 * Purpose: Turn 1 of a new match is a new key even when the previous match was also turn 1.
 * When to use: After a new match has reset the database, before the automatic save that follows.
 * Expected outcome: The next automatic save treats the open turn as unsaved.
 * Exceptions: None.
 */
export function forgetAutoSaveTurnKey(): void {
  logDebug('autoSave forgetAutoSaveTurnKey');
  rememberedAutoSaveTurnKey = null;
}

/**
 * The key of the open turn, or null when the database has no turn row.
 *
 * Purpose: Automatic save and the remembered key share one description of the open turn.
 * When to use: From the write and remember functions.
 * Expected outcome: The strategic key, the battle key, or null.
 * Exceptions: None.
 */
function currentAutoSaveTurnKey(): string | null {
  const turn = readTurnStateRow(dbGetOne);
  if (!turn) return null;
  const battle = getActiveTacticalBattleSnapshot();
  return turnStartKey(turn.turn_number, battle?.battleId ?? null, battle ? battle.tacticalTurnNumber : null);
}
