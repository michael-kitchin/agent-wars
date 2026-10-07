/**
 * One-shot terrain classification from bundled metadata JSON: res-1 kinds for DB seeding and res-4 override rows for the renderer.
 */

import { activeGameMap } from '../shared/activeGameMap';
import { setStrategicTerrainFlags } from '../shared/strategicTerrainFlags';
import { buildStrategicTerrainFlagSets } from './strategicTerrainFlagBuild';
import { strategicH3Resolution, strategicParentOf, tacticalH3Resolution } from '../shared/h3Resolutions';
import { logDebug, logError, logTrace } from './logger';
import type { PipelineTerrainKind } from '../shared/pipelineTerrain';
import type { StrategicProductionContextSnapshot } from '../shared/ipcTypes';
import {
  classifyCellWithoutUrbanOverride,
  classifyTacticalTerrainKind,
  isTacticalUrbanOverlayHex,
} from './terrainClassifierFromMetadata';
import {
  DEFAULT_CLASSIFIER_THRESHOLDS,
  DEFAULT_NODATA_FALLBACK_TERRAIN,
  loadTerrainStrategicMetadataBundled,
  loadTerrainTacticalMetadataBundled,
  recordHasMajorAirport,
  recordHasMajorSeaport,
  type HexMetadataRecordTactical,
} from './terrainMetadataLoad';
import {
  loadTerrainStrategicNamingBundled,
  loadTerrainTacticalNamingBundled,
  type TerrainNamingRecordStrategic,
  type TerrainNamingRecordTactical,
} from './terrainNamingLoad';
import {
  buildNamingCaptionsByH3,
  namingCaptionForStrategicRecord,
  namingCaptionForTacticalRecord,
} from './terrainNamingCaption';
import type { HexNamingCaption } from '../shared/hexNamingCaption';
import { clearTacticalBirthCountryCache, storeTacticalBirthCountryCache } from './unitOrigin/tacticalBirthCountryCache';
import {
  assertLandMassMatchesHexList,
  buildStrategicLandMassByH3,
  loadTerrainStrategicLandMassBundled,
} from './terrainLandMassLoad';
import type { StrategicLandMassRecord } from '../shared/landTraversalStrategic';
import { ensureWeatherPackLoaded } from './weather/weatherPackLoad';
import { reduceTacticalCityOverlayLabelsByH3 } from './terrainTacticalCityOverlayReduce';
import { loadTerrainTacticalRoadRailSidesBundled } from './terrainRoadRailSidesLoad';
import { loadTerrainTacticalRoadRailVectorsBundled } from './terrainRoadRailVectorsLoad';
import {
  hexContinentNamesFromSnapshot,
  hexNamingTooltipLineFromSnapshot,
  strategicBaselineUrbanHexCountRowsFromSnapshot,
  strategicProductionContextFromSnapshot,
  tacticalCityOverlayRowsFromSnapshot,
  tacticalFeatureRowsForSeedingFromSnapshot,
  tacticalRoadRailOverlayRowsFromSnapshot,
  tacticalTerrainOverridesRowsForRenderer,
  tacticalTransportVectorOverlayRowsFromSnapshot,
  terrainStrategicKindsFromSnapshot,
} from './terrainClassificationCacheSerialization';
import type {
  StrategicBaselineUrbanHexCountRow,
  TacticalCityOverlayRow,
  TacticalRoadRailOverlayRow,
  TacticalTransportVectorOverlayRow,
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
   * Specifies the contract for the `strategicKindByH3` member (strategicKindByH3: ReadonlyMap<string, PipelineTerrainKind>;).

   * Contract: Describes stable behavior for callers of `strategicKindByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
strategicKindByH3: ReadonlyMap<string, PipelineTerrainKind>;
    /**
   * Specifies the contract for the `tacticalOverrideRows` member (tacticalOverrideRows: ReadonlyArray<{ h3Index: string; terrainKind: PipelineTerrainKind; isUrban: boolean }>;).

   * Contract: Describes stable behavior for callers of `tacticalOverrideRows` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
tacticalOverrideRows: ReadonlyArray<{ h3Index: string; terrainKind: PipelineTerrainKind; isUrban: boolean }>;
  /**
   * Precomputed naming caption per strategic hex.
   * Contract: Hexes without naming rows are absent; identical captions share one object.
   * When to use: Hex naming IPC lookups at resolution 1.
   * Expected outcome: Caption text plus country spans for flags.
   * Exceptions: None.
   */
  readonly namingCaptionsStrategicByH3: ReadonlyMap<string, HexNamingCaption>;
  /**
   * Precomputed naming caption per tactical cell.
   * Contract: Cells without naming rows are absent; identical captions share one object.
   * When to use: Hex naming IPC lookups at resolution 4.
   * Expected outcome: Caption text plus country spans for flags.
   * Exceptions: None.
   */
  readonly namingCaptionsTacticalByH3: ReadonlyMap<string, HexNamingCaption>;
    /**
   * Specifies the contract for the `continentNamesStrategicByH3` member (continentNamesStrategicByH3: ReadonlyMap<string, string[]>;).

   * Contract: Describes stable behavior for callers of `continentNamesStrategicByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
continentNamesStrategicByH3: ReadonlyMap<string, string[]>;
    /**
   * Specifies the contract for the `urbanHexCountByStrategicH3` member (urbanHexCountByStrategicH3: ReadonlyMap<string, number>;).

   * Contract: Describes stable behavior for callers of `urbanHexCountByStrategicH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urbanHexCountByStrategicH3: ReadonlyMap<string, number>;
    /**
   * Specifies the contract for the `airportCountByStrategicH3` member (airportCountByStrategicH3: ReadonlyMap<string, number>;).

   * Contract: Describes stable behavior for callers of `airportCountByStrategicH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airportCountByStrategicH3: ReadonlyMap<string, number>;
    /**
   * Specifies the contract for the `seaportCountByStrategicH3` member (seaportCountByStrategicH3: ReadonlyMap<string, number>;).

   * Contract: Describes stable behavior for callers of `seaportCountByStrategicH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seaportCountByStrategicH3: ReadonlyMap<string, number>;
    /**
   * Specifies the contract for the `tacticalCityOverlayByH3` member (tacticalCityOverlayByH3: ReadonlyMap<string, string>;).

   * Contract: Reduced tactical city labels (scalerank 0..4) keyed by child `h3_index` for map inspection overlays.
   * When to use: Renderer IPC that must not re-parse the full naming JSON each frame.
   * Expected outcome: Values are non-empty display strings; missing keys mean no city overlay for that hex.
   * Exceptions: None.
   */
tacticalCityOverlayByH3: ReadonlyMap<string, string>;
    /**
   * Specifies the contract for the `tacticalRoadRailOverlayByH3` member (tacticalRoadRailOverlayByH3: ReadonlyMap<string, { roadSides: readonly boolean[]; railSides: readonly boolean[] }>;).

   * Contract: Boolean side masks for roads/rails aligned to the exported clockwise side ordering contract; the renderer infers edge-to-edge chord strokes (plus short inward spurs when the active count is odd) from these masks, not exported centerline polylines.
   * When to use: Renderer IPC for tactical transport overlays when tactical is visible (`drawTacticalCityOverlays` + `buildTransportChordSegments`).
   * Expected outcome: Both arrays share length 5 or 6 for a given cell; absent keys mean no transport overlay.
   * Exceptions: None.
   */
tacticalRoadRailOverlayByH3: ReadonlyMap<string, { roadSides: readonly boolean[]; railSides: readonly boolean[] }>;
    /**
   * Specifies the contract for the `tacticalTransportVectorOverlayRows` member (tacticalTransportVectorOverlayRows: ReadonlyArray<TacticalTransportVectorOverlayRow>;).

   * Contract: Optional display-only road/rail polylines for Leaflet overlays; empty when vector artifact is absent.
   * When to use: Renderer IPC for vector transport drawing without touching boolean pathfinding masks.
   * Expected outcome: Rows contain validated `kind` and WGS84 `points`.
   * Exceptions: None.
   */
tacticalTransportVectorOverlayRows: ReadonlyArray<TacticalTransportVectorOverlayRow>;
    /**
   * Specifies the contract for the `tacticalFeatureRows` member (tacticalFeatureRows: ReadonlyArray<{ h3Index: string; parentH3Index: string; terrainKind: PipelineTerrainKind; isUrban: boolean; isAirport:).

   * Contract: Describes stable behavior for callers of `tacticalFeatureRows` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
tacticalFeatureRows: ReadonlyArray<{
    h3Index: string;
    parentH3Index: string;
    terrainKind: PipelineTerrainKind;
    isUrban: boolean;
    isAirport: boolean;
    isSeaport: boolean;
  }>;
    /**
   * Specifies the contract for the `strategicNamingRecords` member (strategicNamingRecords: ReadonlyArray<TerrainNamingRecordStrategic>;).

   * Contract: Parsed strategic naming rows from `terrain_res1_naming.json` retained for region/scenario helpers without a second file read.
   * When to use: `regionScenario.buildRegionHexCache` and other callers needing country `region` per strategic hex.
   * Expected outcome: Same records as `loadTerrainStrategicNamingBundled().records` at snapshot build time.
   * Exceptions: None.
   */
strategicNamingRecords: ReadonlyArray<TerrainNamingRecordStrategic>;
    /**
   * Specifies the contract for the `strategicLandMassByH3` member (strategicLandMassByH3: ReadonlyMap<string, StrategicLandMassRecord>;).

   * Contract: Precomputed continent/island membership and water fraction per res-1 hex for land-unit pathfinding.
   * When to use: Strategic land movement validation and routing after cache load.
   * Expected outcome: One record per res-1 hex; keys match strategicKindByH3.
   * Exceptions: None.
   */
strategicLandMassByH3: ReadonlyMap<string, StrategicLandMassRecord>;
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
  const strategicEnv = loadTerrainStrategicMetadataBundled();
  const tacticalEnv = loadTerrainTacticalMetadataBundled();
  const namingStrategicEnv = loadTerrainStrategicNamingBundled();
  const namingTacticalEnv = loadTerrainTacticalNamingBundled();
  const expectedStrategic = strategicH3Resolution();
  const expectedTactical = tacticalH3Resolution();
  if (strategicEnv.resolution !== expectedStrategic) {
    throw new Error(
      `terrain metadata: strategic resolution ${strategicEnv.resolution} != expected ${expectedStrategic}`
    );
  }
  if (tacticalEnv.resolution !== expectedTactical) {
    throw new Error(
      `terrain metadata: tactical resolution ${tacticalEnv.resolution} != expected ${expectedTactical}`
    );
  }
  if (tacticalEnv.record_count <= 0) {
    throw new Error(
      'terrain metadata: terrain_res4_metadata.json has no records; regenerate with npm run terrain:generate'
    );
  }
  if (namingStrategicEnv.resolution !== expectedStrategic) {
    throw new Error(
      `terrain naming: strategic resolution ${namingStrategicEnv.resolution} != expected ${expectedStrategic}`
    );
  }
  if (namingTacticalEnv.resolution !== expectedTactical) {
    throw new Error(
      `terrain naming: tactical resolution ${namingTacticalEnv.resolution} != expected ${expectedTactical}`
    );
  }
  if (namingTacticalEnv.record_count <= 0) {
    throw new Error(
      'terrain naming: terrain_res4_naming.json has no records; regenerate with naming pipeline'
    );
  }
  const nodata = DEFAULT_NODATA_FALLBACK_TERRAIN;
  const t = DEFAULT_CLASSIFIER_THRESHOLDS;

  const strategicFallbackKindByH3 = new Map<string, PipelineTerrainKind>();
  for (const row of strategicEnv.records) {
    strategicFallbackKindByH3.set(row.h3_index, classifyCellWithoutUrbanOverride(row, t, nodata));
  }

  const scaleranks = activeGameMap().scaleranks;
  const strategicMajorAirports: string[] = [];
  const strategicMajorSeaports: string[] = [];
  const seaportCountByStrategicH3 = new Map<string, number>();
  const airportCountByStrategicH3 = new Map<string, number>();
  for (const row of strategicEnv.records) {
    if (recordHasMajorAirport(row, scaleranks.airport)) strategicMajorAirports.push(row.h3_index);
    if (recordHasMajorSeaport(row, scaleranks.seaport)) strategicMajorSeaports.push(row.h3_index);
    airportCountByStrategicH3.set(row.h3_index, Math.max(0, row.airport_count_total));
    seaportCountByStrategicH3.set(row.h3_index, Math.max(0, row.seaport_count_total));
  }
  const tacticalMajorAirports: string[] = [];
  const tacticalMajorSeaports: string[] = [];
  const tacticalFeatureRows: Array<{
    h3Index: string;
    parentH3Index: string;
    terrainKind: PipelineTerrainKind;
    isUrban: boolean;
    isAirport: boolean;
    isSeaport: boolean;
  }> = [];
  const tacticalClassifiedRows: Array<{ h3Index: string; parentH3: string; childKind: PipelineTerrainKind; isUrban: boolean }> = [];
  const urbanHexCountByStrategicH3 = new Map<string, number>();
  const childKindCountsByParent = new Map<string, Map<PipelineTerrainKind, number>>();
  for (const row of tacticalEnv.records as HexMetadataRecordTactical[]) {
    const childKind = classifyTacticalTerrainKind(row, t, nodata);
    const isUrban = isTacticalUrbanOverlayHex(row, scaleranks.urbanOverlay);
    const parentH3 = strategicParentOf(row.h3_index);
    // Point infrastructure: use major-feature scalerank gates (not raw totals). Totals are noisy and
    // mark many tactical children when a strategic hosts port/airport influence, which breaks tactical rules
    // that must treat only true facility tiles as seaport/airport tactical cells.
    const isAirport = recordHasMajorAirport(row, scaleranks.airport);
    const isSeaport = recordHasMajorSeaport(row, scaleranks.seaport);
    let parentCounts = childKindCountsByParent.get(parentH3);
    if (!parentCounts) {
      parentCounts = new Map<PipelineTerrainKind, number>();
      childKindCountsByParent.set(parentH3, parentCounts);
    }
    parentCounts.set(childKind, (parentCounts.get(childKind) ?? 0) + 1);
    tacticalClassifiedRows.push({ h3Index: row.h3_index, parentH3, childKind, isUrban });
    tacticalFeatureRows.push({
      h3Index: row.h3_index,
      parentH3Index: parentH3,
      terrainKind: childKind,
      isUrban,
      isAirport,
      isSeaport,
    });
    if (isUrban) {
      urbanHexCountByStrategicH3.set(parentH3, (urbanHexCountByStrategicH3.get(parentH3) ?? 0) + 1);
    }
    if (recordHasMajorAirport(row, scaleranks.airport)) tacticalMajorAirports.push(row.h3_index);
    if (recordHasMajorSeaport(row, scaleranks.seaport)) tacticalMajorSeaports.push(row.h3_index);
  }

  const strategicKindByH3 = new Map<string, PipelineTerrainKind>();
  for (const row of strategicEnv.records) {
    const counts = childKindCountsByParent.get(row.h3_index);
    if (!counts || counts.size === 0) {
      strategicKindByH3.set(row.h3_index, strategicFallbackKindByH3.get(row.h3_index) ?? nodata);
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
    strategicKindByH3.set(row.h3_index, dominantKind ?? (strategicFallbackKindByH3.get(row.h3_index) ?? nodata));
  }

  const tacticalOverrideRows: { h3Index: string; terrainKind: PipelineTerrainKind; isUrban: boolean }[] = [];
  for (const row of tacticalClassifiedRows) {
    const { h3Index, parentH3, childKind, isUrban } = row;
    const parentKind = strategicKindByH3.get(parentH3);
    if (parentKind === undefined) {
      const msg = `terrain metadata: res4 child ${h3Index} parent ${parentH3} missing from res1 map`;
      logError('terrainClassificationCache buildSnapshot: orphan res4 row', new Error(msg));
      throw new Error(msg);
    }
    if (childKind !== parentKind || isUrban) {
      tacticalOverrideRows.push({ h3Index, terrainKind: childKind, isUrban });
    }
  }
  const namingCaptionsStrategicByH3 = buildNamingCaptionsByH3(namingStrategicEnv.records, namingCaptionForStrategicRecord);
  const namingCaptionsTacticalByH3 = buildNamingCaptionsByH3(
    namingTacticalEnv.records as TerrainNamingRecordTactical[],
    namingCaptionForTacticalRecord
  );
  const tacticalCityOverlayByH3 = reduceTacticalCityOverlayLabelsByH3(
    namingTacticalEnv.records as TerrainNamingRecordTactical[],
    scaleranks.cityLabel,
  );
  const tacticalRoadRailOverlayByH3 = loadTerrainTacticalRoadRailSidesBundled();
  const tacticalTransportVectorOverlayRows = loadTerrainTacticalRoadRailVectorsBundled();
  const continentNamesStrategicByH3 = new Map<string, string[]>();
  for (const row of namingStrategicEnv.records as TerrainNamingRecordStrategic[]) {
    const names: string[] = [];
    for (const countryRow of row.countries) {
      const candidate = (countryRow.continent ?? '').trim() || countryRow.name.trim();
      if (!candidate) continue;
      if (!names.includes(candidate)) names.push(candidate);
    }
    continentNamesStrategicByH3.set(row.h3_index, names);
  }

  const landMassEnv = loadTerrainStrategicLandMassBundled();
  ensureWeatherPackLoaded();
  const strategicLandMassByH3 = buildStrategicLandMassByH3(landMassEnv);
  const expectedStrategicHexes = strategicEnv.records.map((row) => row.h3_index);
  assertLandMassMatchesHexList(strategicLandMassByH3, expectedStrategicHexes);

  logDebug('terrainClassificationCache buildSnapshot: done', {
    strategicCount: strategicKindByH3.size,
    tacticalRecords: tacticalEnv.records.length,
    tacticalOverrideCount: tacticalOverrideRows.length,
    strategicMajorAirportHexes: strategicMajorAirports.length,
    strategicMajorSeaportHexes: strategicMajorSeaports.length,
    tacticalMajorAirportHexes: tacticalMajorAirports.length,
    tacticalMajorSeaportHexes: tacticalMajorSeaports.length,
    strategicNamingHexes: namingCaptionsStrategicByH3.size,
    tacticalNamingHexes: namingCaptionsTacticalByH3.size,
    tacticalCityOverlayHexes: tacticalCityOverlayByH3.size,
    tacticalRoadRailOverlayHexes: tacticalRoadRailOverlayByH3.size,
    tacticalTransportVectorRows: tacticalTransportVectorOverlayRows.length,
    strategicLandMassHexes: strategicLandMassByH3.size,
  });
  storeTacticalBirthCountryCache(namingStrategicEnv.records as TerrainNamingRecordStrategic[], namingTacticalEnv.records as TerrainNamingRecordTactical[]);
  setStrategicTerrainFlags(
    buildStrategicTerrainFlagSets({
      records: tacticalEnv.records as HexMetadataRecordTactical[],
      thresholds: t,
      nodataFallback: nodata,
      urbanHexCountByStrategicH3,
    })
  );
  return {
    strategicKindByH3,
    tacticalOverrideRows,
    namingCaptionsStrategicByH3,
    namingCaptionsTacticalByH3,
    continentNamesStrategicByH3,
    urbanHexCountByStrategicH3,
    airportCountByStrategicH3,
    seaportCountByStrategicH3,
    tacticalCityOverlayByH3,
    tacticalRoadRailOverlayByH3,
    tacticalTransportVectorOverlayRows,
    tacticalFeatureRows,
    strategicNamingRecords: namingStrategicEnv.records as TerrainNamingRecordStrategic[],
    strategicLandMassByH3,
  };
}

export function clearTerrainClassificationCache(): void {
  logDebug('terrainClassificationCache clearTerrainClassificationCache');
  cached = null;
  setStrategicTerrainFlags(null);
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
 * Returns parsed strategic naming records from the loaded terrain snapshot.
 *
 * Purpose: Supplies `regionScenario` and similar helpers without re-reading `terrain_res1_naming.json`.
 * When to use: After `ensureTerrainClassificationCacheLoaded()` at startup or before region hex aggregation.
 * Expected outcome: Read-only array identical to the bundled naming envelope records used when the snapshot was built.
 * Exceptions: Throws if the classification cache has not been loaded yet.
 */
export function getTerrainStrategicNamingRecordsFromSnapshot(): ReadonlyArray<TerrainNamingRecordStrategic> {
  logTrace('terrainClassificationCache getTerrainRes1NamingRecordsFromSnapshot');
  if (!cached) {
    const err = new Error('terrainClassificationCache: load ensureTerrainClassificationCacheLoaded() first');
    logError('terrainClassificationCache getTerrainRes1NamingRecordsFromSnapshot: cache empty', err);
    throw err;
  }
  return cached.strategicNamingRecords;
}

/**
 * Defines the `getStrategicLandMassByH3` function shape (export function getStrategicLandMassByH3(): ReadonlyMap<string, StrategicLandMassRecord>).

 * Purpose: Supports maintainability by documenting why `getStrategicLandMassByH3` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getStrategicLandMassByH3(): ReadonlyMap<string, StrategicLandMassRecord> {
  logTrace('terrainClassificationCache getRes1LandMassByH3');
  ensureTerrainClassificationCacheLoaded();
  return cached!.strategicLandMassByH3;
}

/**
 * Defines the `getTerrainStrategicKindsFromCache` function shape (export function getTerrainStrategicKindsFromCache(): ReadonlyMap<string, PipelineTerrainKind> { logTrace('terrainClassificationCache getTerrainStrategicKindsFromCache').

 * Purpose: Supports maintainability by documenting why `getTerrainStrategicKindsFromCache` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getTerrainStrategicKindsFromCache(): ReadonlyMap<string, PipelineTerrainKind> {
  logTrace('terrainClassificationCache getTerrainRes1KindsFromCache');
  if (!cached) {
    const err = new Error('terrainClassificationCache: load ensureTerrainClassificationCacheLoaded() first');
    logError('terrainClassificationCache getTerrainRes1KindsFromCache: cache empty', err);
    throw err;
  }
  return terrainStrategicKindsFromSnapshot(cached);
}

/**
 * Defines the `getTacticalTerrainOverridesForRenderer` function shape (export function getTacticalTerrainOverridesForRenderer(): Array<).

 * Purpose: Supports maintainability by documenting why `getTacticalTerrainOverridesForRenderer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getTacticalTerrainOverridesForRenderer(): Array<{
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
  return tacticalTerrainOverridesRowsForRenderer(cached);
}

/**
 * Looks up the precomputed naming caption for a strategic or tactical hex.
 *
 * Purpose: Backs the `game:getHexNamingTooltipLine` IPC handler.
 * When to use: After `ensureTerrainClassificationCacheLoaded()`.
 * Expected outcome: The shared caption object, or `null` when the hex has no naming data.
 * Exceptions: Throws when the cache has not been loaded.
 */
export function getHexNamingTooltipLineForRenderer(
  payload: { h3Index: string; resolution: 1 | 4 }
): HexNamingCaption | null {
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
 * Defines the `getTacticalCityOverlaysForRenderer` function shape (export function getTacticalCityOverlaysForRenderer(): TacticalCityOverlayRow[]).

 * Purpose: Serializes reduced tactical city labels for renderer map inspection overlays.
 * When to use: `game:getTacticalCityOverlays` IPC handler after the classification cache is loaded.
 * Expected outcome: Stable array of `{ h3Index, label }` rows; empty when the cache has not been built yet.
 * Exceptions: None.
 */
export function getTacticalCityOverlaysForRenderer(): TacticalCityOverlayRow[] {
  logTrace('terrainClassificationCache getRes4CityOverlaysForRenderer');
  if (!cached) {
    logDebug('terrainClassificationCache getRes4CityOverlaysForRenderer: cache empty, returning []');
    return [];
  }
  return tacticalCityOverlayRowsFromSnapshot(cached);
}

/**
 * Returns the generated urban-cell count for each strategic hex that can produce units.
 *
 * Purpose: Tooltips and the build popup classify tech from this baseline, which air strikes do not change.
 * When to use: `game:getStrategicBaselineUrbanHexCounts` after the classification cache is loaded.
 * Expected outcome: Rows with a positive count. Empty when the cache has not been built yet.
 * Exceptions: None.
 */
export function getStrategicBaselineUrbanHexCountsForRenderer(): StrategicBaselineUrbanHexCountRow[] {
  logTrace('terrainClassificationCache getRes1BaselineUrbanHexCountsForRenderer');
  if (!cached) {
    logDebug('terrainClassificationCache getRes1BaselineUrbanHexCountsForRenderer: cache empty, returning []');
    return [];
  }
  return strategicBaselineUrbanHexCountRowsFromSnapshot(cached);
}

/**
 * Defines the `getTacticalRoadRailOverlaysForRenderer` function shape (export function getTacticalRoadRailOverlaysForRenderer(): TacticalRoadRailOverlayRow[]).

 * Purpose: Serializes bundled road/rail side masks for renderer transport glyphs.
 * When to use: `game:getTacticalRoadRailOverlays` IPC handler after the classification cache is loaded.
 * Expected outcome: Each row includes cloned boolean arrays suitable for immediate renderer caching.
 * Exceptions: None.
 */
export function getTacticalRoadRailOverlaysForRenderer(): TacticalRoadRailOverlayRow[] {
  logTrace('terrainClassificationCache getRes4RoadRailOverlaysForRenderer');
  if (!cached) {
    logDebug('terrainClassificationCache getRes4RoadRailOverlaysForRenderer: cache empty, returning []');
    return [];
  }
  return tacticalRoadRailOverlayRowsFromSnapshot(cached);
}

/**
 * Defines the `getTacticalTransportVectorOverlaysForRenderer` function shape (export function getTacticalTransportVectorOverlaysForRenderer(): TacticalTransportVectorOverlayRow[]).

 * Purpose: Serializes optional display-only road/rail vector rows for the Leaflet overlay layer.
 * When to use: `game:getTacticalTransportVectorOverlays` IPC handler after cache load.
 * Expected outcome: Returns cloned point tuples for renderer safety; empty when optional artifact is unavailable.
 * Exceptions: None.
 */
export function getTacticalTransportVectorOverlaysForRenderer(): TacticalTransportVectorOverlayRow[] {
  logTrace('terrainClassificationCache getRes4TransportVectorOverlaysForRenderer');
  if (!cached) {
    logDebug('terrainClassificationCache getRes4TransportVectorOverlaysForRenderer: cache empty, returning []');
    return [];
  }
  return tacticalTransportVectorOverlayRowsFromSnapshot(cached);
}

/**
 * Defines the `getStrategicProductionContext` function shape (export function getStrategicProductionContext(payload:).

 * Purpose: Supports maintainability by documenting why `getStrategicProductionContext` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getStrategicProductionContext(payload: { h3Index: string }): StrategicProductionContextSnapshot {
  logTrace('terrainClassificationCache getRes1ProductionContext', payload);
  if (!cached) {
    const err = new Error('terrainClassificationCache: load ensureTerrainClassificationCacheLoaded() first');
    logError('terrainClassificationCache getRes1ProductionContext: cache empty', err);
    throw err;
  }
  return strategicProductionContextFromSnapshot(cached, payload.h3Index);
}

/**
 * Defines the `getTacticalFeatureRowsForSeeding` function shape (export function getTacticalFeatureRowsForSeeding(): ReadonlyArray<).

 * Purpose: Supports maintainability by documenting why `getTacticalFeatureRowsForSeeding` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getTacticalFeatureRowsForSeeding(): ReadonlyArray<{
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
  return tacticalFeatureRowsForSeedingFromSnapshot(cached);
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
 * Returns the classification-cache seaport counts keyed by res-1 H3, or null when unloaded.
 *
 * Purpose: Naval berth lookup merges world seaports in bulk for hexes omitted from snapshot infra.
 * When to use: `seaportCountByH3ForNavalLookup` when building a strategic naval hex lookup.
 * Expected outcome: The cache map (including zeros) when loaded; null before `ensureTerrainClassificationCacheLoaded`.
 * Exceptions: None.
 */
export function getCachedSeaportCountByStrategicH3(): ReadonlyMap<string, number> | null {
  logTrace('terrainClassificationCache getCachedSeaportCountByRes1H3');
  return cached?.seaportCountByStrategicH3 ?? null;
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
  setStrategicTerrainFlags(null);
  clearTacticalBirthCountryCache();
}
