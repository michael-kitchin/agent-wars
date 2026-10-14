import { unitHasDirectRangedPlanning } from './rangePerimeterModel';

/**
 * Which support action the current selection may start.
 *
 * Purpose: One result for the button's label and the button click, so those two gates cannot drift.
 * When to use: Branch on the value returned by `selectionSupportButtonMode`. Do not re-derive air versus ranged at the call site.
 * Expected outcome: `hidden` starts nothing (the button is greyed out, see `selectionSupportAction`), `ranged` shows
 *   Ranged or Cancel, and `strike` shows Strike.
 * Exceptions: None.
 */
export type SelectionSupportButtonMode = 'hidden' | 'ranged' | 'strike';

/**
 * Chooses whether the shared support button offers Ranged, Strike, or nothing.
 *
 * Purpose: Mixed selections must hide Ranged when any selected unit cannot fire one, including air. All-air stays Strike.
 * When to use: Sidebar visibility and the `#ranged-attack-btn` click gate, on the strategic map and in a tactical battle.
 * Expected outcome: `hidden` for empty, mixed, strategic infantry, unknown types, or air combined with anything else. `strike` when every unit is air. `ranged` when every unit is non-air and has direct ranged planning in this theater.
 * Exceptions: None.
 */
export function selectionSupportButtonMode(
  unitTypes: readonly string[],
  tacticalBattleActive: boolean
): SelectionSupportButtonMode {
  if (unitTypes.length === 0) return 'hidden';
  if (unitTypes.every((unitType) => unitType === 'air')) return 'strike';
  const everyUnitCanRangedAttack = unitTypes.every(
    (unitType) => unitType !== 'air' && unitHasDirectRangedPlanning(unitType, tacticalBattleActive)
  );
  return everyUnitCanRangedAttack ? 'ranged' : 'hidden';
}

/**
 * The reason shown beside a greyed-out Ranged when a world-map selection includes infantry.
 *
 * Purpose: Strategic infantry is melee-only, so Ranged cannot start.
 * When to use: Returned by `selectionSupportAction`.
 * Expected outcome: Shown as written.
 * Exceptions: None.
 */
export const INFANTRY_CANNOT_FIRE_REASON = "Infantry can't fire on the world map.";

/**
 * The reason shown beside a greyed-out Strike when air units are selected with other types.
 *
 * Purpose: A strike needs every selected unit to be air.
 * When to use: Returned by `selectionSupportAction`.
 * Expected outcome: Shown as written.
 * Exceptions: None.
 */
export const STRIKE_NEEDS_AIR_ONLY_REASON = 'Strike needs a selection of air units only.';

/**
 * What the support button shows for a selection: its label, whether it can be clicked, and why not.
 *
 * Purpose: The button stays visible while units are selected, so a selection that cannot fire still needs a label
 *   and a reason.
 * When to use: Returned by `selectionSupportAction`.
 * Expected outcome: `reason` is null whenever `enabled` is true.
 * Exceptions: None.
 */
export interface SelectionSupportAction {
  /**
   * The button's label before aiming starts.
   *
   * Contract: Strike whenever the selection has an air unit, Ranged otherwise.
   * When to use: The button's text while not aiming.
   * Expected outcome: Matches what a click would start.
   * Exceptions: None.
   */
  readonly label: 'Ranged' | 'Strike';
  /**
   * Whether a click can start aiming.
   *
   * Contract: Same answer as `selectionSupportButtonMode` not returning `hidden`.
   * When to use: The button's disabled state.
   * Expected outcome: False greys the button out.
   * Exceptions: None.
   */
  readonly enabled: boolean;
  /**
   * One sentence saying why the button cannot be used, or null.
   *
   * Contract: Null when enabled, and null when no sentence fits, such as an empty selection.
   * When to use: Shown beside the button.
   * Expected outcome: One of the reason constants in this file.
   * Exceptions: None.
   */
  readonly reason: string | null;
}

/**
 * Decides the support button's label, whether it can be clicked, and the reason it cannot.
 *
 * Purpose: The selection panel shows Ranged or Strike for every selection and explains a greyed-out button.
 * When to use: Each time the selection or the theater changes, next to `selectionSupportButtonMode`.
 * Expected outcome: All air: Strike, enabled. All able to fire: Ranged, enabled. Air with other types: Strike,
 *   disabled, `STRIKE_NEEDS_AIR_ONLY_REASON`. World-map infantry without air: Ranged, disabled,
 *   `INFANTRY_CANNOT_FIRE_REASON`. Anything else: Ranged, disabled, no reason.
 * Exceptions: None.
 */
export function selectionSupportAction(unitTypes: readonly string[], tacticalBattleActive: boolean): SelectionSupportAction {
  const mode = selectionSupportButtonMode(unitTypes, tacticalBattleActive);
  if (mode === 'strike') return { label: 'Strike', enabled: true, reason: null };
  if (mode === 'ranged') return { label: 'Ranged', enabled: true, reason: null };
  if (unitTypes.includes('air')) return { label: 'Strike', enabled: false, reason: STRIKE_NEEDS_AIR_ONLY_REASON };
  if (!tacticalBattleActive && unitTypes.includes('infantry')) {
    return { label: 'Ranged', enabled: false, reason: INFANTRY_CANNOT_FIRE_REASON };
  }
  return { label: 'Ranged', enabled: false, reason: null };
}
