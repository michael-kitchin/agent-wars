import { HUMAN_SEAT_ID } from './seatIds';

/**
 * Returns the id of the only selectable human unit in `units`.
 *
 * Purpose: A Shift-click toggles that unit. A plain click sole-selects it when this list is that one stationary unit.
 * When to use: From the main-map icon click, passing `isEmbarkedLandUnitBlockedForSelection`. Do not pass `shouldBlockEmbarkedLandUnitSelect`; that one returns false once an embarked unit is already selected.
 * Expected outcome: The id when exactly one unit is human and the predicate reports it is not embarked. Null for none, for more than one, and for an empty list. Enemy units and embarked land units do not count.
 * Exceptions: None.
 */
export function soleSelectableHumanUnitId(
  units: readonly { id: string; player: string }[],
  isEmbarkedLandUnit: (unitId: string) => boolean
): string | null {
  const selectable = units.filter((unit) => unit.player === HUMAN_SEAT_ID && !isEmbarkedLandUnit(unit.id));
  const only = selectable[0];
  return selectable.length === 1 && only != null ? only.id : null;
}
