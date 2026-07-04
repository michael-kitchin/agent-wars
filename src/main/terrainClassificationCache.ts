/**
 * One-shot terrain classification from bundled metadata JSON: res-1 kinds for DB seeding and res-4 override rows for the renderer.
 */

import { cellToParent } from 'h3-js';
import { logDebug, logError, logTrace } from './logger';
import type { PipelineTerrainKind } from '../shared/pipelineTerrain';
import type { Res1ProductionContextSnapshot } from '../shared/ipcTypes';
import {
  classifyCellWithoutUrbanOverride,
  classifyRes4TerrainKind,
  isRes4UrbanOverlayHex,
} from './terrainClassifierFromMetadata';
import {
  DEFAULT_CLASSIFIER_THRESHOLDS,
  DEFAULT_NODATA_FALLBACK_TERRAIN,
  METADATA_CHILD_RESOLUTION,
  METADATA_PARENT_RESOLUTION,
  loadTerrainRes1MetadataBundled,
  loadTerrainRes4MetadataBundled,
  recordHasMajorAirport,
  recordHasMajorSeaport,
  type HexMetadataRecordRes4,
} from './terrainMetadataLoad';
import {
  loadTerrainRes1NamingBundled,
  loadTerrainRes4NamingBundled,
  namingLineForRes1Record,
  namingLineForRes4Record,
  type TerrainNamingRecordRes1,
  type TerrainNamingRecordRes4,
} from './terrainNamingLoad';
import {
  assertLandMassMatchesHexList,
  buildRes1LandMassByH3,
  loadTerrainRes1LandMassBundled,
} from './terrainLandMassLoad';
import type { Res1LandMassRecord } from '../shared/landTraversalRes1';
import { reduceRes4CityOverlayLabelsByH3 } from './terrainRes4CityOverlayReduce';
import { loadTerrainRes4RoadRailSidesBundled } from './terrainRoadRailSidesLoad';
import { loadTerrainRes4RoadRailVectorsBundled } from './terrainRoadRailVectorsLoad';
import {
  hexContinentNamesFromSnapshot,
  hexNamingTooltipLineFromSnapshot,
  res1ProductionContextFromSnapshot,
  res4CityOverlayRowsFromSnapshot,
  res4FeatureRowsForSeedingFromSnapshot,
  res4RoadRailOverlayRowsFromSnapshot,
  res4TerrainOverridesRowsForRenderer,
  res4TransportVectorOverlayRowsFromSnapshot,
  terrainRes1KindsFromSnapshot,
} from './terrainClassificationCacheSerialization';
import type {
  Res4CityOverlayRow,
  Res4RoadRailOverlayRow,
  Res4TransportVectorOverlayRow,
} from '../shared/ipc/terrainHexTypes';

