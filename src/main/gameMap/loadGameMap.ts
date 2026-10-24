import { logDebug, logError, logTrace } from '../logger';
import { resetActiveGameMap, setActiveGameMap } from '../../shared/activeGameMap';
import type { GameMapId, GameMapProfile } from '../../shared/gameMapTypes';
import { setLoadedStrategicFootprint } from '../../shared/loadedStrategicFootprint';
import { REGIONAL_CONTROL_WIN_MIN_URBAN_SHARE, REGIONAL_RULES_BY_ID, type RegionalGameMapId } from '../../shared/regionalRulesCatalog';
import { clearTerrainClassificationCache, ensureTerrainClassificationCacheLoaded, isTerrainClassificationCacheLoaded } from '../terrainClassificationCache';
import { setActiveTerrainPackDirectory } from '../terrainMetadataPaths';
import { clearWeatherPackCache } from '../weather/weatherPackLoad';
import { clearTacticalBirthCountryCache } from '../unitOrigin/tacticalBirthCountryCache';
import { clearTacticalOriginAreas, loadTacticalOriginAreas } from '../unitOrigin/tacticalOriginAreas';
import { clearScenarioRegionCache, installSideGroupHomes } from '../regionScenario';
import { readRegionManifest, type RegionManifest } from './regionManifestRead';
import { regionPackDirectory } from './regionPackExtract';
import * as path from 'path';

/**
 * Id of the pack whose files are currently in memory.
 *
 * Purpose: A second request for the same map must not reread the tactical JSON.
 * When to use: `ensureGameMapLoaded`.
 * Expected outcome: Null until the first successful load.
 * Exceptions: None.
 */
let loadedId: GameMapId | null = null;

/**
 * Why the last saved-map load failed, or null after a successful load.
 *
 * Purpose: A failed pack must not be drawn as the world map.
 * When to use: Set from startup. Cleared when a load succeeds.
 * Expected outcome: The snapshot copies this string onto `gameMapLoadError`.
 * Exceptions: None.
 */
let mapLoadError: string | null = null;

/**
 * Records or clears the saved-map load error.
 *
 * Purpose: The start overlay can tell the player why the match did not draw.
 * When to use: After a failed `ensureGameMapLoaded`, and with null after success.
 * Expected outcome: `gameMapLoadError` returns that message.
 * Exceptions: None.
 */
export function setGameMapLoadError(message: string | null): void {
  logDebug('setGameMapLoadError', { message });
  mapLoadError = message;
}

/**
 * Returns the saved-map load error.
 *
 * Purpose: Snapshots stay empty while this is set.
 * When to use: `getGameStateSnapshot`.
 * Expected outcome: The message, or null.
 * Exceptions: None.
 */
export function gameMapLoadError(): string | null {
  logTrace('gameMapLoadError', { message: mapLoadError });
  return mapLoadError;
}

/**
 * Loads the global pack or one regional pack into the terrain caches.
 *
 * Purpose: A new match and a relaunch share one entry that fills resolutions, footprint, and files.
 * When to use: Before seeding a match, and when opening a database that already names a map.
 * Expected outcome: The same id returns without rereading. A different id replaces the caches.
 * Exceptions: Throws when a regional folder or manifest is missing, or when catalog resolutions disagree with the manifest.
 */
export function ensureGameMapLoaded(id: GameMapId): void {
  logDebug('ensureGameMapLoaded', { id, loadedId });
  if (loadedId === id) return;
  if (id === 'global' && loadedId === null && isTerrainClassificationCacheLoaded()) {
    installGlobalPack();
    loadedId = 'global';
    setGameMapLoadError(null);
    logDebug('ensureGameMapLoaded: kept the loaded global snapshot');
    return;
  }
  const previous = loadedId;
  try {
    if (id === 'global') {
      installGlobalPack();
    } else {
      installRegionalPack(id);
    }
    clearTerrainClassificationCache();
    clearWeatherPackCache();
    clearTacticalBirthCountryCache();
    clearScenarioRegionCache();
    ensureTerrainClassificationCacheLoaded();
    loadedId = id;
    setGameMapLoadError(null);
    logDebug('ensureGameMapLoaded: done', { id });
  } catch (err) {
    logError('ensureGameMapLoaded: failed', err);
    loadedId = null;
    if (previous && previous !== id) {
      try {
        ensureGameMapLoaded(previous);
      } catch (restoreErr) {
        logError('ensureGameMapLoaded: restore failed', restoreErr);
      }
    }
    throw err;
  }
}

/**
 * Reports which pack is in memory.
 *
 * Purpose: A failed match reset reloads the pack the database still belongs to.
 * When to use: `resetGameForNewMatch` before it switches packs.
 * Expected outcome: Null until the first successful load.
 * Exceptions: None.
 */
