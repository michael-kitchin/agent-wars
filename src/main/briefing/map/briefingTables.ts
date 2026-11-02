/**
 * Markdown tables that accompany the operational ASCII map (Best Options This Turn, footnotes).
 *
 * Purpose: Compact briefing tables using stable hex codes instead of lat/lng.
 * When to use: After possible-actions row collection and hex registry initialization.
 * Expected outcome: GFM tables suitable for direct injection into Commander briefings.
 * Exceptions: None for empty inputs (returns empty fragments).
 */

import { buildPromptTableLines } from '../../promptTableHelpers';
import { logDebug, logTrace } from '../../logger';
import type { PossibleActionTableRow } from '../../openRouter/possibleUnitActionsTableAssembly';
import { bestOptionsActionLabels, selectTopRowsPerUnit } from '../../openRouter/possibleUnitActionsTableAssembly';
import type { BestOptionsOddsRow } from './bestOptionsOdds';
import type { CoordinateContext } from './coordinateContext';
import { h3ToCode } from './hexCodeTranslator';
import { SECTION_TITLE_BEST_OPTIONS_THIS_TURN } from '../../openRouter/promptSpec/sectionHeadings';

/**
 * Builds the Target Infrastructure cell for one Best Options action.
 *
 * Purpose: Keeps a combined air-strike cell down to its infrastructure text, and keeps pipe characters from splitting the markdown table on every row.
 * When to use: From `renderThisTurnOptionsTableMarkdown`, once per expanded action label. `action` is that label.
 * Expected outcome: `featuresSummary` with `|` replaced by spaces. When `action` is `air strike` and the text contains `; strike:`, that suffix is removed. A cell with no `; strike:` suffix is otherwise unchanged. `—` when nothing remains.
 * Exceptions: None.
 */
function infrastructureCellForThisTurnOptionsRow(r: PossibleActionTableRow, action: string): string {
  let s = r.featuresSummary.replace(/\|/g, ' ');
  if (action === 'air strike') {
    const cut = s.indexOf('; strike:');
    if (cut >= 0) s = s.slice(0, cut);
  }
  s = s.trim();
  return s.length > 0 ? s : '—';
}

/**
 * Merges option rows that offer the same action and target into one row listing every unit that shares it.
 *
 * Purpose: Stacked units repeat the same options. Collapsing them keeps every unit addressable, and keeps `targetH3` for the odds call.
 * When to use: After the per-unit cap has chosen which options survive.
 * Expected outcome: One entry per distinct action, hex, target text, and infrastructure, in first-appearance order. `targetH3` is the first row's cell.
 * Exceptions: None.
 */
function groupThisTurnOptionRowsByTarget(
  rows: readonly { unitId: string; action: string; hex: string; targetH3: string; targetUnits: string; infrastructure: string }[]
): Array<{ unitIds: string[]; action: string; hex: string; targetH3: string; targetUnits: string; infrastructure: string }> {
  const byTarget = new Map<
    string,
    { unitIds: string[]; action: string; hex: string; targetH3: string; targetUnits: string; infrastructure: string }
  >();
  for (const row of rows) {
    const key = [row.action, row.hex, row.targetUnits, row.infrastructure].join('\u0000');
    const existing = byTarget.get(key);
    if (existing) {
      if (!existing.unitIds.includes(row.unitId)) existing.unitIds.push(row.unitId);
      continue;
    }
    byTarget.set(key, {
      unitIds: [row.unitId],
      action: row.action,
      hex: row.hex,
      targetH3: row.targetH3,
      targetUnits: row.targetUnits,
      infrastructure: row.infrastructure,
    });
  }
  return [...byTarget.values()];
}

/**
 * Renders the consolidated **Best Options This Turn** table from aggregated possible-action rows.
 *
 * Purpose: Single high-signal table replacing multi-bucket possible-actions markdown.
 * When to use: After `collectAggregatedPossibleActionRows`.
 * Expected outcome: Columns `Unit IDs`, `Action`, `Target Hexes`, `Target Units`, `Target Infrastructure`, and `Odds`. At most five target hexes per unit. An absent odds resolver fills Odds with an em dash.
 * Exceptions: Propagates `h3ToCode` failures for unknown tactical/strategic cells.
 */
const BEST_OPTIONS_ODDS_LINE =
  'Odds is the chance this row wipes out the defenders, and the chance you lose a unit, if every listed unit takes part. An em dash is not a fight, or it could not be estimated.';

export function renderThisTurnOptionsTableMarkdown(
  rows: PossibleActionTableRow[],
  latLngByH3: Map<string, [number, number]>,
  context: CoordinateContext,
  resolveOdds?: (row: BestOptionsOddsRow) => string
): string {
  logDebug('briefing-tables renderThisTurnOptionsTableMarkdown', {
    rowCount: rows.length,
    mode: context.mode,
    sectionTitle: SECTION_TITLE_BEST_OPTIONS_THIS_TURN,
  });
  if (rows.length === 0) return '';
  const capped = selectTopRowsPerUnit(rows, latLngByH3);
  const labeled = capped.flatMap((r) => {
    const hex = h3ToCode(r.targetH3, context);
    const targetUnits = r.enemySummary.replace(/\|/g, ' ');
    return bestOptionsActionLabels(r.actionTypes).map((action) => ({
      unitId: r.unitId,
      action,
      hex,
      targetH3: r.targetH3,
      targetUnits,
      infrastructure: infrastructureCellForThisTurnOptionsRow(r, action),
    }));
  });
  const grouped = groupThisTurnOptionRowsByTarget(labeled);
  logDebug('briefing-tables renderThisTurnOptionsTableMarkdown: grouped', {
    cappedRowCount: capped.length,
    groupedRowCount: grouped.length,
    mode: context.mode,
  });
  const body = grouped.map((g) => [
    g.unitIds.join(', '),
    g.action,
    g.hex,
    g.targetUnits,
    g.infrastructure,
    resolveOdds ? resolveOdds(g) : '—',
  ]);
  const lines = buildPromptTableLines(
    ['Unit IDs', 'Action', 'Target Hexes', 'Target Units', 'Target Infrastructure', 'Odds'],
    body
  );
  return `${lines.join('\n')}\n\n${BEST_OPTIONS_ODDS_LINE}\n`;
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
