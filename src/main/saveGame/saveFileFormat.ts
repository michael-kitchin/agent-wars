/**
 * Names and player-facing sentences for a saved match file.
 *
 * Purpose: Save and load share one extension, one application id, and one wording for each reason a file cannot be used.
 * When to use: Writing a save, inspecting a file, and showing a save or load failure.
 * Expected outcome: Stable strings. The two metadata rows name the app version and the time the file was written.
 * Exceptions: None.
 */

import { logDebug } from '../logger';
import { SAVE_GAME_OVER_MESSAGE, SAVE_NOTHING_TO_SAVE_MESSAGE } from '../../shared/saveLoadAvailability';

export { SAVE_GAME_OVER_MESSAGE, SAVE_NOTHING_TO_SAVE_MESSAGE };

/**
 * File extension for a saved match, without the dot.
 *
 * Purpose: Dialogs and file names share one extension.
 * When to use: Naming a save and recognizing a chosen file.
 * Expected outcome: The string `agentwars`.
 * Exceptions: None.
 */
export const SAVE_FILE_EXTENSION = 'agentwars';

/**
 * Dialog filter label for a saved match.
 *
 * Purpose: The Save and Open dialogs use the same label.
 * When to use: Building the dialog filter.
 * Expected outcome: The string `Agent Wars save`.
 * Exceptions: None.
 */
export const SAVE_FILE_FILTER_NAME = 'Agent Wars save';

/**
 * SQLite `application_id` written into every save.
 *
 * Purpose: A copied match database is not a save until it carries this id.
 * When to use: Writing a save and recognizing one.
 * Expected outcome: The integer `0x41575356`.
 * Exceptions: None.
 */
export const SAVE_APPLICATION_ID = 0x41575356;

/**
 * `game_config` key for the app version that wrote the save.
 *
 * Purpose: A later version can name the app that wrote a file it cannot load.
 * When to use: Writing and inspecting a save.
 * Expected outcome: The string `save_app_version`.
 * Exceptions: None.
 */
export const SAVE_APP_VERSION_CONFIG_KEY = 'save_app_version';

/**
 * `game_config` key for the time the save was written.
 *
 * Purpose: Auto-save rotation can order files by the time stored inside them.
 * When to use: Writing a save and choosing which auto-saves to keep.
 * Expected outcome: The string `save_written_at`.
 * Exceptions: None.
 */
export const SAVE_WRITTEN_AT_CONFIG_KEY = 'save_written_at';

/**
 * Folder name, under the app data directory, that holds automatic saves.
 *
 * Purpose: Automatic saves stay out of the folder the player last chose.
 * When to use: Naming that folder.
 * Expected outcome: The string `autosaves`.
 * Exceptions: None.
 */
export const AUTOSAVE_DIRECTORY_NAME = 'autosaves';

/**
 * Start of an automatic-save file name.
 *
 * Purpose: Automatic saves are recognizable in the folder that holds them.
 * When to use: Naming an automatic save.
 * Expected outcome: The string `autosave-`.
 * Exceptions: None.
 */
export const AUTOSAVE_FILE_PREFIX = 'autosave-';

/**
 * How many automatic saves to keep.
 *
 * Purpose: Rotation deletes the oldest files beyond this count.
 * When to use: After a successful automatic save.
 * Expected outcome: The number 5.
 * Exceptions: None.
 */
export const AUTOSAVE_KEEP_COUNT = 5;

/** Shown when the file is not a saved match. */
export const SAVE_NOT_A_SAVE_MESSAGE = 'This file is not an Agent Wars save.';

/** Shown when a save has no match in it. */
export const SAVE_NO_MATCH_MESSAGE = 'This save has no match in it.';

/** Shown when a save names a map this build does not have. */
export const SAVE_UNKNOWN_MAP_MESSAGE = 'This save uses a map this version of Agent Wars does not have.';

/** Shown when the current turn is still resolving. */
export const SAVE_BUSY_MESSAGE = 'The match can be saved once this turn finishes resolving.';

/** Shown when a save could not be written for any other reason. */
export const SAVE_FAILED_MESSAGE = 'The game could not be saved.';

/** Shown when a load is asked for while the turn is still resolving. */
export const LOAD_BUSY_MESSAGE = 'A saved game can be loaded once this turn finishes resolving.';

/** Shown when a load fails for any other reason. */
export const LOAD_FAILED_MESSAGE = 'The saved game could not be loaded.';

/** Shown when a save or load is already running. */
export const SAVE_LOAD_IN_PROGRESS_MESSAGE = 'A save or load is already in progress.';

const SAVE_FILE_FORMAT_MESSAGES: readonly string[] = [
  SAVE_NOT_A_SAVE_MESSAGE,
  SAVE_NO_MATCH_MESSAGE,
  SAVE_UNKNOWN_MAP_MESSAGE,
  SAVE_NOTHING_TO_SAVE_MESSAGE,
  SAVE_GAME_OVER_MESSAGE,
  SAVE_BUSY_MESSAGE,
];

/**
 * Reports whether a thrown message is one this module shows to the player.
 *
 * Purpose: A save keeps a known sentence and replaces every other failure with the generic save failure.
 * When to use: After `writeSaveFileFromOpenDatabase` throws.
 * Expected outcome: True for this module's sentences, including the wrong-version sentence.
 * Exceptions: None.
 */
export function isSaveFileFormatMessage(message: string): boolean {
  logDebug('saveFileFormat isSaveFileFormatMessage', { known: SAVE_FILE_FORMAT_MESSAGES.includes(message) });
  return SAVE_FILE_FORMAT_MESSAGES.includes(message) || message.startsWith('This save was made by ');
}

/**
 * Names the app versions when a save's database version does not match this build.
 *
 * Purpose: The player sees which version wrote the file when the save recorded one.
 * When to use: After an inspection finds a different `user_version`.
 * Expected outcome: One sentence. A missing recorded version uses the shorter sentence.
 * Exceptions: None.
 */
export function saveWrongVersionMessage(savedBy: string | null, current: string): string {
  logDebug('saveFileFormat saveWrongVersionMessage', { hasSavedBy: savedBy !== null, current });
  if (savedBy === null) {
    return `This save was made by a different version of Agent Wars. Agent Wars ${current} cannot load it.`;
  }
  return `This save was made by Agent Wars ${savedBy}. Agent Wars ${current} cannot load it.`;
}
