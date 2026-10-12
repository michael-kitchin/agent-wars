/**
 * Shared primitives for assembling grouped human march hover previews (`HumanOrderGroupPreviewResult`).
 *
 * Purpose: Keeps strategic (`resolveHumanMarchOrderPreviews`) and tactical (`buildTacticalMarchHoverPreview`) aligned on
 * representative selection, envelope assembly, and movement-range aggregation without importing renderer/main code.
 * When to use: Any code path that builds grouped march preview payloads from selected unit ids and per-unit previews.
 * Expected outcome: Deterministic, first-wins de-duplication and stable `validForAll` / `showInvalidMarker` semantics.
 * Exceptions: None; callers supply already-filtered human unit rows where applicable.
 */

import type {
  HumanOrderGroupPreviewResult,
  HumanOrderGroupPreviewUnitResult,
  OrderPreviewTerrainImpact,
} from './ipc/humanOrderPreviewTypes';
import { sortSlowTerrainLabels } from './orderPreviewSlowTerrainTooltip';

/**
 * De-duplicates strategic march preview unit ids using the same rules as legacy strategic hover preview.
 *
 * Purpose: Preserves strategic `previewHumanMarchOrders` id de-duplication semantics during refactors.
 * When to use: Strategic hover preview assembly only.
 * Expected outcome: First occurrence order preserved; empty strings removed; ids are not trimmed.
 * Exceptions: None.
 */
export function uniqueStrategicMarchPreviewUnitIds(unitIds: readonly string[]): string[] {
  return [...new Set(unitIds.filter((id) => id.length > 0))];
}

/**
 * De-duplicates tactical march preview unit ids with trim + first-wins semantics.
 *
 * Purpose: Preserves tactical renderer hover preview id normalization during refactors.
 * When to use: Tactical grouped hover preview assembly only.
 * Expected outcome: Trimmed ids; first occurrence wins; whitespace-only ids dropped.
 * Exceptions: None.
 */
export function uniqueTacticalMarchPreviewUnitIds(unitIds: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of unitIds) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Picks one representative unit id per distinct origin hex (first seen wins).
 *
 * Purpose: Matches strategic/tactical stack preview behavior where one preview line is drawn per origin stack.
 * When to use: After resolving each selected unit's current origin `h3Index` (committed cell).
 * Expected outcome: Stable subset of ids suitable for `previews` array construction.
 * Exceptions: None.
 */
export function representativeMarchPreviewUnitIdsByOriginH3(
  rows: readonly { unitId: string; originH3: string }[]
): string[] {
  const byOrigin = new Map<string, string>();
  for (const row of rows) {
    if (!byOrigin.has(row.originH3)) byOrigin.set(row.originH3, row.unitId);
  }
  return Array.from(byOrigin.values());
}

/**
 * Resolves which unit ids receive per-unit march hover previews for a grouped selection.
 *
 * Purpose: Mixed land/naval stacks must preview every selected unit so `validForAll` reflects the whole selection;
 * homogeneous stacks keep one representative preview line per origin hex.
 * When to use: Strategic `resolveHumanMarchOrderPreviews` before building per-unit previews.
 * Expected outcome: All selected ids when `mixedLandAndNaval` is true; otherwise `representativeMarchPreviewUnitIdsByOriginH3`.
 * Exceptions: None.
 */
export function groupedStrategicMarchPreviewUnitIds(args: {
  rows: readonly { unitId: string; originH3: string }[];
  mixedLandAndNaval: boolean;
}): string[] {
  if (args.mixedLandAndNaval) {
    return args.rows.map((row) => row.unitId);
  }
  return representativeMarchPreviewUnitIdsByOriginH3(args.rows);
}

/**
 * Returns whether the selection contains both naval units and land combat units (infantry or armor).
 *
 * Purpose: Drives grouped march preview unit resolution for mixed land/naval stacks in strategic and tactical modes.
 * When to use: Before choosing representative vs all-unit preview ids for a grouped hover selection.
 * Expected outcome: `true` only when both domains are represented in the selection.
 * Exceptions: None.
 */
