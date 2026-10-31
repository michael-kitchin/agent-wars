/**
 * Drops queued drafts that belong to units that just left the player's side.
 *
 * Purpose: A confirmed dismiss clears those units' unsent orders without touching anyone else's queue.
 * When to use: After `executeDismissMercenary` returns the ids that became Neutral.
 * Expected outcome: A new array. Drafts whose `unitId` is in `unitIds` are gone. An empty id list copies every draft.
 * Exceptions: None.
 */

/**
 * Returns the drafts that are not for the named units.
 *
 * Purpose: Ranged, strike, launch, ferry, and embark queues share one filter.
 * When to use: Pass one pending array and the ids from a successful dismiss.
 * Expected outcome: A new array. One named id drops that unit's rows and keeps the rest. An empty id list returns a copy of `drafts`.
 * Exceptions: None.
 */
export function draftsWithoutUnits<T extends { readonly unitId: string }>(
  drafts: readonly T[],
  unitIds: readonly string[]
): T[] {
  if (unitIds.length === 0) return [...drafts];
  const drop = new Set(unitIds);
  return drafts.filter((draft) => !drop.has(draft.unitId));
}
