/**
 * Pure construction of march hover preview payloads for tactical (res4) battles so the renderer can
 * mirror strategic `HumanOrderGroupPreviewResult` without calling `previewHumanMarchOrders` (blocked in main).
 */

import { cellToLatLng, getResolution, gridDistance, gridPathCells } from 'h3-js';
import type { TacticalBattleSnapshot } from './tacticalBattleTypes';
import type {
  HumanOrderGroupPreviewResult,
  HumanOrderGroupPreviewUnitResult,
  HumanOrderPreviewResult,
} from './ipc/humanOrderPreviewTypes';
import { MOVEMENT_RANGE_BY_UNIT_TYPE } from './tacticalRanges';

const TACTICAL_H3_RESOLUTION = 4;

/**
 * Resolves a sub-unit's current march origin for preview and validation, overlaying renderer-local draft destinations.
 *
 * Purpose: Matches `tacticalEffectiveH3ForSubUnit` semantics without importing renderer modules.
 * When to use: Internally by `buildTacticalMarchHoverPreview` / `buildPreviewForSubUnit` only.
 * Expected outcome: Pending draft destination wins when listed; otherwise the snapshot `h3Index`.
 * Exceptions: None; missing ids yield empty string.
 */
function tacticalMarchEffectiveOriginH3(
  battle: TacticalBattleSnapshot,
  pendingMarches: readonly { subUnitId: string; destinationH3Index: string }[],
  subUnitId: string
): string {
  const draft = pendingMarches.find((r) => r.subUnitId === subUnitId);
  if (draft) return draft.destinationH3Index;
  return battle.subUnits.find((u) => u.id === subUnitId)?.h3Index ?? '';
}

/**
 * Returns a sidebar-friendly movement label (`Nh (Pending)`) from committed snapshot placement to a draft destination.
 *
 * Purpose: Keeps tactical pending-order rows aligned with strategic `…Nh (status)` distance-first wording.
 * When to use: Pending orders list while a tactical battle snapshot is active.
 * Expected outcome: Non-negative step count at res4 with `(Pending)` to mirror strategic `…h (status)` pending rows; falls back when the sub-unit row is missing.
 * Exceptions: Propagates H3 resolution errors from `gridDistance` only for invalid indexes (callers pass snapshot data).
 */
export function formatTacticalMarchPendingDistanceLabel(
  battle: TacticalBattleSnapshot,
  subUnitId: string,
  destinationH3Index: string
): string {
  const origin = battle.subUnits.find((u) => u.id === subUnitId)?.h3Index;
  if (!origin) return '0h (Pending)';
  try {
    const steps = gridDistance(origin, destinationH3Index);
    return `${steps}h (Pending)`;
  } catch {
    return '0h (Pending)';
  }
}

