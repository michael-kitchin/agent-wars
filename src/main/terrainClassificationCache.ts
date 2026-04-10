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
  preferredNamingLineForRes1Record,
  preferredNamingLineForRes4Record,
  type TerrainNamingRecordRes1,
  type TerrainNamingRecordRes4,
} from './terrainNamingLoad';

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
    const isAirport = row.airport_count_total > 0;
    const isSeaport = row.seaport_count_total > 0;
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
    const line = preferredNamingLineForRes1Record(row);
    if (line) namingLinesRes1ByH3.set(row.h3_index, line);
  }
  const namingLinesRes4ByH3 = new Map<string, string>();
  for (const row of namingRes4Env.records as TerrainNamingRecordRes4[]) {
    const line = preferredNamingLineForRes4Record(row);
    if (line) namingLinesRes4ByH3.set(row.h3_index, line);
  }
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
    res4FeatureRows,
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
  return cached.res1KindByH3;
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
  return cached.res4OverrideRows.map((row) => ({ ...row, isRubble: false }));
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
  if (payload.resolution === 1) {
    return cached.namingLinesRes1ByH3.get(payload.h3Index) ?? null;
  }
  return cached.namingLinesRes4ByH3.get(payload.h3Index) ?? null;
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
  return [...(cached.continentNamesRes1ByH3.get(payload.h3Index) ?? [])];
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
  return {
    urbanHexCount: Math.max(0, cached.urbanHexCountByRes1H3.get(payload.h3Index) ?? 0),
    airportCount: Math.max(0, cached.airportCountByRes1H3.get(payload.h3Index) ?? 0),
    seaportCount: Math.max(0, cached.seaportCountByRes1H3.get(payload.h3Index) ?? 0),
  };
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
  return cached.res4FeatureRows;
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
