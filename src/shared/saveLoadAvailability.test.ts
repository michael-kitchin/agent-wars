/**
 * Save and load availability for the menu and the new-game bar.
 *
 * Purpose: Each row of the button rules has one case, including the overlay being open when there is no match and when the match is over.
 * When to use: `npm test`.
 * Expected outcome: The first matching rule wins, and a live match asks before it is replaced.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LOAD_FILE_TOOLTIP,
  LOAD_REPLACES_MATCH_TOOLTIP,
  LOAD_RESOLVING_MESSAGE,
  SAVE_CLOSE_NEW_GAME_SCREEN_MESSAGE,
  SAVE_GAME_OVER_MESSAGE,
  SAVE_MATCH_TOOLTIP,
  SAVE_NOTHING_TO_SAVE_MESSAGE,
  SAVE_RESOLVING_MESSAGE,
  loadGameItemState,
  loadNeedsConfirm,
  saveGameItemState,
  type SaveLoadUiState,
} from './saveLoadAvailability';

/**
 * A screen with a live match and every flag off.
 *
 * Purpose: Each case changes the one flag it is about.
 * When to use: The cases in this file.
 * Expected outcome: A loaded match that is not over, with Ready idle and the new-game screen closed.
 * Exceptions: None.
 */
function liveMatch(patch: Partial<SaveLoadUiState> = {}): SaveLoadUiState {
  return {
    matchLoaded: true,
    gameOver: false,
    readyInFlight: false,
    newGameScreenOpen: false,
    ...patch,
  };
}

test('save is refused for a finished match, an empty launch, the new-game screen, and Ready', () => {
  assert.deepEqual(saveGameItemState(liveMatch({ gameOver: true, newGameScreenOpen: true })), {
    disabled: true,
    tooltip: SAVE_GAME_OVER_MESSAGE,
  });
  assert.deepEqual(saveGameItemState(liveMatch({ matchLoaded: false, newGameScreenOpen: true })), {
    disabled: true,
    tooltip: SAVE_NOTHING_TO_SAVE_MESSAGE,
  });
  assert.deepEqual(saveGameItemState(liveMatch({ newGameScreenOpen: true })), {
    disabled: true,
    tooltip: SAVE_CLOSE_NEW_GAME_SCREEN_MESSAGE,
  });
  assert.deepEqual(saveGameItemState(liveMatch({ readyInFlight: true })), {
    disabled: true,
    tooltip: SAVE_RESOLVING_MESSAGE,
  });
  assert.deepEqual(saveGameItemState(liveMatch()), { disabled: false, tooltip: SAVE_MATCH_TOOLTIP });
});

test('load waits only while Ready is in flight', () => {
  assert.deepEqual(loadGameItemState(liveMatch({ readyInFlight: true })), {
    disabled: true,
    tooltip: LOAD_RESOLVING_MESSAGE,
  });
  assert.deepEqual(loadGameItemState(liveMatch()), { disabled: false, tooltip: LOAD_REPLACES_MATCH_TOOLTIP });
  assert.deepEqual(loadGameItemState(liveMatch({ matchLoaded: false })), { disabled: false, tooltip: LOAD_FILE_TOOLTIP });
});

test('load asks only while a match is still being played', () => {
  assert.equal(loadNeedsConfirm(liveMatch()), true);
  assert.equal(loadNeedsConfirm(liveMatch({ newGameScreenOpen: true })), true);
  assert.equal(loadNeedsConfirm(liveMatch({ gameOver: true })), false);
  assert.equal(loadNeedsConfirm(liveMatch({ matchLoaded: false })), false);
});
