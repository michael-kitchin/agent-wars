/**
 * One combat kill: the removed unit and the units credited with removing it.
 *
 * Purpose: One name for the kill-edge shape repeated on ready results, tactical playback, and toasts.
 * When to use: Any IPC or in-memory ledger that records `victimId` plus `killerIds`.
 * Expected outcome: Structural match for existing kill arrays.
 * Exceptions: None.
 */
export type KillEdge = { victimId: string; killerIds: string[] };
