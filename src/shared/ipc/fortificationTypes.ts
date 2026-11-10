/**
 * Strategic-map fortification losses for one turn.
 *
 * Purpose: The turn report names the hex and who owned it. `remaining` is the count left after fighting on a strategic hex; the loss sentence does not print it.
 * When to use: `ReadyResult.fortificationReports`, omitted when the list is empty. A beat report reuses this type for tactical cells.
 * Expected outcome: One row per strategic hex, or one row per battle cell, that lost at least one fortification.
 * Exceptions: None.
 */

/**
 * One hex's fortification losses on the strategic map.
 *
 * Purpose: The toast files the sentence under `ownerId`.
 * When to use: After fighting and before this turn's control resolution, or after a battle beat's air and ranged fire.
 * Expected outcome: `ownerId` is the controller at that moment. On a strategic report, `remaining` is what is left before production. On a beat report, `remaining` is 0 and the sentence does not read it.
 * Exceptions: None.
 */
export interface FortificationReport {
  /**
   * The hex that lost the fortifications.
   *
   * Contract: A resolution-1 index on a strategic report. A tactical cell index on a beat report.
   * When to use: Code lookup and visibility.
   * Expected outcome: The strategic hex, or the battle cell, that lost the fortifications.
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
   * How many hits this row contributes to the sentence.
   *
   * Contract: A positive integer from every producer. The sentence skips a row at or below 0.
   * When to use: The hit count in the sentence.
   * Expected outcome: On a strategic report, fortifications removed from that hex. On a beat report, hits that cell absorbed.
   * Exceptions: None.
   */
  readonly lost: number;
  /**
   * Fortifications left after fighting and before production.
   *
   * Contract: Zero or more. A beat report sets this to 0, and the sentence does not read it.
   * When to use: The report records the count. The loss sentence does not print it.
   * Expected outcome: On a strategic report, the fortified count still on the hex before production. Zero means none are left on that hex. On a beat report, zero does not mean the strategic hex has no fortifications left.
   * Exceptions: None.
   */
  readonly remaining: number;
}
