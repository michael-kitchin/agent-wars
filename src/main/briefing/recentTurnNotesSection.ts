/**
 * Builds recent turn notes markdown for AI system prompts from persisted history.
 */

import {
  formatPlayerLossInline,
  parsePlayerLossSummaryJson,
  playerHasAnyLoss,
} from '../../shared/lossSummary';
import { getRecentTurnNotes, type TurnNoteRow, type TurnNotesScope } from '../gameDb';
import { logTrace } from '../logger';

/**
 * Arguments for assembling a recent turn notes prompt section.
 */
export interface BuildRecentTurnNotesSectionArgs {
  /**
   * Strategic or tactical scope for the query window.
   *
   * Contract: Must match rows written by consultation and resolution capture.
   * When to use: Strategic briefing and tactical operational map prompts.
   * Expected outcome: Only rows for this scope and battle id are read.
   * Exceptions: None.
   */
  scope: TurnNotesScope;
  /**
   * Tactical battle id; empty string for strategic prompts.
   *
   * Contract: Matches `turn_notes_history.battle_id`.
   * When to use: Tactical turn notes; omit battle id only for strategic scope.
   * Expected outcome: Isolates tactical history per battle.
   * Exceptions: None.
   */
  battleId: string;
  /**
   * Current planning turn or beat number (notes strictly before this value are included).
   *
   * Contract: Strategic `state.turnNumber` or `tacticalBattle.tacticalTurnNumber`.
   * When to use: At prompt assembly time before the turn being planned resolves.
   * Expected outcome: First turn yields empty section (no prior rows).
   * Exceptions: None.
   */
  currentTurnNumber: number;
  /**
   * Markdown heading for the section (e.g. `Recent Turn Notes`).
   *
   * Contract: H2 title without leading `##`; added by this builder.
   * When to use: Strategic and tactical prompt variants (both use `Recent Turn Notes`).
   * Expected outcome: Rendered as `## {heading}` when section is non-empty.
   * Exceptions: None.
   */
  heading: string;
}

/**
 * Formats strategy text for prompt bullets, using `(none)` when empty.
 *
 * Purpose: Keeps recent-turn notes readable when the AI omitted strategy.
 * When to use: Inside per-turn block formatting.
 * Expected outcome: Trimmed strategy or the literal `(none)`.
 * Exceptions: None.
 */
function strategyDisplayText(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : '(none)';
}

/**
 * Returns whether a persisted row should appear in the recent-turn prompt section.
 *
 * Purpose: Suppresses turns with no strategy and no losses on either side.
 * When to use: After loading rows from `getRecentTurnNotes`.
 * Expected outcome: False for turns with no content; true when any field has content.
 * Exceptions: None.
 */
function rowHasPromptContent(row: TurnNoteRow): boolean {
  const strategy = row.strategyText?.trim() ?? '';
  const human = parsePlayerLossSummaryJson(row.humanLossJson);
  const ai = parsePlayerLossSummaryJson(row.aiLossJson);
  return strategy.length > 0 || playerHasAnyLoss(human) || playerHasAnyLoss(ai);
}

/**
 * Formats one turn block with Strategy and optional loss bullets.
 *
 * Purpose: Emits the per-entry shape inside Recent Turn Notes sections for both strategic and tactical scopes.
 * When to use: For each qualifying row returned from the DB query.
 * Expected outcome: Multiline block starting with `Turn N:`.
 * Exceptions: None.
 */
function formatTurnBlock(row: TurnNoteRow): string {
  const label = `Turn ${row.turnNumber}`;
  const lines: string[] = [`${label}:`];
  lines.push(`- Strategy: ${strategyDisplayText(row.strategyText)}`);
  const human = parsePlayerLossSummaryJson(row.humanLossJson);
  const ai = parsePlayerLossSummaryJson(row.aiLossJson);
  const humanInline = formatPlayerLossInline(human);
  const aiInline = formatPlayerLossInline(ai);
  if (humanInline.length > 0) lines.push(`- Human Losses: ${humanInline}`);
  if (aiInline.length > 0) lines.push(`- AI Losses: ${aiInline}`);
  return lines.join('\n');
}

/**
 * Builds the recent turn notes markdown block for AI prompts.
 *
 * Purpose: Replaces the legacy losses-since-consultation table with rolling three-entry history.
 * When to use: Strategic `formatBriefing` and tactical block in `requestOrdersFlow` (both use `Turn N:` labels).
 * Expected outcome: Empty string when no qualifying prior turns; otherwise `## heading` plus per-turn bullets.
 * Exceptions: None.
 */
export function buildRecentTurnNotesSection(args: BuildRecentTurnNotesSectionArgs): string {
  logTrace('recentTurnNotesSection buildRecentTurnNotesSection', {
    scope: args.scope,
    battleId: args.battleId,
    currentTurnNumber: args.currentTurnNumber,
  });
  const rows = getRecentTurnNotes(args.scope, args.battleId, args.currentTurnNumber, 3).filter(rowHasPromptContent);
  if (rows.length === 0) return '';
  const blocks = rows.map((row) => formatTurnBlock(row));
  return `## ${args.heading}\n\n${blocks.join('\n\n')}`;
}
