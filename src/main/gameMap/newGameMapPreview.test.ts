import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import { getResolution } from 'h3-js';
import { activeGameMap } from '../../shared/activeGameMap';
import { gameDateForTurn } from '../../shared/gameCalendar';
import { buildNewGameMapPreview } from './newGameMapPreview';
import { listScenarioHomeRegions } from '../regionScenario';
import { ensureTerrainClassificationCacheLoaded, getStrategicBaselineUrbanHexCountsForRenderer, getTerrainStrategicKindsFromCache } from '../terrainClassificationCache';
import { displayWeatherForHex } from '../weather/weatherPackLoad';
import { REGIONAL_RULES_BY_ID } from '../../shared/regionalRulesCatalog';
import { readRegionManifest, resolveGeneratedRegionsDirectory } from './regionManifestRead';

/**
 * First extracted regional pack, if the repo has one.
 *
 * Purpose: The regional preview test needs a real manifest and skips when none is unpacked.
 * When to use: The regional test only.
 * Expected outcome: A folder id and directory, or null.
 * Exceptions: None.
 */
function firstExtractedRegion(): { id: string; directory: string } | null {
  const root = resolveGeneratedRegionsDirectory();
  if (!root || !fs.existsSync(root)) return null;
  for (const name of fs.readdirSync(root)) {
    const directory = path.join(root, name);
    if (!(name in REGIONAL_RULES_BY_ID)) continue;
    if (fs.existsSync(path.join(directory, 'region_manifest.json'))) return { id: name, directory };
  }
  return null;
}

test('global preview matches the world grid and leaves the active map alone', () => {
  const before = activeGameMap().id;
  const preview = buildNewGameMapPreview({
    scope: 'global',
    humanHomeRegion: 'not-a-region',
    aiHomeRegion: 'not-a-region',
  });
  assert.equal(activeGameMap().id, before);
  assert.equal(preview.gameMapId, 'global');
  assert.equal(preview.strategicResolution, 1);
  assert.equal(preview.extent, 'world');
  assert.equal(preview.advancedMinUrbanCells, 21);
  assert.equal(preview.hexes.length, 842);
  assert.deepEqual(preview.humanHomeRegionHexes, []);
  assert.deepEqual(preview.aiHomeRegionHexes, []);
  ensureTerrainClassificationCacheLoaded();
  const kinds = getTerrainStrategicKindsFromCache();
  const urbanCounts = new Map(
    getStrategicBaselineUrbanHexCountsForRenderer().map((row) => [row.h3Index, row.urbanHexCount])
  );
  for (const hex of preview.hexes) {
    assert.equal(getResolution(hex.h3Index), 1);
    assert.equal(hex.weatherByMonth.length, 12);
    assert.equal(hex.terrainKind, kinds.get(hex.h3Index));
    assert.equal(hex.baselineUrbanHexCount, urbanCounts.get(hex.h3Index) ?? 0);
  }
  const sample = preview.hexes[0]!;
  assert.equal(
    sample.weatherByMonth[gameDateForTurn(1, 6, 'monthly').monthIndex],
    displayWeatherForHex(sample.h3Index, 1, 6)
  );
});

test('the same global home name returns equal hex lists', () => {
  const name = listScenarioHomeRegions()[0];
  assert.ok(name);
  const preview = buildNewGameMapPreview({
    scope: 'global',
    humanHomeRegion: name!,
    aiHomeRegion: name!,
  });
  assert.deepEqual(preview.humanHomeRegionHexes, preview.aiHomeRegionHexes);
  assert.ok(preview.humanHomeRegionHexes.length > 0);
});

test('regional preview uses that pack and does not replace global weather', (t) => {
  const extracted = firstExtractedRegion();
  if (!extracted) {
    t.skip('no regional JSON is extracted');
    return;
  }
  const manifest = readRegionManifest(path.join(extracted.directory, 'region_manifest.json'));
  const [human, ai] = manifest.sideGroups;
  assert.ok(human && ai);
  const globalHex = buildNewGameMapPreview({
    scope: 'global',
    humanHomeRegion: '',
    aiHomeRegion: '',
  }).hexes[0]!.h3Index;
  const beforeId = activeGameMap().id;
  const beforeWeather = displayWeatherForHex(globalHex, 1, 6);
  const preview = buildNewGameMapPreview({
    scope: 'regional',
    gameMapId: extracted.id,
    humanSideGroupId: human!.id,
    aiSideGroupId: ai!.id,
  });
  assert.equal(activeGameMap().id, beforeId);
  assert.equal(displayWeatherForHex(globalHex, 1, 6), beforeWeather);
  assert.equal(preview.gameMapId, extracted.id);
  assert.equal(preview.strategicResolution, manifest.strategicResolution);
  assert.equal(preview.advancedMinUrbanCells, REGIONAL_RULES_BY_ID[extracted.id as keyof typeof REGIONAL_RULES_BY_ID].rules.advancedMinUrbanCells);
  assert.notEqual(preview.extent, 'world');
  assert.equal(preview.hexes.length, manifest.hexes.length);
  for (const hex of preview.hexes) {
    assert.equal(hex.weatherByMonth.length, 12);
    assert.equal(getResolution(hex.h3Index), manifest.strategicResolution);
    assert.ok(hex.baselineUrbanHexCount >= 0);
  }
  const land = (groupId: string): string[] =>
    manifest.hexes
      .filter((hex) => hex.sideGroupId === groupId && (hex.role === 'land' || hex.role === 'member_land'))
      .map((hex) => hex.h3Index);
  assert.deepEqual(preview.humanHomeRegionHexes, land(human!.id));
  assert.deepEqual(preview.aiHomeRegionHexes, land(ai!.id));
});

test('an unknown regional map throws', () => {
  assert.throws(() =>
    buildNewGameMapPreview({
      scope: 'regional',
      gameMapId: 'not-a-map',
      humanSideGroupId: 'a',
      aiSideGroupId: 'b',
    })
  );
});
