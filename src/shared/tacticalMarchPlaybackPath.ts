/**
 * Helpers for tactical Ready resolution playback march polylines (`pathH3Indexes`).
 *
 * Purpose: Keeps path clipping logic testable and reusable from `commitHumanTacticalDraftOrders` without coupling to DB/game state.
 * When to use: After `tacticalMarchFirstStopAlongPath` when building `TacticalCommitResolutionPlayback` rows.
 * Expected outcome: Clipped paths are ordered `[from, …, destination]` with length at least 2 when defined.
 * Exceptions: Returns `undefined` when the prefix cannot be aligned to the committed destination cell.
 */

/**
 * Truncates a tactical march path prefix so playback ends on the cell the commit actually reached.
 *
 * Purpose: Keeps `pathH3Indexes` consistent when `toH3Index` lies earlier on the prefix than the planner's nominal stop.
 * When to use: When assembling `TacticalCommitResolutionPlayback` march rows after `tacticalMarchFirstStopAlongPath`.
 * Expected outcome: Returns `undefined` when no usable polyline; otherwise length ≥ 2 ending at `destinationH3` when found.
 * Exceptions: None; pure helper.
 */
export function clipTacticalMarchPathToDestination(
  destinationH3: string,
  pathPrefix: string[] | undefined
): string[] | undefined {
  if (!pathPrefix || pathPrefix.length < 2) return undefined;
  const idx = pathPrefix.indexOf(destinationH3);
  if (idx >= 0) {
    const clipped = pathPrefix.slice(0, idx + 1);
    return clipped.length >= 2 ? clipped : undefined;
  }
  if (pathPrefix[pathPrefix.length - 1] === destinationH3) return pathPrefix;
  return undefined;
}
