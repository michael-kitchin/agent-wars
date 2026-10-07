/**
 * Unit tests for res-1 land-mass JSON loading contracts.
 */

import * as assert from 'assert';
import { getOrderedHexList } from './mapData';
import {
  assertLandMassMatchesHexList,
  buildStrategicLandMassByH3,
  EXPECTED_LANDMASS_SCHEMA_VERSION,
  loadTerrainStrategicLandMassBundled,
  parseStrategicLandMassEnvelope,
} from './terrainLandMassLoad';

/**
 * Documents the module-scope binding `EXPECTED_STRATEGIC_HEX_COUNT` (EXPECTED_STRATEGIC_HEX_COUNT).

 * Purpose: Supports maintainability by documenting why `EXPECTED_STRATEGIC_HEX_COUNT` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const EXPECTED_STRATEGIC_HEX_COUNT = 842;

/**
 * Defines the `testBundledLandMassRecordCount` function shape (function testBundledLandMassRecordCount(): void).

 * Purpose: Supports maintainability by documenting why `testBundledLandMassRecordCount` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testBundledLandMassRecordCount(): void {
  const envelope = loadTerrainStrategicLandMassBundled();
  assert.strictEqual(envelope.schema_version, EXPECTED_LANDMASS_SCHEMA_VERSION);
  assert.strictEqual(envelope.resolution, 1);
  assert.strictEqual(envelope.record_count, EXPECTED_STRATEGIC_HEX_COUNT);
  assert.strictEqual(envelope.records.length, EXPECTED_STRATEGIC_HEX_COUNT);
  const byH3 = buildStrategicLandMassByH3(envelope);
  assertLandMassMatchesHexList(byH3, getOrderedHexList());
}

/**
 * Defines the `testParseRejectsInvalidEnvelope` function shape (function testParseRejectsInvalidEnvelope(): void).

 * Purpose: Supports maintainability by documenting why `testParseRejectsInvalidEnvelope` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testParseRejectsInvalidEnvelope(): void {
  assert.throws(() => parseStrategicLandMassEnvelope({ schema_version: '9.9.9', records: [] }));
  assert.throws(() => parseStrategicLandMassEnvelope({ schema_version: EXPECTED_LANDMASS_SCHEMA_VERSION, records: 'bad' }));
}

function testParseV2MinimalEnvelope(): void {
  const envelope = parseStrategicLandMassEnvelope({
    schema_version: EXPECTED_LANDMASS_SCHEMA_VERSION,
    resolution: 1,
    generated_at_utc: '2026-01-01T00:00:00+00:00',
    record_count: 1,
    polygon_source: {
      shapefile: 'ne_10m_geography_regions_polys.shp',
      continent_featurecla: ['Continent', 'Isthmus'],
      island_featurecla: 'Island',
      id_property: 'NE_ID',
      island_min_area_km2: 1000,
    },
    water_pct_source: {
      method: 'tactical_child_water_terrain_fraction',
      requires: ['terrain_res4_metadata.json'],
    },
    records: [
      {
        h3_index: '813e7ffffffffff',
        water_pct: 8.5,
        continent_ids: [1159104365, 1159104597],
        island_ids: [],
      },
    ],
  });
  assert.strictEqual(envelope.records.length, 1);
  assert.strictEqual(envelope.polygon_source?.island_min_area_km2, 1000);
  assert.strictEqual(envelope.island_min_area_km2, 1000);
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testParseV2MinimalEnvelope();
  testBundledLandMassRecordCount();
  testParseRejectsInvalidEnvelope();
  console.log('terrainLandMassLoad tests passed');
}

run();