/**
 * Documents the `TerrainClassificationSnapshot` interface as a named contract surface (export interface TerrainClassificationSnapshot).

 * Purpose: Supports maintainability by documenting why `TerrainClassificationSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface TerrainClassificationSnapshot {
    /**
   * Specifies the contract for the `res1KindByH3` member (res1KindByH3: ReadonlyMap<string, PipelineTerrainKind>;).

   * Contract: Describes stable behavior for callers of `res1KindByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res1KindByH3: ReadonlyMap<string, PipelineTerrainKind>;
    /**
   * Specifies the contract for the `res4OverrideRows` member (res4OverrideRows: ReadonlyArray<{ h3Index: string; terrainKind: PipelineTerrainKind; isUrban: boolean }>;).

   * Contract: Describes stable behavior for callers of `res4OverrideRows` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res4OverrideRows: ReadonlyArray<{ h3Index: string; terrainKind: PipelineTerrainKind; isUrban: boolean }>;
    /**
   * Specifies the contract for the `namingLinesRes1ByH3` member (namingLinesRes1ByH3: ReadonlyMap<string, string>;).

   * Contract: Describes stable behavior for callers of `namingLinesRes1ByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
namingLinesRes1ByH3: ReadonlyMap<string, string>;
    /**
   * Specifies the contract for the `namingLinesRes4ByH3` member (namingLinesRes4ByH3: ReadonlyMap<string, string>;).

   * Contract: Describes stable behavior for callers of `namingLinesRes4ByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
namingLinesRes4ByH3: ReadonlyMap<string, string>;
    /**
   * Specifies the contract for the `continentNamesRes1ByH3` member (continentNamesRes1ByH3: ReadonlyMap<string, string[]>;).

   * Contract: Describes stable behavior for callers of `continentNamesRes1ByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
continentNamesRes1ByH3: ReadonlyMap<string, string[]>;
    /**
   * Specifies the contract for the `urbanHexCountByRes1H3` member (urbanHexCountByRes1H3: ReadonlyMap<string, number>;).

   * Contract: Describes stable behavior for callers of `urbanHexCountByRes1H3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urbanHexCountByRes1H3: ReadonlyMap<string, number>;
    /**
   * Specifies the contract for the `airportCountByRes1H3` member (airportCountByRes1H3: ReadonlyMap<string, number>;).

   * Contract: Describes stable behavior for callers of `airportCountByRes1H3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airportCountByRes1H3: ReadonlyMap<string, number>;
    /**
   * Specifies the contract for the `seaportCountByRes1H3` member (seaportCountByRes1H3: ReadonlyMap<string, number>;).

   * Contract: Describes stable behavior for callers of `seaportCountByRes1H3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seaportCountByRes1H3: ReadonlyMap<string, number>;
    /**
   * Specifies the contract for the `res4CityOverlayByH3` member (res4CityOverlayByH3: ReadonlyMap<string, string>;).

   * Contract: Reduced res4 city labels (scalerank 0..4) keyed by child `h3_index` for map inspection overlays.
   * When to use: Renderer IPC that must not re-parse the full naming JSON each frame.
   * Expected outcome: Values are non-empty display strings; missing keys mean no city overlay for that hex.
   * Exceptions: None.
   */
res4CityOverlayByH3: ReadonlyMap<string, string>;
    /**
   * Specifies the contract for the `res4RoadRailOverlayByH3` member (res4RoadRailOverlayByH3: ReadonlyMap<string, { roadSides: readonly boolean[]; railSides: readonly boolean[] }>;).

   * Contract: Boolean side masks for roads/rails aligned to the exported clockwise side ordering contract; the renderer infers edge-to-edge chord strokes (plus short inward spurs when the active count is odd) from these masks, not exported centerline polylines.
   * When to use: Renderer IPC for res4 transport overlays when res4 is visible (`drawRes4CityOverlays` + `buildTransportChordSegments`).
   * Expected outcome: Both arrays share length 5 or 6 for a given cell; absent keys mean no transport overlay.
   * Exceptions: None.
   */
res4RoadRailOverlayByH3: ReadonlyMap<string, { roadSides: readonly boolean[]; railSides: readonly boolean[] }>;
    /**
   * Specifies the contract for the `res4TransportVectorOverlayRows` member (res4TransportVectorOverlayRows: ReadonlyArray<Res4TransportVectorOverlayRow>;).

   * Contract: Optional display-only road/rail polylines for Leaflet overlays; empty when vector artifact is absent.
   * When to use: Renderer IPC for vector transport drawing without touching boolean pathfinding masks.
   * Expected outcome: Rows contain validated `kind` and WGS84 `points`.
   * Exceptions: None.
   */
res4TransportVectorOverlayRows: ReadonlyArray<Res4TransportVectorOverlayRow>;
    /**
   * Specifies the contract for the `res4FeatureRows` member (res4FeatureRows: ReadonlyArray<{ h3Index: string; parentH3Index: string; terrainKind: PipelineTerrainKind; isUrban: boolean; isAirport:).

   * Contract: Describes stable behavior for callers of `res4FeatureRows` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res4FeatureRows: ReadonlyArray<{
    h3Index: string;
    parentH3Index: string;
    terrainKind: PipelineTerrainKind;
    isUrban: boolean;
    isAirport: boolean;
    isSeaport: boolean;
  }>;
    /**
   * Specifies the contract for the `res1NamingRecords` member (res1NamingRecords: ReadonlyArray<TerrainNamingRecordRes1>;).

   * Contract: Parsed res1 naming rows from `terrain_res1_naming.json` retained for region/scenario helpers without a second file read.
   * When to use: `regionScenario.buildRegionHexCache` and other callers needing country `region` per res1 hex.
   * Expected outcome: Same records as `loadTerrainRes1NamingBundled().records` at snapshot build time.
   * Exceptions: None.
   */
