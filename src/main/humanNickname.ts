/**
 * The name shown for the human seat, stored on this computer.
 *
 * Purpose: Game Options keeps the name across matches. A save file does not.
 * When to use: The Game Options field, and the start of the next match.
 * Expected outcome: A missing or rejected row reads `Human`.
 * Exceptions: None. This module does not import the roster, so the roster can call the normalizer without a cycle.
 */

import { dbGetOne, dbRun } from './gameDb';
import { deleteGameConfigRow, selectGameConfigValue, upsertGameConfigValue } from './gameDb/gameConfigRows';
import { logDebug, logTrace } from './logger';
import { HUMAN_NICKNAME_CONFIG_KEY, HUMAN_NICKNAME_DEFAULT, normalizeSideNickname } from '../shared/sideNicknames';

/**
 * The nickname Game Options should show.
 *
 * Purpose: A missing row, a blank row, and a rejected row all mean the default.
 * When to use: When the field opens, and when a start did not send a nickname.
 * Expected outcome: The stored name, or `Human`. The log records the length, not the text.
 * Exceptions: Propagates a database error.
 */
export function getHumanNickname(): string {
  const stored = selectGameConfigValue({ getOne: dbGetOne }, HUMAN_NICKNAME_CONFIG_KEY);
  const name = normalizeSideNickname(stored) || HUMAN_NICKNAME_DEFAULT;
  logTrace('humanNickname getHumanNickname', { length: name.length });
  return name;
}

/**
 * Saves the Game Options nickname.
 *
 * Purpose: The field and the next match share one row.
 * When to use: Each edit of the field, and a start that sent a nickname.
 * Expected outcome: A blank, rejected, or default value deletes the row. Any other cleaned name replaces it.
 *   The log records the length, not the text.
 * Exceptions: Propagates a database error.
 */
export function setHumanNickname(value: unknown): void {
  const name = normalizeSideNickname(value);
  if (name.length === 0 || name === HUMAN_NICKNAME_DEFAULT) {
    deleteGameConfigRow({ run: dbRun }, HUMAN_NICKNAME_CONFIG_KEY);
    logDebug('humanNickname setHumanNickname cleared', { length: 0 });
    return;
  }
  upsertGameConfigValue({ run: dbRun }, HUMAN_NICKNAME_CONFIG_KEY, name);
  logDebug('humanNickname setHumanNickname', { length: name.length });
}
