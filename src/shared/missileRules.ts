/**
 * Rules and sentences for the missile unit type.
 *
 * Purpose: One place for the missile token, the survival face, the cost multiplier, and the sentences
 * the player and the model see. Map range stays on `missileRangeHexes` because it depends on the loaded map.
 * When to use: Any check or message that is about missiles and does not need the active map.
 * Expected outcome: Callers share one literal and one sentence instead of inlining them.
 * Exceptions: None. This module does not log; it has no process or database.
 */

/**
 * The unit-type token for a ballistic missile.
 *
 * Purpose: The same string as `UnitType` and `BuildUnitType`, spelled in one place.
 * When to use: Comparisons and records that must name the missile type.
 * Expected outcome: `'missile'`.
 * Exceptions: None.
 */
export const MISSILE_UNIT_TYPE = 'missile' as const;

/**
 * Reports whether a unit-type string is a missile.
 *
 * Purpose: Call sites that only have a string can branch without repeating the literal.
 * When to use: Combat, production, orders, and prompts, before treating a unit as a missile.
 * Expected outcome: True only for `'missile'`.
 * Exceptions: None.
 */
export function isMissileUnitType(unitType: string): boolean {
  return unitType === MISSILE_UNIT_TYPE;
}

/**
 * The only d20 face on which one infrastructure flag survives a missile.
 *
 * Purpose: A launch always hits, and each set flag is destroyed unless this face comes up.
 * When to use: Missile resolution, and nowhere else.
 * Expected outcome: `20`.
 * Exceptions: None.
 */
export const MISSILE_INFRASTRUCTURE_SURVIVAL_FACE = 20;

/**
 * How many times the map's infantry cost a missile costs.
 *
 * Purpose: Global and regional prices stay in the same ratio. The regional pipeline has the same number.
 * When to use: Manifest checks and any cost that is derived rather than stored.
 * Expected outcome: `10`.
 * Exceptions: None.
 */
export const MISSILE_COST_MULTIPLIER = 10;

/**
 * Shown when a missile is ordered to move.
 *
 * Purpose: Missiles never move, on the world map or in a battle.
 * When to use: March, path, and embark refusals that name a missile.
 * Expected outcome: The sentence as written.
 * Exceptions: None.
 */
export const MISSILE_CANNOT_MOVE_REASON = 'Missiles cannot move.';

/**
 * Shown when a missile is asked to fire or launch during a battle.
 *
 * Purpose: A missile's only action is a strategic launch, and a battle is not that.
 * When to use: Tactical validation and the greyed reticle during a battle.
 * Expected outcome: The sentence as written.
 * Exceptions: None.
 */
export const MISSILES_CANNOT_FIRE_IN_BATTLE_REASON = 'Missiles cannot fire or launch during a battle.';

/**
 * Tells the model why a missile refused a standing order.
 *
 * Purpose: A missile always holds. A launch is a `missileLaunches` entry, not a standing order.
 * When to use: `assign_order` when the unit is a missile and the type is not `hold_fire`.
 * Expected outcome: A sentence that names the rejected type.
 * Exceptions: None.
 */
export function missileStandingOrderRejectionReason(orderType: string): string {
  return `Missiles cannot take a ${orderType} standing order. A missile always holds; launch it with a missileLaunches entry.`;
}

/**
 * Shown when someone tries to cancel a missile's hold order.
 *
 * Purpose: Cancelling the hold would leave the missile unordered and force a consultation every turn.
 * When to use: `cancel_order` for a missile.
 * Expected outcome: The sentence as written. The row stays.
 * Exceptions: None.
 */
export const MISSILE_HOLD_CANNOT_BE_CANCELLED_REASON = 'A missile always holds, so its order cannot be cancelled.';

/**
 * Shown when a launch names a unit that is not a missile.
 *
 * Purpose: Only missiles launch.
 * When to use: Launch validation after the unit has been loaded.
 * Expected outcome: The sentence as written.
 * Exceptions: None.
 */
export const ONLY_MISSILES_CAN_LAUNCH_REASON = 'Only missiles can launch.';