res1NamingRecords: ReadonlyArray<TerrainNamingRecordRes1>;
    /**
   * Specifies the contract for the `res1LandMassByH3` member (res1LandMassByH3: ReadonlyMap<string, Res1LandMassRecord>;).

   * Contract: Precomputed continent/island membership and water fraction per res-1 hex for land-unit pathfinding.
   * When to use: Strategic land movement validation and routing after cache load.
   * Expected outcome: One record per res-1 hex; keys match res1KindByH3.
   * Exceptions: None.
   */
res1LandMassByH3: ReadonlyMap<string, Res1LandMassRecord>;
}

/**
 * Documents the module-scope binding `cached` (cached: TerrainClassificationSnapshot | null).

 * Purpose: Supports maintainability by documenting why `cached` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let cached: TerrainClassificationSnapshot | null = null;

/**
 * Defines the `buildSnapshot` function shape (function buildSnapshot(): TerrainClassificationSnapshot).

 * Purpose: Supports maintainability by documenting why `buildSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildSnapshot(): TerrainClassificationSnapshot {
  logDebug('terrainClassificationCache buildSnapshot: loading JSON');
  const res1Env = loadTerrainRes1MetadataBundled();
  const res4Env = loadTerrainRes4MetadataBundled();
  const namingRes1Env = loadTerrainRes1NamingBundled();
  const namingRes4Env = loadTerrainRes4NamingBundled();
  if (res1Env.resolution !== METADATA_PARENT_RESOLUTION) {
    throw new Error(
      `terrain metadata: res1 resolution ${res1Env.resolution} != expected ${METADATA_PARENT_RESOLUTION}`
    );
  }
  if (res4Env.resolution !== METADATA_CHILD_RESOLUTION) {
    throw new Error(
      `terrain metadata: res4 resolution ${res4Env.resolution} != expected ${METADATA_CHILD_RESOLUTION}`
    );
  }
  if (res4Env.record_count <= 0) {
    throw new Error(
      'terrain metadata: terrain_res4_metadata.json has no records; regenerate with npm run terrain:generate'
    );
  }
  if (namingRes1Env.resolution !== METADATA_PARENT_RESOLUTION) {
    throw new Error(
      `terrain naming: res1 resolution ${namingRes1Env.resolution} != expected ${METADATA_PARENT_RESOLUTION}`
    );
  }
  if (namingRes4Env.resolution !== METADATA_CHILD_RESOLUTION) {
    throw new Error(
      `terrain naming: res4 resolution ${namingRes4Env.resolution} != expected ${METADATA_CHILD_RESOLUTION}`
    );
  }
  if (namingRes4Env.record_count <= 0) {
    throw new Error(
      'terrain naming: terrain_res4_naming.json has no records; regenerate with naming pipeline'
    );
  }
  const nodata = DEFAULT_NODATA_FALLBACK_TERRAIN;
  const t = DEFAULT_CLASSIFIER_THRESHOLDS;

  const res1FallbackKindByH3 = new Map<string, PipelineTerrainKind>();
  for (const row of res1Env.records) {
    res1FallbackKindByH3.set(row.h3_index, classifyCellWithoutUrbanOverride(row, t, nodata));
  }

  const res1MajorAirports: string[] = [];
  const res1MajorSeaports: string[] = [];
  const seaportCountByRes1H3 = new Map<string, number>();
  const airportCountByRes1H3 = new Map<string, number>();
  for (const row of res1Env.records) {
    if (recordHasMajorAirport(row)) res1MajorAirports.push(row.h3_index);
    if (recordHasMajorSeaport(row)) res1MajorSeaports.push(row.h3_index);
    airportCountByRes1H3.set(row.h3_index, Math.max(0, row.airport_count_total));
    seaportCountByRes1H3.set(row.h3_index, Math.max(0, row.seaport_count_total));
  }
  const res4MajorAirports: string[] = [];
  const res4MajorSeaports: string[] = [];
  const res4FeatureRows: Array<{
    h3Index: string;
    parentH3Index: string;
    terrainKind: PipelineTerrainKind;
    isUrban: boolean;
    isAirport: boolean;
    isSeaport: boolean;
  }> = [];
  const res4ClassifiedRows: Array<{ h3Index: string; parentH3: string; childKind: PipelineTerrainKind; isUrban: boolean }> = [];
  const urbanHexCountByRes1H3 = new Map<string, number>();
  const childKindCountsByParent = new Map<string, Map<PipelineTerrainKind, number>>();
  for (const row of res4Env.records as HexMetadataRecordRes4[]) {
    const childKind = classifyRes4TerrainKind(row, t, nodata);
    const isUrban = isRes4UrbanOverlayHex(row);
    const parentH3 = cellToParent(row.h3_index, METADATA_PARENT_RESOLUTION);
    // Point infrastructure: use major-feature scalerank gates (not raw totals). Totals are noisy and
    // mark many res4 children when a res1 hosts port/airport influence, which breaks tactical rules
    // that must treat only true facility tiles as seaport/airport res4 cells.
    const isAirport = recordHasMajorAirport(row);
    const isSeaport = recordHasMajorSeaport(row);
    let parentCounts = childKindCountsByParent.get(parentH3);
    if (!parentCounts) {
      parentCounts = new Map<PipelineTerrainKind, number>();
      childKindCountsByParent.set(parentH3, parentCounts);
    }
    parentCounts.set(childKind, (parentCounts.get(childKind) ?? 0) + 1);
    res4ClassifiedRows.push({ h3Index: row.h3_index, parentH3, childKind, isUrban });
    res4FeatureRows.push({
      h3Index: row.h3_index,
      parentH3Index: parentH3,
      terrainKind: childKind,
      isUrban,
      isAirport,
      isSeaport,
    });
    if (isUrban) {
      urbanHexCountByRes1H3.set(parentH3, (urbanHexCountByRes1H3.get(parentH3) ?? 0) + 1);
    }
    if (recordHasMajorAirport(row)) res4MajorAirports.push(row.h3_index);
    if (recordHasMajorSeaport(row)) res4MajorSeaports.push(row.h3_index);
  }

  const res1KindByH3 = new Map<string, PipelineTerrainKind>();
  for (const row of res1Env.records) {
    const counts = childKindCountsByParent.get(row.h3_index);
    if (!counts || counts.size === 0) {
      res1KindByH3.set(row.h3_index, res1FallbackKindByH3.get(row.h3_index) ?? nodata);
      continue;
    }
    let dominantKind: PipelineTerrainKind | null = null;
    let dominantCount = -1;
    for (const [kind, count] of counts.entries()) {
      if (count > dominantCount || (count === dominantCount && dominantKind !== null && kind.localeCompare(dominantKind) < 0)) {
        dominantKind = kind;
        dominantCount = count;
      }
    }
    res1KindByH3.set(row.h3_index, dominantKind ?? (res1FallbackKindByH3.get(row.h3_index) ?? nodata));
  }

  const res4OverrideRows: { h3Index: string; terrainKind: PipelineTerrainKind; isUrban: boolean }[] = [];
  for (const row of res4ClassifiedRows) {
    const { h3Index, parentH3, childKind, isUrban } = row;
    const parentKind = res1KindByH3.get(parentH3);
    if (parentKind === undefined) {
      const msg = `terrain metadata: res4 child ${h3Index} parent ${parentH3} missing from res1 map`;
      logError('terrainClassificationCache buildSnapshot: orphan res4 row', new Error(msg));
      throw new Error(msg);
    }
    if (childKind !== parentKind || isUrban) {
      res4OverrideRows.push({ h3Index, terrainKind: childKind, isUrban });
    }
  }
  const namingLinesRes1ByH3 = new Map<string, string>();
  for (const row of namingRes1Env.records) {
    const line = namingLineForRes1Record(row);
    if (line) namingLinesRes1ByH3.set(row.h3_index, line);
  }
  const namingLinesRes4ByH3 = new Map<string, string>();
  for (const row of namingRes4Env.records as TerrainNamingRecordRes4[]) {
    const line = namingLineForRes4Record(row);
    if (line) namingLinesRes4ByH3.set(row.h3_index, line);
  }
  const res4CityOverlayByH3 = reduceRes4CityOverlayLabelsByH3(namingRes4Env.records as TerrainNamingRecordRes4[]);
  const res4RoadRailOverlayByH3 = loadTerrainRes4RoadRailSidesBundled();
  const res4TransportVectorOverlayRows = loadTerrainRes4RoadRailVectorsBundled();
  const continentNamesRes1ByH3 = new Map<string, string[]>();
  for (const row of namingRes1Env.records as TerrainNamingRecordRes1[]) {
    const names: string[] = [];
    for (const countryRow of row.countries) {
      const candidate = (countryRow.continent ?? '').trim() || countryRow.name.trim();
      if (!candidate) continue;
      if (!names.includes(candidate)) names.push(candidate);
    }
    continentNamesRes1ByH3.set(row.h3_index, names);
  }

  const landMassEnv = loadTerrainRes1LandMassBundled();
  const res1LandMassByH3 = buildRes1LandMassByH3(landMassEnv);
  const expectedRes1Hexes = res1Env.records.map((row) => row.h3_index);
  assertLandMassMatchesHexList(res1LandMassByH3, expectedRes1Hexes);

  logDebug('terrainClassificationCache buildSnapshot: done', {
    res1Count: res1KindByH3.size,
    res4Records: res4Env.records.length,
    res4OverrideCount: res4OverrideRows.length,
    res1MajorAirportHexes: res1MajorAirports.length,
    res1MajorSeaportHexes: res1MajorSeaports.length,
    res4MajorAirportHexes: res4MajorAirports.length,
    res4MajorSeaportHexes: res4MajorSeaports.length,
    res1NamingHexes: namingLinesRes1ByH3.size,
    res4NamingHexes: namingLinesRes4ByH3.size,
    res4CityOverlayHexes: res4CityOverlayByH3.size,
    res4RoadRailOverlayHexes: res4RoadRailOverlayByH3.size,
    res4TransportVectorRows: res4TransportVectorOverlayRows.length,
    res1LandMassHexes: res1LandMassByH3.size,
  });
  return {
    res1KindByH3,
    res4OverrideRows,
    namingLinesRes1ByH3,
    namingLinesRes4ByH3,
    continentNamesRes1ByH3,
    urbanHexCountByRes1H3,
    airportCountByRes1H3,
    seaportCountByRes1H3,
    res4CityOverlayByH3,
    res4RoadRailOverlayByH3,
    res4TransportVectorOverlayRows,
    res4FeatureRows,
    res1NamingRecords: namingRes1Env.records as TerrainNamingRecordRes1[],
    res1LandMassByH3,
  };
}

/**
 * Defines the `ensureTerrainClassificationCacheLoaded` function shape (export function ensureTerrainClassificationCacheLoaded(): void).

 * Purpose: Supports maintainability by documenting why `ensureTerrainClassificationCacheLoaded` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function ensureTerrainClassificationCacheLoaded(): void {
  logTrace('terrainClassificationCache ensureTerrainClassificationCacheLoaded');
  if (cached) return;
  try {
    cached = buildSnapshot();
  } catch (err) {
    logError('terrainClassificationCache ensureTerrainClassificationCacheLoaded: failed', err);
    throw err;
  }
}

/**
 * Returns parsed res1 naming records from the loaded terrain snapshot.
 *
 * Purpose: Supplies `regionScenario` and similar helpers without re-reading `terrain_res1_naming.json`.
 * When to use: After `ensureTerrainClassificationCacheLoaded()` at startup or before region hex aggregation.
 * Expected outcome: Read-only array identical to the bundled naming envelope records used when the snapshot was built.
 * Exceptions: Throws if the classification cache has not been loaded yet.
 */
