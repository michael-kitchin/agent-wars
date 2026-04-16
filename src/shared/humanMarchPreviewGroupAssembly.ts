/**
 * Shared primitives for assembling grouped human march hover previews (`HumanOrderGroupPreviewResult`).
 *
 * Purpose: Keeps strategic (`previewHumanMarchOrdersImpl`) and tactical (`buildTacticalMarchHoverPreview`) aligned on
 * representative selection, envelope assembly, and movement-range aggregation without importing renderer/main code.
 * When to use: Any code path that builds grouped march preview payloads from selected unit ids and per-unit previews.
 * Expected outcome: Deterministic, first-wins de-duplication and stable `validForAll` / `showInvalidMarker` semantics.
 * Exceptions: None; callers supply already-filtered human unit rows where applicable.
 */

import type {
  HumanOrderGroupPreviewResult,
  HumanOrderGroupPreviewUnitResult,
} from './ipc/humanOrderPreviewTypes';

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

const TACTICAL_MARCH_PREVIEW_TYPE_PRIORITY: Readonly<Record<string, number>> = {
  naval: 0,
  armor: 1,
  infantry: 2,
  air: 3,
};

/**
 * Picks one representative tactical sub-unit id per origin for march hover previews.
 *
 * Purpose: When infantry/armor share a res4 with a naval carrier, first-id-wins would often pick land units and
 * run §12.4 pathfinding as infantry/armor (land costs), producing long land previews and blocking water — the inverse of naval rules.
 * When to use: `buildTacticalMarchHoverPreview` only; strategic previews keep `representativeMarchPreviewUnitIdsByOriginH3`.
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
 * Computes the slowest per-turn movement range across a set of unit types using a shared range table.
 *
 * Purpose: Centralizes `Math.min(...MOVEMENT_RANGE_BY_UNIT_TYPE[...])` logic for grouped previews.
 * When to use: Strategic and tactical grouped hover preview envelopes.
 * Expected outcome: Minimum positive integer range among known types; `fallbackPerType` when a type is unknown.
 * Exceptions: Returns `0` when `unitTypes` is empty.
 */
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
 * Purpose: Single place for `validForAll`, `showInvalidMarker`, and `invalidReason` derivation.
 * When to use: Final assembly step after all per-unit previews are computed.
 * Expected outcome: Shallow-copied `previews` array in the returned object.
 * Exceptions: None.
 */
export function buildHumanOrderGroupPreviewEnvelope(args: {
  previews: readonly HumanOrderGroupPreviewUnitResult[];
  slowestMovementRange: number;
  slowerTerrainDisplayTitle?: string | null;
}): HumanOrderGroupPreviewResult {
  const previews = [...args.previews];
  const invalid = previews.find((e) => !e.preview.valid);
  const fromRows = previews.map((e) => e.preview.slowerTerrainDisplayTitle).find((t) => t != null && String(t).length > 0);
  const explicit = args.slowerTerrainDisplayTitle;
  const slowerTerrainDisplayTitle = explicit !== undefined ? explicit : fromRows ?? null;
  return {
    validForAll: invalid === undefined,
    showInvalidMarker: invalid !== undefined,
    invalidReason: invalid?.preview.invalidReason,
    slowestMovementRange: args.slowestMovementRange,
    slowerTerrainDisplayTitle: slowerTerrainDisplayTitle ?? null,
    previews,
  };
}
