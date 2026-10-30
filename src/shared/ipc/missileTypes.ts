/**
 * Missile launch orders and the record of one resolved launch.
 *
 * Purpose: The human submit payload, AI turn orders, and Ready playback share these two shapes.
 * When to use: Anywhere a launch is stored or reported. Resolution fills the record; callers do not invent counts.
 * Expected outcome: One order names a missile and a target hex. One record says what that launch cleared.
 * Exceptions: None. This module has no logger.
 */

/**
 * One missile ordered to launch at one strategic hex.
 *
 * Purpose: Pending human launches and AI `missileLaunchOrders` use the same row.
 * When to use: Submit, Ready, and validation.
 * Expected outcome: `unitId` is a missile. `targetH3Index` is a strategic hex.
 * Exceptions: None.
 */
export interface MissileLaunchOrder {
  /**
   * Strategic id of the missile that launches.
   *
   * Contract: Must be a unit the order's owner still has when the launch is resolved.
   * When to use: The pending table and `OwnerTurnOrders`.
   * Expected outcome: A missile id such as `h1-m1`.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * Strategic hex the missile is aimed at.
   *
   * Contract: On the map, inside the missile's range, and explored by the launching side.
   * When to use: Validation and resolution.
   * Expected outcome: A strategic H3 index. The origin hex is allowed.
   * Exceptions: None.
   */
  readonly targetH3Index: string;
}

/**
 * What one accepted launch did to its target hex.
 *
 * Purpose: Playback, the turn report, and consultation all read this instead of re-rolling.
 * When to use: `ReadyResult.missileLaunches` after resolution.
 * Expected outcome: Before-counts are the flags present when this launch started. Destroyed-counts are the flags this launch cleared.
 * Exceptions: None.
 */
export interface MissileLaunchRecord {
  /**
   * Strategic id of the missile that was spent.
   *
   * Contract: The missile row is gone after a successful launch.
   * When to use: Playback and consultation.
   * Expected outcome: The order's `unitId`.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * Seat that launched.
   *
   * Contract: The owner of the missile at the moment of launch.
   * When to use: Consultation activity checks.
   * Expected outcome: A seat id.
   * Exceptions: None.
   */
  readonly player: string;
  /**
   * Hex the missile launched from.
   *
   * Contract: The missile's hex before it was deleted.
   * When to use: The flight arrow.
   * Expected outcome: A strategic H3 index.
   * Exceptions: None.
   */
  readonly fromH3Index: string;
  /**
   * Hex the missile hit.
   *
   * Contract: The order's target.
   * When to use: Damage, the flight arrow, and the strike line.
   * Expected outcome: A strategic H3 index.
   * Exceptions: None.
   */
  readonly targetH3Index: string;
  /**
   * Who controlled the target hex when the missile launched.
   *
   * Contract: Null when the hex has no controller.
   * When to use: Whether another seat observed the strike.
   * Expected outcome: A seat id or null.
   * Exceptions: None.
   */
  readonly targetControllerId: string | null;
  /**
   * Urban flags in the target hex before this launch.
   *
   * Contract: Counted from set urban flags when the launch starts.
   * When to use: The strike line and the record.
   * Expected outcome: Equal to `urbanDestroyed` when every urban flag fails its roll.
   * Exceptions: None.
   */
  readonly urbanBefore: number;
  /**
   * Urban flags this launch cleared.
   *
   * Contract: Never above `urbanBefore`.
   * When to use: The strike line.
   * Expected outcome: Zero when every urban roll is 20.
   * Exceptions: None.
   */
  readonly urbanDestroyed: number;
  /**
   * Airport flags in the target hex before this launch.
   *
   * Contract: Counted from set airport flags when the launch starts.
   * When to use: The strike line and based-air removal.
   * Expected outcome: Equal to `airportsDestroyed` when every airport flag fails its roll.
   * Exceptions: None.
   */
  readonly airportsBefore: number;
  /**
   * Airport flags this launch cleared.
   *
   * Contract: Based air is removed only when this is above zero.
   * When to use: The strike line.
   * Expected outcome: Zero when every airport roll is 20.
   * Exceptions: None.
   */
  readonly airportsDestroyed: number;
  /**
   * Seaport flags in the target hex before this launch.
   *
   * Contract: Counted from set seaport flags when the launch starts.
   * When to use: The strike line.
   * Expected outcome: Equal to `seaportsDestroyed` when every seaport flag fails its roll.
   * Exceptions: None.
   */
  readonly seaportsBefore: number;
  /**
   * Seaport flags this launch cleared.
   *
   * Contract: Never above `seaportsBefore`.
   * When to use: The strike line.
   * Expected outcome: Zero when every seaport roll is 20.
   * Exceptions: None.
   */
  readonly seaportsDestroyed: number;
  /**
   * Fortified cells in the target when the launch started.
   *
   * Contract: Those cells are not included in the urban, airport, or seaport before-counts.
   * When to use: The strike line.
   * Expected outcome: Zero when the hex had no fortifications.
   * Exceptions: None.
   */
  readonly fortificationsBefore: number;
  /**
   * Fortifications this launch removed.
   *
   * Contract: The cell keeps its city, airport, and seaport flags.
   * When to use: The strike line.
   * Expected outcome: Zero when every fortified cell rolls above getAttack('air').
   * Exceptions: None.
   */
  readonly fortificationsDestroyed: number;
  /**
   * Air units removed because an airport flag in the target was destroyed.
   *
   * Contract: Empty when no airport was destroyed. These ids are also removed units.
   * When to use: Loss reports. The spent missile is not in this list.
   * Expected outcome: Ids of based air at the target.
   * Exceptions: None.
   */
  readonly destroyedAirUnitIds: readonly string[];
}