export function loadedGameMapId(): GameMapId | null {
  logTrace('loadedGameMapId', { loadedId });
  return loadedId;
}

/**
 * Forgets which pack is loaded so the next request reads files again.
 *
 * Purpose: Tests that swap fixtures need a clean load.
 * When to use: Test teardown. Production loads through `ensureGameMapLoaded`.
 * Expected outcome: The next `ensureGameMapLoaded` reads files even for the same id.
 * Exceptions: None.
 */
export function clearLoadedGameMapForTests(): void {
  logDebug('clearLoadedGameMapForTests', { loadedId });
  loadedId = null;
}

/**
 * Installs the world pack and drops any regional footprint.
 *
 * Purpose: Global matches keep the existing file names and the full resolution-1 grid.
 * When to use: From `ensureGameMapLoaded` when the id is global.
 * Expected outcome: Profile, paths, and footprint are the global defaults.
 * Exceptions: None.
 */
function installGlobalPack(): void {
  setActiveTerrainPackDirectory(null);
  setLoadedStrategicFootprint(null);
  installSideGroupHomes(null);
  clearTacticalOriginAreas();
  resetActiveGameMap();
}

/**
 * Installs one regional pack from its extracted folder.
 *
 * Purpose: The match uses that folder's resolutions, scaleranks, and hex list.
 * When to use: From `ensureGameMapLoaded` for a regional id.
 * Expected outcome: The profile matches the catalog and the manifest. Home hexes are the group's land hexes.
 * Exceptions: Throws when the folder is missing or the resolutions disagree.
 */
function installRegionalPack(id: RegionalGameMapId): void {
  const directory = regionPackDirectory(id);
  if (!directory) {
    const err = new Error(`Regional map ${id} is not extracted`);
    logError('ensureGameMapLoaded: missing pack', err);
    throw err;
  }
  const manifest = readRegionManifest(path.join(directory, 'region_manifest.json'));
  const catalog = REGIONAL_RULES_BY_ID[id];
  if (manifest.strategicResolution !== catalog.strategicResolution || manifest.tacticalResolution !== catalog.tacticalResolution) {
    const err = new Error(
      `Regional map ${id} resolutions ${manifest.strategicResolution}/${manifest.tacticalResolution} do not match the catalog`
    );
    logError('ensureGameMapLoaded: resolution mismatch', err);
    throw err;
  }
  const profile: GameMapProfile = {
    id,
    displayName: manifest.displayName,
    strategicResolution: catalog.strategicResolution,
    tacticalResolution: catalog.tacticalResolution,
    controlWinMinUrbanShare: REGIONAL_CONTROL_WIN_MIN_URBAN_SHARE,
    rules: manifest.rules,
    scaleranks: manifest.scaleranks,
  };
  setActiveTerrainPackDirectory(directory);
  const roles = new Map<string, string>();
  for (const hex of manifest.hexes) {
    const role = hex.role === 'land' || hex.role === 'member_land' ? 'member_land' : hex.role;
    roles.set(hex.h3Index, role);
  }
  setLoadedStrategicFootprint(manifest.hexes.map((hex) => hex.h3Index), roles);
  installSideGroupHomes(sideGroupsFromManifest(manifest));
  setActiveGameMap(profile);
  loadTacticalOriginAreas(directory);
}

/**
 * Collects each side's land hexes.
 *
 * Purpose: Seeding and victory use the same home lists as the dialog's groups.
 * When to use: While installing a regional pack.
 * Expected outcome: One entry per manifest group. Land hexes are those with role `land` or `member_land`.
 * Exceptions: None.
 */
function sideGroupsFromManifest(manifest: RegionManifest): { id: string; displayName: string; hexes: string[] }[] {
  return manifest.sideGroups.map((group) => ({
    id: group.id,
    displayName: group.displayName,
    hexes: manifest.hexes
      .filter((hex) => hex.sideGroupId === group.id && (hex.role === 'land' || hex.role === 'member_land'))
      .map((hex) => hex.h3Index),
  }));
}

/**
 * Accepts a new-game map id, treating a missing value as the global map.
 *
 * Purpose: Older callers omit the field and must keep starting the world map.
 * When to use: `resetGameForNewMatch` before any delete.
 * Expected outcome: `global` or a catalog id.
 * Exceptions: Throws when the string is not a known map id.
 */
export function requireGameMapId(value: string | undefined): GameMapId {
  logDebug('requireGameMapId', { value: value ?? null });
  if (!value || value === 'global') return 'global';
  if (value in REGIONAL_RULES_BY_ID) return value as RegionalGameMapId;
  const err = new Error(`Unknown map ${value}`);
  logError('requireGameMapId: unknown', err);
  throw err;
}