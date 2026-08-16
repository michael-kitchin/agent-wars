/**
 * Drops draft or standing-order rows whose unit no longer exists in a living-id set.
 *
 * Purpose: After a tactical loss or voluntary-exit bailout, the pre-battle stash can still hold marches for parents deleted in main; restoring those rows would show ghost orders until the next Ready.
 * When to use: Restoring stashed strategic drafts after tactical exit against `S.gameState.units`.
 * Expected outcome: Rows whose `unitId` is in `livingUnitIds` are kept in original order; others are omitted.
 * Exceptions: An empty living set yields an empty array.
 */
export function filterOrdersToLivingUnitIds<T extends { unitId: string }>(
  rows: readonly T[],
  livingUnitIds: ReadonlySet<string>
): T[] {
  return rows.filter((row) => livingUnitIds.has(row.unitId));
}
