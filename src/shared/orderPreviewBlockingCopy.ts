/**
 * Pure copy + classification for “Blocked: …” hover hints during march / ranged order preview.
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
 * When to use: `readyHandler` after `buildTurnUpdateBullets` + `buildCombatActivityFallbackBullets` for both strategic and tactical Ready.
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
 * Purpose: Ranged failures are already phrased as range vs mountain LOS in tactical and strategic validators.
 * When to use: Renderer hover while `rangedModeActive` and grouped validation failed.
 * Expected outcome: `Blocked: Range`, `Blocked: Mountain`, `Blocked: No Target` when there is no valid enemy target, or `null` for unrelated failures.
 * Exceptions: None.
 */
export function blockingHoverMessageFromRangedReason(reason: string): string | null {
  const r = reason.toLowerCase();
  if (r.includes('target out of range') || r.includes('out of ferry range')) return 'Blocked: Range';
  if (r.includes('line of sight blocked') || r.includes('blocked by mountains')) return 'Blocked: Mountain';
  if (r.includes('no enemy') || r.includes('no eligible')) return 'Blocked: No Target';
  return null;
}

/**
 * Derives the air-strike validation hover string from `validateGroupAirStrikeTarget` failure reasons (strategic range only).
 *
 * Purpose: Air strikes do not use terrain-block hover copy; strategic strikes still fail on `isWithinAirStrikeGridRange`
 * with the same `formatTargetOutOfRangeReason` phrasing as other unit types.
 * When to use: Renderer hover while `airStrikeModeActive` and grouped strike validation failed.
 * Expected outcome: `Blocked: Range` when the reason is out-of-strike-range; `null` for all other failures (footprint, payload, etc.).
 * Exceptions: None.
 */
export function blockingHoverMessageFromAirStrikeReason(reason: string): string | null {
  const r = reason.toLowerCase();
  if (r.includes('target out of range')) return 'Blocked: Range';
  return null;
}

/**
 * Derives the march-preview hover string from `previewHumanMarchOrders` / tactical planner `invalidReason` text.
 *
 * Purpose: March preview strings mix movement rules, terrain vocabulary, and generic unreachable messages; this
 * collapses them into the two buckets the UI shows (`Blocked: Range` vs `Blocked: <Terrain>`).
 * When to use: Renderer hover while movement planning shows `showInvalidMarker` on the grouped envelope or per-unit preview.
 * Expected outcome: Prefer explicit out-of-range / ferry-range copy; otherwise use `hoveredTerrainKind` for generic blocks.
 * Exceptions: Returns `null` when `invalidReason` is empty or clearly non-terrain (e.g. database errors).
 */
export function blockingHoverMessageFromMarchInvalidReason(
  invalidReason: string,
  hoveredTerrainKind: string | null
): string | null {
  if (!invalidReason) return null;
  const low = invalidReason.toLowerCase();
  if (low.includes('database not initialized') || low.includes('unavailable') || low.includes('no selected units')) {
    return null;
  }
  if (low.includes('out of range') || low.includes('out of ferry range')) return 'Blocked: Range';
  if (low.includes('line of sight blocked') || low.includes('blocked by mountains')) return 'Blocked: Mountain';
  if (low.includes('arctic')) return 'Blocked: Arctic';
  if (low.includes('cannot move directly from one water') || (low.includes('water') && low.includes('cannot')))
    return 'Blocked: Water';
  if (low.includes('mountain')) return 'Blocked: Mountain';
  if (hoveredTerrainKind) {
    if (
      low.includes('no valid tactical route') ||
      low.includes('unreachable') ||
      low.includes('invalid for this unit type') ||
      low.includes('outside tactical footprint') ||
      low.includes('mixed land/naval')
    ) {
      return `Blocked: ${titleCaseTerrainKindToken(hoveredTerrainKind)}`;
    }
  }
  return null;
}
