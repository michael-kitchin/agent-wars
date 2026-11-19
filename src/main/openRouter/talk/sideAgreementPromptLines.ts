/**
 * Prints a commander's agreement views as prompt lines.
 *
 * Purpose: The talk situation text and the strategic orders Messages section show agreements in one format.
 * When to use: After `readSideAgreementViews`.
 * Expected outcome: Pure text. Double quotes in terms and reasons become single quotes, so a quoted field stays one field.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import type { SideAgreementView } from '../../sideAgreements/sideAgreementLedger';
import type { SideAgreementStanding } from '../../../shared/sideAgreements';

/**
 * Replaces double quotes so a quoted field stays one field.
 *
 * Purpose: Terms and reasons come from a model reply and are printed inside double quotes.
 * When to use: Printing terms and a decision reason.
 * Expected outcome: The text with every `"` replaced by `'`.
 * Exceptions: None.
 */
function singleQuoted(text: string): string {
  return text.replace(/"/g, "'");
}

/**
 * Words the standing of one agreement.
 *
 * Purpose: Closed and expired agreements say how they ended.
 * When to use: The head of a line.
 * Expected outcome: The text from the standing table of the prompt.
 * Exceptions: None.
 */
function standingText(standing: SideAgreementStanding, view: SideAgreementView): string {
  switch (standing) {
    case 'expired':
      return `expired after turn ${view.endTurn}`;
    case 'lapsed':
      return `lapsed because ${view.counterpartCode} is out of the match`;
    case 'broken_by_them':
      return `broken by ${view.counterpartCode}`;
    case 'broken_by_me':
      return 'broken by you';
    default:
      return standing;
  }
}

/**
 * Prints one view as a bullet, with its evidence on a second line.
 *
 * Purpose: One agreement per bullet.
 * When to use: `formatSideAgreementLines`, once per view.
 * Expected outcome: The head, intent, terms, optional zone and against parts, and optional decision, then the evidence line when there is one.
 * Exceptions: None.
 */
function formatSideAgreementLine(view: SideAgreementView): string {
  const parts = [
    `- Agreement ${view.agreementId} with ${view.counterpartLabel} (${view.counterpartCode}): ${view.kind}, turns ${view.startTurn} to ${view.endTurn}, ${standingText(view.standing, view)}.`,
    `Your intent: ${view.intent}.`,
    `Terms: "${singleQuoted(view.terms)}"`,
  ];
  if (view.zoneCodes.length > 0) parts.push(`Zone: ${view.zoneCodes.join(', ')}.`);
  if (view.againstCode !== null) parts.push(`Against: ${view.againstLabel} (${view.againstCode}).`);
  if (view.decision !== null) {
    const { turnNumber, decision, reason } = view.decision;
    parts.push(
      reason.length > 0
        ? `Your decision on turn ${turnNumber}: ${decision}, "${singleQuoted(reason)}"`
        : `Your decision on turn ${turnNumber}: ${decision}.`
    );
  }
  const line = parts.join(' ');
  return view.evidence !== null ? `${line}\n  ${view.evidence}` : line;
}

/**
 * Prints every agreement view as prompt lines.
 *
 * Purpose: The commander reads its own record, with the game's evidence under each open agreement.
 * When to use: The Your agreements section of the talk situation text and the Messages section of the strategic orders prompt.
 * Expected outcome: `- None.` for no views. Otherwise one bullet per view, joined by newlines.
 * Exceptions: None.
 */
export function formatSideAgreementLines(views: readonly SideAgreementView[]): string {
  logTrace('sideAgreementPromptLines formatSideAgreementLines', { viewCount: views.length });
  if (views.length === 0) return '- None.';
  return views.map(formatSideAgreementLine).join('\n');
}
