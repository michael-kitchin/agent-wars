/**
 * The snapshot the match screen is allowed to see.
 *
 * Purpose: A watch can ask for every side or for one seat's fog. An active human seat always sees its own.
 * When to use: `game:getState`, and the snapshot returned when a match starts or a player ends one.
 * Expected outcome: The human seat while it is active. Every hex, with no stale intel, for `'all'`. That seat's fog otherwise.
 * Exceptions: Logs and drops a view sent while the human seat is active, and a view that names no seat.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { withBuildPausedFlags } from '../../shared/productionBuildability';
import { resolveMatchView } from '../../shared/observeModeControls';
import { HUMAN_SEAT_ID, type SeatId } from '../../shared/seatIds';
import { getGameState, getGameStateForPlayer, getSeatRoster } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { withHireHexes } from '../gameDb/mercenaryEconomyRead';
import { logDebug, logError } from '../logger';

/**
 * Builds the all-sides snapshot from the unfiltered match.
 *
 * Purpose: All sides, no fog, shows every hex and every unit and no stale ghost.
 * When to use: When `resolveMatchView` returns `'all'`.
 * Expected outcome: `playerPerspective` is `'all'`, `enemyIntel` is empty, and every hex is visible and explored.
 * Exceptions: Propagates a database error from `getGameState`.
 */
function omniscientSnapshot(): GameStateSnapshot {
  const state = getGameState();
  const allHexes = state.hexes.map((hex) => hex.h3Index);
  return withBuildPausedFlags({
    ...state,
    visibleHexes: allHexes,
    exploredHexes: allHexes,
    staleHexes: [],
    enemyIntel: [],
    playerPerspective: 'all',
  }, null);
}

/**
 * Reads the snapshot for the view the renderer asked for.
 *
 * Purpose: One reader for get-state, a new match, and End game.
 * When to use: Those IPC handlers. Omit the argument when the renderer has no view.
 * Expected outcome: See the module comment. A view is logged at debug, and a dropped view at error.
 * Exceptions: Propagates a database error from the snapshot readers.
 */
export function readMatchSnapshot(requested: unknown): GameStateSnapshot {
  const requestedText = typeof requested === 'string' ? requested : null;
  const decision = resolveMatchView({ seats: getSeatRoster(), requested: requestedText });
  if (decision.ignoredRequest) {
    logError('readMatchSnapshot ignored viewAs because the human seat is active', { viewAs: requestedText });
  }
  if (decision.rejected) {
    logError('readMatchSnapshot rejected viewAs', { viewAs: requestedText });
  }
  logDebug('readMatchSnapshot', { view: decision.view });
  if (decision.view === 'all') return omniscientSnapshot();
  const seatId: SeatId = decision.view === HUMAN_SEAT_ID ? HUMAN_SEAT_ID : decision.view;
  const snapshot = getGameStateForPlayer(seatId, { maskUnexploredTerrain: false });
  if (seatId !== HUMAN_SEAT_ID) return snapshot;
  return withHireHexes(gameDbOps, snapshot, seatId);
}
