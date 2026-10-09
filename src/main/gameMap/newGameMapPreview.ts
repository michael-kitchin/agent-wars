import * as path from 'path';
import { cellToChildren, cellToLatLng, getRes0Cells, getResolution } from 'h3-js';
import { logDebug, logError, logTrace } from '../logger';
import { globalScenarioHomeRegionHexes } from '../regionScenario';
import {
  loadTerrainMetadataFromPath,
  type HexMetadataRecordStrategic,
  type HexMetadataRecordTactical,
} from '../terrainMetadataLoad';
import {
  resolveBundledGlobalStrategicMetadataPath,
  resolveBundledGlobalTacticalMetadataPath,
  resolveBundledGlobalWeatherPath,
} from '../terrainMetadataPaths';
import { loadWeatherPackFromPath } from '../weather/weatherPackLoad';
import type { WeatherMonthRecord, WeatherState } from '../../shared/weatherBonusTypes';
import {
  GLOBAL_STRATEGIC_H3_RESOLUTION,
  GLOBAL_TACTICAL_H3_RESOLUTION,
} from '../../shared/h3Resolutions';
import { longitudeIntervalFromCenters, mapExtentBoxForHexes, type MapExtentBox } from '../../shared/mapExtent';
import type { NewGameMapPreview, NewGameMapPreviewHex, NewGameMapPreviewRequest } from '../../shared/newGameMapPreviewTypes';
import { REGIONAL_RULES_BY_ID, type RegionalGameMapId } from '../../shared/regionalRulesCatalog';
import { readRegionManifest, type RegionManifest } from './regionManifestRead';
import { regionPackDirectory } from './regionPackExtract';
import { GLOBAL_GAME_MAP } from '../../shared/activeGameMap';
import { baselineUrbanHexCounts, dominantStrategicTerrainKinds } from './newGameMapPreviewTerrain';

/**
 * Twelve mild months for a footprint hex the weather pack does not list.
 *
 * Purpose: Matches `weatherYearForHex`, which treats a missing hex as mild all year.
 * When to use: While attaching weather to a cached grid.
 * Expected outcome: Twelve `mild` states.
 * Exceptions: None.
 */
const MILD_YEAR: readonly WeatherState[] = Object.freeze(Array.from({ length: 12 }, () => 'mild' as const));

/**
 * Classified footprint for one map, without the dialog's home choices.
 *
 * Purpose: Home combos change often. The terrain files do not.
 * When to use: The process-lifetime cache inside this module.
 * Expected outcome: Hexes stay in footprint order.
 * Exceptions: None.
 */
interface CachedPreviewGrid {
  /**
   * Strategic resolution of `hexes`.
   *
   * Contract: 1, 2, or 3.
   * When to use: The payload's `strategicResolution`.
   * Expected outcome: The resolution the files were parsed at.
   * Exceptions: None.
   */
  readonly strategicResolution: number;
  /**
   * Footprint hexes with terrain and a twelve-month year.
   *
   * Contract: Non-empty.
   * When to use: Copied into each payload for this map.
   * Expected outcome: Stable for the process lifetime.
   * Exceptions: None.
   */
  readonly hexes: readonly NewGameMapPreviewHex[];
}

/**
 * Grids already classified, keyed by `global` or a regional pack id.
 *
 * Purpose: Switching home areas must not reread the tactical metadata.
 * When to use: `cachedGrid`.
 * Expected outcome: Grows by one entry the first time each map is previewed.
 * Exceptions: None.
 */
const grids = new Map<string, CachedPreviewGrid>();

/**
 * Builds the new-game map preview for the dialog's current tab.
 *
 * Purpose: The renderer needs terrain, weather, homes, and extent without changing the loaded match.
 * When to use: The `game:newGameMapPreview` handler.
 * Expected outcome: A payload for that map. Home lists follow the request and may overlap.
 * Exceptions: Throws when the map, the pack files, or a side group is unknown, or when a footprint hex has no terrain kind.
 */
export function buildNewGameMapPreview(request: NewGameMapPreviewRequest): NewGameMapPreview {
  logDebug('newGameMapPreview buildNewGameMapPreview', {
    scope: request.scope,
    gameMapId: request.scope === 'regional' ? request.gameMapId : 'global',
  });
  if (request.scope === 'global') return buildGlobalPreview(request.humanHomeRegion, request.aiHomeRegion);
  return buildRegionalPreview(request.gameMapId, request.humanSideGroupId, request.aiSideGroupId);
}

