/**
 * The choice to keep watching after the human seat is knocked out.
 *
 * Purpose: Watch the rest asks the match screen to advance on its own once that screen exists.
 * When to use: The knocked-out dialog, and the screen that watches a match with no active human seat.
 * Expected outcome: The flag stays set until a later match start clears it.
 * Exceptions: None.
 */

import { rendererSharedState as S } from '../core/state';
import { syncObserveChrome } from './observeChrome';

/**
 * True after the player chooses to watch the rest of a match.
 *
 * Purpose: Auto-advance starts from the dialog, before the watch screen is drawn.
 * When to use: `chooseWatchTheRest` and `clearObserveAfterKnockout`.
 * Expected outcome: False until Watch the rest is chosen.
 * Exceptions: None.
 */
let watchTheRest = false;

/**
 * Records that the player will watch the match, with auto-advance on.
 *
 * Purpose: The dialog closes and the match keeps going.
 * When to use: The Watch the rest button.
 * Expected outcome: `observeAutoAdvanceRequested` becomes true.
 * Exceptions: None.
 */
export function chooseWatchTheRest(): void {
  watchTheRest = true;
  S.autoAdvance = true;
  S.viewAs = 'all';
  syncObserveChrome();
}

/**
 * Whether Watch the rest asked the match to advance on its own.
 *
 * Purpose: The watch screen turns auto-advance on from this choice.
 * When to use: While opening that screen after a knockout.
 * Expected outcome: True after `chooseWatchTheRest`, until a new match clears it.
 * Exceptions: None.
 */
export function observeAutoAdvanceRequested(): boolean {
  return watchTheRest;
}

/**
 * Forgets a Watch the rest choice.
 *
 * Purpose: A new match does not inherit the previous match's auto-advance.
 * When to use: When a match starts.
 * Expected outcome: `observeAutoAdvanceRequested` is false.
 * Exceptions: None.
 */
export function clearObserveAfterKnockout(): void {
  watchTheRest = false;
  S.autoAdvance = false;
  S.viewAs = 'all';
}
