/**
 * When Save game and Load game can be used, and the sentence each one shows.
 *
 * Purpose: The menu, the new-game bar, and a failed save share one decision and, for an empty or finished match, the same sentence.
 * When to use: Enabling the three buttons, and from the main process when a save is refused before a file is written.
 * Expected outcome: The first matching row wins. Load asks for confirmation only while a match is still being played.
 * Exceptions: None.
 */

/**
 * The screen facts the availability rules read.
 *
 * Purpose: The rules stay free of the renderer state object.
 * When to use: `saveGameItemState`, `loadGameItemState`, and `loadNeedsConfirm`.
 * Expected outcome: Whether a match is loaded, whether it is over, whether Ready is in flight, and whether the new-game screen is open.
 * Exceptions: None.
 */
export interface SaveLoadUiState {
  /**
   * Whether the snapshot has at least one hex.
   *
   * Contract: False on a fresh launch before a match exists.
   * When to use: The save and load rules.
   * Expected outcome: A match that can be saved when the other flags allow it.
   * Exceptions: None.
   */
  readonly matchLoaded: boolean;
  /**
   * Whether the match has ended.
   *
   * Contract: The snapshot's `gameOver` flag.
   * When to use: The save rule and the load-confirm rule.
   * Expected outcome: A finished match is not saved and does not ask before a load.
   * Exceptions: None.
   */
  readonly gameOver: boolean;
  /**
   * Whether Ready or a battle beat is still resolving.
   *
   * Contract: The renderer's in-flight Ready flag.
   * When to use: Both buttons.
   * Expected outcome: Both stay disabled while this is true.
   * Exceptions: None.
   */
  readonly readyInFlight: boolean;
  /**
   * Whether the new-game screen is open, including while it is compact.
   *
   * Contract: True for a fresh launch, a finished match, and a screen opened over a live match.
   * When to use: The save rule, after game over and an empty launch have been checked.
   * Expected outcome: Save stays disabled over a live match.
   * Exceptions: None.
   */
  readonly newGameScreenOpen: boolean;
}

/**
 * Whether one button takes a click, and the tip beside it.
 *
 * Purpose: The button and its tip host are updated together.
 * When to use: The return values of the item-state functions.
 * Expected outcome: `disabled` and one sentence.
 * Exceptions: None.
 */
export interface SaveLoadItemState {
  /**
   * Whether the button ignores a click.
   *
   * Contract: True when the matching rule refuses the action.
   * When to use: The button's `disabled` property.
   * Expected outcome: A disabled button does not start a save or load.
   * Exceptions: None.
   */
  readonly disabled: boolean;
  /**
   * The sentence shown beside the button.
   *
   * Contract: One player-facing sentence.
   * When to use: The tip host's `data-control-tooltip`.
   * Expected outcome: The reason the button is disabled, or what the enabled button does.
   * Exceptions: None.
   */
  readonly tooltip: string;
}

/** Shown when there is no match to save. */
export const SAVE_NOTHING_TO_SAVE_MESSAGE = 'There is no match to save.';

/** Shown when the match has already ended. */
export const SAVE_GAME_OVER_MESSAGE = 'The match is over, so there is nothing to save.';

/** Shown when Save game is blocked by the new-game screen. */
export const SAVE_CLOSE_NEW_GAME_SCREEN_MESSAGE = 'Close the new-game screen to save the match under it.';

/** Shown when Save game waits for the current turn or beat. */
export const SAVE_RESOLVING_MESSAGE = 'Save game is available again once this turn or beat finishes resolving.';

/** Shown when Save game can write a file. */
export const SAVE_MATCH_TOOLTIP = 'Save this match to a file.';

/** Shown when Load game waits for the current turn or beat. */
export const LOAD_RESOLVING_MESSAGE = 'Load game is available again once this turn or beat finishes resolving.';

/** Shown when Load game would replace a match still being played. */
export const LOAD_REPLACES_MATCH_TOOLTIP = 'Open a saved game from a file. The match in progress is replaced.';

/** Shown when Load game opens a file and nothing is in progress. */
export const LOAD_FILE_TOOLTIP = 'Open a saved game from a file.';

/**
 * The Save game button's enabled state and tip.
 *
 * Purpose: Game over and an empty launch win over the new-game screen, which is open in both of those cases.
 * When to use: Whenever the game menu or the match controls are refreshed.
 * Expected outcome: The first matching rule: game over, no match, the new-game screen over a live match, Ready in flight, otherwise enabled.
 * Exceptions: None.
 */
export function saveGameItemState(state: SaveLoadUiState): SaveLoadItemState {
  if (state.gameOver) return { disabled: true, tooltip: SAVE_GAME_OVER_MESSAGE };
  if (!state.matchLoaded) return { disabled: true, tooltip: SAVE_NOTHING_TO_SAVE_MESSAGE };
  if (state.newGameScreenOpen) return { disabled: true, tooltip: SAVE_CLOSE_NEW_GAME_SCREEN_MESSAGE };
  if (state.readyInFlight) return { disabled: true, tooltip: SAVE_RESOLVING_MESSAGE };
  return { disabled: false, tooltip: SAVE_MATCH_TOOLTIP };
}

/**
 * The Load game button's enabled state and tip.
 *
 * Purpose: Load stays available on the new-game screen. It waits only while a turn or beat is resolving.
 * When to use: Whenever the game menu or the match controls are refreshed.
 * Expected outcome: Disabled only while Ready is in flight. The tip names the match in progress when one is still being played.
 * Exceptions: None.
 */
export function loadGameItemState(state: SaveLoadUiState): SaveLoadItemState {
  if (state.readyInFlight) return { disabled: true, tooltip: LOAD_RESOLVING_MESSAGE };
  if (state.matchLoaded && !state.gameOver) return { disabled: false, tooltip: LOAD_REPLACES_MATCH_TOOLTIP };
  return { disabled: false, tooltip: LOAD_FILE_TOOLTIP };
}

/**
 * Whether loading should ask before it replaces the match.
 *
 * Purpose: A live match, including one sitting under the new-game screen, is not replaced silently.
 * When to use: Before `game:loadGame`.
 * Expected outcome: True when a match is loaded and is not over.
 * Exceptions: None.
 */
export function loadNeedsConfirm(state: SaveLoadUiState): boolean {
  return state.matchLoaded && !state.gameOver;
}