/**
 * Returns a cached grid, building it on the first request for that map.
 *
 * Purpose: Trace-level so a home-only change can show that the files were not read again.
 * When to use: Both preview branches.
 * Expected outcome: The same object for a repeated map id.
 * Exceptions: Rethrows a build failure. Nothing is cached in that case.
 */
function cachedGrid(mapId: string, build: () => CachedPreviewGrid): CachedPreviewGrid {
  const existing = grids.get(mapId);
  if (existing) {
    logTrace('newGameMapPreview cachedGrid', { mapId, hexes: existing.hexes.length });
    return existing;
  }
  const built = build();
  grids.set(mapId, built);
  logDebug('newGameMapPreview cachedGrid: built', { mapId, hexes: built.hexes.length });
  return built;
}

/**
 * Builds the world preview.
 *
 * Purpose: Resolution 1 and the Mercator extent, with UN subregion homes.
 * When to use: `scope: 'global'`.
 * Expected outcome: 842 hexes and extent `'world'`.
 * Exceptions: Throws when a world file or a footprint kind is missing.
 */
function buildGlobalPreview(humanHomeRegion: string, aiHomeRegion: string): NewGameMapPreview {
  const grid = cachedGrid('global', () => {
    const indexes = globalStrategicIndexes();
    return gridFromFiles({
      h3Indexes: indexes,
      strategicResolution: GLOBAL_STRATEGIC_H3_RESOLUTION,
      strategicMetadataPath: resolveBundledGlobalStrategicMetadataPath(),
      tacticalMetadataPath: resolveBundledGlobalTacticalMetadataPath(),
      tacticalResolution: GLOBAL_TACTICAL_H3_RESOLUTION,
      weatherPath: resolveBundledGlobalWeatherPath(),
      urbanOverlayMaxScalerank: GLOBAL_GAME_MAP.scaleranks.urbanOverlay,
    });
  });
  return {
    gameMapId: 'global',
    strategicResolution: grid.strategicResolution,
    advancedMinUrbanCells: GLOBAL_GAME_MAP.rules.advancedMinUrbanCells,
    extent: 'world',
    hexes: grid.hexes,
    humanHomeRegionHexes: globalScenarioHomeRegionHexes(humanHomeRegion),
    aiHomeRegionHexes: globalScenarioHomeRegionHexes(aiHomeRegion),
  };
}

/**
 * Builds one regional preview.
 *
 * Purpose: The selected pack's footprint, resolution, and side-group land.
 * When to use: `scope: 'regional'`.
 * Expected outcome: One row per manifest hex and a regional extent box.
 * Exceptions: Throws when the id, the pack, the resolutions, or a side group is unknown.
 */
function buildRegionalPreview(gameMapId: string, humanSideGroupId: string, aiSideGroupId: string): NewGameMapPreview {
  const catalog = regionalCatalog(gameMapId);
  const directory = regionPackDirectory(gameMapId);
  if (!directory) {
    const err = new Error(`Regional map ${gameMapId} is not extracted`);
    logError('newGameMapPreview buildRegionalPreview: missing pack', err);
    throw err;
  }
  const manifest = readRegionManifest(path.join(directory, 'region_manifest.json'));
  assertManifestResolutions(gameMapId, manifest, catalog.strategicResolution, catalog.tacticalResolution);
  const grid = cachedGrid(gameMapId, () =>
    gridFromFiles({
      h3Indexes: manifest.hexes.map((hex) => hex.h3Index),
      strategicResolution: manifest.strategicResolution,
      strategicMetadataPath: path.join(directory, 'terrain_res_s_metadata.json'),
      tacticalMetadataPath: path.join(directory, 'terrain_res_t_metadata.json'),
      tacticalResolution: manifest.tacticalResolution,
      weatherPath: path.join(directory, 'terrain_res_s_weather.json'),
      urbanOverlayMaxScalerank: manifest.scaleranks.urbanOverlay,
    })
  );
  return {
    gameMapId,
    strategicResolution: grid.strategicResolution,
    advancedMinUrbanCells: manifest.rules.advancedMinUrbanCells,
    extent: regionalExtent(grid.hexes.map((hex) => hex.h3Index)),
    hexes: grid.hexes,
    humanHomeRegionHexes: sideGroupLand(manifest, humanSideGroupId),
    aiHomeRegionHexes: sideGroupLand(manifest, aiSideGroupId),
  };
}

