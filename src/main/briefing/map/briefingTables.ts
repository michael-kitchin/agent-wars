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
 * Merges option rows that offer the identical action and target into one row listing every unit that shares it.
 *
 * Purpose: Units stacked on one hex each produce the same handful of options, so the per-unit table repeats itself
 * once per unit. A captured turn listed 518 rows carrying only 67 distinct options, and that redundancy dominated the
 * prompt. Collapsing it keeps every unit addressable while cutting the block to roughly a quarter of its size.
 * When to use: `renderThisTurnOptionsTableMarkdown`, after the per-unit cap has already chosen which options survive.
 * Expected outcome: One entry per distinct `(action, hex, target units, infrastructure)` tuple, in first-appearance
 * order, with `unitIds` in the order those units were encountered so the table stays stable turn to turn.
 * Exceptions: None.
 */
function groupThisTurnOptionRowsByTarget(
  rows: readonly { unitId: string; action: string; hex: string; targetUnits: string; infrastructure: string }[]
): Array<{ unitIds: string[]; action: string; hex: string; targetUnits: string; infrastructure: string }> {
  const byTarget = new Map<
    string,
    { unitIds: string[]; action: string; hex: string; targetUnits: string; infrastructure: string }
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
 * Expected outcome: Columns `Unit IDs`, `Action`, `Target Hexes`, `Target Units` (enemy summary only), `Target Infrastructure` (hex features; an air-strike row drops text from `; strike:` onward when that suffix is present); at most five target hexes per unit, with each distinct action on a hex kept as its own row; units sharing an identical option are listed together in `Unit IDs`.
 * Exceptions: Propagates `h3ToCode` failures for unknown tactical/strategic cells.
 */
export function renderThisTurnOptionsTableMarkdown(
  rows: PossibleActionTableRow[],
  latLngByH3: Map<string, [number, number]>,
  context: CoordinateContext
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
  const body = grouped.map((g) => [g.unitIds.join(', '), g.action, g.hex, g.targetUnits, g.infrastructure]);
  const lines = buildPromptTableLines(
    ['Unit IDs', 'Action', 'Target Hexes', 'Target Units', 'Target Infrastructure'],
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
