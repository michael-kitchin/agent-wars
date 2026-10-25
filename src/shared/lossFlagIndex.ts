/**
 * Groups loss-toast flag values by the side that lost the unit and the unit's display name.
 */

/**
 * One victim row before flags are grouped.
 *
 * Purpose: The caller has already resolved a value, or null when this victim has nothing to show.
 * When to use: `indexLossFlagsByOwner`.
 * Expected outcome: `value` null means the row is skipped.
 * Exceptions: None.
 */
export interface LossFlagRow<T> {
  /**
   * The side that lost the unit.
   *
   * Contract: Compared as a string. Two owners never share a slot.
   * When to use: The victim's owner id.
   * Expected outcome: The outer map key.
   * Exceptions: None.
   */
  readonly ownerId: string;
  /**
   * The name shown on the loss line.
   *
   * Contract: Compared as a string, within one owner.
   * When to use: The victim's display name.
   * Expected outcome: The inner map key.
   * Exceptions: None.
   */
  readonly name: string;
  /**
   * The flag value, or null when this victim has none.
   *
   * Contract: Null is skipped and does not make a name ambiguous.
   * When to use: After the caller looks up an origin.
   * Expected outcome: A kept value, or null.
   * Exceptions: None.
   */
  readonly value: T | null;
}

/**
 * Groups flag values so each side keeps its own copy of a shared display name.
 *
 * Purpose: The popup names a unit without the side prefix, and two sides can use the same name.
 * When to use: When building the loss-toast flag map.
 * Expected outcome: One inner map per owner. A name is kept when every non-null value for that owner and name
 *   passes `same`. A disagreement omits that name for that owner only. A null value is skipped.
 * Exceptions: None.
 */
export function indexLossFlagsByOwner<T>(
  rows: readonly LossFlagRow<T>[],
  same: (left: T, right: T) => boolean
): ReadonlyMap<string, ReadonlyMap<string, T>> {
  const byOwner = new Map<string, Map<string, T>>();
  const dropped = new Set<string>();
  for (const row of rows) {
    if (row.value == null) continue;
    const dropKey = `${row.ownerId}\0${row.name}`;
    if (dropped.has(dropKey)) continue;
    let ownerMap = byOwner.get(row.ownerId);
    if (!ownerMap) {
      ownerMap = new Map();
      byOwner.set(row.ownerId, ownerMap);
    }
    const existing = ownerMap.get(row.name);
    if (existing === undefined) ownerMap.set(row.name, row.value);
    else if (!same(existing, row.value)) {
      ownerMap.delete(row.name);
      dropped.add(dropKey);
    }
  }
  return byOwner;
}
