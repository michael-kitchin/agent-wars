import { escapeHtmlForOrderPreviewTooltip } from './orderPreviewSlowTerrainTooltip';
import { formatTerrainNameListHtml } from './terrainSwatchHtml';
import { LAND_UNIT_DESTINATION_NOT_LANDMASS_REASON } from './landTraversalStrategic';
import {
  NAVAL_DESTINATION_NOT_OCCUPIABLE_REASON,
  STRATEGIC_DESTINATION_UNREACHABLE_REASON,
  TACTICAL_DESTINATION_BLOCKS_ENTRY_REASON,
} from './marchInvalidReasons';
import { FORTIFIED_CELL_BLOCKED_HOVER, FORTIFIED_CELL_BLOCKED_REASON } from './fortificationRules';
import { ARMOR_MOVE_ENDS_ON_ENTER_REASON } from './strategicTerrainFlags';

/**
 * Pure copy + classification for “Blocked: …” hover hints during march / ranged / air-strike order preview.
 *
 * Purpose: Keeps renderer and any future callers aligned on how validation `reason` / `invalidReason` strings map to
 * short user-facing labels without importing renderer-only modules.
 * When to use: `refreshHoverRoutePreview` and related UI when drawing invalid march, ranged, or air-strike hover targets.
 * Expected outcome: Deterministic `Blocked: Range`, `Blocked: <Terrain>` (march/ranged only), or `null` when the failure is not classified.
 * Exceptions: None.
 */

const MELEE_ENGAGEMENT_LINE = /^\u2022 Melee engagements at \d+ hex(es)?\.\s*$/;
const RANGED_ENGAGEMENT_LINE = /^\u2022 Ranged engagements at \d+ hex(es)?\.\s*$/;

/**
 * Merges primary Ready toast lines with combat-activity fallback lines so tactical and strategic share one policy.
 *
 * Purpose: Suppresses low-signal “engagement count only” fallback toasts (inconclusive melee/ranged with no casualties
 * and no primary summary lines) that strategic Ready rarely surfaces alone; keeps tactical parity with that UX.
 * When to use: `readyHandler` after `buildConsolidatedTurnUpdateToastMessage` / `buildCombatActivityFallbackBullets` for both strategic and tactical Ready.
 * Expected outcome: Primary lines win when present; otherwise fallback unless every line is only ranged/melee engagement counters.
 * Exceptions: None.
 */
export function composeResolutionMapToastBullets(primary: string[], combatFallback: string[]): string[] {
  if (primary.length > 0) return primary;
  if (combatFallback.length === 0) return [];
  const onlyEngagementCounters = combatFallback.every(
    (line) => MELEE_ENGAGEMENT_LINE.test(line) || RANGED_ENGAGEMENT_LINE.test(line)
  );
  if (onlyEngagementCounters) return [];
  return combatFallback;
}

/**
 * Title-cases a GIS `terrain_kind` token (or coarse `terrain`) for a short “Blocked:” suffix.
 *
 * Purpose: Matches sidebar / tooltip wording conventions (`Mountain`, `Urban`, …).
 * When to use: After resolving the hovered destination cell’s dominant kind from snapshot or game state.
 * Expected outcome: Non-empty ASCII label; `unknown` becomes `Unknown`.
 * Exceptions: None.
 */
export function titleCaseTerrainKindToken(kind: string): string {
  const k = kind.trim();
  if (!k) return 'Unknown';
  if (k.length === 1) return k.toUpperCase();
  return k.charAt(0).toUpperCase() + k.slice(1).toLowerCase();
}

/**
 * Derives the ranged-validation hover string from a main-process `validateGroupRangedTarget` failure reason.
 *
 * Purpose: Ranged failures are phrased as range vs mountain LOS vs empty target; range uses `formatTargetOutOfRangeReason` / `Target out of range.` across unit types.
 * When to use: Renderer hover while `rangedModeActive` and grouped validation failed.
 * Expected outcome: Any out-of-range failure → `Blocked: Range`; mountain LOS → `Blocked: Mountain`; no enemies → `Blocked: No Target`; else `null`.
 * Exceptions: None.
 */
