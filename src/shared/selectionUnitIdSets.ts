/**
 * Returns whether two unit-id lists represent different sets (order ignored).
 *
 * Purpose: Shared inequality check for selection-change side effects without
 * sorting or mutating caller arrays.
 * When to use: Compare a pre-update id list to a post-reconcile selection before
 * deciding whether planning chrome should react to a selection change.
 * Expected outcome: `true` when lengths differ or any id in `after` is missing from `before`.
 * Exceptions: None.
 */
export function selectionUnitIdSetsDiffer(before: readonly string[], after: readonly string[]): boolean {
  if (before.length !== after.length) return true;
  const beforeSet = new Set(before);
  return after.some((id) => !beforeSet.has(id));
}
