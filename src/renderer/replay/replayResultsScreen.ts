/**
 * Sets the results screen aside during replay over a finished match, and gives the map back to the preview when replay ends.
 *
 * Purpose: Replay over a finished match shows the results screen only on its last step. Earlier steps look as they did during the game, and the map shows the recorded match.
 * When to use: `wireReplayResultsScreen` once at startup. It follows every change to replay through `onReplayChange`.
 * Expected outcome: `#game-over-overlay` gains `replay-aside` on every step before the last and loses it on the last step. The overlay never gains `hidden`, so every other check still treats it as open.
 * Exceptions: None.
 */

import { replayResultsScreenAside } from '../../shared/replayResultsScreenRules';
import { rendererMatchEpochCurrent } from '../core/matchEpoch';
import { rendererSharedState as S } from '../core/state';
import { setMainUIControlsEnabled } from '../core/uiState';
import { refreshNewGameMapPreview, resetNewGameMapPreviewFrame } from '../gameplay/newGameMapPreviewUi';
import { REPLAY_ASIDE_CLASS } from '../gameplay/newGamePreviewOwnership';
import { setBasemapGameMap } from '../map/basemapLayer';
import { syncMapExtentToSnapshot } from '../map/mapExtent';
import { invalidateLeafletMapSizes } from '../map/worldLeafletMap';
import { resizeAndRedraw } from '../rendering/gameScene';
import { setReplayOverFinishedMatch } from './replayMatchOver';
import { currentReplay, onReplayChange } from './replayState';

/**
 * The replay session this module last saw.
 *
 * Purpose: A new session is told apart from a later step of the same one.
 * When to use: `syncReplayResultsScreen` and `endReplayOverResults`.
 * Expected outcome: Null while replay is off.
 * Exceptions: None.
 */
let trackedSession: number | null = null;

/**
 * The match epoch of the tracked session.
 *
 * Purpose: A replay that ends because Start began a new match is told apart from one the player left.
 * When to use: `endReplayOverResults`.
 * Expected outcome: The epoch recorded when the session was first seen.
 * Exceptions: None.
 */
let trackedEpoch = 0;

/**
 * Whether the tracked session opened over a finished strategic match.
 *
 * Purpose: Replay over a live match, or over a battle, never sets the screen aside.
 * When to use: `syncReplayResultsScreen` and `endReplayOverResults`.
 * Expected outcome: False while replay is off.
 * Exceptions: None.
 */
let matchOverInReplay = false;

/**
 * Whether the overlay now has `replay-aside`.
 *
 * Purpose: The class, the controls, and the redraw change only when the answer changes.
 * When to use: `setScreenAside` and `endReplayOverResults`.
 * Expected outcome: Matches the overlay's class list.
 * Exceptions: None.
 */
let screenAside = false;

/**
 * Switches the map from the next-game preview to the recorded match.
 *
 * Purpose: The preview had applied its own hillshade, extent, and camera while the results screen was open.
 * When to use: When replay opens over a finished match.
 * Expected outcome: The hillshade is the match's map, the match's extent is fitted, and the map is redrawn. Nothing happens without a live snapshot.
 * Exceptions: None.
 */
function showMatchMapForReplay(): void {
  const state = S.gameState;
  if (!state) return;
  setBasemapGameMap(state.gameMap?.id ?? 'global');
  syncMapExtentToSnapshot(state, { refit: true });
  invalidateLeafletMapSizes();
  resizeAndRedraw();
}

/**
 * Shows or sets aside the results screen.
 *
 * Purpose: Earlier steps show the match chrome, so the console, the top bar, and the map take the pointer again while the screen is aside.
 * When to use: After every replay change over a finished match.
 * Expected outcome: `replay-aside` is on the overlay exactly when `aside` is true. The main controls are enabled while aside and disabled otherwise, the map is resized for the console's width, and the frame is redrawn. Nothing changes when the answer is the same.
 * Exceptions: None.
 */
function setScreenAside(aside: boolean): void {
  if (aside === screenAside) return;
  screenAside = aside;
  document.getElementById('game-over-overlay')?.classList.toggle(REPLAY_ASIDE_CLASS, aside);
  setMainUIControlsEnabled(aside);
  invalidateLeafletMapSizes();
  resizeAndRedraw();
  console.debug('replay results screen aside', { aside });
}

/**
 * Puts the game-over view back when replay ends.
 *
 * Purpose: Leaving replay shows the results screen and the next-game preview again. A replay dropped by a new match leaves the rest to the start path.
 * When to use: When the tracked replay session ends.
 * Expected outcome: The tracking is cleared and the flag for the save and load rules is off. When the match is the same one, the screen is shown, the preview frame is forgotten, and the preview is refreshed. When a new match began, only the class is removed, because the start path owns the controls and the preview camera.
 * Exceptions: None.
 */
function endReplayOverResults(): void {
  const wasOver = matchOverInReplay;
  const sameMatch = rendererMatchEpochCurrent(trackedEpoch);
  trackedSession = null;
  matchOverInReplay = false;
  setReplayOverFinishedMatch(false);
  if (!sameMatch) {
    document.getElementById('game-over-overlay')?.classList.remove(REPLAY_ASIDE_CLASS);
    screenAside = false;
    console.debug('replay results screen dropped for a new match');
    return;
  }
  setScreenAside(false);
  if (!wasOver) return;
  resetNewGameMapPreviewFrame();
  void refreshNewGameMapPreview();
  resizeAndRedraw();
}

/**
 * Follows the replay state.
 *
 * Purpose: The single reaction to a change in replay, so the results screen follows the step shown.
 * When to use: Subscribed with `onReplayChange` by `wireReplayResultsScreen`.
 * Expected outcome: A new session over a finished strategic match switches the map to the match. The results screen is then set aside or shown by the step. A session over a live match or a battle changes nothing. Replay ending runs `endReplayOverResults`.
 * Exceptions: None.
 */
function syncReplayResultsScreen(): void {
  const state = currentReplay();
  if (!state) {
    if (trackedSession !== null) endReplayOverResults();
    return;
  }
  if (state.session !== trackedSession) {
    trackedSession = state.session;
    trackedEpoch = state.matchEpoch;
    matchOverInReplay = state.timeline.scope === 'strategic' && S.gameState?.gameOver === true;
    setReplayOverFinishedMatch(matchOverInReplay);
    console.debug('replay results screen session', { session: state.session, matchOverInReplay });
    if (matchOverInReplay) showMatchMapForReplay();
  }
  if (!matchOverInReplay) return;
  setScreenAside(replayResultsScreenAside({ matchOver: true, stepCount: state.timeline.steps.length, index: state.index }));
}

/**
 * Subscribes the results screen to replay.
 *
 * Purpose: The module's single setup point.
 * When to use: Once during renderer startup, from `wireReplayPanel`.
 * Expected outcome: The results screen follows every change to replay.
 * Exceptions: None.
 */
export function wireReplayResultsScreen(): void {
  onReplayChange(syncReplayResultsScreen);
}
