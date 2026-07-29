/**
 * Filters multi-beat tactical march continuation rows to sub-units still present on the battle roster.
 */

/**
 * Drops continuation rows whose sub-unit id is absent from the post-beat roster.
 *
 * Purpose: Continuations are planned from pre-combat marches; melee/ranged can remove a unit in the same beat,
 * and re-queueing that id makes the next Ready fail with `unknown_unit`.
 * When to use: After a successful tactical Ready beat when assembling `tacticalMarchContinuations`, and when
 * building renderer pending-march rows from those continuations.
 * Expected outcome: Only rows whose `subUnitId` is in `presentSubUnitIds`; order preserved.
 * Exceptions: None.
 */
export function filterTacticalMarchContinuationsToPresentSubUnits(
  continuations: readonly { subUnitId: string; destinationH3Index: string }[],
  presentSubUnitIds: ReadonlySet<string>
): { subUnitId: string; destinationH3Index: string }[] {
  return continuations.filter((row) => presentSubUnitIds.has(row.subUnitId));
}
