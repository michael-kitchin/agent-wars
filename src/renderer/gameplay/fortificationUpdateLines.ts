/**
 * Fortification loss sentences for the turn report.
 *
 * Purpose: The Updates section totals fortification losses by owner.
 * When to use: Strategic Ready and a battle beat, before the consolidated toast is built.
 * Expected outcome: One line per owner the viewer may see.
 * Exceptions: None.
 */

import type { FortificationToastLine } from '../../shared/consolidatedTurnUpdateToast';
import {
  buildFortificationToastLines,
  fortificationReportVisibleToViewer,
  type FortificationReportEntry,
} from '../../shared/fortificationReport';
import type { ReadyResult } from '../../shared/ipcTypes';
import { orderTargetHexCode, type OrderHexCodeBattle } from '../../shared/orderTargetHexCode';

/**
 * Totals each visible fortification loss by owner.
 *
 * Purpose: The toast builder files finished sentences by owner and does not look up hex codes.
 * When to use: `announceResolutionTurnUpdate`, with the viewer's seat, explored hexes, and the battle when the report is a beat.
 * Expected outcome: One line per owner the viewer may see, from `buildFortificationToastLines`. A null battle names world-map hexes.
 * Exceptions: None.
 */
export function fortificationReportLinesFor(
  readySlice: ReadyResult,
  viewer: { readonly viewerSeatId: string | null; readonly exploredHexes: ReadonlySet<string> },
  hexCodeBattle: OrderHexCodeBattle | null
): FortificationToastLine[] {
  const entries: FortificationReportEntry[] = [];
  for (const report of readySlice.fortificationReports ?? []) {
    if (!fortificationReportVisibleToViewer(report, viewer.viewerSeatId, viewer.exploredHexes)) continue;
    entries.push({ report, hexCode: orderTargetHexCode(report.h3Index, hexCodeBattle) });
  }
  return buildFortificationToastLines(entries);
}
