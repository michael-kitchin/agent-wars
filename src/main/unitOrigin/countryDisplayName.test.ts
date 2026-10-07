import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listUnitsForSnapshotWithGetAll } from '../gameDb/unitSnapshotRead';
import type { TerrainNamingCountryRow } from '../terrainNamingLoad';
import { clearTacticalBirthCountryCache, countryDisplayNameForCode, storeTacticalBirthCountryCache } from './tacticalBirthCountryCache';

/**
 * A strategic country row with the given English name and ISO code.
 *
 * Purpose: The display-name cache reads `countryCode` on strategic country rows.
 * When to use: The tests below.
 * Expected outcome: A complete country row.
 * Exceptions: None.
 */
function country(name: string, countryCode: string): TerrainNamingCountryRow {
  return { name, continent: 'North America', region: 'R', population: 1, scalerank: 0, countryCode };
}

/**
 * One units-table row whose birth country code is the given value.
 *
 * Purpose: `listUnitsForSnapshotWithGetAll` maps this row through the private origin builder.
 * When to use: The tests below.
 * Expected outcome: A row with a birth hex, so the snapshot unit has an origin.
 * Exceptions: None.
 */
function unitRow(id: string, birthCountryCode: string): Record<string, unknown> {
  return {
    id,
    player: 'human',
    unit_type: 'infantry',
    h3_index: '812abffffffffff',
    display_order: null,
    embarked_on_naval_unit_id: null,
    birth_h3_index: '812abffffffffff',
    birth_res_t_h3_index: null,
    birth_terrain_kind: 'plains',
    birth_is_urban: 0,
    birth_country_name: 'France',
    birth_country_code: birthCountryCode,
    birth_area_id: 'US-CO',
    birth_area_name: 'Colorado',
  };
}

test('a snapshot origin copies the canonical country name for its country code', () => {
  clearTacticalBirthCountryCache();
  try {
    assert.equal(countryDisplayNameForCode('US'), null);
    storeTacticalBirthCountryCache(
      [{ h3_index: '812abffffffffff', states: [], countries: [country('United States of America', 'US'), country('France', 'fr')], water: [] }],
      []
    );
    assert.equal(countryDisplayNameForCode('US'), 'United States of America');
    assert.equal(countryDisplayNameForCode('us'), 'United States of America');
    assert.equal(countryDisplayNameForCode('FR'), 'France');
    assert.equal(countryDisplayNameForCode('ZZ'), null);
    const loaded = listUnitsForSnapshotWithGetAll(<T extends Record<string, unknown>>() => [unitRow('u-us', 'US'), unitRow('u-fr', 'fr'), unitRow('u-zz', 'ZZ')] as T[]);
    assert.equal(loaded[0]?.origin?.birthOriginCountryName, 'United States of America');
    assert.equal(loaded[1]?.origin?.birthOriginCountryName, 'France');
    assert.equal(loaded[2]?.origin?.birthOriginCountryName, null);
    clearTacticalBirthCountryCache();
    assert.equal(countryDisplayNameForCode('US'), null);
    const cleared = listUnitsForSnapshotWithGetAll(<T extends Record<string, unknown>>() => [unitRow('u-us', 'US')] as T[]);
    assert.equal(cleared[0]?.origin?.birthOriginCountryName, null);
  } finally {
    clearTacticalBirthCountryCache();
  }
});