/**
 * Shown when a launch target is not a hex of the loaded map.
 *
 * Purpose: Range is measured on the map's hexes. An off-map index is not a target.
 * When to use: Launch validation after the unit is known to be a missile.
 * Expected outcome: The sentence as written.
 * Exceptions: None.
 */
export const MISSILE_TARGET_OFF_MAP_REASON = 'That target is not on the map.';

/**
 * Shown when the launching side has not explored the target.
 *
 * Purpose: A missile can strike any explored hex in range, including the side's own hexes, and no other hex.
 * When to use: Launch validation when fog is on and the target has no intel row.
 * Expected outcome: The sentence as written.
 * Exceptions: None.
 */
export const MISSILE_TARGET_UNEXPLORED_REASON = 'A missile can only target a hex its side has explored.';

/**
 * Shown when the target is outside the loaded map's missile range.
 *
 * Purpose: The range is a per-map hex count, so the sentence names the number that was checked.
 * When to use: Launch validation after the off-map check.
 * Expected outcome: A sentence that includes `rangeHexes`.
 * Exceptions: None.
 */
export function missileTargetOutOfRangeReason(rangeHexes: number): string {
  return `That target is more than ${rangeHexes} hexes from the missile.`;
}

/**
 * Shown when a launch selection mixes missiles with other unit types.
 *
 * Purpose: One launch aims every selected unit, so the selection has to be missiles only.
 * When to use: The reticle when missiles are selected with something else, outside a battle.
 * Expected outcome: The sentence as written.
 * Exceptions: None.
 */
export const LAUNCH_NEEDS_MISSILES_ONLY_REASON = 'A launch needs a selection of missiles only.';

/**
 * Shown when a mixed selection that includes a missile double-clicks a march.
 *
 * Purpose: Missiles cannot march, and the other units should be planned without them.
 * When to use: The map double-click handler for a mixed missile selection.
 * Expected outcome: The sentence as written.
 * Exceptions: None.
 */
export const MISSILE_MIXED_MOVE_MESSAGE = 'Missiles cannot move. Deselect them to plan a march.';

/**
 * Fallback when a launch validation failure has no more specific sentence.
 *
 * Purpose: The player still sees a sentence if the reason string is missing.
 * When to use: The double-click launch path, as the default passed to the reason formatter.
 * Expected outcome: The sentence as written.
 * Exceptions: None.
 */
export const MISSILE_LAUNCH_REJECTED_DEFAULT_MESSAGE = 'The selected missiles cannot launch at that target.';

/**
 * Shown when launch aiming starts with nothing selected.
 *
 * Purpose: A launch needs at least one missile.
 * When to use: Group launch validation of an empty selection.
 * Expected outcome: The sentence as written.
 * Exceptions: None.
 */
export const NO_SELECTED_MISSILES_REASON = 'Select one or more missiles before aiming a launch.';

/**
 * Shown when a launch IPC payload cannot be read.
 *
 * Purpose: A malformed request is refused before any unit is loaded.
 * When to use: The launch IPC handler when the payload parser returns null.
 * Expected outcome: The sentence as written.
 * Exceptions: None.
 */
export const INVALID_MISSILE_LAUNCH_PAYLOAD_REASON = 'The missile launch request could not be read.';

/**
 * Names the unit whose launch was submitted twice in one order set.
 *
 * Purpose: One missile launches once. A second row for the same unit is dropped.
 * When to use: Order sanitizing, for the first duplicate.
 * Expected outcome: A sentence that includes the unit's display label.
 * Exceptions: None.
 */
export function missileLaunchDuplicateReason(unitLabel: string): string {
  return `Duplicate missile launch for ${unitLabel}.`;
}

/**
 * Logged when a battle consult has only missiles on that side.
 *
 * Purpose: Missiles cannot act in a battle, so the model is not called.
 * When to use: The empty-roster path when the side still has missile sub-units.
 * Expected outcome: The sentence as written. The absence reason stays `no_units_in_battle`.
 * Exceptions: None.
 */
export const ONLY_MISSILES_REMAIN_IN_BATTLE_MESSAGE = 'Only missiles remain in this battle; they cannot act.';
