/**
 * Reads the screen to say whether the next-game preview draws the map, and whether the new-game overlay is on screen.
 *
 * Purpose: The map painter, the hillshade choice, the preview loader, the names and borders, and the T layers ask one question, so replay over a finished match can show the recorded match under the results screen. The map's hover handlers ask the second, so an earlier replay step, with the screen set aside, behaves like replay over a live match.
 * When to use: `newGamePreviewOwnsMapNow` for what the map draws. `newGameOverlayOnScreen` for map hover.
 * Expected outcome: The pure rule `newGamePreviewOwnsMap` applied to the overlay and to replay, and the overlay's on-screen state.
 * Exceptions: None.
 */

import { newGamePreviewOwnsMap } from '../../shared/replayResultsScreenRules';
import { replayActive } from '../replay/replayState';

/**
 * The class that hides the overlay's box during replay while keeping it open for the rest of the renderer.
 *
 * Purpose: `replayResultsScreen.ts` sets it, `newGameOverlayOnScreen` reads it, and `static/replayChrome.css` hides the box with it.
 * When to use: Those three places only.
 * Expected outcome: On `#game-over-overlay` only on a replay step before the last of a finished match.
 * Exceptions: None.
 */
export const REPLAY_ASIDE_CLASS = 'replay-aside';

/**
 * Says whether the next-game preview draws the map right now.
 *
 * Purpose: Reads the overlay directly. `gameScene.ts` and `mapExtent.ts` import this module, and importing the new-game dialog modules from here would close an import cycle through them.
 * When to use: Wherever the map or its hillshade must follow the preview only outside replay.
 * Expected outcome: True when `#game-over-overlay` is present and not `hidden`, and replay is off. Outside replay this equals "the overlay is open".
 * Exceptions: None.
 */
export function newGamePreviewOwnsMapNow(): boolean {
  const overlay = document.getElementById('game-over-overlay');
  const overlayOpen = overlay != null && !overlay.classList.contains('hidden');
  return newGamePreviewOwnsMap({ overlayOpen, replayOn: replayActive() });
}

/**
 * Says whether the new-game overlay is open and on screen.
 *
 * Purpose: The overlay stays open while replay sets it aside, so `newGameOverlayIsOpen` stays true then. Map hover must follow what the player sees instead.
 * When to use: Map hover tooltips and the unit cursor, which stop while the screen covers the map.
 * Expected outcome: True when `#game-over-overlay` is present, not `hidden`, and not set aside by replay.
 * Exceptions: None.
 */
export function newGameOverlayOnScreen(): boolean {
  const overlay = document.getElementById('game-over-overlay');
  return overlay != null && !overlay.classList.contains('hidden') && !overlay.classList.contains(REPLAY_ASIDE_CLASS);
}