/**
 * Accepts a catalog id.
 *
 * Purpose: An unknown string must not be treated as a folder name.
 * When to use: Before reading a regional pack.
 * Expected outcome: The catalog row.
 * Exceptions: Throws when `gameMapId` is not a catalog key.
 */
function regionalCatalog(gameMapId: string): (typeof REGIONAL_RULES_BY_ID)[RegionalGameMapId] {
  if (!(gameMapId in REGIONAL_RULES_BY_ID)) {
    const err = new Error(`Unknown map ${gameMapId}`);
    logError('newGameMapPreview regionalCatalog: unknown', err);
    throw err;
  }
  return REGIONAL_RULES_BY_ID[gameMapId as RegionalGameMapId];
}

/**
 * Rejects a manifest whose resolutions disagree with the catalog.
 *
 * Purpose: The preview and a started match must classify the same cells.
 * When to use: After the manifest is read.
 * Expected outcome: Returns when both resolutions match.
 * Exceptions: Throws when either resolution disagrees.
 */
function assertManifestResolutions(
  gameMapId: string,
  manifest: RegionManifest,
  strategicResolution: number,
  tacticalResolution: number
): void {
  if (manifest.strategicResolution === strategicResolution && manifest.tacticalResolution === tacticalResolution) return;
  const err = new Error(
    `Regional map ${gameMapId} resolutions ${manifest.strategicResolution}/${manifest.tacticalResolution} do not match the catalog`
  );
  logError('newGameMapPreview assertManifestResolutions: mismatch', err);
  throw err;
}

/**
 * Collects one side group's land hexes.
 *
 * Purpose: The same land filter match seeding uses for home outlines.
 * When to use: The two side ids on a regional request.
 * Expected outcome: Hexes whose role is `land` or `member_land` and whose group id matches.
 * Exceptions: Throws when the group id is not on the manifest.
 */
function sideGroupLand(manifest: RegionManifest, sideGroupId: string): string[] {
  if (!manifest.sideGroups.some((group) => group.id === sideGroupId)) {
    const err = new Error(`Unknown side group ${sideGroupId}`);
    logError('newGameMapPreview sideGroupLand: unknown', err);
    throw err;
  }
  return manifest.hexes
    .filter((hex) => hex.sideGroupId === sideGroupId && (hex.role === 'land' || hex.role === 'member_land'))
    .map((hex) => hex.h3Index);
}

/**
 * Frames a regional footprint.
 *
 * Purpose: The preview uses the same box a started regional match uses.
 * When to use: After the regional grid is known.
 * Expected outcome: A non-world extent box.
 * Exceptions: Throws when the hexes do not produce a box.
 */
function regionalExtent(h3Indexes: readonly string[]): MapExtentBox {
  const box = mapExtentBoxForHexes(
    longitudeIntervalFromCenters(h3Indexes.map((h3Index) => cellToLatLng(h3Index)[1])),
    h3Indexes
  );
  if (!box) {
    const err = new Error('Regional preview extent is empty');
    logError('newGameMapPreview regionalExtent: empty', err);
    throw err;
  }
  return box;
}

/**
 * Lists every global strategic cell in sorted order.
 *
 * Purpose: The world footprint is the resolution-1 grid, not whatever footprint the loaded match installed.
 * When to use: The first global preview.
 * Expected outcome: 842 resolution-1 indexes.
 * Exceptions: None.
 */
function globalStrategicIndexes(): string[] {
  const indexes: string[] = [];
  for (const cell of getRes0Cells()) {
    indexes.push(...cellToChildren(cell, GLOBAL_STRATEGIC_H3_RESOLUTION));
  }
  indexes.sort();
  return indexes;
}

/**
 * Files and cutoffs for one preview grid.
 *
 * Purpose: The footprint, both metadata files, weather, and the urban scalerank travel together so the active map is never consulted.
 * When to use: `gridFromFiles`.
 * Expected outcome: Paths are absolute. Resolutions are the preview map's, not the loaded match's.
 * Exceptions: None.
 */
