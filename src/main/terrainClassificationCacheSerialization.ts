/**
 * Pure transforms from a loaded `TerrainClassificationSnapshot` into renderer/IPC-friendly rows.
 * When to use: Only from `terrainClassificationCache` wrappers after load; keeps snapshot build separate from serialization.
 */

import type { PipelineTerrainKind } from '../shared/pipelineTerrain';
import type { StrategicProductionContextSnapshot } from '../shared/ipcTypes';
import type {
  StrategicBaselineUrbanHexCountRow,
  TacticalCityOverlayRow,
  TacticalRoadRailOverlayRow,
  TacticalTransportVectorOverlayRow,
} from '../shared/ipc/terrainHexTypes';
import type { TerrainClassificationSnapshot } from './terrainClassificationCache';
import type { HexNamingCaption } from '../shared/hexNamingCaption';

/**
 * Maps tactical override rows into renderer payload rows with `isRubble` defaulted.
 * When to use: `getTacticalTerrainOverridesForRenderer` after the cache snapshot is non-null.
 */
export function tacticalTerrainOverridesRowsForRenderer(
  snapshot: TerrainClassificationSnapshot
): Array<{
  h3Index: string;
  terrainKind: PipelineTerrainKind;
  isUrban: boolean;
  isRubble?: boolean;
}> {
  return snapshot.tacticalOverrideRows.map((row) => ({ ...row, isRubble: false }));
}

/**
 * Resolves the naming caption for a hex from the snapshot caption maps.
 * When to use: `getHexNamingTooltipLineForRenderer` when the cache is loaded.
 */
export function hexNamingTooltipLineFromSnapshot(
  snapshot: TerrainClassificationSnapshot,
  payload: { h3Index: string; resolution: 1 | 4 }
): HexNamingCaption | null {
  const captions = payload.resolution === 1 ? snapshot.namingCaptionsStrategicByH3 : snapshot.namingCaptionsTacticalByH3;
  return captions.get(payload.h3Index) ?? null;
}

/**
 * Copies continent name lists for a strategic hex from the snapshot.
 * When to use: `getHexContinentNamesForRenderer` when the cache is loaded.
 */
export function hexContinentNamesFromSnapshot(
  snapshot: TerrainClassificationSnapshot,
  h3Index: string
): string[] {
  return [...(snapshot.continentNamesStrategicByH3.get(h3Index) ?? [])];
}

/**
 * Lists strategic hexes whose generated urban count can produce units.
 *
 * Purpose: The renderer classifies tech from this baseline, not from the live count after air strikes.
 * When to use: `getStrategicBaselineUrbanHexCountsForRenderer`. Pass null before the cache is loaded.
 * Expected outcome: One row per hex with a positive integer count. An empty cache, a blank hex id, or a hex that produces nothing yields no row.
 * Exceptions: None.
 */
export function strategicBaselineUrbanHexCountRowsFromSnapshot(
  snapshot: TerrainClassificationSnapshot | null
): StrategicBaselineUrbanHexCountRow[] {
  if (!snapshot) return [];
  const rows: StrategicBaselineUrbanHexCountRow[] = [];
  for (const [h3Index, urbanHexCount] of snapshot.urbanHexCountByStrategicH3.entries()) {
    if (!h3Index || !Number.isFinite(urbanHexCount)) continue;
    const count = Math.trunc(urbanHexCount);
    if (count <= 0) continue;
    rows.push({ h3Index, urbanHexCount: count });
  }
  return rows;
}

/**
 * Builds city overlay rows from reduced tactical labels in the snapshot.
 * When to use: `getTacticalCityOverlaysForRenderer`; pass null before load to get an empty list.
 */
export function tacticalCityOverlayRowsFromSnapshot(
  snapshot: TerrainClassificationSnapshot | null
): TacticalCityOverlayRow[] {
  if (!snapshot) return [];
  const rows: TacticalCityOverlayRow[] = [];
  for (const [h3Index, label] of snapshot.tacticalCityOverlayByH3.entries()) {
    if (!label) continue;
    rows.push({ h3Index, label });
  }
  return rows;
}

/**
 * Builds road/rail side-mask rows for renderer transport overlays.
 * When to use: `getTacticalRoadRailOverlaysForRenderer`; pass null before load to get an empty list.
 */
export function tacticalRoadRailOverlayRowsFromSnapshot(
  snapshot: TerrainClassificationSnapshot | null
): TacticalRoadRailOverlayRow[] {
  if (!snapshot) return [];
  const rows: TacticalRoadRailOverlayRow[] = [];
  for (const [h3Index, masks] of snapshot.tacticalRoadRailOverlayByH3.entries()) {
    rows.push({
      h3Index,
      roadSides: [...masks.roadSides],
      railSides: [...masks.railSides],
    });
  }
  return rows;
}

/**
 * Clones transport vector overlay rows for renderer consumption.
 * When to use: `getTacticalTransportVectorOverlaysForRenderer`; pass null before load to get an empty list.
 */
export function tacticalTransportVectorOverlayRowsFromSnapshot(
  snapshot: TerrainClassificationSnapshot | null
): TacticalTransportVectorOverlayRow[] {
  if (!snapshot) return [];
  return snapshot.tacticalTransportVectorOverlayRows.map((row) => ({
    kind: row.kind,
    points: row.points.map((p) => [p[0], p[1]] as [number, number]),
  }));
}

/**
 * Builds the strategic production context struct for a parent hex from snapshot counters.
 * When to use: `getStrategicProductionContext` when the cache is loaded.
 */
export function strategicProductionContextFromSnapshot(
  snapshot: TerrainClassificationSnapshot,
  h3Index: string
): StrategicProductionContextSnapshot {
  return {
    urbanHexCount: Math.max(0, snapshot.urbanHexCountByStrategicH3.get(h3Index) ?? 0),
    airportCount: Math.max(0, snapshot.airportCountByStrategicH3.get(h3Index) ?? 0),
    seaportCount: Math.max(0, snapshot.seaportCountByStrategicH3.get(h3Index) ?? 0),
  };
}

/**
 * Returns the immutable strategic terrain kind map from a loaded snapshot.
 * When to use: `getTerrainStrategicKindsFromCache` after load validation succeeds.
 */
export function terrainStrategicKindsFromSnapshot(
  snapshot: TerrainClassificationSnapshot
): ReadonlyMap<string, PipelineTerrainKind> {
  return snapshot.strategicKindByH3;
}

/**
 * Returns tactical DB seeding feature rows from a loaded snapshot.
 * When to use: `getTacticalFeatureRowsForSeeding` after load validation succeeds.
 */
export function tacticalFeatureRowsForSeedingFromSnapshot(
  snapshot: TerrainClassificationSnapshot
): ReadonlyArray<{
  h3Index: string;
  parentH3Index: string;
  terrainKind: PipelineTerrainKind;
  isUrban: boolean;
  isAirport: boolean;
  isSeaport: boolean;
}> {
  return snapshot.tacticalFeatureRows;
}
