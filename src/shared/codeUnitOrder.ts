/**
 * Orders two strings by UTF-16 code units.
 *
 * Purpose: Sorted ids, cells, and names come out the same on every machine.
 * When to use: Any sort or tie-break that must not follow the machine locale.
 * Expected outcome: `-1` when `left` is first, `1` when `right` is first, and `0` when they are equal.
 * Exceptions: None. `localeCompare` gives a different order and must not replace this.
 */
export function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
