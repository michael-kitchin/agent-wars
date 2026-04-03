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

export interface TerrainInfrastructureHintsPayload {
  res1MajorAirports: string[];
  res1MajorSeaports: string[];
  res4MajorAirports: string[];
  res4MajorSeaports: string[];
}

export interface TerrainClassificationSnapshot {
  res1KindByH3: ReadonlyMap<string, PipelineTerrainKind>;
  /** Child res-4 rows carrying either a base-kind override and/or `isUrban` overlay flag for renderer detail mode. */
  res4OverrideRows: ReadonlyArray<{ h3Index: string; terrainKind: PipelineTerrainKind; isUrban: boolean }>;
  infrastructureHints: TerrainInfrastructureHintsPayload;
  namingLinesRes1ByH3: ReadonlyMap<string, string>;
  namingLinesRes4ByH3: ReadonlyMap<string, string>;
  continentNamesRes1ByH3: ReadonlyMap<string, string[]>;
  urbanHexCountByRes1H3: ReadonlyMap<string, number>;
  seaportCountByRes1H3: ReadonlyMap<string, number>;
}

let cached: TerrainClassificationSnapshot | null = null;

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
  for (const row of res1Env.records) {
    if (recordHasMajorAirport(row)) res1MajorAirports.push(row.h3_index);
    if (recordHasMajorSeaport(row)) res1MajorSeaports.push(row.h3_index);
    seaportCountByRes1H3.set(row.h3_index, Math.max(0, row.seaport_count_total));
  }
  const res4MajorAirports: string[] = [];
  const res4MajorSeaports: string[] = [];
  const res4ClassifiedRows: Array<{ h3Index: string; parentH3: string; childKind: PipelineTerrainKind; isUrban: boolean }> = [];
  const urbanHexCountByRes1H3 = new Map<string, number>();
  const childKindCountsByParent = new Map<string, Map<PipelineTerrainKind, number>>();
  for (const row of res4Env.records as HexMetadataRecordRes4[]) {
    const childKind = classifyRes4TerrainKind(row, t, nodata);
    const isUrban = isRes4UrbanOverlayHex(row);
    const parentH3 = cellToParent(row.h3_index, METADATA_PARENT_RESOLUTION);
    let parentCounts = childKindCountsByParent.get(parentH3);
    if (!parentCounts) {
      parentCounts = new Map<PipelineTerrainKind, number>();
      childKindCountsByParent.set(parentH3, parentCounts);
    }
    parentCounts.set(childKind, (parentCounts.get(childKind) ?? 0) + 1);
    res4ClassifiedRows.push({ h3Index: row.h3_index, parentH3, childKind, isUrban });
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
    infrastructureHints: {
      res1MajorAirports,
      res1MajorSeaports,
      res4MajorAirports,
      res4MajorSeaports,
    },
    namingLinesRes1ByH3,
    namingLinesRes4ByH3,
    continentNamesRes1ByH3,
    urbanHexCountByRes1H3,
    seaportCountByRes1H3,
  };
}

/**
 * Why this exists:
 *     Load metadata JSON once and memoize classified maps for fast `resetGameForNewMatch` and renderer IPC without rereading disk.
 * When to use:
 *     During app init after the DB is ready, and implicitly before first hex seeding.
 * What to expect:
 *     Throws if any metadata file is missing or invalid; safe to call repeatedly (no-op when already loaded).
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
 * Why this exists:
 *     Provide classified res-1 kinds for SQLite `hexes` seeding.
 * When to use:
 *     From `gameDb` hex seeding after `ensureTerrainClassificationCacheLoaded`.
 * What to expect:
 *     Throws if cache was never built; returns an immutable map view.
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
 * Why this exists:
 *     Supply res-4 renderer overlay rows (base terrain + urban state) for detail rendering.
 * When to use:
 *     From the `game:getRes4TerrainOverrides` IPC handler.
 * What to expect:
 *     Returns a new array snapshot; throws if cache was never built.
 */
export function getRes4TerrainOverridesForRenderer(): Array<{
  h3Index: string;
  terrainKind: PipelineTerrainKind;
  isUrban: boolean;
}> {
  logTrace('terrainClassificationCache getRes4TerrainOverridesForRenderer');
  if (!cached) {
    const err = new Error('terrainClassificationCache: load ensureTerrainClassificationCacheLoaded() first');
    logError('terrainClassificationCache getRes4TerrainOverridesForRenderer: cache empty', err);
    throw err;
  }
  return [...cached.res4OverrideRows];
}

/**
 * Why this exists:
 *     Provide sparse H3 lists for major airports/seaports (scalerank ≤ 5) so the renderer can draw terrain-hover glyphs.
 * When to use:
 *     From `game:getTerrainInfrastructureHints` after the classification cache is loaded.
 * What to expect:
 *     New object each call; throws if cache is empty.
 */
export function getTerrainInfrastructureHintsForRenderer(): TerrainInfrastructureHintsPayload {
  logTrace('terrainClassificationCache getTerrainInfrastructureHintsForRenderer');
  if (!cached) {
    const err = new Error('terrainClassificationCache: load ensureTerrainClassificationCacheLoaded() first');
    logError('terrainClassificationCache getTerrainInfrastructureHintsForRenderer: cache empty', err);
    throw err;
  }
  const h = cached.infrastructureHints;
  return {
    res1MajorAirports: [...h.res1MajorAirports],
    res1MajorSeaports: [...h.res1MajorSeaports],
    res4MajorAirports: [...h.res4MajorAirports],
    res4MajorSeaports: [...h.res4MajorSeaports],
  };
}

/**
 * Why this exists:
 *     Provide hover tooltip naming headline for one hex (res-4 city/state preference, res-1 state fallback).
 * When to use:
 *     Renderer `game:getHexNamingTooltipLine` IPC calls on hover.
 * What to expect:
 *     Returns null when no naming line exists for that hex/resolution; throws if cache is not loaded.
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
 * Why this exists:
 *     Return de-duplicated continent names for one res-1 hex for unknown-battle announcements.
 * When to use:
 *     Renderer/main formatting of fog-of-war combat announcements without unit identity.
 * What to expect:
 *     Returns empty list when no naming continents exist for the hex; throws if cache is not loaded.
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
 * Why this exists:
 *     Returns production-relevant terrain infrastructure counts for one res-1 hex.
 * When to use:
 *     Build queue gating and turn production calculations in main-process gameplay logic.
 * What to expect:
 *     Always returns non-negative counts; missing rows default to zero.
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
    seaportCount: Math.max(0, cached.seaportCountByRes1H3.get(payload.h3Index) ?? 0),
  };
}

/**
 * Why this exists:
 *     Lets consumers decide whether production-context reads are safe without forcing cache initialization.
 * When to use:
 *     Movement/pathing helpers that should opportunistically use terrain metadata when available.
 * What to expect:
 *     Returns true only after `ensureTerrainClassificationCacheLoaded` has successfully built the cache.
 */
export function isTerrainClassificationCacheLoaded(): boolean {
  logTrace('terrainClassificationCache isTerrainClassificationCacheLoaded');
  return cached !== null;
}

/**
 * Why this exists:
 *     Reset process-level terrain cache between main-process tests that swap metadata fixtures.
 * When to use:
 *     Test teardown after `setTerrainMetadataPathOverrideForTests`.
 * What to expect:
 *     Next `ensureTerrainClassificationCacheLoaded` rebuilds from disk.
 */
export function clearTerrainClassificationCacheForTests(): void {
  logDebug('terrainClassificationCache clearTerrainClassificationCacheForTests');
  cached = null;
}
