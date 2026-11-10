/**
 * Who may see a fortification loss, and the sentence for those losses.
 *
 * Purpose: The turn report hides a hex the viewer has not explored, unless the viewer owns it or is observing, and totals the hits the viewer may see.
 * When to use: Strategic Ready and a battle beat, before a fortification sentence is added to the toast.
 * Expected outcome: One sentence per owner, or none when no visible hit remains.
 * Exceptions: None. This module has no logger.
 */

import type { FortificationToastLine } from './consolidatedTurnUpdateToast';
import type { FortificationReport } from './ipc/fortificationTypes';
import { formatTurnReportHexList } from './turnReportHexCodes';

/**
 * One visible loss and the code of its hex.
 *
 * Purpose: The sentence builder does not look up hex codes.
 * When to use: After `orderTargetHexCode` and the visibility filter.
 * Expected outcome: `hexCode` is null when the hex has no code.
 * Exceptions: None.
 */
export interface FortificationReportEntry {
  /**
   * The loss whose hit count this sentence totals.
   *
   * Contract: A report the viewer may see. `lost` may be 0; those rows are skipped.
   * When to use: Always.
   * Expected outcome: A positive `lost` adds into that owner's sentence.
   * Exceptions: None.
   */
  readonly report: FortificationReport;
  /**
   * The hex's code, or null when it has none.
   *
   * Contract: The code `orderTargetHexCode` returned. Not a place name.
   * When to use: Always.
   * Expected outcome: Null becomes `an unidentified hex` in the sentence.
   * Exceptions: None.
   */
  readonly hexCode: string | null;
}

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

/**
 * The fortification sentence for one owner's visible losses.
 *
 * Purpose: The turn report totals the hits those hexes absorbed.
 * When to use: Once per owner group.
 * Expected outcome: Null when no entry has `lost` above 0. Otherwise one sentence. The sentence does not say how many remain.
 * Exceptions: None.
 */
export function formatFortificationSummaryLine(entries: readonly FortificationReportEntry[]): string | null {
  let total = 0;
  const codes: (string | null)[] = [];
  for (const entry of entries) {
    if (entry.report.lost <= 0) continue;
    total += entry.report.lost;
    codes.push(entry.hexCode);
  }
  if (total === 0) return null;
  const hit = total === 1 ? 'hit' : 'hits';
  return `Fortifications in ${formatTurnReportHexList(codes)} absorbed ${total} ${hit}.`;
}

/**
 * One toast line per owner, in the order each owner first appears.
 *
 * Purpose: The toast assembler files each line and does not combine hexes.
 * When to use: After the viewer filter, with a code on every entry.
 * Expected outcome: `ownerId` is copied as stored, including Neutral and null. A group with no hits is dropped.
 * Exceptions: None. An empty list returns no lines.
 */
export function buildFortificationToastLines(entries: readonly FortificationReportEntry[]): FortificationToastLine[] {
  const groups = new Map<string | null, FortificationReportEntry[]>();
  for (const entry of entries) {
    const key = entry.report.ownerId;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  const lines: FortificationToastLine[] = [];
  for (const [ownerId, group] of groups) {
    const line = formatFortificationSummaryLine(group);
    if (line !== null) lines.push({ ownerId, line });
  }
  return lines;
}