export function getTerrainRes1NamingRecordsFromSnapshot(): ReadonlyArray<TerrainNamingRecordRes1> {
  logTrace('terrainClassificationCache getTerrainRes1NamingRecordsFromSnapshot');
  if (!cached) {
    const err = new Error('terrainClassificationCache: load ensureTerrainClassificationCacheLoaded() first');
    logError('terrainClassificationCache getTerrainRes1NamingRecordsFromSnapshot: cache empty', err);
    throw err;
  }
  return cached.res1NamingRecords;
}

/**
 * Defines the `getRes1LandMassByH3` function shape (export function getRes1LandMassByH3(): ReadonlyMap<string, Res1LandMassRecord>).

 * Purpose: Supports maintainability by documenting why `getRes1LandMassByH3` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getRes1LandMassByH3(): ReadonlyMap<string, Res1LandMassRecord> {
  logTrace('terrainClassificationCache getRes1LandMassByH3');
  ensureTerrainClassificationCacheLoaded();
  return cached!.res1LandMassByH3;
}

/**
 * Defines the `getTerrainRes1KindsFromCache` function shape (export function getTerrainRes1KindsFromCache(): ReadonlyMap<string, PipelineTerrainKind> { logTrace('terrainClassificationCache getTerrainRes1KindsFromCache').

 * Purpose: Supports maintainability by documenting why `getTerrainRes1KindsFromCache` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getTerrainRes1KindsFromCache(): ReadonlyMap<string, PipelineTerrainKind> {
  logTrace('terrainClassificationCache getTerrainRes1KindsFromCache');
  if (!cached) {
    const err = new Error('terrainClassificationCache: load ensureTerrainClassificationCacheLoaded() first');
    logError('terrainClassificationCache getTerrainRes1KindsFromCache: cache empty', err);
    throw err;
  }
  return terrainRes1KindsFromSnapshot(cached);
}

/**
 * Defines the `getRes4TerrainOverridesForRenderer` function shape (export function getRes4TerrainOverridesForRenderer(): Array<).

 * Purpose: Supports maintainability by documenting why `getRes4TerrainOverridesForRenderer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getRes4TerrainOverridesForRenderer(): Array<{
  h3Index: string;
  terrainKind: PipelineTerrainKind;
  isUrban: boolean;
  isRubble?: boolean;
}> {
  logTrace('terrainClassificationCache getRes4TerrainOverridesForRenderer');
  if (!cached) {
    const err = new Error('terrainClassificationCache: load ensureTerrainClassificationCacheLoaded() first');
    logError('terrainClassificationCache getRes4TerrainOverridesForRenderer: cache empty', err);
    throw err;
  }
  return res4TerrainOverridesRowsForRenderer(cached);
}

/**
 * Defines the `getHexNamingTooltipLineForRenderer` function shape (export function getHexNamingTooltipLineForRenderer( payload: { h3Index: string; resolution: 1 | 4 } ): string | null { logTrace('terrainClassificationCac).

 * Purpose: Supports maintainability by documenting why `getHexNamingTooltipLineForRenderer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getHexNamingTooltipLineForRenderer(
  payload: { h3Index: string; resolution: 1 | 4 }
): string | null {
  logTrace('terrainClassificationCache getHexNamingTooltipLineForRenderer', payload);
  if (!cached) {
    const err = new Error('terrainClassificationCache: load ensureTerrainClassificationCacheLoaded() first');
    logError('terrainClassificationCache getHexNamingTooltipLineForRenderer: cache empty', err);
    throw err;
  }
  return hexNamingTooltipLineFromSnapshot(cached, payload);
}

/**
 * Defines the `getHexContinentNamesForRenderer` function shape (export function getHexContinentNamesForRenderer(payload:).

 * Purpose: Supports maintainability by documenting why `getHexContinentNamesForRenderer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getHexContinentNamesForRenderer(payload: { h3Index: string }): string[] {
  logTrace('terrainClassificationCache getHexContinentNamesForRenderer', payload);
  if (!cached) {
    const err = new Error('terrainClassificationCache: load ensureTerrainClassificationCacheLoaded() first');
    logError('terrainClassificationCache getHexContinentNamesForRenderer: cache empty', err);
    throw err;
  }
  return hexContinentNamesFromSnapshot(cached, payload.h3Index);
}

/**
 * Defines the `getRes4CityOverlaysForRenderer` function shape (export function getRes4CityOverlaysForRenderer(): Res4CityOverlayRow[]).

 * Purpose: Serializes reduced res4 city labels for renderer map inspection overlays.
 * When to use: `game:getRes4CityOverlays` IPC handler after the classification cache is loaded.
 * Expected outcome: Stable array of `{ h3Index, label }` rows; empty when the cache has not been built yet.
 * Exceptions: None.
 */
