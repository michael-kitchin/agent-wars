/**
 * The text of the agreements strip: cell labels and the cell tooltip.
 *
 * Purpose: Keeps every readable sentence of the strip in one pure, tested module so the renderer only draws it.
 * When to use: Drawing a cell label, and building the tooltip for a hovered cell.
 * Expected outcome: Plain strings and plain data. This module does not draw, read the database, or log.
 * Exceptions: None.
 */

import type { AgreementCell, AgreementCellItem } from './agreementStrip';
import { SIDE_AGREEMENT_INTENT_LABELS, SIDE_AGREEMENT_KIND_LABELS } from './sideAgreements';

/**
 * One line of a tooltip.
 *
 * Contract: Plain text, never markup.
 * When to use: Inside `AgreementTooltip`.
 * Expected outcome: The text, an optional bold lead-in, whether it is a list item, and whether it starts a spaced group.
 * Exceptions: None.
 */
export interface AgreementTooltipLine {
  /**
   * The line's text.
   *
   * Contract: Plain text.
   * When to use: Set with `textContent`.
   * Expected outcome: A readable sentence.
   * Exceptions: None.
   */
  readonly text: string;
  /**
   * Bold text drawn before `text`.
   *
   * Contract: Plain text. Omitted for a line with no lead-in.
   * When to use: An agreement's head line, which reads `Agreement #7:` in bold and then the rest in regular weight.
   * Expected outcome: The renderer draws the lead, one space, and `text`.
   * Exceptions: None.
   */
  readonly lead?: string;
  /**
   * Whether the line is a bullet in a list.
   *
   * Contract: True for the detail lines under an agreement's head line.
   * When to use: Drawing the line as a list item. Consecutive bullet lines form one list.
   * Expected outcome: A flag. Omitted means false.
   * Exceptions: None.
   */
  readonly bullet?: boolean;
  /**
   * Whether the line starts a spaced group.
   *
   * Contract: True only for an agreement's head line.
   * When to use: Choosing the line's spacing.
   * Expected outcome: A flag. The renderer adds space above the line.
   * Exceptions: None.
   */
  readonly emphasis: boolean;
}

/**
 * A cell tooltip.
 *
 * Contract: A heading and its lines.
 * When to use: The result of `agreementCellTooltip`.
 * Expected outcome: Plain data the renderer draws.
 * Exceptions: None.
 */
export interface AgreementTooltip {
  /**
   * The heading, naming the commander and the turn.
   *
   * Contract: Plain text.
   * When to use: The first line of the tooltip.
   * Expected outcome: Text such as `Sonnet 5.5 (turn 7)`.
   * Exceptions: None.
   */
  readonly heading: string;
  /**
   * The lines under the heading.
   *
   * Contract: Never empty.
   * When to use: Below the heading.
   * Expected outcome: One head line per agreement followed by its detail lines, or a single no-match line.
   * Exceptions: None.
   */
  readonly lines: readonly AgreementTooltipLine[];
}

/**
 * Arguments of `agreementCellTooltip`.
 *
 * Contract: All fields are required.
 * When to use: Building one tooltip.
 * Expected outcome: Read by `agreementCellTooltip` only.
 * Exceptions: None.
 */
export interface AgreementTooltipArgs {
  /**
   * The commander whose row was hovered.
   *
   * Contract: A seat id.
   * When to use: The heading.
   * Expected outcome: Named with `nameOf`.
   * Exceptions: None.
   */
  readonly rowSeatId: string;
  /**
   * The turn of the hovered cell.
   *
   * Contract: A whole turn number.
   * When to use: The heading.
   * Expected outcome: Printed in the heading.
   * Exceptions: None.
   */
  readonly turn: number;
  /**
   * The hovered cell.
   *
   * Contract: A cell from `agreementStrip`.
   * When to use: The lines.
   * Expected outcome: Every item is listed.
   * Exceptions: None.
   */
  readonly cell: AgreementCell;
  /**
   * Gives a seat's display name.
   *
   * Contract: Returns non-empty text.
   * When to use: Naming sides.
   * Expected outcome: A name.
   * Exceptions: None.
   */
  readonly nameOf: (seatId: string) => string;
  /**
   * Turns side codes in commander text into names.
   *
   * Contract: A pure text function.
   * When to use: Printing terms and reasons.
   * Expected outcome: Text with names.
   * Exceptions: None.
   */
  readonly displayText: (text: string) => string;
}

/**
 * Builds a cell's full label.
 *
 * Purpose: Shows the active count, the proposed count, and a breach in a few characters.
 * When to use: Drawing a cell when the label fits.
 * Expected outcome: Empty for a cell with no active or proposed agreement, else the active count, then `+N` for proposals, then `!` for a breach.
 * Exceptions: None.
 */
