/**
 * Tech bonus values shared by dice, tools, and tooltips.
 *
 * Purpose: Names the two unit tiers and the points an Advanced unit can add.
 * When to use: Anywhere a birth hex is classified or a hit roll reads a tech bonus.
 * Expected outcome: Basic adds nothing. Advanced adds attack, and defense only at High.
 * Exceptions: None.
 */

/**
 * How advanced a unit's birth hex was when the unit was created.
 *
 * Purpose: The tier is fixed from the generated urban count of that hex.
 * When to use: Stamped on snapshots for tooltips and tools. Dice recompute it from the birth hex.
 * Expected outcome: `advanced` at 21 or more urban cells; otherwise `basic`.
 * Exceptions: None.
 */
export type TechLevel = 'basic' | 'advanced';

/**
 * Points a tech tier adds to one roll.
 *
 * Purpose: Attack and defense are separate, because Low adds attack only.
 * When to use: Estimates and hit thresholds.
 * Expected outcome: Both zero for Basic or when the option is off.
 * Exceptions: None.
 */
export interface TechHitBonus {
  /**
   * Points added to the attack threshold after the floor.
   *
   * Contract: 0 or 2.
   * When to use: `attackHitThreshold`.
   * Expected outcome: 2 for an Advanced unit when tech is Low or High.
   * Exceptions: None.
   */
  readonly attack: number;
  /**
   * Points added to the defense threshold.
   *
   * Contract: 0 or 2. Present even when 0 so a Low bonus is not read as applying to defense.
   * When to use: `defenseHitThreshold`. Casualty order ignores it.
   * Expected outcome: 2 only for an Advanced unit when tech is High.
   * Exceptions: None.
   */
  readonly defense: number;
}
