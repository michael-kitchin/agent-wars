/**
 * Pure transforms from a loaded `TerrainClassificationSnapshot` into renderer/IPC-friendly rows.
 * When to use: Only from `terrainClassificationCache` wrappers after load; keeps snapshot build separate from serialization.
 */

import type { PipelineTerrainKind } from '../shared/pipelineTerrain';
import type { Res1ProductionContextSnapshot } from '../shared/ipcTypes';
import type {
  Res4CityOverlayRow,
  Res4RoadRailOverlayRow,
  Res4TransportVectorOverlayRow,
} from '../shared/ipc/terrainHexTypes';
import type { TerrainClassificationSnapshot } from './terrainClassificationCache';
import type { HexNamingCaption } from '../shared/hexNamingCaption';

/**
 * Maps res4 override rows into renderer payload rows with `isRubble` defaulted.
 * When to use: `getRes4TerrainOverridesForRenderer` after the cache snapshot is non-null.
 */
export function res4TerrainOverridesRowsForRenderer(
  snapshot: TerrainClassificationSnapshot
): Array<{
  h3Index: string;
  terrainKind: PipelineTerrainKind;
  isUrban: boolean;
  isRubble?: boolean;
}> {
  return snapshot.res4OverrideRows.map((row) => ({ ...row, isRubble: false }));
}

/**
 * Resolves the naming caption for a hex from the snapshot caption maps.
 * When to use: `getHexNamingTooltipLineForRenderer` when the cache is loaded.
 */
export function hexNamingTooltipLineFromSnapshot(
  snapshot: TerrainClassificationSnapshot,
  payload: { h3Index: string; resolution: 1 | 4 }
): HexNamingCaption | null {
  const captions = payload.resolution === 1 ? snapshot.namingCaptionsRes1ByH3 : snapshot.namingCaptionsRes4ByH3;
  return captions.get(payload.h3Index) ?? null;
}

/**
 * Copies continent name lists for a res1 hex from the snapshot.
 * When to use: `getHexContinentNamesForRenderer` when the cache is loaded.
 */
export function hexContinentNamesFromSnapshot(
  snapshot: TerrainClassificationSnapshot,
  h3Index: string
): string[] {
  return [...(snapshot.continentNamesRes1ByH3.get(h3Index) ?? [])];
}

/**
 * Builds city overlay rows from reduced res4 labels in the snapshot.
 * When to use: `getRes4CityOverlaysForRenderer`; pass null before load to get an empty list.
 */
export function res4CityOverlayRowsFromSnapshot(
  snapshot: TerrainClassificationSnapshot | null
): Res4CityOverlayRow[] {
  if (!snapshot) return [];
  const rows: Res4CityOverlayRow[] = [];
  for (const [h3Index, label] of snapshot.res4CityOverlayByH3.entries()) {
    if (!label) continue;
    rows.push({ h3Index, label });
  }
  return rows;
}

/**
 * Builds road/rail side-mask rows for renderer transport overlays.
 * When to use: `getRes4RoadRailOverlaysForRenderer`; pass null before load to get an empty list.
 */
export function res4RoadRailOverlayRowsFromSnapshot(
  snapshot: TerrainClassificationSnapshot | null
): Res4RoadRailOverlayRow[] {
  if (!snapshot) return [];
  const rows: Res4RoadRailOverlayRow[] = [];
  for (const [h3Index, masks] of snapshot.res4RoadRailOverlayByH3.entries()) {
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
 * When to use: `getRes4TransportVectorOverlaysForRenderer`; pass null before load to get an empty list.
 */
export function res4TransportVectorOverlayRowsFromSnapshot(
  snapshot: TerrainClassificationSnapshot | null
): Res4TransportVectorOverlayRow[] {
  if (!snapshot) return [];
  return snapshot.res4TransportVectorOverlayRows.map((row) => ({
    kind: row.kind,
    points: row.points.map((p) => [p[0], p[1]] as [number, number]),
  }));
}

/**
 * Builds the res1 production context struct for a parent hex from snapshot counters.
 * When to use: `getRes1ProductionContext` when the cache is loaded.
 */
export function res1ProductionContextFromSnapshot(
  snapshot: TerrainClassificationSnapshot,
  h3Index: string
): Res1ProductionContextSnapshot {
  return {
    urbanHexCount: Math.max(0, snapshot.urbanHexCountByRes1H3.get(h3Index) ?? 0),
    airportCount: Math.max(0, snapshot.airportCountByRes1H3.get(h3Index) ?? 0),
    seaportCount: Math.max(0, snapshot.seaportCountByRes1H3.get(h3Index) ?? 0),
  };
}

/**
 * Returns the immutable res1 terrain kind map from a loaded snapshot.
 * When to use: `getTerrainRes1KindsFromCache` after load validation succeeds.
 */
export function terrainRes1KindsFromSnapshot(
  snapshot: TerrainClassificationSnapshot
): ReadonlyMap<string, PipelineTerrainKind> {
  return snapshot.res1KindByH3;
}

/**
 * Returns res4 DB seeding feature rows from a loaded snapshot.
 * When to use: `getRes4FeatureRowsForSeeding` after load validation succeeds.
 */
export function res4FeatureRowsForSeedingFromSnapshot(
  snapshot: TerrainClassificationSnapshot
): ReadonlyArray<{
  h3Index: string;
  parentH3Index: string;
  terrainKind: PipelineTerrainKind;
  isUrban: boolean;
  isAirport: boolean;
  isSeaport: boolean;
}> {
  return snapshot.res4FeatureRows;
}
