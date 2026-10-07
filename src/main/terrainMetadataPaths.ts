/**
 * Resolves bundled terrain generated JSON paths for dev (repo layout) and packaged Electron (app root / asar).
 */

import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError } from './logger';

/**
 * Documents the module-scope binding `STRATEGIC_SEGMENTS` (STRATEGIC_SEGMENTS).

 * Purpose: Supports maintainability by documenting why `STRATEGIC_SEGMENTS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const STRATEGIC_SEGMENTS = ['data', 'generated', 'terrain_res1_metadata.json'] as const;
/**
 * Documents the module-scope binding `TACTICAL_SEGMENTS` (TACTICAL_SEGMENTS).

 * Purpose: Supports maintainability by documenting why `TACTICAL_SEGMENTS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const TACTICAL_SEGMENTS = ['data', 'generated', 'terrain_res4_metadata.json'] as const;
/**
 * Documents the module-scope binding `STRATEGIC_NAMING_SEGMENTS` (STRATEGIC_NAMING_SEGMENTS).

 * Purpose: Supports maintainability by documenting why `STRATEGIC_NAMING_SEGMENTS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const STRATEGIC_NAMING_SEGMENTS = ['data', 'generated', 'terrain_res1_naming.json'] as const;
/**
 * Documents the module-scope binding `TACTICAL_NAMING_SEGMENTS` (TACTICAL_NAMING_SEGMENTS).

 * Purpose: Supports maintainability by documenting why `TACTICAL_NAMING_SEGMENTS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const TACTICAL_NAMING_SEGMENTS = ['data', 'generated', 'terrain_res4_naming.json'] as const;
/**
 * Documents the module-scope binding `TACTICAL_ROAD_RAIL_SIDES_SEGMENTS` (TACTICAL_ROAD_RAIL_SIDES_SEGMENTS).

 * Purpose: Supports maintainability by documenting why `TACTICAL_ROAD_RAIL_SIDES_SEGMENTS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const TACTICAL_ROAD_RAIL_SIDES_SEGMENTS = ['data', 'generated', 'terrain_res4_road_rail_sides.json'] as const;
/**
 * Documents the module-scope binding `TACTICAL_ROAD_RAIL_VECTORS_SEGMENTS` (TACTICAL_ROAD_RAIL_VECTORS_SEGMENTS).

 * Purpose: Candidate segments for optional Leaflet road/rail display-vector JSON lookup (non-gameplay).
 * When to use: `resolveTerrainTacticalRoadRailVectorsPathOptional` path probing.
 * Expected outcome: Matches `data/generated/terrain_res4_road_rail_vectors.json`.
 * Exceptions: None.
 */
const TACTICAL_ROAD_RAIL_VECTORS_SEGMENTS = ['data', 'generated', 'terrain_res4_road_rail_vectors.json'] as const;
/**
 * Documents the module-scope binding `STRATEGIC_LANDMASS_SEGMENTS` (STRATEGIC_LANDMASS_SEGMENTS).

 * Purpose: Candidate path segments for res-1 land-mass JSON used by strategic land-unit pathfinding.
 * When to use: `resolveTerrainStrategicLandMassPath` path probing.
 * Expected outcome: Matches `data/generated/terrain_res1_landmass.json`.
 * Exceptions: None.
 */
const STRATEGIC_LANDMASS_SEGMENTS = ['data', 'generated', 'terrain_res1_landmass.json'] as const;
/**
 * Path segments for the strategic weather pack.
 *
 * Purpose: Campaign weather is a generated file, not a live climate query.
 * When to use: `resolveTerrainStrategicWeatherPath`.
 * Expected outcome: Matches `data/generated/terrain_res1_weather.json`.
 * Exceptions: None.
 */
const STRATEGIC_WEATHER_SEGMENTS = ['data', 'generated', 'terrain_res1_weather.json'] as const;

