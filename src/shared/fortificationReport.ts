/**
 * Who may see a strategic fortification loss.
 *
 * Purpose: The turn report hides a hex the viewer has not explored, unless the viewer owns it or is observing.
 * When to use: Before a fortification sentence is added to the toast.
 * Expected outcome: True for an observer, the owner, or an explored hex.
 * Exceptions: None.
 */

import type { FortificationReport } from './ipc/fortificationTypes';

/**
 * Reports whether this viewer may see the fortification loss.
 *
 * Purpose: Fog hides enemy fortification losses on hexes the viewer has not explored.
 * When to use: Once per report, with the viewer's explored set.
 * Expected outcome: True when `viewerSeatId` is null, when it equals `ownerId`, or when the hex is explored.
 * Exceptions: None.
 */
export function fortificationReportVisibleToViewer(
  report: FortificationReport,
  viewerSeatId: string | null,
  exploredHexes: ReadonlySet<string>
): boolean {
  if (viewerSeatId === null) return true;
  if (viewerSeatId === report.ownerId) return true;
  return exploredHexes.has(report.h3Index);
}
