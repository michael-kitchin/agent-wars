/**
 * Pure rules for the results screen and the map during replay over a finished match.
 *
 * Purpose: Replay over a finished match shows the results screen only on its last step, and the map shows the recorded match instead of the next-game preview.
 * When to use: The renderer's map painting and the replay results-screen module read these rules.
 * Expected outcome: Plain answers. Nothing here reads the page.
 * Exceptions: None.
 */

/**
 * What decides whether the next-game preview draws the map.
 *
 * Purpose: One object keeps the call readable.
 * When to use: `newGamePreviewOwnsMap`.
 * Expected outcome: Two flags read from the screen.
 * Exceptions: None.
 */
export interface NewGamePreviewOwnerInput {
  /**
   * Whether the new-game overlay is open.
   *
   * Contract: True from the moment the match ends until Start or close.
   * When to use: The first condition.
   * Expected outcome: False means the match owns the map.
   * Exceptions: None.
   */
  readonly overlayOpen: boolean;
  /**
   * Whether replay is on.
   *
   * Contract: True from the moment replay opens until it has been left.
   * When to use: The second condition.
   * Expected outcome: True means the recorded match owns the map.
   * Exceptions: None.
   */
  readonly replayOn: boolean;
}

/**
 * Says whether the next-game preview draws the map.
 *
 * Purpose: The new-game preview replaces the match on the map only outside replay. Replay over a finished match shows the recorded match.
 * When to use: Painting the map, choosing the hillshade, and accepting a preview reply.
 * Expected outcome: True when the overlay is open and replay is off.
 * Exceptions: None.
 */
export function newGamePreviewOwnsMap(input: NewGamePreviewOwnerInput): boolean {
  return input.overlayOpen && !input.replayOn;
}

/**
 * What decides whether the results screen is set aside.
 *
 * Purpose: One object keeps the call readable.
 * When to use: `replayResultsScreenAside`.
 * Expected outcome: Three values read from the replay state.
 * Exceptions: None.
 */
export interface ReplayResultsScreenInput {
  /**
   * Whether the match under replay is over.
   *
   * Contract: True when the live match has ended.
   * When to use: The first condition.
   * Expected outcome: False never sets the screen aside.
   * Exceptions: None.
   */
  readonly matchOver: boolean;
  /**
   * How many steps the timeline holds.
   *
   * Contract: Zero or more.
   * When to use: Finding the last step.
   * Expected outcome: Zero never sets the screen aside.
   * Exceptions: None.
   */
  readonly stepCount: number;
  /**
   * The step now shown.
   *
   * Contract: An index into the timeline.
   * When to use: Comparing against the last step.
   * Expected outcome: The last index shows the screen.
   * Exceptions: None.
   */
  readonly index: number;
}

/**
 * Says whether the results screen is set aside on this step.
 *
 * Purpose: Replay over a finished match shows the results screen only on the last step, where the match ended.
 * When to use: Every change to the replay state.
 * Expected outcome: True for every step before the last of a finished match. False on the last step, for a match still being played, and for an empty timeline.
 * Exceptions: None.
 */
export function replayResultsScreenAside(input: ReplayResultsScreenInput): boolean {
  return input.matchOver && input.stepCount > 0 && input.index < input.stepCount - 1;
}
