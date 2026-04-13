/**
 * Pure construction of march hover preview payloads for tactical (res4) battles so the renderer can
 * mirror strategic `HumanOrderGroupPreviewResult` without calling `previewHumanMarchOrders` (blocked in main).
 */

import { cellToLatLng, getResolution, gridDistance, gridPathCells } from 'h3-js';
import {
  buildHumanOrderGroupPreviewEnvelope,
  minMovementRangeAmongUnitTypes,
  representativeMarchPreviewUnitIdsByOriginH3,
  uniqueTacticalMarchPreviewUnitIds,
} from './humanMarchPreviewGroupAssembly';
import type { TacticalBattleSnapshot } from './tacticalBattleTypes';
import type {
  HumanOrderGroupPreviewResult,
  HumanOrderGroupPreviewUnitResult,
  HumanOrderPreviewResult,
} from './ipc/humanOrderPreviewTypes';
import { MOVEMENT_RANGE_BY_UNIT_TYPE } from './tacticalRanges';

const TACTICAL_H3_RESOLUTION = 4;

/**
 * Resolves a sub-unit's committed origin for preview and validation.
 *
 * Purpose: Keeps tactical planning parity with strategic behavior where planning never changes a unit's current cell.
 * When to use: Internally by `buildTacticalMarchHoverPreview` / `buildPreviewForSubUnit` only.
 * Expected outcome: Returns the active snapshot `h3Index` for the given sub-unit id.
 * Exceptions: None; missing ids yield empty string.
 */
function tacticalMarchCommittedOriginH3(battle: TacticalBattleSnapshot, subUnitId: string): string {
  return battle.subUnits.find((u) => u.id === subUnitId)?.h3Index ?? '';
}

function buildPreviewForSubUnit(args: {
  battle: TacticalBattleSnapshot;
  unitId: string;
  hoveredH3Index: string;
  res4Set: ReadonlySet<string>;
}): HumanOrderPreviewResult {
  const sub = args.battle.subUnits.find((u) => u.id === args.unitId);
  if (!sub || sub.player !== 'human') {
    return { valid: false, showInvalidMarker: false, invalidReason: 'Not a human tactical sub-unit', segments: [] };
  }
  const origin = tacticalMarchCommittedOriginH3(args.battle, args.unitId);
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
  try {
    void gridDistance(origin, args.hoveredH3Index);
  } catch {
    return { valid: false, showInvalidMarker: true, invalidReason: 'Could not measure distance', segments: [] };
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
 * Expected outcome: One preview per distinct origin (stack parity with strategic), with solid edges for the current turn and dashed continuation for future turns.
 * Exceptions: None; returns empty previews when there are no eligible human sub-units in `unitIds`.
 */
export function buildTacticalMarchHoverPreview(
  battle: TacticalBattleSnapshot,
  unitIds: readonly string[],
  hoveredH3Index: string | null
): HumanOrderGroupPreviewResult {
  const res4Set = new Set(battle.res4ChildH3Indexes);
  const uniqueIds = uniqueTacticalMarchPreviewUnitIds(unitIds);
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
  const previewUnitIds = representativeMarchPreviewUnitIdsByOriginH3(
    selectedHuman.map((u) => ({ unitId: u.id, originH3: tacticalMarchCommittedOriginH3(battle, u.id) }))
  );
  const previews: HumanOrderGroupPreviewUnitResult[] = previewUnitIds.map((unitId) => ({
    unitId,
    preview: buildPreviewForSubUnit({
      battle,
      unitId,
      hoveredH3Index,
      res4Set,
    }),
  }));
  const slowestMovementRange = minMovementRangeAmongUnitTypes(
    selectedHuman.map((u) => u.unitType),
    MOVEMENT_RANGE_BY_UNIT_TYPE,
    1
  );
  return buildHumanOrderGroupPreviewEnvelope({ previews, slowestMovementRange });
}
