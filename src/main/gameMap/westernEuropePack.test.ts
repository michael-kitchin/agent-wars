import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import { withGameMap } from '../../shared/activeGameMap';
import { advancedTechMinUrbanCells, strategicUrbanCellsDestroyedPerHit, unitCostFor } from '../../shared/gameRules';
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { setLoadedStrategicFootprint } from '../../shared/loadedStrategicFootprint';
import { REGIONAL_RULES_BY_ID } from '../../shared/regionalRulesCatalog';
import { getOrderedHexList } from '../mapData';
import { loadTerrainStrategicLandMassBundled } from '../terrainLandMassLoad';
import { loadTerrainStrategicMetadataBundled } from '../terrainMetadataLoad';
import { setActiveTerrainPackDirectory } from '../terrainMetadataPaths';
import { loadTerrainStrategicNamingBundled } from '../terrainNamingLoad';
import { readRegionManifest, resolveGeneratedRegionsDirectory } from './regionManifestRead';

/**
 * Collects member-land hexes for one side group.
 *
 * Purpose: Disjointness is about land the sides can own, not sea or neutral border.
 * When to use: The western Europe pack test.
 * Expected outcome: Hex indexes whose role is land and whose group id matches.
 * Exceptions: None.
 */
function memberLand(hexes: readonly { h3Index: string; role: string; sideGroupId: string | null }[], groupId: string): string[] {
  return hexes
    .filter((hex) => hex.sideGroupId === groupId && (hex.role === 'land' || hex.role === 'member_land'))
    .map((hex) => hex.h3Index);
}

test('western europe pack matches its manifest', (t) => {
  const root = resolveGeneratedRegionsDirectory();
  const directory = root ? path.join(root, 'western_europe') : '';
  const manifestPath = directory ? path.join(directory, 'region_manifest.json') : '';
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    t.skip('western_europe JSON is not extracted. Run npm run regional:extract');
    return;
  }
  const manifest = readRegionManifest(manifestPath);
  const catalog = REGIONAL_RULES_BY_ID.western_europe;
  assert.equal(manifest.strategicResolution, 3);
  assert.equal(manifest.tacticalResolution, 6);
  assert.equal(catalog.strategicResolution, manifest.strategicResolution);
  assert.equal(catalog.tacticalResolution, manifest.tacticalResolution);
  assert.ok(manifest.sideGroups.length >= 2);
  const landByGroup = manifest.sideGroups.map((group) => memberLand(manifest.hexes, group.id));
  for (const land of landByGroup) assert.ok(land.length > 0);
  const seen = new Set<string>();
  for (const land of landByGroup) {
    for (const hex of land) {
      assert.equal(seen.has(hex), false);
      seen.add(hex);
    }
  }
  const border = manifest.hexes.find((hex) => hex.role === 'neutral_border');
  assert.ok(border);
  const roles = new Map(manifest.hexes.map((hex) => [hex.h3Index, hex.role === 'land' ? 'member_land' : hex.role]));
  setLoadedStrategicFootprint(manifest.hexes.map((hex) => hex.h3Index), roles);
  try {
    assert.equal(getOrderedHexList().length, manifest.hexes.length);
    assert.equal(isNeutralBorderHex(border.h3Index), true);
    setActiveTerrainPackDirectory(directory);
    withGameMap(
      {
        id: 'western_europe',
        displayName: manifest.displayName,
        strategicResolution: catalog.strategicResolution,
        tacticalResolution: catalog.tacticalResolution,
        controlWinMinUrbanShare: null,
        rules: manifest.rules,
        scaleranks: manifest.scaleranks,
      },
      () => {
        const metadata = loadTerrainStrategicMetadataBundled();
        const naming = loadTerrainStrategicNamingBundled();
        const landmass = loadTerrainStrategicLandMassBundled();
        assert.equal(metadata.resolution, 3);
        assert.equal(naming.resolution, 3);
        assert.ok(metadata.records.length > 0);
        assert.ok(naming.records.length > 0);
        assert.ok(landmass.records.length > 0);
        assert.equal(unitCostFor('infantry'), 60);
        assert.equal(advancedTechMinUrbanCells(), 59);
        assert.equal(strategicUrbanCellsDestroyedPerHit(), 26);
      }
    );
    const tacticalPath = path.join(directory, 'terrain_res_t_metadata.json');
    const header = Buffer.alloc(400);
    const fd = fs.openSync(tacticalPath, 'r');
    try {
      fs.readSync(fd, header, 0, header.length, 0);
    } finally {
      fs.closeSync(fd);
    }
    assert.match(header.toString('utf8'), /"resolution": 6/);
  } finally {
    setActiveTerrainPackDirectory(null);
    setLoadedStrategicFootprint(null);
  }
});
