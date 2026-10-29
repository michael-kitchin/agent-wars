/**
 * Strategic-map fortification losses for one turn.
 *
 * Purpose: The turn report names the hex, who owned it, and how many fortifications remain.
 * When to use: `ReadyResult.fortificationReports`, omitted when the list is empty.
 * Expected outcome: One row per hex that lost at least one fortification.
 * Exceptions: None.
 */

/**
 * One hex's fortification losses on the strategic map.
 *
 * Purpose: The toast files the sentence under `ownerId`.
 * When to use: After fighting and before this turn's control resolution.
 * Expected outcome: `ownerId` is the controller at that moment. `remaining` is what is left before production.
 * Exceptions: None.
 */
export interface FortificationReport {
  /**
   * The strategic hex.
   *
   * Contract: A resolution-1 index.
   * When to use: Place lookup and visibility.
   * Expected outcome: The hex that lost the fortifications.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Who controlled the hex while the fortifications were lost.
   *
   * Contract: A seat id, `neutral`, or null when the hex had no controller.
   * When to use: Choosing the loss section. Read before this turn's control resolution.
   * Expected outcome: Null files the sentence under Updates.
   * Exceptions: None.
   */
  readonly ownerId: string | null;
  /**
   * Fortifications removed on the strategic map this turn.
   *
   * Contract: A positive integer. Every source shares the tally.
   * When to use: The hit count in the sentence.
   * Expected outcome: At least 1.
   * Exceptions: None.
   */
  readonly lost: number;
  /**
   * Fortifications left after fighting and before production.
   *
   * Contract: Zero or more.
   * When to use: The remainder in the sentence.
   * Expected outcome: Zero reads as none remaining.
   * Exceptions: None.
   */
  readonly remaining: number;
}
