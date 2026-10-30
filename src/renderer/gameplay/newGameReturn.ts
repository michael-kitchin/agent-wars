/**
 * Going back to the match from the new-game screen.
 *
 * Purpose: Opening the new-game screen from the game menu leaves the match running under it. The player can close the
 *   screen and carry on, or start a new match, which replaces it. This module records whether a match is waiting and
 *   performs the close.
 * When to use: `holdMatchUnderNewGame` as the screen opens over a live match, `forgetMatchUnderNewGame` when that match
 *   is replaced or ends, and `closeNewGameOverlayToMatch` from the close control.
 * Expected outcome: The close control `#new-game-dialog-close` shows only while a match is waiting.
 * Exceptions: None; missing elements are skipped.
 */
import { dismissStaleControlTooltip } from '../chrome/controlTooltip';
import { rendererSharedState as S } from '../core/state';
import { forgetMainMapCameraForReturn, returnMainMapCamera, saveMainMapCameraForReturn } from '../map/mainMapCameraReturn';
import { invalidateLeafletMapSizes } from '../map/worldLeafletMap';
import { newGameOverlayIsOpen } from './newGameDialogCollapse';
import { closeNewGameOptionsPopover } from './newGameOptionsPopover';

/**
 * Whether a live match is waiting under the new-game screen.
 *
 * Purpose: Decides whether close shows, whether a refresh may close the screen, and whether Start must stop a match.
 * When to use: Only through the functions below.
 * Expected outcome: False at startup, at game over, and after close or Start.
 * Exceptions: None.
 */
let matchWaiting = false;

/**
 * Shows the close control only while a match is waiting.
 *
 * Purpose: At startup and at game over there is no match to go back to.
 * When to use: After `matchWaiting` changes.
 * Expected outcome: `hidden` on `#new-game-dialog-close` is the opposite of `matchWaiting`.
 * Exceptions: None.
 */
function syncCloseControl(): void {
  const close = document.getElementById('new-game-dialog-close');
  if (close instanceof HTMLButtonElement) close.hidden = !matchWaiting;
}

/**
 * Reports whether a live match is waiting under the new-game screen.
 *
 * Purpose: The refresh, push, and Start paths treat a waiting match differently from no match.
 * When to use: From `updateGameOverUI`, the consultation push listeners, and the Start handler.
 * Expected outcome: True between `holdMatchUnderNewGame` and the next close, Start, or match end.
 * Exceptions: None.
 */
export function isMatchWaitingUnderNewGame(): boolean {
  return matchWaiting;
}

/**
 * Marks the live match as waiting under the new-game screen and saves its camera.
 *
 * Purpose: The match keeps running, and close can return to it.
 * When to use: As the screen opens from the game menu over a match that is loaded and not over, before the preview
 *   loads.
 * Expected outcome: A match is waiting, its camera is saved, and the close control shows.
 * Exceptions: None.
 */
export function holdMatchUnderNewGame(): void {
  matchWaiting = true;
  saveMainMapCameraForReturn();
  syncCloseControl();
}

/**
 * Forgets the match that was waiting under the new-game screen.
 *
 * Purpose: Start replaces that match, and a match that ends there has nothing to go back to.
 * When to use: From the Start handler before it stops the match, and from `updateGameOverUI` when the match ends.
 * Expected outcome: No match is waiting, the saved camera is dropped, and the close control hides.
 * Exceptions: None.
 */
export function forgetMatchUnderNewGame(): void {
  matchWaiting = false;
  forgetMainMapCameraForReturn();
  syncCloseControl();
}

/**
 * What closing the new-game screen needs from the renderer's entry module.
 *
 * Purpose: Keeps this module free of the entry module's imports.
 * When to use: Pass the same callbacks `registerNewGameButton` receives.
 * Expected outcome: Each callback does what the entry module does for any other state change.
 * Exceptions: None.
 */
export interface NewGameCloseDeps {
  /**
   * Turns pointer input for the map, the top bar, and the console on or off.
   *
   * Contract: `true` lets the match take clicks; `false` keeps them for the new-game screen.
   * When to use: Pass the same callback `registerNewGameButton` receives.
   * Expected outcome: The match controls are enabled again after close.
   * Exceptions: None.
   */
  setMainUIControlsEnabled(enabled: boolean): void;
  /**
   * Recomputes Ready's label and whether it can be clicked.
   *
   * Contract: Same function the rest of the renderer uses after a state change.
   * When to use: Pass the same callback `registerNewGameButton` receives.
   * Expected outcome: Ready matches the match that is back on screen.
   * Exceptions: None.
   */
  updateReadyButtonState(): void;
  /**
   * Starts a background opponent plan when Run is on and nothing blocks it.
   *
   * Contract: Same function the rest of the renderer uses after a state change.
   * When to use: Pass the same callback `registerNewGameButton` receives.
   * Expected outcome: Planning resumes only when the screen is closed and Run is on.
   * Exceptions: None.
   */
  startBackgroundRequestIfAllowed(): void;
  /**
   * Resizes the canvas to the map and redraws the frame.
   *
   * Contract: Same function the rest of the renderer uses after a layout change.
   * When to use: Pass the same callback `registerNewGameButton` receives.
   * Expected outcome: The frame matches the map after the screen closes.
   * Exceptions: None.
   */
  resizeAndRedraw(): void;
}

/**
 * Closes the new-game screen and goes back to the match waiting under it.
 *
 * Purpose: The close control's single action.
 * When to use: On a click on `#new-game-dialog-close`.
 * Expected outcome: Nothing unless a match is waiting and the screen is open. Otherwise the screen hides, its tip goes,
 *   the match controls take the pointer again, the map takes its new size and goes back to the saved camera, Ready is
 *   recomputed, background planning resumes when Run is on, and the frame redraws. The match's state, orders, and
 *   selection are as the player left them.
 * Exceptions: None.
 */
export function closeNewGameOverlayToMatch(deps: NewGameCloseDeps): void {
  if (!matchWaiting || !newGameOverlayIsOpen()) return;
  matchWaiting = false;
  closeNewGameOptionsPopover();
  syncCloseControl();
  document.getElementById('game-over-overlay')?.classList.add('hidden');
  dismissStaleControlTooltip();
  deps.setMainUIControlsEnabled(true);
  invalidateLeafletMapSizes();
  returnMainMapCamera();
  deps.updateReadyButtonState();
  if (S.runButtonOn) deps.startBackgroundRequestIfAllowed();
  deps.resizeAndRedraw();
}