export function selectionHasMixedLandAndNaval(units: ReadonlyArray<{ unitType: string }>): boolean {
  const hasNaval = units.some((unit) => unit.unitType === 'naval');
  const hasLand = units.some((unit) => unit.unitType === 'infantry' || unit.unitType === 'armor');
  return hasNaval && hasLand;
}

const TACTICAL_MARCH_PREVIEW_TYPE_PRIORITY: Readonly<Record<string, number>> = {
  naval: 0,
  armor: 1,
  infantry: 2,
  air: 3,
};

/**
 * Picks one representative tactical sub-unit id per origin for march hover previews.
 *
 * Purpose: When infantry/armor share a tactical with a naval carrier, first-id-wins would often pick land units and
 * run §12.4 pathfinding as infantry/armor (land costs), producing long land previews and blocking water — the inverse of naval rules.
 * When to use: `groupedTacticalMarchPreviewUnitIds` for homogeneous tactical selections only; mixed land/naval uses all selected ids.
 * Expected outcome: Lowest numeric priority among `naval` → `armor` → `infantry` → `air` per `originH3`; ties keep the first seen id.
 * Exceptions: None; unknown `unitType` sorts after `air`.
 */
export function representativeTacticalMarchPreviewUnitIdsByOriginH3(
  rows: readonly { unitId: string; originH3: string; unitType: string }[]
): string[] {
  const best = new Map<string, { unitId: string; p: number }>();
  for (const row of rows) {
    const p = TACTICAL_MARCH_PREVIEW_TYPE_PRIORITY[row.unitType] ?? 99;
    const cur = best.get(row.originH3);
    if (!cur || p < cur.p) {
      best.set(row.originH3, { unitId: row.unitId, p });
    }
  }
  return Array.from(best.values()).map((v) => v.unitId);
}

/**
 * Resolves which sub-unit ids receive per-unit tactical march hover previews for a grouped selection.
 *
 * Purpose: Mixed land/naval stacks must preview every selected sub-unit so `validForAll` reflects the whole selection;
 * homogeneous stacks keep one representative preview per origin, preferring naval over land on the same tactical cell.
 * When to use: `buildTacticalMarchHoverPreview` before building per-unit previews.
 * Expected outcome: All selected ids when `mixedLandAndNaval` is true; otherwise `representativeTacticalMarchPreviewUnitIdsByOriginH3`.
 * Exceptions: None.
 */
export function groupedTacticalMarchPreviewUnitIds(args: {
  rows: readonly { unitId: string; originH3: string; unitType: string }[];
  mixedLandAndNaval: boolean;
}): string[] {
  if (args.mixedLandAndNaval) {
    return args.rows.map((row) => row.unitId);
  }
  return representativeTacticalMarchPreviewUnitIdsByOriginH3(args.rows);
}

/**
 * Computes the slowest per-turn movement range across a set of unit types using a shared range table.
 *
 * Purpose: Centralizes `Math.min(...MOVEMENT_RANGE_BY_UNIT_TYPE[...])` logic for grouped previews.
 * When to use: Strategic and tactical grouped hover preview envelopes.
 * Expected outcome: Minimum positive integer range among known types; `fallbackPerType` when a type is unknown.
 * Exceptions: Returns `0` when `unitTypes` is empty.
 */
/**
 * Unions per-row `orderPreviewTerrainImpact` values into one grouped envelope payload.
 *
 * Purpose: Multi-origin march hovers should list every slowing terrain encountered by any representative path, and surface road/rail if any path used it.
 * When to use: `buildHumanOrderGroupPreviewEnvelope` when the caller does not pass an explicit merged impact.
 * Expected outcome: Sorted unique `slower` labels; `roadRail` true if any row had it.
 * Exceptions: Returns `null` when no row contributes terrain or transport hints.
 */