export function getRes4CityOverlaysForRenderer(): Res4CityOverlayRow[] {
  logTrace('terrainClassificationCache getRes4CityOverlaysForRenderer');
  if (!cached) {
    logDebug('terrainClassificationCache getRes4CityOverlaysForRenderer: cache empty, returning []');
    return [];
  }
  return res4CityOverlayRowsFromSnapshot(cached);
}

/**
 * Defines the `getRes4RoadRailOverlaysForRenderer` function shape (export function getRes4RoadRailOverlaysForRenderer(): Res4RoadRailOverlayRow[]).

 * Purpose: Serializes bundled road/rail side masks for renderer transport glyphs.
 * When to use: `game:getRes4RoadRailOverlays` IPC handler after the classification cache is loaded.
 * Expected outcome: Each row includes cloned boolean arrays suitable for immediate renderer caching.
 * Exceptions: None.
 */
export function getRes4RoadRailOverlaysForRenderer(): Res4RoadRailOverlayRow[] {
  logTrace('terrainClassificationCache getRes4RoadRailOverlaysForRenderer');
  if (!cached) {
    logDebug('terrainClassificationCache getRes4RoadRailOverlaysForRenderer: cache empty, returning []');
    return [];
  }
  return res4RoadRailOverlayRowsFromSnapshot(cached);
}