interface PreviewGridFiles {
  /**
   * Strategic hexes in footprint order.
   *
   * Contract: Non-empty. Each index is at `strategicResolution`.
   * When to use: The hex list for this map.
   * Expected outcome: One preview hex per index.
   * Exceptions: None.
   */
  readonly h3Indexes: readonly string[];
  /**
   * Strategic H3 resolution.
   *
   * Contract: 1, 2, or 3.
   * When to use: Parsing strategic metadata and parenting tactical cells.
   * Expected outcome: Matches the metadata file.
   * Exceptions: None.
   */
  readonly strategicResolution: number;
  /**
   * Absolute path to the strategic metadata file.
   *
   * Contract: A JSON file at `strategicResolution`.
   * When to use: Terrain classification.
   * Expected outcome: One row per footprint hex.
   * Exceptions: None.
   */
  readonly strategicMetadataPath: string;
  /**
   * Absolute path to the tactical metadata file.
   *
   * Contract: A JSON file at `tacticalResolution`.
   * When to use: Dominant kind and urban counts.
   * Expected outcome: Child cells of the footprint.
   * Exceptions: None.
   */
  readonly tacticalMetadataPath: string;
  /**
   * Tactical H3 resolution.
   *
   * Contract: Three levels below `strategicResolution`.
   * When to use: Parsing the tactical file.
   * Expected outcome: 4, 5, or 6.
   * Exceptions: None.
   */
  readonly tacticalResolution: number;
  /**
   * Absolute path to the strategic weather pack.
   *
   * Contract: Twelve-month rows for this map.
   * When to use: Attaching weather without replacing the loaded pack.
   * Expected outcome: A year per listed hex.
   * Exceptions: None.
   */
  readonly weatherPath: string;
  /**
   * Highest scalerank that still counts as urban overlay.
   *
   * Contract: The preview map's scalerank, not the loaded match's.
   * When to use: `baselineUrbanHexCounts`.
   * Expected outcome: The same cutoff a started match on this map uses.
   * Exceptions: None.
   */
  readonly urbanOverlayMaxScalerank: number;
}

/**
 * Classifies one footprint from explicit files.
 *
 * Purpose: Keeps file paths and resolutions on one object so the active map is never consulted.
 * When to use: The cache builder for the world and for one region.
 * Expected outcome: One preview hex per footprint index, in that order, with a baseline urban count.
 * Exceptions: Throws when a footprint hex has no classified kind.
 */
function gridFromFiles(files: PreviewGridFiles): CachedPreviewGrid {
  const strategic = loadTerrainMetadataFromPath(files.strategicMetadataPath, files.strategicResolution, false);
  const tactical = loadTerrainMetadataFromPath(files.tacticalMetadataPath, files.tacticalResolution, true);
  const tacticalRecords = tactical.records as readonly HexMetadataRecordTactical[];
  const kinds = dominantStrategicTerrainKinds(
    strategic.records as readonly HexMetadataRecordStrategic[],
    tacticalRecords,
    files.strategicResolution
  );
  const urbanCounts = baselineUrbanHexCounts(tacticalRecords, files.strategicResolution, files.urbanOverlayMaxScalerank);
  const weather = loadWeatherPackFromPath(files.weatherPath);
  const hexes = files.h3Indexes.map((h3Index) =>
    hexFromKind(h3Index, files.strategicResolution, kinds, weather, urbanCounts)
  );
  return { strategicResolution: files.strategicResolution, hexes };
}

/**
 * Builds one preview hex, or fails when its kind is missing.
 *
 * Purpose: A partial grid would paint the wrong map.
 * When to use: Once per footprint index.
 * Expected outcome: The classified kind, twelve weather states, and a baseline urban count.
 * Exceptions: Throws when `kinds` has no entry for `h3Index`.
 */
function hexFromKind(
  h3Index: string,
  strategicResolution: number,
  kinds: ReadonlyMap<string, string>,
  weather: ReadonlyMap<string, readonly WeatherMonthRecord[]>,
  urbanCounts: ReadonlyMap<string, number>
): NewGameMapPreviewHex {
  const terrainKind = kinds.get(h3Index);
  if (!terrainKind) {
    const err = new Error(`terrain metadata missing h3_index ${h3Index}`);
    logError('newGameMapPreview hexFromKind: missing kind', err);
    throw err;
  }
  if (getResolution(h3Index) !== strategicResolution) {
    const err = new Error(`preview hex ${h3Index} is not resolution ${strategicResolution}`);
    logError('newGameMapPreview hexFromKind: resolution', err);
    throw err;
  }
  const year = weather.get(h3Index);
  return {
    h3Index,
    terrainKind,
    weatherByMonth: year ? year.map((month) => month.display) : MILD_YEAR,
    baselineUrbanHexCount: urbanCounts.get(h3Index) ?? 0,
  };
}