export function blockingHoverMessageFromRangedReason(reason: string): string | null {
  const r = reason.toLowerCase();
  // Strategic `formatTargetOutOfRangeReason`, tactical `Target out of range.`, and any future copy using "out of range".
  // Keep `out of ferry range` separately — it does not contain the contiguous substring `out of range`.
  if (r.includes('out of range') || r.includes('out of ferry range')) return 'Blocked: Range';
  if (r.includes('line of sight blocked') || r.includes('blocked by mountains')) return 'Blocked: Mountain';
  if (r.includes('no enemy') || r.includes('no eligible')) return 'Blocked: No Target';
  return null;
}

/**
 * Strips a single leading `Label: ` prefix from validator copy so pattern matching works for grouped `Unit: reason` lines.
 *
 * Purpose: `validateGroupAirStrikeTarget` and similar prepend a per-unit display label; hover hints classify the failure, not the label.
 * When to use: First step inside `blockingHoverMessageFromAirStrikeReason` before lowercase keyword checks.
 * Expected outcome: Trimmed tail after the first `": "` when present; otherwise the original trimmed string.
 * Exceptions: None.
 */
function stripLeadingUnitLabelForStrikeReason(reason: string): string {
  const t = reason.trim();
  const m = t.match(/^[^:]+:\s+(.+)$/s);
  return m?.[1]?.trim() ? m[1]!.trim() : t;
}

/**
 * Derives the air-strike validation hover string from `validateGroupAirStrikeTarget` failure reasons (strategic + tactical).
 *
 * Purpose: Surfaces `Blocked: …` for every substantive strike failure so hover matches invalid strike previews (not only range).
 * When to use: Renderer hover while `airStrikeModeActive` and grouped strike validation failed.
 * Expected outcome: Short `Blocked: …` bucket per failure kind; `null` only for suppressed infra noise (e.g. DB unavailable).
 * Exceptions: None.
 */
export function blockingHoverMessageFromAirStrikeReason(reason: string): string | null {
  const raw = reason.trim();
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (r.includes('database not initialized')) return null;

  const tail = stripLeadingUnitLabelForStrikeReason(raw).toLowerCase();

  if (tail.includes('target out of range') || r.includes('target out of range')) return 'Blocked: Range';

  if (
    tail.includes('must be based at an intact airport') ||
    tail.includes('based at an intact airport to strike')
  ) {
    return 'Blocked: No base airport';
  }
  if (tail.includes('outside the tactical battle footprint')) return 'Blocked: Unit outside battle area';
  if (tail.includes('target is outside the tactical battle')) return 'Blocked: Target outside battle';
  if (tail.includes('contested strategic hex')) return 'Blocked: Strike wrong hex';
  if (tail.includes('unit not in tactical battle')) return 'Blocked: Unit not in battle';
  if (tail.includes('only air units can strike')) return 'Blocked: Not an air unit';
  if (tail.includes('no enemy units')) return 'Blocked: No enemies at target';
  if (tail.includes('no urban infrastructure')) return 'Blocked: No urban at target';
  if (tail.includes('target hex has no airport')) return 'Blocked: No airport at target';
  if (tail.includes('target hex has no seaport')) return 'Blocked: No seaport at target';
  if (tail.includes('not on map')) return 'Blocked: Hex not on map';
  if (tail.includes('only air units can execute strikes')) return 'Blocked: Not an air unit';
  if (tail.includes('must belong to')) return 'Blocked: Wrong owner';

  return 'Blocked: Cannot strike here';
}

/**
 * Derives the march-preview hover string from `previewHumanMarchOrders` / tactical planner `invalidReason` text.
 *
 * Purpose: March preview strings mix movement rules, terrain vocabulary, a fortified cell, and generic unreachable messages.
 * An entry block names the hovered terrain. A fortified cell says `Blocked: Fortified`. Every other illegal march says `Blocked: Unreachable`.
 * When to use: Renderer hover while movement planning shows `showInvalidMarker` on the grouped envelope or per-unit preview.
 * Expected outcome: An entry block names the hovered terrain. `FORTIFIED_CELL_BLOCKED_REASON` returns `Blocked: Fortified`. Every other illegal march, including a missing route and a cell outside the battle, says `Blocked: Unreachable`.
 * Exceptions: Returns `null` when `invalidReason` is empty or clearly non-terrain (e.g. database errors).
 */
