/**
 * Whether the live match is over while replay shows a recorded step.
 *
 * Purpose: During replay the screen holds a recorded snapshot, so rules about the live match read this flag for whether that match is over.
 * When to use: `replayResultsScreen.ts` sets it when replay opens and clears it when replay ends. `readSaveLoadUiState` reads it.
 * Expected outcome: True only while replay is on over a finished strategic match.
 * Exceptions: None.
 */

/**
 * Whether replay is on over a finished match.
 *
 * Purpose: One value for the save and load rules to read.
 * When to use: Through `setReplayOverFinishedMatch` and `replayIsOverFinishedMatch` only.
 * Expected outcome: False until replay opens over a finished match.
 * Exceptions: None.
 */
let overFinishedMatch = false;

/**
 * Records whether replay is on over a finished match.
 *
 * Purpose: Replay opens and ends in one module, which keeps this flag in step.
 * When to use: When replay opens over a match, and when replay ends.
 * Expected outcome: `replayIsOverFinishedMatch` returns `over`.
 * Exceptions: None.
 */
export function setReplayOverFinishedMatch(over: boolean): void {
  overFinishedMatch = over;
}

/**
 * Says whether replay is on over a finished match.
 *
 * Purpose: Save game stays enabled and Load game asks no confirmation on every replay step of a finished match.
 * When to use: Building the save and load screen state.
 * Expected outcome: True while replay shows any step of a finished strategic match.
 * Exceptions: None.
 */
export function replayIsOverFinishedMatch(): boolean {
  return overFinishedMatch;
}
