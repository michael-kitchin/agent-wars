/**
 * A counter that moves only when a new match replaces the one a turn was resolving.
 *
 * Purpose: An in-flight Ready must not call `ready()` after New has already started another match.
 * Run off and a model change do not move it, so that turn still resolves.
 * When to use: `stopModelWork` when the reason is `new_game` or `load_game`, and `handleGameReady` around `deps.ready()`.
 * Expected outcome: `getMatchGeneration` changes only through `advanceMatchGeneration`.
 * Exceptions: None.
 */

import { logDebug, logTrace } from './logger';

let matchGeneration = 0;

/**
 * The current match generation.
 *
 * Purpose: Ready captures this on entry and compares it immediately before resolving the turn.
 * When to use: Any main-process check that must ignore work from a match New already replaced.
 * Expected outcome: A count that starts at 0.
 * Exceptions: None.
 */
export function getMatchGeneration(): number {
  logTrace('matchGeneration getMatchGeneration', { matchGeneration });
  return matchGeneration;
}

/**
 * Moves the match generation forward.
 *
 * Purpose: Opening New, starting the new match, and loading a save each call this once, through `stopModelWork`.
 * When to use: Only from `stopModelWork` when the reason is `new_game` or `load_game`.
 * Expected outcome: The generation increases by one. Two increases are fine; Ready only checks inequality.
 * Exceptions: None.
 */
export function advanceMatchGeneration(reason: string): void {
  matchGeneration += 1;
  logDebug('matchGeneration advanceMatchGeneration', { reason, matchGeneration });
}
