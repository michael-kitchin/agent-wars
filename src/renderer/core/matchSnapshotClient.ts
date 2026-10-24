/**
 * Loads the snapshot for the side the screen is showing.
 *
 * Purpose: A watch passes View as. An active human seat does not.
 * When to use: Every renderer refresh of the match on screen.
 * Expected outcome: `getGameState` receives `'all'` or a seat id while watching, and no argument otherwise.
 * Exceptions: Rejects when `getGameState` is missing.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { observeModeControls } from '../../shared/observeModeControls';
import { rendererSharedState as S } from './state';

/**
 * The view argument for the current roster, if the screen is watching.
 *
 * Purpose: The server treats a missing view as the human seat, or as every side when that seat is out.
 * When to use: `fetchMatchSnapshot`.
 * Expected outcome: Undefined while a human seat is playing or before a roster is loaded. Otherwise `S.viewAs`.
 * Exceptions: None.
 */
export function matchViewArgument(): string | undefined {
  if (!observeModeControls(S.gameState?.seats ?? []).observing) return undefined;
  return S.viewAs;
}

/**
 * Reads the match snapshot for the current view.
 *
 * Purpose: View as survives the next refresh only when every read passes it.
 * When to use: Startup, Ready, battle exit, build edits, and a View as change.
 * Expected outcome: The promise from `gameApi.getGameState`.
 * Exceptions: Rejects when the bridge is missing.
 */
export function fetchMatchSnapshot(): Promise<GameStateSnapshot> {
  const api = window.gameApi;
  if (!api?.getGameState) return Promise.reject(new Error('getGameState is unavailable'));
  return api.getGameState(matchViewArgument());
}
