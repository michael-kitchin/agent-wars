/**
 * Stable res1 H3 fixtures for melee-intercept candidate contract tests.
 *
 * Purpose: Avoid repeating magic strings across `meleeInterceptCandidates` tests while keeping coordinates stable.
 * When to use: Import `hexA` / `hexB` from unit tests that assert melee candidate grouping.
 * Expected outcome: Valid H3 indexes at the project’s configured strategic resolution.
 * Exceptions: None.
 */

/** Primary fixture hex used in melee intercept candidate tests. */
export const hexA = '8a1f1d48b9fffff';

/** Secondary fixture hex adjacent to the primary test scenario. */
export const hexB = '8a1f1d48b8fffff';
