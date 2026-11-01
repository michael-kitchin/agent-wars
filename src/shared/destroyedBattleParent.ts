import type { TechLevel } from './techBonusTypes';
import type { UnitOrigin } from './unitOriginTypes';
import type { WeatherState } from './weatherBonusTypes';

/**
 * A strategic unit a tactical battle removed.
 *
 * Purpose: The strategic update popup names these units without asking which combat die destroyed them.
 * When to use: The list returned when a battle ends, and the line built from that list.
 * Expected outcome: One row per deleted parent, plus a land unit removed because its carrier sank.
 * Exceptions: None.
 */
export interface DestroyedBattleParent {
  /**
   * Strategic unit id.
   *
   * Contract: The `units.id` that was deleted. A second delete of the same id is not recorded.
   * When to use: De-duplicating the battle list.
   * Expected outcome: A non-empty id.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * Side that owned the unit.
   *
   * Contract: The `player` column. A seat id or the neutral owner.
   * When to use: Choosing which loss section receives the line.
   * Expected outcome: The owner at the moment of deletion.
   * Exceptions: None.
   */
  readonly ownerId: string;
  /**
   * Strategic unit type.
   *
   * Contract: The same vocabulary as a live unit, such as `infantry` or `armor`.
   * When to use: Grouping more than three of one type on the battle line.
   * Expected outcome: A known unit type.
   * Exceptions: None.
   */
  readonly unitType: string;
  /**
   * Base display name, with no side prefix.
   *
   * Contract: The same label other loss lines use, such as `III Infantry`.
   * When to use: The battle line, in the unit's original order until a type is collapsed.
   * Expected outcome: A non-empty name. Roman numerals match the roster from before the delete.
   * Exceptions: None.
   */
  readonly displayName: string;
  /**
   * Strategic hex the unit occupied.
   *
   * Contract: The `h3_index` captured before the row was deleted.
   * When to use: Fog. A seat viewer lists an enemy unit only when this hex was visible.
   * Expected outcome: A strategic H3 index.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Birth record for the origin flag.
   *
   * Contract: Omitted when the unit had no birth hex.
   * When to use: The flag painter, after the cause-bucket lookup.
   * Expected outcome: The same origin a live flag would show.
   * Exceptions: None.
   */
  readonly origin?: UnitOrigin;
  /**
   * Strategic turn on which the unit was formed.
   *
   * Contract: Omitted when the row had no formation turn.
   * When to use: The flag tooltip.
   * Expected outcome: A positive integer, or absent.
   * Exceptions: None.
   */
  readonly formedTurn?: number;
  /**
   * Acclimation tags of the birth hex.
   *
   * Contract: Present only when the weather bonus is on and the unit has an origin.
   * When to use: The flag tooltip.
   * Expected outcome: Zero to two of snow, rain, and heat.
   * Exceptions: None.
   */
  readonly weatherTags?: readonly WeatherState[];
  /**
   * Tech tier of the birth hex.
   *
   * Contract: Present only when the tech bonus is on and the unit has an origin.
   * When to use: The flag tooltip.
   * Expected outcome: `advanced` or `basic`.
   * Exceptions: None.
   */
  readonly techLevel?: TechLevel;
}
