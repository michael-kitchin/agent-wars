import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resetActiveGameMap } from '../../shared/activeGameMap';
import { setLoadedStrategicFootprint } from '../../shared/loadedStrategicFootprint';
import { closeGameDatabaseForTests, openGameDatabaseAtPathForTests, resetGameForNewMatch } from '../gameDb';
import type { ResetGameForNewMatchOptions } from '../gameDb/resetGame';
import { clearLoadedGameMapForTests } from '../gameMap/loadGameMap';
import { setRegionPackUserDataRootForTests } from '../gameMap/regionPackExtract';
import { clearScenarioRegionCache, installSideGroupHomes } from '../regionScenario';
import { clearTerrainClassificationCache } from '../terrainClassificationCache';
import { clearTacticalBirthCountryCache } from '../unitOrigin/tacticalBirthCountryCache';
import { clearWeatherPackCache } from '../weather/weatherPackLoad';
import { setActiveTerrainPackDirectory } from '../terrainMetadataPaths';
import { clearTacticalOriginAreas } from '../unitOrigin/tacticalOriginAreas';

/**
 * Opens a temporary match and starts it from the given new-game options.
 *
 * Purpose: Seat tests need a roster other than the default two-side start, then a clean process afterward.
 * When to use: A test that calls `resetGameForNewMatch` with `seats` or with the older home fields.
 * Expected outcome: `runCase` sees that match. The temporary files and the loaded map are cleared afterward.
 * Exceptions: Propagates a reset error after cleanup. `runCase` errors propagate the same way.
 */
export function withSeatedTempGameDb(
  prefix: string,
  options: ResetGameForNewMatchOptions,
  runCase: () => void
): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(dir, 't.sqlite');
  const userData = path.join(dir, 'user-data');
  fs.mkdirSync(userData);
  setRegionPackUserDataRootForTests(userData);
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch(options);
    runCase();
  } finally {
    setRegionPackUserDataRootForTests(null);
    closeGameDatabaseForTests();
    clearTerrainClassificationCache();
    clearWeatherPackCache();
    clearTacticalBirthCountryCache();
    clearScenarioRegionCache();
    clearLoadedGameMapForTests();
    setActiveTerrainPackDirectory(null);
    setLoadedStrategicFootprint(null);
    installSideGroupHomes(null);
    clearTacticalOriginAreas();
    resetActiveGameMap();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Opens a temporary match and waits for an async case before closing it.
 *
 * Purpose: A Ready test has to await order gathering while the roster is still open.
 * When to use: A test whose case returns a promise.
 * Expected outcome: `runCase` finishes before the database is closed.
 * Exceptions: Propagates a reset or case error after cleanup.
 */
export async function withSeatedTempGameDbAsync(
  prefix: string,
  options: ResetGameForNewMatchOptions,
  runCase: () => Promise<void>
): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(dir, 't.sqlite');
  const userData = path.join(dir, 'user-data');
  fs.mkdirSync(userData);
  setRegionPackUserDataRootForTests(userData);
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch(options);
    await runCase();
  } finally {
    setRegionPackUserDataRootForTests(null);
    closeGameDatabaseForTests();
    clearTerrainClassificationCache();
    clearWeatherPackCache();
    clearTacticalBirthCountryCache();
    clearScenarioRegionCache();
    clearLoadedGameMapForTests();
    setActiveTerrainPackDirectory(null);
    setLoadedStrategicFootprint(null);
    installSideGroupHomes(null);
    clearTacticalOriginAreas();
    resetActiveGameMap();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
