import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { resetActiveGameMap } from '../shared/activeGameMap';
import { setLoadedStrategicFootprint } from '../shared/loadedStrategicFootprint';
import { getOrderedHexList } from './mapData';
import { clearLoadedGameMapForTests, ensureGameMapLoaded } from './gameMap/loadGameMap';
import { readRegionManifest, resolveGeneratedRegionsDirectory } from './gameMap/regionManifestRead';
import {
  closeGameDatabaseForTests,
  getGameState,
  openGameDatabaseAtPathForTests,
  resetGameForNewMatch,
} from './gameDb';
import { installSideGroupHomes } from './regionScenario';
import { setActiveTerrainPackDirectory } from './terrainMetadataPaths';
import { clearTacticalOriginAreas } from './unitOrigin/tacticalOriginAreas';

test('maghreb footprint length matches its manifest', (t) => {
  const root = resolveGeneratedRegionsDirectory();
  const directory = root ? path.join(root, 'maghreb') : '';
  const manifestPath = directory ? path.join(directory, 'region_manifest.json') : '';
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    t.skip('maghreb JSON is not extracted. Run npm run regional:extract');
    return;
  }
  const manifest = readRegionManifest(manifestPath);
  try {
    ensureGameMapLoaded('maghreb');
    assert.equal(getOrderedHexList().length, manifest.hexes.length);
  } finally {
    clearLoadedGameMapForTests();
    setActiveTerrainPackDirectory(null);
    setLoadedStrategicFootprint(null);
    installSideGroupHomes(null);
    clearTacticalOriginAreas();
    resetActiveGameMap();
  }
});

test('a maghreb start snapshot matches the manifest hex count', (t) => {
  const root = resolveGeneratedRegionsDirectory();
  const directory = root ? path.join(root, 'maghreb') : '';
  const manifestPath = directory ? path.join(directory, 'region_manifest.json') : '';
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    t.skip('maghreb JSON is not extracted. Run npm run regional:extract');
    return;
  }
  const manifest = readRegionManifest(manifestPath);
  const [human, ai] = manifest.sideGroups;
  if (!human || !ai) {
    t.skip('maghreb has fewer than two side groups');
    return;
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-maghreb-'));
  openGameDatabaseAtPathForTests(path.join(temp, 'match.sqlite'));
  try {
    resetGameForNewMatch({
      gameMapId: 'maghreb',
      humanSideGroupId: human.id,
      aiSideGroupId: ai.id,
      fogOfWarEnabled: false,
    });
    assert.equal(getGameState().hexes.length, manifest.hexes.length);
  } finally {
    closeGameDatabaseForTests();
    clearLoadedGameMapForTests();
    setActiveTerrainPackDirectory(null);
    setLoadedStrategicFootprint(null);
    installSideGroupHomes(null);
    clearTacticalOriginAreas();
    resetActiveGameMap();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
