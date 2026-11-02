/**
 * Adds tool-group counts from several commanders into one map.
 *
 * Purpose: The Commanders tab shows one total per group for the consult that is running.
 * When to use: When a pool snapshot is built from the seats that have reported.
 * Expected outcome: A new map. The same group id is added across maps. A non-finite count is left out.
 * Exceptions: None.
 */
export function sumCommanderToolCounts(
  maps: readonly Readonly<Record<string, number>>[]
): Record<string, number> {
  const sum: Record<string, number> = {};
  for (const counts of maps) {
    for (const [groupId, count] of Object.entries(counts)) {
      if (!Number.isFinite(count)) continue;
      sum[groupId] = (sum[groupId] ?? 0) + count;
    }
  }
  return sum;
}