/**
 * Documents the module-scope binding `testOverrideRoot` (testOverrideRoot: string | null).

 * Purpose: Supports maintainability by documenting why `testOverrideRoot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let testOverrideRoot: string | null = null;

/**
 * Defines the `setTerrainMetadataPathOverrideForTests` function shape (export function setTerrainMetadataPathOverrideForTests(overrideRoot: string | null): void).

 * Purpose: Supports maintainability by documenting why `setTerrainMetadataPathOverrideForTests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setTerrainMetadataPathOverrideForTests(overrideRoot: string | null): void {
  logDebug('terrainMetadataPaths setTerrainMetadataPathOverrideForTests', {
    hasOverride: !!overrideRoot,
  });
  testOverrideRoot = overrideRoot;
}

/**
 * Defines the `clearTerrainMetadataPathOverrideForTests` function shape (export function clearTerrainMetadataPathOverrideForTests(): void).

 * Purpose: Supports maintainability by documenting why `clearTerrainMetadataPathOverrideForTests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearTerrainMetadataPathOverrideForTests(): void {
  logDebug('terrainMetadataPaths clearTerrainMetadataPathOverrideForTests');
  testOverrideRoot = null;
}

/**
 * Defines the `pathCandidates` function shape (function pathCandidates(...segments: string[]): string[]).

 * Purpose: Supports maintainability by documenting why `pathCandidates` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function pathCandidates(...segments: string[]): string[] {
  const roots: string[] = [];
  if (testOverrideRoot) roots.push(testOverrideRoot);
  roots.push(path.join(__dirname, '..', '..'));
  roots.push(process.cwd());
  const processResourcesPath =
    typeof process !== 'undefined' && typeof process.resourcesPath === 'string' ? process.resourcesPath : null;
  if (processResourcesPath) {
    // Packaged app fallback: support resources/data and app.asar.unpacked roots.
    roots.push(processResourcesPath);
    roots.push(path.join(processResourcesPath, 'app.asar.unpacked'));
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as { app?: { getAppPath?: () => string } };
    const ap = app?.getAppPath?.();
    if (ap) roots.push(ap);
  } catch {
    /* non-Electron contexts */
  }
  const uniq = [...new Set(roots)];
  return uniq.map((r) => path.join(r, ...segments));
}

/**
 * Defines the `resolveTerrainStrategicMetadataPath` function shape (export function resolveTerrainStrategicMetadataPath(): string).

 * Purpose: Supports maintainability by documenting why `resolveTerrainStrategicMetadataPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveTerrainStrategicMetadataPath(): string {
  logDebug('terrainMetadataPaths resolveTerrainRes1MetadataPath');
  return resolveFirstExisting('terrain_res1_metadata.json', [...STRATEGIC_SEGMENTS]);
}

/**
 * Defines the `resolveTerrainTacticalMetadataPath` function shape (export function resolveTerrainTacticalMetadataPath(): string).

 * Purpose: Supports maintainability by documenting why `resolveTerrainTacticalMetadataPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveTerrainTacticalMetadataPath(): string {
  logDebug('terrainMetadataPaths resolveTerrainRes4MetadataPath');
  return resolveFirstExisting('terrain_res4_metadata.json', [...TACTICAL_SEGMENTS]);
}

/**
 * Defines the `resolveTerrainStrategicNamingPath` function shape (export function resolveTerrainStrategicNamingPath(): string).

 * Purpose: Supports maintainability by documenting why `resolveTerrainStrategicNamingPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveTerrainStrategicNamingPath(): string {
  logDebug('terrainMetadataPaths resolveTerrainRes1NamingPath');
  return resolveFirstExisting('terrain_res1_naming.json', [...STRATEGIC_NAMING_SEGMENTS]);
}

/**
 * Defines the `resolveTerrainTacticalNamingPath` function shape (export function resolveTerrainTacticalNamingPath(): string).

 * Purpose: Supports maintainability by documenting why `resolveTerrainTacticalNamingPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveTerrainTacticalNamingPath(): string {
  logDebug('terrainMetadataPaths resolveTerrainRes4NamingPath');
  return resolveFirstExisting('terrain_res4_naming.json', [...TACTICAL_NAMING_SEGMENTS]);
}

/**
 * Defines the `resolveTerrainStrategicLandMassPath` function shape (export function resolveTerrainStrategicLandMassPath(): string).

 * Purpose: Supports maintainability by documenting why `resolveTerrainStrategicLandMassPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveTerrainStrategicLandMassPath(): string {
  logDebug('terrainMetadataPaths resolveTerrainRes1LandMassPath');
  return resolveFirstExisting('terrain_res1_landmass.json', [...STRATEGIC_LANDMASS_SEGMENTS]);
}

/**
 * Locates the strategic weather pack.
 *
 * Purpose: Startup and weather reads fail the same way as a missing terrain file.
 * When to use: `ensureWeatherPackLoaded`.
 * Expected outcome: Absolute path to `terrain_res1_weather.json`.
 * Exceptions: Throws when no candidate exists.
 */
