/**
 * Markdown tables that accompany the operational ASCII map (Best Options This Turn, footnotes).
 *
 * Purpose: Compact briefing tables using stable hex codes instead of lat/lng.
 * When to use: After possible-actions row collection and hex registry initialization.
 * Expected outcome: GFM tables suitable for direct injection into Commander briefings.
 * Exceptions: None for empty inputs (returns empty fragments).
 */

import { buildPromptTableLines } from '../../promptTableUtils';
import { logDebug, logTrace } from '../../logger';
import type { PossibleActionTableRow } from '../../openrouter/possibleUnitActionsTableAssembly';
import { deriveThisTurnOptionsActionColumn, selectTopRowsPerUnit } from '../../openrouter/possibleUnitActionsTableAssembly';
import type { CoordinateContext } from './coordinateContext';
import { h3ToCode } from './hex-code-translator';

/**
 * Defines the `infrastructureCellForThisTurnOptionsRow` function shape (function infrastructureCellForThisTurnOptionsRow(r: PossibleActionTableRow): string).

 * Purpose: Builds the **Target Infrastructure** column for the **Best Options This Turn** table from `featuresSummary`, stripping air-strike-only `; strike: …` suffixes so strike kinds stay out of that column.
 * When to use: Only from `renderThisTurnOptionsTableMarkdown` per body row.
 * Expected outcome: Pipe-safe text, or `—` when nothing remains after trim/strip.
 * Exceptions: None.
 */
function infrastructureCellForThisTurnOptionsRow(r: PossibleActionTableRow): string {
  let s = r.featuresSummary.replace(/\|/g, ' ');
  if (deriveThisTurnOptionsActionColumn(r) === 'air strike') {
    const cut = s.indexOf('; strike:');
    if (cut >= 0) s = s.slice(0, cut);
  }
  s = s.trim();
  return s.length > 0 ? s : '—';
}

/**
 * Renders the consolidated **Best Options This Turn** table from aggregated possible-action rows.
 *
 * Purpose: Single high-signal table replacing multi-bucket possible-actions markdown.
 * When to use: After `collectAggregatedPossibleActionRows`.
 * Expected outcome: Columns `Unit ID`, `Action`, `Target Hexes`, `Target Units` (enemy summary only), `Target Infrastructure` (hex features; air-strike rows omit `; strike: …`); at most five rows per unit; one target hex per row.
 * Exceptions: Propagates `h3ToCode` failures for unknown tactical/strategic cells.
 */
export function renderThisTurnOptionsTableMarkdown(
  rows: PossibleActionTableRow[],
  latLngByH3: Map<string, [number, number]>,
  context: CoordinateContext
): string {
  logDebug('briefing-tables renderThisTurnOptionsTableMarkdown', { rowCount: rows.length, mode: context.mode });
  if (rows.length === 0) return '';
  const capped = selectTopRowsPerUnit(rows, latLngByH3);
  const body = capped.map((r) => {
    const hex = h3ToCode(r.targetH3, context);
    const action = deriveThisTurnOptionsActionColumn(r);
    const targetUnits = r.enemySummary.replace(/\|/g, ' ');
    const infrastructure = infrastructureCellForThisTurnOptionsRow(r);
    return [r.unitId, action, hex, targetUnits, infrastructure];
  });
  const lines = buildPromptTableLines(
    ['Unit ID', 'Action', 'Target Hexes', 'Target Units', 'Target Infrastructure'],
    body
  );
  return `${lines.join('\n')}\n`;
}

/**
 * Renders the displaced-features footnote line for the operational map.
 *
 * Purpose: Recovers infrastructure letters hidden by presence markers, per plan.
 * When to use: When `renderHexAsciiMap` returns non-empty `displacedFeatures`.
 * Expected outcome: Single-line compact footnote or an empty string.
 * Exceptions: None.
 */
export function renderDisplacedFeaturesLine(
  displaced: Array<{ code: string; feature: string }>
): string {
  logTrace('briefing-tables renderDisplacedFeaturesLine', { count: displaced.length });
  if (displaced.length === 0) return '';
  const inner = displaced.map((d) => `${d.code}(${d.feature})`).join(', ');
  return `Units at featured hexes: ${inner}\n`;
}
