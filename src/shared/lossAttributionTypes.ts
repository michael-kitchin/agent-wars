/**
 * Who was responsible for a destroyed unit, stored beside the unit in a commander's loss notes.
 */

import type { BuildUnitType } from './ipc/productionTypes';

/**
 * One unit that fought and destroyed a victim.
 *
 * Purpose: Loss notes name the types that did the killing, so a commander can weigh how much force a side used.
 * When to use: Inside `LossAttribution.killerUnits`.
 * Expected outcome: A snapshot id and the build type that id had during the fight.
 * Exceptions: None.
 */
export interface LossKillerUnit {
  /**
   * Snapshot id of the killer.
   *
   * Contract: The same id the rest of the prompt uses for that unit. A non-empty string.
   * When to use: De-duplicating killers across the victims of one loss group.
   * Expected outcome: Unique inside one `killerUnits` list.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * Build type of the killer during the fight.
   *
   * Contract: One of the build unit types.
   * When to use: Counting killers by type in the closing `(by ...)` text.
   * Expected outcome: Naval, air, armor, infantry, or missile.
   * Exceptions: None.
   */
  readonly unitType: BuildUnitType;
}

/**
 * Who lost a unit, where, and who was responsible.
 *
 * Purpose: Gives a commander's loss notes the evidence its trust judgments need.
 * When to use: Set on a `LostUnit` by the main process when it writes a loss note. Popups never read it.
 * Expected outcome: Present on rows written after attribution existed. Absent on older rows.
 * Exceptions: None.
 */
export interface LossAttribution {
  /**
   * Owner of the victim at the time of the loss.
   *
   * Contract: A non-empty owner id: a seat id or the Neutral owner id.
   * When to use: Grouping other sides' losses by who lost them.
   * Expected outcome: The owner at fight time, not an id prefix.
   * Exceptions: None.
   */
  readonly ownerId: string;
  /**
   * Hex where the unit was lost.
   *
   * Contract: An H3 index, or null when the game did not record one.
   * When to use: Printing the hex code on a loss line.
   * Expected outcome: Null prints no hex.
   * Exceptions: None.
   */
  readonly lossH3Index: string | null;
  /**
   * Owners responsible for the loss.
   *
   * Contract: A non-empty list names the sides. An empty list means the data shows no other side caused the loss. Null means the game could not tell.
   * When to use: Printing the `by ...` text of a loss line.
   * Expected outcome: Never contains `ownerId`.
   * Exceptions: None.
   */
  readonly responsibleOwnerIds: readonly string[] | null;
  /**
   * Units that fought and destroyed the victim.
   *
   * Contract: Distinct ids. Empty when none are known.
   * When to use: The closing type counts of a loss line.
   * Expected outcome: Only units whose owner differs from `ownerId`.
   * Exceptions: None.
   */
  readonly killerUnits: readonly LossKillerUnit[];
}
