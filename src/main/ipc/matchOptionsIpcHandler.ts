/**
 * IPC that changes a running match's options.
 *
 * Purpose: The Game Options dialog may change some options while the player plans a turn on the world map, and never while a turn resolves or a battle is open.
 * When to use: `registerIpcHandlers`.
 * Expected outcome: `game:setMatchOptions` stores a valid request and returns `{ ok: true }`, or returns a plain reason and stores nothing.
 * Exceptions: None reach the renderer. A failed write is logged and reported as a reason.
 */

import type { IpcMain } from 'electron';
import { IPC_GAME } from '../../shared/ipc/channels';
import type { MatchOptionsResult, MatchOptionsUpdate } from '../../shared/ipc/matchOptionsTypes';
import { gameDbOps, hasDbHandle } from '../gameDb/dbConnection';
import { selectGameConfigValue } from '../gameDb/gameConfigRows';
import { validateMatchOptionsUpdate, writeMatchOptions } from '../gameDb/matchOptionsWrite';
import { readTurnStateRow } from '../gameDb/turnStateReads';
import { logDebug, logError, logTrace } from '../logger';
import { isTacticalBattleActive } from '../tacticalBattle/tacticalBattleSession';
import { isReadyInFlight } from './readyInFlight';

/**
 * What the handler reads about the live match, and how it writes.
 *
 * Purpose: The checks run against plain functions, so a test needs no Electron and no database.
 * When to use: `handleSetMatchOptions`; `registerMatchOptionsIpcHandler` builds the real set.
 * Expected outcome: Each reader answers for the live match at the moment it is called.
 * Exceptions: None.
 */
export interface MatchOptionsDeps {
  /**
   * Whether a match is open.
   *
   * Contract: False before any match is started or loaded.
   * When to use: The first check.
   * Expected outcome: True when the database is open and has hexes.
   * Exceptions: None.
   */
  matchLoaded(): boolean;
  /**
   * Whether the match has ended.
   *
   * Contract: True once a winner or end reason is stored.
   * When to use: After the match is known to be open.
   * Expected outcome: The stored `game_over` flag.
   * Exceptions: None.
   */
  gameOver(): boolean;
  /**
   * The strategic turn phase.
   *
   * Contract: `'planning'` while the player gives orders.
   * When to use: Changes are allowed only while planning.
   * Expected outcome: The stored `turn_state.phase`.
   * Exceptions: None.
   */
  phase(): string;
  /**
   * Whether a Ready is resolving the turn.
   *
   * Contract: True from the start of Ready until its result is returned.
   * When to use: Changes must not race resolution.
   * Expected outcome: The main process's in-flight flag.
   * Exceptions: None.
   */
  readyInFlight(): boolean;
  /**
   * Whether a tactical battle is open.
   *
   * Contract: True while a battle session exists.
   * When to use: Changes wait until the battle ends.
   * Expected outcome: The tactical session's active flag.
   * Exceptions: None.
   */
  battleOpen(): boolean;
  /**
   * The current turn number.
   *
   * Contract: 1 or more.
   * When to use: A city-hexes limit must be later than this turn.
   * Expected outcome: The stored `turn_state.turn_number`.
   * Exceptions: None.
   */
  currentTurn(): number;
  /**
   * Stores a checked request.
   *
   * Contract: Writes every value or nothing.
   * When to use: Only after every check passed.
   * Expected outcome: The match's `game_config` rows hold the new values.
   * Exceptions: Throws on a database error.
   */
  write(update: MatchOptionsUpdate): void;
}

/**
 * The reason returned when the write throws.
 *
 * Purpose: The player gets a plain sentence; the error itself goes to the log.
 * When to use: `handleSetMatchOptions`.
 * Expected outcome: A fixed sentence.
 * Exceptions: None.
 */
const WRITE_FAILED_REASON = 'The settings could not be saved.';

/**
 * Why the match cannot take a change now, or null when it can.
 *
 * Purpose: Keeps the state checks in one ordered list.
 * When to use: `handleSetMatchOptions`, before validation.
 * Expected outcome: A plain sentence for the first blocking state, or null.
 * Exceptions: None.
 */
