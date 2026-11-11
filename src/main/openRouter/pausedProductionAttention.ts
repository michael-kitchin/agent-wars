/**
 * Paused queues in the situation message.
 *
 * Purpose: The situation message names the seat's paused queues, that those queues lose their points, and how to restart them, in the same pause sentences as the turn report, one paragraph each.
 * When to use: While building Production Status, and when Attention Flags needs the one-line pointer.
 * Expected outcome: The subsection body, or null when nothing qualifies, and a pointer that names the heading.
 * Exceptions: None.
 */

import { formatQueuePausedLines, QUEUE_PAUSE_REASON_TEXT, queuePauseReasonForText } from '../../shared/queuePauseReasons';
import type { QueuePauseReason } from '../../shared/queuePauseTypes';
import { logTrace } from '../logger';
import { SECTION_TITLE_PAUSED_QUEUES, SECTION_TITLE_PRODUCTION_STATUS } from './promptSpec/sectionHeadings';
import type { ControlledHexQueueSnapshot } from './productionQueueSnapshotTypes';

/**
 * One controlled hex whose queue is paused for occupation or a full city.
 *
 * Purpose: The subsection and the pointer share one list, so a cap-only pause stays out of both.
 * When to use: The result of `findPausedProductionHexes`.
 * Expected outcome: A briefing code and the reasons that apply.
 * Exceptions: None.
 */
export interface PausedProductionHex {
  /**
   * Briefing code for the hex.
   *
   * Contract: The label `formatHexLabel` returned, or null when the row has no center.
   * When to use: The grouped pause sentence.
   * Expected outcome: A short code, or null. A null code prints as `an unidentified hex`.
   * Exceptions: None.
   */
  readonly hexText: string | null;
  /**
   * Every reason this hex is paused.
   *
   * Contract: Includes `occupation` or `allCellsFortified`. A cap may be included beside one of those. Order is `QUEUE_PAUSE_REASON_ORDER`.
   * When to use: Grouping the sentence and choosing the remedy paragraphs.
   * Expected outcome: One or more reasons.
   * Exceptions: None.
   */
  readonly reasons: readonly QueuePauseReason[];
}

/**
 * How to clear an occupation pause.
 *
 * Purpose: The subsection tells the model the two ways to restart a city it cannot occupy.
 * When to use: When any listed hex includes `occupation`.
 * Expected outcome: One paragraph. Raise Options `yes` is the hire path.
 * Exceptions: None.
 */
export const PAUSED_OCCUPATION_REMEDY =
  `To clear "${QUEUE_PAUSE_REASON_TEXT.occupation}", end a turn with one of your units in the cell, ` +
  'or raise a mercenary there (Raise Options shows yes under Resumes building).';

/**
 * How to clear a full-city pause.
 *
 * Purpose: A fortification queue in a fully fortified city spends nothing until the queue changes.
 * When to use: When any listed hex includes `allCellsFortified`.
 * Expected outcome: One paragraph naming `set_build_queue`.
 * Exceptions: None.
 */
export const PAUSED_FORTIFICATION_REMEDY =
  `To clear "${QUEUE_PAUSE_REASON_TEXT.allCellsFortified}", replace that cell's queue with set_build_queue.`;

/**
 * The points a paused queue does not keep.
 *
 * Purpose: The subsection says the loss once, for every listed hex, rather than totaling points that will be discarded.
 * When to use: After the grouped pause sentences, before the remedies.
 * Expected outcome: One paragraph.
 * Exceptions: None.
 */
export const PAUSED_POINTS_LOST = 'A paused queue loses its production points at the end of each turn.';

/**
 * Controlled hexes paused for occupation or a full city.
 *
 * Purpose: Hexes paused only by the cap are left to the Production idle flag.
 * When to use: After `query_production` returns controlled-hex queues.
 * Expected outcome: One entry per qualifying hex, in snapshot order. A row with no recognized reason is left out.
 * Exceptions: None.
 */
export function findPausedProductionHexes(
  rows: readonly ControlledHexQueueSnapshot[],
  formatHexLabel: (ll: [number, number]) => string
): PausedProductionHex[] {
  logTrace('pausedProductionAttention findPausedProductionHexes', { rowCount: rows.length });
  const paused: PausedProductionHex[] = [];
  for (const row of rows) {
    const texts = Array.isArray(row.pausedReasons) ? (row.pausedReasons as unknown[]).map((value) => String(value)) : [];
    const reasons = texts
      .map((text) => queuePauseReasonForText(text))
      .filter((reason): reason is QueuePauseReason => reason !== null);
    if (!reasons.includes('occupation') && !reasons.includes('allCellsFortified')) continue;
    const hex = Array.isArray(row.hex) ? (row.hex as [number, number]) : null;
    paused.push({
      hexText: hex ? formatHexLabel(hex) : null,
      reasons,
    });
  }
  return paused;
}

/**
 * The Paused Queues body, without its heading.
 *
 * Purpose: The production briefing adds the heading. This function keeps the pause sentences, the points-lost paragraph, and the remedies.
 * When to use: After `findPausedProductionHexes`, including when the queue table is empty.
 * Expected outcome: Paragraphs separated by a blank line: one grouped pause sentence each, then the points-lost paragraph, then one remedy paragraph per reason present. Null when nothing is paused. No heading.
 * Exceptions: None.
 */
export function formatPausedQueuesSection(paused: readonly PausedProductionHex[]): string | null {
  logTrace('pausedProductionAttention formatPausedQueuesSection', { pausedCount: paused.length });
  if (paused.length === 0) return null;
  const paragraphs = formatQueuePausedLines(paused.map((hex) => ({ hexCode: hex.hexText, reasons: hex.reasons })));
  paragraphs.push(PAUSED_POINTS_LOST);
  if (paused.some((hex) => hex.reasons.includes('occupation'))) paragraphs.push(PAUSED_OCCUPATION_REMEDY);
  if (paused.some((hex) => hex.reasons.includes('allCellsFortified'))) paragraphs.push(PAUSED_FORTIFICATION_REMEDY);
  return paragraphs.join('\n\n');
}

/**
 * The Attention Flags pointer to the paused-queue subsection.
 *
 * Purpose: The flag names the heading and does not repeat the hexes or the remedies.
 * When to use: After the production idle bullet, when the subsection is present.
 * Expected outcome: The one pointer sentence, or null when the section is omitted.
 * Exceptions: None.
 */
export function formatPausedProductionPointer(paused: readonly PausedProductionHex[]): string | null {
  logTrace('pausedProductionAttention formatPausedProductionPointer', { pausedCount: paused.length });
  if (paused.length === 0) return null;
  return `Paused queues: see ${SECTION_TITLE_PAUSED_QUEUES} under ${SECTION_TITLE_PRODUCTION_STATUS}.`;
}