export function resolveTerrainStrategicWeatherPath(): string {
  logDebug('terrainMetadataPaths resolveTerrainRes1WeatherPath');
  return resolveFirstExisting('terrain_res1_weather.json', [...STRATEGIC_WEATHER_SEGMENTS]);
}

/**
 * Defines the `resolveTerrainTacticalRoadRailSidesPathOptional` function shape (export function resolveTerrainTacticalRoadRailSidesPathOptional(): string | null).

 * Purpose: Locates optional `terrain_res4_road_rail_sides.json` without throwing so packaged/dev trees missing the artifact can still boot.
 * When to use: While loading tactical transport overlay masks during terrain classification snapshot build.
 * Expected outcome: Returns an absolute filesystem path when a candidate exists; otherwise null after debug logging.
 * Exceptions: None.
 */
export function resolveTerrainTacticalRoadRailSidesPathOptional(): string | null {
  logDebug('terrainMetadataPaths resolveTerrainRes4RoadRailSidesPathOptional');
  const candidates = pathCandidates(...TACTICAL_ROAD_RAIL_SIDES_SEGMENTS);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      logDebug('terrainMetadataPaths resolveTerrainRes4RoadRailSidesPathOptional: found', { path: p });
      return p;
    }
  }
  logDebug('terrainMetadataPaths resolveTerrainRes4RoadRailSidesPathOptional: missing file', {
    tried: candidates.join('; '),
  });
  return null;
}

/**
 * Defines the `resolveTerrainTacticalRoadRailVectorsPathOptional` function shape (export function resolveTerrainTacticalRoadRailVectorsPathOptional(): string | null).

 * Purpose: Locates optional display-only road/rail vector JSON without forcing the app to fail when absent.
 * When to use: During terrain cache hydration for Leaflet transport vector overlays.
 * Expected outcome: Returns absolute path to `terrain_res4_road_rail_vectors.json` when present, else null.
 * Exceptions: None.
 */
export function resolveTerrainTacticalRoadRailVectorsPathOptional(): string | null {
  logDebug('terrainMetadataPaths resolveTerrainRes4RoadRailVectorsPathOptional');
  const candidates = pathCandidates(...TACTICAL_ROAD_RAIL_VECTORS_SEGMENTS);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      logDebug('terrainMetadataPaths resolveTerrainRes4RoadRailVectorsPathOptional: found', { path: p });
      return p;
    }
  }
  logDebug('terrainMetadataPaths resolveTerrainRes4RoadRailVectorsPathOptional: missing file', {
    tried: candidates.join('; '),
  });
  return null;
}

/**
 * Defines the `resolveFirstExisting` function shape (function resolveFirstExisting(label: string, segments: readonly string[]): string).

 * Purpose: Supports maintainability by documenting why `resolveFirstExisting` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function resolveFirstExisting(label: string, segments: readonly string[]): string {
  const candidates = pathCandidates(...segments);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      logDebug('terrainMetadataPaths resolveFirstExisting: found', { label, path: p });
      return p;
    }
  }
  const msg = `terrain metadata file "${label}" not found; tried: ${candidates.join('; ')}`;
  logError('terrainMetadataPaths resolveFirstExisting: missing file', new Error(msg));
  throw new Error(msg);
}