export function agreementCellLabel(cell: AgreementCell): string {
  if (cell.activeCount === 0 && cell.proposedCount === 0) return '';
  const proposed = cell.proposedCount > 0 ? `+${cell.proposedCount}` : '';
  return `${cell.activeCount}${proposed}${cell.breached ? '!' : ''}`;
}

/**
 * Builds a cell's short label.
 *
 * Purpose: A narrow cell still shows the main number and a breach.
 * When to use: Drawing a cell when the full label does not fit.
 * Expected outcome: The active count plus `!` for a breach, or empty for a cell with no active or proposed agreement.
 * Exceptions: None.
 */
export function agreementCellShortLabel(cell: AgreementCell): string {
  if (cell.activeCount === 0 && cell.proposedCount === 0) return '';
  return `${cell.activeCount}${cell.breached ? '!' : ''}`;
}

/**
 * Writes the breach line parts of one item.
 *
 * Purpose: A breach has up to two causes, joined in one sentence.
 * When to use: For a breached item.
 * Expected outcome: A line such as `Breach this turn: destroyed 2 units of X by attack and decided to break it`.
 * Exceptions: None.
 */
function breachText(item: AgreementCellItem, counterpartName: string): string {
  const parts: string[] = [];
  if (item.unitsDestroyedByAttack > 0) {
    const noun = item.unitsDestroyedByAttack === 1 ? 'unit' : 'units';
    parts.push(`destroyed ${item.unitsDestroyedByAttack} ${noun} of ${counterpartName} by attack`);
  }
  if (item.decidedBreakThisTurn) parts.push('decided to break it');
  return `Breach this turn: ${parts.join(' and ')}`;
}

/**
 * Writes every tooltip line of one agreement.
 *
 * Purpose: One agreement reads as a head line and its detail lines.
 * When to use: For each item of a cell.
 * Expected outcome: The head line, with `Agreement #N:` as its bold lead-in, then terms, zone, decision, breach, and counterpart lines as they apply, each as a bullet.
 * Exceptions: None.
 */
function itemLines(
  item: AgreementCellItem,
  nameOf: (seatId: string) => string,
  displayText: (text: string) => string,
): AgreementTooltipLine[] {
  const counterpartName = nameOf(item.counterpartSeatId);
  const against = item.againstSeatId === null ? '' : `, against ${nameOf(item.againstSeatId)}`;
  const head = `${SIDE_AGREEMENT_KIND_LABELS[item.kind]} with ${counterpartName}, `
    + `turns ${item.startTurn} to ${item.endTurn}, ${item.standing}, intent: ${SIDE_AGREEMENT_INTENT_LABELS[item.intent]}${against}`;
  const lines: string[] = [`Terms: ${displayText(item.terms)}`];
  if (item.zoneCodes.length > 0) lines.push(`Zone: ${item.zoneCodes.join(', ')}`);
  if (item.latestDecision) {
    const { turnNumber, decision, reason } = item.latestDecision;
    lines.push(`Decision on turn ${turnNumber}: ${decision}${reason === '' ? '' : `: ${displayText(reason)}`}`);
  }
  if (item.breached) lines.push(breachText(item, counterpartName));
  const record = item.counterpartRecord;
  if (record.kind === 'match') lines.push(`${counterpartName} records it as #${record.agreementId} (${record.standing})`);
  if (record.kind === 'none') lines.push(`${counterpartName} records no matching agreement`);
  return [
    { lead: `Agreement #${item.agreementId}:`, text: head, emphasis: true },
    ...lines.map((text) => ({ text, bullet: true, emphasis: false })),
  ];
}

/**
 * Builds the tooltip of a hovered cell.
 *
 * Purpose: Lists every matching agreement in readable text with display names, with no cap.
 * When to use: When the pointer rests on a cell of the agreements strip.
 * Expected outcome: A heading naming the commander and turn, then every item in the cell's order, or `No matching agreements.` for an empty cell.
 * Exceptions: None.
 */
export function agreementCellTooltip(args: AgreementTooltipArgs): AgreementTooltip {
  const { rowSeatId, turn, cell, nameOf, displayText } = args;
  const heading = `${nameOf(rowSeatId)} (turn ${turn})`;
  if (cell.items.length === 0) return { heading, lines: [{ text: 'No matching agreements.', emphasis: false }] };
  return { heading, lines: cell.items.flatMap((item) => itemLines(item, nameOf, displayText)) };
}