function uniqueNonEmptyIds(unitIds: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of unitIds) {
    const t = id.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function buildPreviewForSubUnit(args: {
  battle: TacticalBattleSnapshot;
  pendingMarches: readonly { subUnitId: string; destinationH3Index: string }[];
  unitId: string;
  hoveredH3Index: string;
  res4Set: ReadonlySet<string>;
}): HumanOrderPreviewResult {
  const sub = args.battle.subUnits.find((u) => u.id === args.unitId);
  if (!sub || sub.player !== 'human') {
    return { valid: false, showInvalidMarker: false, invalidReason: 'Not a human tactical sub-unit', segments: [] };
  }
  const origin = tacticalMarchEffectiveOriginH3(args.battle, args.pendingMarches, args.unitId);
  const maxSteps = MOVEMENT_RANGE_BY_UNIT_TYPE[sub.unitType] ?? 1;
  let resOk = true;
  try {
    resOk =
      getResolution(origin) === TACTICAL_H3_RESOLUTION && getResolution(args.hoveredH3Index) === TACTICAL_H3_RESOLUTION;
  } catch {
    resOk = false;
  }
  if (!resOk) {
    return { valid: false, showInvalidMarker: true, invalidReason: 'Invalid tactical cell', segments: [] };
  }
  if (!args.res4Set.has(args.hoveredH3Index)) {
    return { valid: false, showInvalidMarker: true, invalidReason: 'Outside tactical footprint', segments: [] };
  }
  let distance = Number.POSITIVE_INFINITY;
  try {
    distance = gridDistance(origin, args.hoveredH3Index);
  } catch {
    return { valid: false, showInvalidMarker: true, invalidReason: 'Could not measure distance', segments: [] };
  }
  if (distance > maxSteps) {
    return {
      valid: false,
      showInvalidMarker: true,
      invalidReason: 'Beyond movement range',
      segments: [],
    };
  }
  if (origin === args.hoveredH3Index) {
    return { valid: true, showInvalidMarker: false, segments: [] };
  }
  let pathCells: string[];
  try {
    pathCells = gridPathCells(origin, args.hoveredH3Index);
  } catch {
    return { valid: false, showInvalidMarker: true, invalidReason: 'No path', segments: [] };
  }
  const hexes: [number, number][] = pathCells.map((h) => {
    const [lat, lng] = cellToLatLng(h);
    return [lat, lng];
  });
  const [destLat, destLng] = cellToLatLng(args.hoveredH3Index);
  return {
    valid: true,
    showInvalidMarker: false,
    arrowLatLng: [destLat, destLng],
    segments: [{ turn: 1, hexes }],
  };
}

/**
 * Builds a grouped march hover preview for selected tactical sub-units toward a hovered res4 cell.
 *
 * Purpose: Supplies `drawHoverRoutePreview` with the same data shape as strategic previews while respecting res4 footprint and `MOVEMENT_RANGE_BY_UNIT_TYPE`.
 * When to use: Renderer `refreshHoverRoutePreview` when `S.tacticalBattleSnapshot` is set and ranged/air modes are off.
 * Expected outcome: One preview per distinct effective origin (stack parity with strategic), `validForAll` when every representative path is in range.
 * Exceptions: None; returns empty previews when there are no eligible human sub-units in `unitIds`.
 */
export function buildTacticalMarchHoverPreview(
  battle: TacticalBattleSnapshot,
  pendingMarches: readonly { subUnitId: string; destinationH3Index: string }[],
  unitIds: readonly string[],
  hoveredH3Index: string | null
): HumanOrderGroupPreviewResult {
  const res4Set = new Set(battle.res4ChildH3Indexes);
  const uniqueIds = uniqueNonEmptyIds(unitIds);
  const selectedHuman = uniqueIds
    .map((id) => battle.subUnits.find((u) => u.id === id && u.player === 'human'))
    .filter((u): u is NonNullable<typeof u> => !!u);
  if (!hoveredH3Index || selectedHuman.length === 0) {
    return {
      validForAll: false,
      showInvalidMarker: false,
      slowestMovementRange: 0,
      previews: [],
    };
  }
  const representativeUnitIdsByOrigin = new Map<string, string>();
  for (const u of selectedHuman) {
    const origin = tacticalMarchEffectiveOriginH3(battle, pendingMarches, u.id);
    if (!representativeUnitIdsByOrigin.has(origin)) representativeUnitIdsByOrigin.set(origin, u.id);
  }
  const previewUnitIds = Array.from(representativeUnitIdsByOrigin.values());
  const previews: HumanOrderGroupPreviewUnitResult[] = previewUnitIds.map((unitId) => ({
    unitId,
    preview: buildPreviewForSubUnit({
      battle,
      pendingMarches,
      unitId,
      hoveredH3Index,
      res4Set,
    }),
  }));
  const invalid = previews.find((e) => !e.preview.valid);
  const slowestMovementRange =
    selectedHuman.length > 0
      ? Math.min(...selectedHuman.map((u) => MOVEMENT_RANGE_BY_UNIT_TYPE[u.unitType] ?? 1))
      : 0;
  return {
    validForAll: invalid === undefined,
    showInvalidMarker: invalid !== undefined,
    invalidReason: invalid?.preview.invalidReason,
    slowestMovementRange,
    previews,
  };
}
