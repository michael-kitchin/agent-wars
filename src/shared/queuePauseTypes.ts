/**
 * Why a build queue is not spending, and one paused hex.
 *
 * Purpose: The production pass, the Ready result, the build popup, and the AI briefing share these names without importing sentence code.
 * When to use: Type positions only. The wording and sentence builders live in `queuePauseReasons.ts`.
 * Expected outcome: Plain types. This file imports nothing, so IPC types can use it without an import cycle.
 * Exceptions: None.
 */

/**
 * One reason a queue with something to build is not spending.
 *
 * Purpose: Names each pause so every surface can print the same words.
 * When to use: Results of `listQueuePauseReasons`, and the `reasons` of a `QueuePause`.
 * Expected outcome: `occupation` when the hex is outside the seat's home and holds none of its units or fortifications. `allCellsFortified` when the next item is a fortification and no city cell is left to fortify. `unitCap` when the next item is a unit type at the seat's deployment cap.
 * Exceptions: None.
 */
export type QueuePauseReason = 'occupation' | 'allCellsFortified' | 'unitCap';

/**
 * One paused hex and every reason that applies.
 *
 * Purpose: The turn report groups hexes that share the same reasons.
 * When to use: The production pass summary and the Ready result.
 * Expected outcome: `reasons` is never empty.
 * Exceptions: None.
 */
export interface QueuePause {
  /**
   * The paused hex.
   *
   * Contract: An H3 index on the strategic map.
   * When to use: Resolving the hex code for the report.
   * Expected outcome: A non-empty index.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Every reason the hex's queue is paused.
   *
   * Contract: In `QUEUE_PAUSE_REASON_ORDER` order, without duplicates.
   * When to use: Grouping and wording the report sentence.
   * Expected outcome: At least one reason.
   * Exceptions: None.
   */
  readonly reasons: readonly QueuePauseReason[];
}
