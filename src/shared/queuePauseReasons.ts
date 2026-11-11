/**
 * One rule and one set of words for paused queues.
 *
 * Purpose: The production pass, the build-queue view, the popup, the turn report, and the AI briefing share these reasons and sentences.
 * When to use: Any surface that explains why a queue is not spending.
 * Expected outcome: The same reasons, in the same order, and the same sentences, on every surface.
 * Exceptions: None. This module has no logger.
 */

import { joinWithSerialComma } from './consolidatedTurnUpdateToast';
import { FORTIFICATION_QUEUE_ITEM } from './fortificationRules';
import { isBuildUnitType } from './ipc/productionTypes';
import type { QueuePauseReason } from './queuePauseTypes';
import { formatTurnReportHexList } from './turnReportHexCodes';

/**
 * Print order for pause reasons.
 *
 * Purpose: Every sentence lists occupation, then a full city, then the unit cap.
 * When to use: Sorting a reason list before it is printed or grouped.
 * Expected outcome: The three reasons in that order.
 * Exceptions: None.
 */
export const QUEUE_PAUSE_REASON_ORDER: readonly QueuePauseReason[] = ['occupation', 'allCellsFortified', 'unitCap'];

/**
 * The words for each pause reason.
 *
 * Purpose: The popup, the turn report, and the briefing print one spelling.
 * When to use: Building a sentence, and mapping a tool field back to a reason.
 * Expected outcome: The three phrases from the player-facing note.
 * Exceptions: None.
 */
export const QUEUE_PAUSE_REASON_TEXT: Readonly<Record<QueuePauseReason, string>> = {
  occupation: 'occupying units or fortifications required',
  allCellsFortified: 'every city cell fortified',
  unitCap: 'unit cap reached',
};

/**
 * Lists every reason the next queued item is not spending.
 *
 * Purpose: One rule for the production pass, the build-queue view, and the briefing.
 * When to use: When the hex has a queue entry or Keep building is armed. Pass null when nothing is queued.
 * Expected outcome: Reasons in `QUEUE_PAUSE_REASON_ORDER`, and an empty list when nothing is queued.
 * Exceptions: None.
 */
export function listQueuePauseReasons(args: {
  readonly buildable: boolean;
  readonly nextItemType: string | null;
  readonly fortifiableLeft: number;
  readonly maxedUnitTypes: ReadonlySet<string>;
}): QueuePauseReason[] {
  if (args.nextItemType === null) return [];
  const reasons: QueuePauseReason[] = [];
  if (!args.buildable) reasons.push('occupation');
  if (args.nextItemType === FORTIFICATION_QUEUE_ITEM && args.fortifiableLeft <= 0) reasons.push('allCellsFortified');
  if (isBuildUnitType(args.nextItemType) && args.maxedUnitTypes.has(args.nextItemType)) reasons.push('unitCap');
  return reasons;
}

/**
 * Drops duplicates and puts reasons in print order.
 *
 * Purpose: A caller may collect reasons in any order.
 * When to use: Before grouping or wording a sentence.
 * Expected outcome: The subset of `QUEUE_PAUSE_REASON_ORDER` that was passed, in that order.
 * Exceptions: None.
 */
export function sortQueuePauseReasons(reasons: readonly QueuePauseReason[]): QueuePauseReason[] {
  return QUEUE_PAUSE_REASON_ORDER.filter((reason) => reasons.includes(reason));
}

/**
 * Maps a printed reason back to its name.
 *
 * Purpose: Tool rows carry the words, and the briefing groups by the name.
 * When to use: When reading `pausedReasons` text from a production snapshot.
 * Expected outcome: The matching reason, or null when the text is not one of the three phrases.
 * Exceptions: None.
 */
export function queuePauseReasonForText(text: string): QueuePauseReason | null {
  const trimmed = text.trim();
  return QUEUE_PAUSE_REASON_ORDER.find((reason) => QUEUE_PAUSE_REASON_TEXT[reason] === trimmed) ?? null;
}

/**
 * The build popup's one-line pause note.
 *
 * Purpose: The player sees every reason that applies, in one line.
 * When to use: When the viewer controls the hex and at least one reason applies.
 * Expected outcome: `Queue paused: <reasons>.`, or null when the list is empty.
 * Exceptions: None.
 */
export function formatQueuePausedNote(reasons: readonly QueuePauseReason[]): string | null {
  const sorted = sortQueuePauseReasons(reasons);
  if (sorted.length === 0) return null;
  return `Queue paused: ${joinWithSerialComma(sorted.map((reason) => QUEUE_PAUSE_REASON_TEXT[reason]))}.`;
}

/**
 * One hex in a grouped pause sentence.
 *
 * Purpose: The report and the briefing already resolved the code, or failed to.
 * When to use: The argument to `formatQueuePausedLines`.
 * Expected outcome: A code or null, and the reasons that apply.
 * Exceptions: None.
 */
export interface QueuePauseLineEntry {
  /**
   * Briefing or report code for the hex.
   *
   * Contract: A code, or null when the code cannot be resolved.
   * When to use: After `orderTargetHexCode`, or when the row has no center.
   * Expected outcome: The code the reader should see, or null.
   * Exceptions: None.
   */
  readonly hexCode: string | null;
  /**
   * Every reason this hex is paused.
   *
   * Contract: May be empty. Empty entries are left out of the sentences.
   * When to use: The reasons recorded for this hex.
   * Expected outcome: Zero or more reasons. Order does not matter.
   * Exceptions: None.
   */
  readonly reasons: readonly QueuePauseReason[];
}

/**
 * Groups paused hexes that share a reason set into one sentence each.
 *
 * Purpose: The turn report and the briefing name every hex with the same reasons once.
 * When to use: After each hex has a code, or null when the code is missing.
 * Expected outcome: One sentence per non-empty reason set. The group key is each reason's position in `QUEUE_PAUSE_REASON_ORDER`, so plain string order sorts the groups as `0`, `0,1`, `0,2`, `1`, `2`. That works because there are fewer than ten reasons.
 * Exceptions: None. An empty reason list is skipped. A missing code is `an unidentified hex`, once per sentence.
 */
export function formatQueuePausedLines(entries: readonly QueuePauseLineEntry[]): string[] {
  const groups = new Map<string, { readonly reasons: QueuePauseReason[]; readonly codes: (string | null)[] }>();
  for (const entry of entries) {
    const reasons = sortQueuePauseReasons(entry.reasons);
    if (reasons.length === 0) continue;
    const key = reasons.map((reason) => QUEUE_PAUSE_REASON_ORDER.indexOf(reason)).join(',');
    const group = groups.get(key) ?? { reasons, codes: [] };
    group.codes.push(entry.hexCode);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, group]) => {
      const noun = group.codes.length === 1 ? 'Queue' : 'Queues';
      const reasons = joinWithSerialComma(group.reasons.map((reason) => QUEUE_PAUSE_REASON_TEXT[reason]));
      return `${noun} paused at ${formatTurnReportHexList(group.codes)}: ${reasons}.`;
    });
}
