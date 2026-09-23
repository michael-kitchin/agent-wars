import { unitHasDirectRangedPlanning } from './rangePerimeterModel';

/**
 * Which support action the current selection may start.
 *
 * Purpose: One result for the sidebar label and the button click, so those two gates cannot drift.
 * When to use: Branch on the value returned by `selectionSupportButtonMode`. Do not re-derive air versus ranged at the call site.
 * Expected outcome: `hidden` shows nothing, `ranged` shows Ranged or Cancel, and `strike` shows Strike.
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
