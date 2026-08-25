/**
 * Strategic turn versus tactical beat, shared by envelope, coaching, and game-rule builders.
 *
 * Purpose: A leaf type so envelope and callback-vocabulary modules can share the mode union without importing each other.
 * When to use: Any promptSpec gate object that branches on consultation mode.
 * Expected outcome: `'strategic'` or `'tactical'`.
 * Exceptions: None.
 */

/**
 * Coordinate mode of the consultation that will consume the prompt.
 *
 * Purpose: Tactical beats forbid standing-order actions and the memory/production tails.
 * When to use: On every envelope, coaching, and game-rule gate object.
 * Expected outcome: `'strategic'` or `'tactical'`.
 * Exceptions: None.
 */
export type PromptCoordinateMode = 'strategic' | 'tactical';
