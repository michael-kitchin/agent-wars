/**
 * Markdown tables that accompany the operational ASCII map (unit roster, Best Options This Turn, footnotes).
 *
 * Purpose: Phase 4 compact briefing tables using stable hex codes instead of lat/lng.
 * When to use: After possible-actions row collection and hex registry initialization.
 * Expected outcome: GFM tables suitable for direct injection into Commander briefings.
 * Exceptions: None for empty inputs (returns empty fragments).
 */

import { gridDistance, latLngToCell } from 'h3-js';
import type { GameStateSnapshot } from '../../gameDb';
import type { UnitAssessmentResult } from '../../precomputation';
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
 * Renders the unit roster table (one row per AI unit with nearest enemy summary).
 *
 * Purpose: Replaces scattered lat/lng unit rows with map-cross-referencing hex codes.
 * When to use: Commander briefing assembly for the opponent AI.
 * Expected outcome: Markdown table sorted by nearest-enemy distance ascending (nulls last).
 * Exceptions: Propagates `h3ToCode` failures if a unit's H3 is not registered for the active context.
 */
export function renderUnitRosterTableMarkdown(
  assessments: UnitAssessmentResult[],
  context: CoordinateContext
): string {
  logDebug('briefing-tables renderUnitRosterTableMarkdown', { rowCount: assessments.length, mode: context.mode });
  const header = '| Hex | Unit ID | Type | Standing order | Nearest enemy | Dist |';
  const sep = '|-----|---------|------|----------------|---------------|------|';
  const res = context.mode === 'strategic' ? 1 : 4;
  const decorated = assessments
    .map((a) => {
      const u = a.result.unit;
      const pos = u?.position;
      const h3 =
        Array.isArray(pos) && pos.length >= 2 && Number.isFinite(Number(pos[0])) && Number.isFinite(Number(pos[1]))
          ? latLngToCell(Number(pos[0]), Number(pos[1]), res)
          : undefined;
      const hex = h3 ? h3ToCode(h3, context) : '—';
      const type = typeof u?.type === 'string' ? u.type : '—';
      const order = summarizeStandingOrder(u?.currentStandingOrder as Record<string, unknown> | null | undefined, context);
      const nearest = a.result.nearbyEnemies?.[0];
      const nearestStr = nearest ? nearest.unitId : '—';
      const dist = nearest?.hexDistance != null ? String(nearest.hexDistance) : '—';
      return { distNum: nearest?.hexDistance ?? Number.POSITIVE_INFINITY, row: `| ${hex} | ${a.unitId} | ${type} | ${order} | ${nearestStr} | ${dist} |` };
    })
    .sort((a, b) => {
      if (a.distNum === b.distNum) return a.row.localeCompare(b.row);
      return a.distNum - b.distNum;
    });
  const lines = [header, sep, ...decorated.map((d) => d.row)];
  return `${lines.join('\n')}\n`;
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
/**
 * Renders a lightweight opponent roster for tactical footprints without precomputed assessments.
 *
 * Purpose: Tactical AI consultations may omit full precomputation; this still lists units with nearest enemies.
 * When to use: Tactical operational map section only.
 * Expected outcome: Same column shape as the strategic roster table for consistent LLM parsing.
 * Exceptions: Grid distance failures fall back to `—` for nearest enemy distance.
 */
export function renderTacticalOpponentRosterMarkdown(state: GameStateSnapshot, context: CoordinateContext): string {
  logDebug('briefing-tables renderTacticalOpponentRosterMarkdown', {
    unitCount: state.units.filter((u) => u.player === 'opponent').length,
  });
  const header = '| Hex | Unit ID | Type | Standing order | Nearest enemy | Dist |';
  const sep = '|-----|---------|------|----------------|---------------|------|';
  const enemies = state.units.filter((u) => u.player === 'human');
  const opponents = state.units.filter((u) => u.player === 'opponent').sort((a, b) => a.id.localeCompare(b.id));
  const lines: string[] = [];
  for (const u of opponents) {
    let best: { id: string; d: number } | null = null;
    for (const e of enemies) {
      try {
        const d = gridDistance(u.h3Index, e.h3Index);
        if (!best || d < best.d) best = { id: e.id, d };
      } catch {
        /* ignore */
      }
    }
    const hex = h3ToCode(u.h3Index, context);
    lines.push(`| ${hex} | ${u.id} | ${u.unitType} | — | ${best ? best.id : '—'} | ${best ? String(best.d) : '—'} |`);
  }
  return `${[header, sep, ...lines].join('\n')}\n`;
}

export function renderDisplacedFeaturesLine(
  displaced: Array<{ code: string; feature: string }>
): string {
  logTrace('briefing-tables renderDisplacedFeaturesLine', { count: displaced.length });
  if (displaced.length === 0) return '';
  const inner = displaced.map((d) => `${d.code}(${d.feature})`).join(', ');
  return `Units at featured hexes: ${inner}\n`;
}

function summarizeStandingOrder(order: Record<string, unknown> | null | undefined, context: CoordinateContext): string {
  if (!order) return '—';
  const type = typeof order.type === 'string' ? order.type.toUpperCase() : '';
  const dest = order.destination;
  if (Array.isArray(dest) && dest.length >= 2) {
    const lat = Number(dest[0]);
    const lng = Number(dest[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      try {
        const res = context.mode === 'strategic' ? 1 : 4;
        const h3 = latLngToCell(lat, lng, res);
        return `${type} → ${h3ToCode(h3, context)}`;
      } catch {
        return `${type} → ?`;
      }
    }
  }
  if (typeof order.targetUnitId === 'string') return `${type} → ${order.targetUnitId}`;
  return type || '—';
}
