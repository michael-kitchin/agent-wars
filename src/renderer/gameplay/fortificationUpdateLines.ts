/**
 * Builds the Updates line for fortification queues that paused this turn.
 *
 * Purpose: Place names come from the same caption lookup as missile sentences, which this module's caller does not have.
 * When to use: Strategic Ready, before the consolidated toast is built.
 * Expected outcome: One paused-queue sentence when any hex paused, otherwise an empty list.
 * Exceptions: A rejected caption lookup is logged and becomes the unnamed place. It is not rethrown.
 */

import type { FortificationToastLine } from '../../shared/consolidatedTurnUpdateToast';
import { fortificationReportVisibleToViewer } from '../../shared/fortificationReport';
import { FORTIFICATION_UNNAMED_PLACE, formatFortificationQueuePausedLine, formatFortificationReportLine } from '../../shared/fortificationRules';
import type { ReadyResult } from '../../shared/ipcTypes';

/**
 * Names each paused hex and formats the Updates sentence.
 *
 * Purpose: The toast builder receives finished sentences and does not look up hex names.
 * When to use: `announceResolutionTurnUpdate`, passing the Ready slice.
 * Expected outcome: One `formatFortificationQueuePausedLine` sentence, or no lines when nothing paused.
 * Exceptions: A rejected caption lookup is logged and uses `FORTIFICATION_UNNAMED_PLACE`.
 */
export async function fortificationUpdateLinesFor(readySlice: ReadyResult): Promise<string[]> {
  const hexes = readySlice.humanFortificationQueuePausedHexes ?? [];
  if (hexes.length === 0) return [];
  const names: string[] = [];
  for (const h3Index of hexes) {
    let placeName = FORTIFICATION_UNNAMED_PLACE;
    try {
      const caption = await window.gameApi?.getHexNamingTooltipLine?.({ h3Index, resolution: 1 });
      placeName = caption?.text.trim() || FORTIFICATION_UNNAMED_PLACE;
    } catch (err) {
      console.error('fortification place name failed', err);
    }
    names.push(placeName);
  }
  return [formatFortificationQueuePausedLine(names)];
}

/**
 * Names each visible fortification loss.
 *
 * Purpose: The toast builder files finished sentences by owner and does not look up places.
 * When to use: `announceResolutionTurnUpdate`, with the viewer's seat and explored hexes.
 * Expected outcome: One line per report the viewer may see, in report order.
 * Exceptions: A rejected caption lookup is logged and uses `FORTIFICATION_UNNAMED_PLACE`.
 */
export async function fortificationReportLinesFor(
  readySlice: ReadyResult,
  viewer: { readonly viewerSeatId: string | null; readonly exploredHexes: ReadonlySet<string> }
): Promise<FortificationToastLine[]> {
  const lines: FortificationToastLine[] = [];
  for (const report of readySlice.fortificationReports ?? []) {
    if (!fortificationReportVisibleToViewer(report, viewer.viewerSeatId, viewer.exploredHexes)) continue;
    let placeName = FORTIFICATION_UNNAMED_PLACE;
    try {
      const caption = await window.gameApi?.getHexNamingTooltipLine?.({ h3Index: report.h3Index, resolution: 1 });
      placeName = caption?.text.trim() || FORTIFICATION_UNNAMED_PLACE;
    } catch (err) {
      console.error('fortification place name failed', err);
    }
    lines.push({
      ownerId: report.ownerId,
      line: formatFortificationReportLine({ placeName, lost: report.lost, remaining: report.remaining }),
    });
  }
  return lines;
}