/**
 * Defines the `getRes4TransportVectorOverlaysForRenderer` function shape (export function getRes4TransportVectorOverlaysForRenderer(): Res4TransportVectorOverlayRow[]).

 * Purpose: Serializes optional display-only road/rail vector rows for the Leaflet overlay layer.
 * When to use: `game:getRes4TransportVectorOverlays` IPC handler after cache load.
 * Expected outcome: Returns cloned point tuples for renderer safety; empty when optional artifact is unavailable.
 * Exceptions: None.
 */
export function getRes4TransportVectorOverlaysForRenderer(): Res4TransportVectorOverlayRow[] {
  logTrace('terrainClassificationCache getRes4TransportVectorOverlaysForRenderer');
  if (!cached) {
    logDebug('terrainClassificationCache getRes4TransportVectorOverlaysForRenderer: cache empty, returning []');
    return [];
  }
  return res4TransportVectorOverlayRowsFromSnapshot(cached);
}

/**
 * Defines the `getRes1ProductionContext` function shape (export function getRes1ProductionContext(payload:).

 * Purpose: Supports maintainability by documenting why `getRes1ProductionContext` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getRes1ProductionContext(payload: { h3Index: string }): Res1ProductionContextSnapshot {
  logTrace('terrainClassificationCache getRes1ProductionContext', payload);
  if (!cached) {
    const err = new Error('terrainClassificationCache: load ensureTerrainClassificationCacheLoaded() first');
    logError('terrainClassificationCache getRes1ProductionContext: cache empty', err);
    throw err;
  }
  return res1ProductionContextFromSnapshot(cached, payload.h3Index);
}

/**
 * Defines the `getRes4FeatureRowsForSeeding` function shape (export function getRes4FeatureRowsForSeeding(): ReadonlyArray<).

 * Purpose: Supports maintainability by documenting why `getRes4FeatureRowsForSeeding` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getRes4FeatureRowsForSeeding(): ReadonlyArray<{
  h3Index: string;
  parentH3Index: string;
  terrainKind: PipelineTerrainKind;
  isUrban: boolean;
  isAirport: boolean;
  isSeaport: boolean;
}> {
  logTrace('terrainClassificationCache getRes4FeatureRowsForSeeding');
  if (!cached) {
    const err = new Error('terrainClassificationCache: load ensureTerrainClassificationCacheLoaded() first');
    logError('terrainClassificationCache getRes4FeatureRowsForSeeding: cache empty', err);
    throw err;
  }
  return res4FeatureRowsForSeedingFromSnapshot(cached);
}

/**
 * Defines the `isTerrainClassificationCacheLoaded` function shape (export function isTerrainClassificationCacheLoaded(): boolean).

 * Purpose: Supports maintainability by documenting why `isTerrainClassificationCacheLoaded` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isTerrainClassificationCacheLoaded(): boolean {
  logTrace('terrainClassificationCache isTerrainClassificationCacheLoaded');
  return cached !== null;
}

/**
 * Defines the `clearTerrainClassificationCacheForTests` function shape (export function clearTerrainClassificationCacheForTests(): void).

 * Purpose: Supports maintainability by documenting why `clearTerrainClassificationCacheForTests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearTerrainClassificationCacheForTests(): void {
  logDebug('terrainClassificationCache clearTerrainClassificationCacheForTests');
  cached = null;
}