function blockedReason(deps: MatchOptionsDeps): string | null {
  if (!deps.matchLoaded()) return 'No match is open.';
  if (deps.gameOver()) return 'The match is over.';
  if (deps.phase() !== 'planning') return 'Settings can be changed only while you plan a turn.';
  if (deps.readyInFlight()) return 'Settings cannot be changed while the turn resolves.';
  if (deps.battleOpen()) return 'Settings cannot be changed while a battle is open.';
  return null;
}

/**
 * Checks and stores a request to change the match's options.
 *
 * Purpose: The renderer's own checks are not trusted; the main process repeats them against the live match.
 * When to use: The `game:setMatchOptions` handler, and tests with fake deps.
 * Expected outcome: `{ ok: true }` after one write, or `{ ok: false, reason }` with no write when the match is not planning or the request is invalid.
 * Exceptions: None. A thrown write is logged and returned as a reason.
 */
export function handleSetMatchOptions(payload: unknown, deps: MatchOptionsDeps): MatchOptionsResult {
  logDebug('matchOptionsIpcHandler handleSetMatchOptions', { payload });
  const blocked = blockedReason(deps);
  if (blocked) {
    logDebug('matchOptionsIpcHandler refused', { reason: blocked });
    return { ok: false, reason: blocked };
  }
  const validation = validateMatchOptionsUpdate(payload, deps.currentTurn());
  if (!validation.ok) {
    logDebug('matchOptionsIpcHandler refused', { reason: validation.reason });
    return validation;
  }
  try {
    deps.write(validation.update);
  } catch (err) {
    logError('matchOptionsIpcHandler write failed', err);
    return { ok: false, reason: WRITE_FAILED_REASON };
  }
  return { ok: true };
}

/**
 * Whether a match is open.
 *
 * Purpose: The real `matchLoaded` reader: an open database with hexes, the same test the snapshot builder uses.
 * When to use: `registerMatchOptionsIpcHandler`.
 * Expected outcome: True when the `hexes` table has a row.
 * Exceptions: Propagates SQLite errors.
 */
function liveMatchLoaded(): boolean {
  logTrace('matchOptionsIpcHandler liveMatchLoaded');
  if (!hasDbHandle()) return false;
  return (gameDbOps.getOne<{ c: number }>('SELECT COUNT(*) AS c FROM hexes')?.c ?? 0) > 0;
}

/**
 * The real readers and writer for the handler.
 *
 * Purpose: The same reads the snapshot builder uses, plus the main-process Ready and battle flags.
 * When to use: `registerMatchOptionsIpcHandler`.
 * Expected outcome: Readers that answer for the live match.
 * Exceptions: None.
 */
const LIVE_MATCH_OPTIONS_DEPS: MatchOptionsDeps = {
  matchLoaded: liveMatchLoaded,
  gameOver: () => selectGameConfigValue(gameDbOps, 'game_over') === '1',
  phase: () => readTurnStateRow(gameDbOps.getOne)?.phase ?? 'planning',
  readyInFlight: isReadyInFlight,
  battleOpen: isTacticalBattleActive,
  currentTurn: () => readTurnStateRow(gameDbOps.getOne)?.turn_number ?? 1,
  write: writeMatchOptions,
};

/**
 * Registers `game:setMatchOptions`.
 *
 * Purpose: Keeps the handler body out of the main process entry file.
 * When to use: Once, from `registerIpcHandlers`.
 * Expected outcome: The channel returns `handleSetMatchOptions` with the live deps. No autosave runs; the next turn's autosave carries the change.
 * Exceptions: None.
 */
export function registerMatchOptionsIpcHandler(ipcMain: IpcMain): void {
  logDebug('matchOptionsIpcHandler register');
  ipcMain.handle(IPC_GAME.setMatchOptions, (_event, payload: unknown) => handleSetMatchOptions(payload, LIVE_MATCH_OPTIONS_DEPS));
}
