/**
 * New-match reset hook for the in-memory attack-mix baselines.
 *
 * Purpose: The evaluator stores one baseline per commander, and a new match must drop every seat. The evaluator
 * imports the database facade, so the match reset cannot import the evaluator without a cycle.
 * When to use: The evaluator registers its clearer when it loads. Match reset calls the hook.
 * Expected outcome: Before the evaluator loads, the hook is a no-op. Afterward it clears every seat.
 * Exceptions: None.
 */

/** Clears every stored baseline. Replaced when the evaluator module loads. */
let clearAttackMixSnapshots: () => void = () => {};

/**
 * Installs the evaluator's clearer.
 *
 * Purpose: Binds the hook to the live map without a database import.
 * When to use: Once, at evaluator module load.
 * Expected outcome: Later new-match calls clear that map.
 * Exceptions: None.
 */
export function registerAttackMixReset(clear: () => void): void {
  clearAttackMixSnapshots = clear;
}

/**
 * Drops every commander's attack-mix baseline.
 *
 * Purpose: A previous match's baseline must not look like the previous turn of a new match.
 * When to use: At the start of match reset, before the new roster is written.
 * Expected outcome: The next consultation for each seat records a fresh baseline.
 * Exceptions: None.
 */
export function clearAttackMixOnNewGame(): void {
  clearAttackMixSnapshots();
}
