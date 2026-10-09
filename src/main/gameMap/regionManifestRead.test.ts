import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import { regionManifestTextFromZip } from './regionPackExtract';
import { compareManifestSchemaVersion, readRegionManifest, readRegionManifestText, resolveGeneratedRegionsDirectory } from './regionManifestRead';

const EXPECTED_INFANTRY: Readonly<Record<string, number>> = {
  australia_new_zealand: 10,
  caribbean: 12,
  central_america: 11,
  central_asia: 18,
  eastern_asia: 30,
  eastern_europe: 17,
  horn_and_great_lakes: 11,
  libya_egypt_sudan: 14,
  maghreb: 19,
  middle_africa_north: 9,
  middle_africa_south: 8,
  northern_america: 20,
  northern_europe: 25,
  south_america: 10,
  south_eastern_asia: 9,
  southern_africa: 17,
  southern_asia_east: 20,
  southern_asia_west: 35,
  southern_east_africa: 10,
  southern_europe: 40,
  west_africa_coast: 16,
  western_asia_north: 20,
  western_europe: 60,
};

/**
 * Builds the smallest manifest text the parser will accept.
 *
 * Purpose: Schema and economy failures do not need a real pack.
 * When to use: The out-of-date and bad-ratio tests.
 * Expected outcome: JSON text with the given schema and armor cost.
 * Exceptions: None.
 */
function manifestText(schema: string, armorCost: number): string {
  return JSON.stringify({
    schema_version: schema,
    region_id: 'western_europe',
    display_name: 'Western Europe',
    res_s: 3,
    res_t: 6,
    scalerank_policy: {
      urban_overlay_max: 7,
      major_airport_max: 5,
      major_seaport_max: 5,
      city_label_max: 6,
    },
    hexes: [],
    side_groups: [],
    economy: {
      infantry_cost: 10,
      armor_cost: armorCost,
      naval_cost: 50,
      air_cost: 30,
      armor_min_urban_cells: 2,
      air_min_urban_cells: 4,
      naval_min_urban_cells: 5,
      advanced_min_urban_cells: 10,
      strategic_strike_urban_cells: 4,
    },
  });
}

test('schema versions compare as integers', () => {
  assert.ok(compareManifestSchemaVersion('1.1.0', '1.2.0') < 0);
  assert.ok(compareManifestSchemaVersion('1.2.0', '1.10.0') < 0);
  assert.equal(compareManifestSchemaVersion('1.2.0', '1.2.0'), 0);
  assert.throws(() => compareManifestSchemaVersion('1.2.beta', '1.2.0'), /not an integer/);
});

test('a manifest older than 1.2.0 is out of date', () => {
  assert.throws(
    () => readRegionManifestText(manifestText('1.1.0', 20), 'sample'),
    /regional pack is out of date \(schema 1\.1\.0\)/
  );
});

test('armor that is not twice infantry is rejected', () => {
  assert.throws(
    () => readRegionManifestText(manifestText('1.2.0', 19), 'sample'),
    /economy\.armor_cost must be 2 × infantry_cost/
  );
});

test('every shipped regional manifest has the expected infantry cost', (t) => {
  const root = resolveGeneratedRegionsDirectory();
  if (!root) {
    t.skip('no regional packs');
    return;
  }
  const regionIds = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'qa')
    .map((entry) => entry.name)
    .filter((regionId) => {
      const directory = path.join(root, regionId);
      return fs.existsSync(path.join(directory, 'region_manifest.json'))
        || fs.existsSync(path.join(directory, 'region_manifest.json.zip'));
    });
  if (regionIds.length === 0) {
    t.skip('no regional packs');
    return;
  }
  for (const regionId of regionIds) {
    const directory = path.join(root, regionId);
    const jsonPath = path.join(directory, 'region_manifest.json');
    const zipPath = path.join(directory, 'region_manifest.json.zip');
    if (fs.existsSync(jsonPath)) {
      assert.equal(readRegionManifest(jsonPath).rules.infantryCost, EXPECTED_INFANTRY[regionId], regionId);
    }
    if (fs.existsSync(zipPath)) {
      const fromZip = readRegionManifestText(regionManifestTextFromZip(zipPath), regionId);
      assert.equal(fromZip.rules.infantryCost, EXPECTED_INFANTRY[regionId], regionId);
    }
  }
});