export function mergeOrderPreviewTerrainImpactsFromPreviews(
  previews: readonly HumanOrderGroupPreviewUnitResult[]
): OrderPreviewTerrainImpact | null {
  const slower = new Set<string>();
  let roadRail = false;
  let road = false;
  let rail = false;
  for (const row of previews) {
    const imp = row.preview.orderPreviewTerrainImpact;
    if (!imp) continue;
    roadRail = roadRail || imp.roadRail;
    road = road || imp.road === true;
    rail = rail || imp.rail === true;
    for (const s of imp.slower) slower.add(s);
  }
  const slowerArr = sortSlowTerrainLabels([...slower]);
  if (slowerArr.length === 0 && !roadRail && !road && !rail) return null;
  return {
    slower: slowerArr,
    roadRail,
    ...(road ? { road: true as const } : {}),
    ...(rail ? { rail: true as const } : {}),
  };
}

export function minMovementRangeAmongUnitTypes(
  unitTypes: readonly string[],
  rangeByType: Readonly<Record<string, number>>,
  fallbackPerType: number
): number {
  if (unitTypes.length === 0) return 0;
  return Math.min(...unitTypes.map((t) => rangeByType[t] ?? fallbackPerType));
}

/**
 * Builds the grouped preview envelope fields from per-unit previews and the aggregated movement range.
 *
 * Purpose: Single place for `validForAll`, `showInvalidMarker`, `invalidReason`, merged terrain tooltips, and movement-range aggregation.
 * When to use: Final assembly step after all per-unit previews are computed.
 * Expected outcome: Shallow-copied `previews`. An invalid row clears every row's segments. `orderPreviewTerrainImpact` is the union of the row impacts unless the caller passed one. `slowerTerrainDisplayTitle` uses that union only when a row already has a title, so a strategic armor stop keeps the title null.
 * Exceptions: None.
 */
export function buildHumanOrderGroupPreviewEnvelope(args: {
  previews: readonly HumanOrderGroupPreviewUnitResult[];
  slowestMovementRange: number;
  slowerTerrainDisplayTitle?: string | null;
  /** When set (including `null`), skips auto-merge and uses this envelope-level impact directly. */
  orderPreviewTerrainImpact?: OrderPreviewTerrainImpact | null;
}): HumanOrderGroupPreviewResult {
  const previews = [...args.previews];
  const invalid = previews.find((e) => !e.preview.valid);
  const fromRows = previews.map((e) => e.preview.slowerTerrainDisplayTitle).find((t) => t != null && String(t).length > 0);
  const explicit = args.slowerTerrainDisplayTitle;
  const mergedImpact =
    args.orderPreviewTerrainImpact !== undefined
      ? args.orderPreviewTerrainImpact
      : mergeOrderPreviewTerrainImpactsFromPreviews(previews);
  const slowerFromImpact =
    mergedImpact && (mergedImpact.slower.length > 0 || mergedImpact.roadRail)
      ? mergedImpact.slower.length > 0
        ? mergedImpact.slower.join(', ')
        : 'Road/Rail'
      : null;
  const slowerTerrainDisplayTitle =
    explicit !== undefined ? explicit : fromRows != null ? (slowerFromImpact ?? fromRows) : null;
  const validForAll = invalid === undefined;
  const normalizedPreviews = validForAll
    ? previews
    : previews.map((row) => ({
        ...row,
        preview: {
          ...row.preview,
          segments: [],
        },
      }));
  return {
    validForAll,
    showInvalidMarker: invalid !== undefined,
    invalidReason: invalid?.preview.invalidReason,
    slowestMovementRange: args.slowestMovementRange,
    slowerTerrainDisplayTitle: slowerTerrainDisplayTitle ?? null,
    orderPreviewTerrainImpact: mergedImpact ?? null,
    previews: normalizedPreviews,
  };
}
