/**
 * Shared helpers for reusing stored march path polylines when a unit advances along a committed route.
 */

/**
 * Finds the suffix of a stored H3 path that starts at the unit's current cell.
 *
 * Purpose: Keeps tactical and strategic march overlays stable after partial movement along a previously planned route.
 * When to use: After beat or turn resolution when the unit may have advanced but should still follow the committed path tail.
 * Expected outcome: Returns the full stored path when `currentH3` is the path head; returns the tail when `currentH3` appears later; `null` when off-path.
 * Exceptions: None.
 */
export function findPathTailFromCurrentPosition(
  storedPathH3Indexes: readonly string[],
  currentH3: string
): readonly string[] | null {
  if (storedPathH3Indexes.length === 0) return null;
  if (storedPathH3Indexes[0] === currentH3) return storedPathH3Indexes;
  for (let i = 1; i < storedPathH3Indexes.length; i++) {
    if (storedPathH3Indexes[i] === currentH3) return storedPathH3Indexes.slice(i);
  }
  return null;
}