export function blockingHoverMessageFromMarchInvalidReason(
  invalidReason: string,
  hoveredTerrainKind: string | null
): string | null {
  if (!invalidReason) return null;
  if (invalidReason === FORTIFIED_CELL_BLOCKED_REASON) return FORTIFIED_CELL_BLOCKED_HOVER;
  if (
    invalidReason === TACTICAL_DESTINATION_BLOCKS_ENTRY_REASON ||
    invalidReason === NAVAL_DESTINATION_NOT_OCCUPIABLE_REASON ||
    invalidReason === LAND_UNIT_DESTINATION_NOT_LANDMASS_REASON
  ) {
    return blockedTerrainOrUnreachable(hoveredTerrainKind);
  }
  if (invalidReason === ARMOR_MOVE_ENDS_ON_ENTER_REASON) return 'Blocked: Unreachable';
  const low = invalidReason.toLowerCase();
  if (low.includes('database not initialized') || low.includes('unavailable') || low.includes('no selected units')) {
    return null;
  }
  if (low.includes('out of range') || low.includes('out of ferry range')) return 'Blocked: Range';
  if (low.includes('ferry destination must be a human-controlled airport')) return 'Blocked: Invalid';
  if (low.includes('ferry destination must have an intact airport')) return 'Blocked: Invalid';
  if (low.includes('destination airport is not intact')) return 'Blocked: Invalid';
  if (low.includes('origin airport is not intact')) return 'Blocked: Invalid';
  if (low.includes('air units do not use tactical march')) return 'Blocked: Air — use strike mode or ferry (dbl-click)';
  if (low.includes('line of sight blocked') || low.includes('blocked by mountains')) return 'Blocked: Mountain';
  if (low.includes('land, coastal, or wetlands')) return 'Blocked: Coastal, Land, Wetlands';
  if (low.includes('mixed land/naval')) return 'Blocked: Coastal';
  if (
    low.includes('cannot move directly from one water or arctic') ||
    low.includes('one water or arctic hex to another')
  ) {
    return 'Blocked: Arctic, Water';
  }
  if (low.includes('arctic')) return 'Blocked: Arctic';
  if (low.includes('cannot move directly from one water') || (low.includes('water') && low.includes('cannot')))
    return 'Blocked: Water';
  if (low.includes('mountain')) return 'Blocked: Mountain';
  if (
    invalidReason === 'No valid tactical route' ||
    invalidReason === STRATEGIC_DESTINATION_UNREACHABLE_REASON ||
    invalidReason === 'Outside tactical footprint'
  ) {
    return 'Blocked: Unreachable';
  }
  return null;
}

/**
 * Names the hovered terrain, or Unreachable when that kind is missing.
 *
 * Purpose: An entry block needs a terrain word. A missing kind must not invent one.
 * When to use: After an exact entry-block reason match.
 * Expected outcome: `Blocked:` plus the title-cased kind, or `Blocked: Unreachable`.
 * Exceptions: None.
 */
function blockedTerrainOrUnreachable(hoveredTerrainKind: string | null): string {
  if (!hoveredTerrainKind) return 'Blocked: Unreachable';
  return `Blocked: ${titleCaseTerrainKindToken(hoveredTerrainKind)}`;
}

/**
 * Converts a plain `Blocked: …` hover line into minimal HTML (`Blocked:` label in bold, suffix escaped).
 *
 * Purpose: Matches order-slower tooltip styling while keeping `#order-block-tooltip` on `innerHTML` with safe markup.
 * When to use: Renderer `showOrderBlockHexTooltip` after `resolveOrderBlockHexTooltipMessage` returns a blocking string.
 * Expected outcome: `<strong>Blocked:</strong> Range` for `Blocked: Range`. A map-key terrain name in the suffix gets a swatch. Other input is escaped.
 * Exceptions: None; empty string yields empty string.
 */
export function blockingHoverMessageHtmlFromPlainMessage(message: string): string {
  const t = message.trim();
  const m = t.match(/^blocked:\s*(.*)$/i);
  if (!m) return escapeHtmlForOrderPreviewTooltip(t);
  return `<strong>Blocked:</strong> ${formatTerrainNameListHtml(m[1]!.trim())}`;
}
