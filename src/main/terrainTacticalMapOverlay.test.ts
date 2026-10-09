/**
 * Unit tests for tactical map inspection overlay reduction and road/rail JSON parsing contracts.
 */

import * as assert from 'assert';
import type { TerrainNamingRecordTactical } from './terrainNamingLoad';
import {
  clearTerrainClassificationCacheForTests,
  ensureTerrainClassificationCacheLoaded,
  getStrategicBaselineUrbanHexCountsForRenderer,
  getTacticalCityOverlaysForRenderer,
  getTacticalRoadRailOverlaysForRenderer,
} from './terrainClassificationCache';
import { reduceTacticalCityOverlayLabelsByH3 } from './terrainTacticalCityOverlayReduce';
import { parseTerrainTacticalRoadRailSidesJson } from './terrainRoadRailSidesLoad';

/**
 * Defines the `testCityReductionPicksLowestScalerank` function shape (function testCityReductionPicksLowestScalerank(): void).

 * Purpose: Guards the city-label ceiling and lowest-rank winner selection for map labels.
 * When to use: `npm test` main-process suite.
 * Expected outcome: The smallest scalerank among eligible cities becomes the sole label when unique.
 * Exceptions: None.
 */
function testCityReductionPicksLowestScalerank(): void {
  const records: TerrainNamingRecordTactical[] = [
    {
      h3_index: '8401341ffffffff',
      cities: [
        { name: 'Small', state: null, country: null, population: 100, scalerank: 2, countryCode: null },
        { name: 'BigCity', state: null, country: null, population: 9, scalerank: 0, countryCode: null },
        { name: 'Mid', state: null, country: null, population: 50, scalerank: 1, countryCode: null },
      ],
      states: [],
      countries: [],
      water: [],
    },
  ];
  const m = reduceTacticalCityOverlayLabelsByH3(records);
  assert.strictEqual(m.get('8401341ffffffff'), 'BigCity');
}

/**
 * Defines the `testCityTieJoinsAndSorts` function shape (function testCityTieJoinsAndSorts(): void).

 * Purpose: Ensures tied cities at the winning scalerank join with `" / "` using population desc then name asc.
 * When to use: `npm test` main-process suite.
 * Expected outcome: Cities outside the winning rank are ignored for labeling.
 * Exceptions: None.
 */
function testCityTieJoinsAndSorts(): void {
  const records: TerrainNamingRecordTactical[] = [
    {
      h3_index: '8401349ffffffff',
      cities: [
        { name: 'B', state: null, country: null, population: 5, scalerank: 1, countryCode: null },
        { name: 'A', state: null, country: null, population: 5, scalerank: 1, countryCode: null },
        { name: 'Z', state: null, country: null, population: 10, scalerank: 2, countryCode: null },
      ],
      states: [],
      countries: [],
      water: [],
    },
  ];
  const m = reduceTacticalCityOverlayLabelsByH3(records);
  assert.strictEqual(m.get('8401349ffffffff'), 'A / B');
}

/**
 * Defines the `testCityReductionIgnoresOutOfRangeScalerank` function shape (function testCityReductionIgnoresOutOfRangeScalerank(): void).

 * Purpose: Confirms a city above the active map's city label ceiling never contributes to overlays.
 * When to use: `npm test` main-process suite.
 * Expected outcome: No map entry is produced when no eligible cities exist. Scalerank 6 is labeled.
 * Exceptions: None.
 */
function testCityReductionIgnoresOutOfRangeScalerank(): void {
  const records: TerrainNamingRecordTactical[] = [
    {
      h3_index: '840134bffffffff',
      cities: [{ name: 'OnlySeven', state: null, country: null, population: 1, scalerank: 7, countryCode: null }],
      states: [],
      countries: [],
      water: [],
    },
  ];
  const m = reduceTacticalCityOverlayLabelsByH3(records);
  assert.ok(!m.has('840134bffffffff'));
  const labeled = reduceTacticalCityOverlayLabelsByH3([
    {
      h3_index: '840134cffffffff',
      cities: [{ name: 'RankSix', state: null, country: null, population: 1, scalerank: 6, countryCode: null }],
      states: [],
      countries: [],
      water: [],
    },
  ]);
  assert.strictEqual(labeled.get('840134cffffffff'), 'RankSix');
}

/**
 * Defines the `testRoadRailParseMinimal` function shape (function testRoadRailParseMinimal(): void).

 * Purpose: Happy-path validation for the road/rail sides envelope parser.
 * When to use: `npm test` main-process suite.
 * Expected outcome: Hex id and boolean masks round-trip from JSON text.
 * Exceptions: None.
 */
function testRoadRailParseMinimal(): void {
  const text = JSON.stringify({
    schema_version: '1.1.0',
    resolution: 4,
    records: [
      {
        h3_index: '8401341ffffffff',
        road_sides: [true, false, false, false, false, false],
        rail_sides: [false, false, false, false, false, false],
      },
    ],
  });
  const rows = parseTerrainTacticalRoadRailSidesJson(text);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]!.h3Index, '8401341ffffffff');
  assert.strictEqual(rows[0]!.roadSides[0], true);
}

/**
 * Defines the `testRoadRailParseRejectsLengthMismatch` function shape (function testRoadRailParseRejectsLengthMismatch(): void).

 * Purpose: Essential failure guard when road and rail mask lengths disagree.
 * When to use: `npm test` main-process suite.
 * Expected outcome: Parser throws before any partial structure is returned.
 * Exceptions: None.
 */
function testRoadRailParseRejectsLengthMismatch(): void {
  const text = JSON.stringify({
    schema_version: '1.1.0',
    resolution: 4,
    records: [{ h3_index: '8401341ffffffff', road_sides: [true], rail_sides: [false, false] }],
  });
  assert.throws(() => parseTerrainTacticalRoadRailSidesJson(text));
}

/**
 * Defines the `testRoadRailParseRejectsNonBoolean` function shape (function testRoadRailParseRejectsNonBoolean(): void).

 * Purpose: Ensures mask arrays reject non-boolean entries (essential schema failure).
 * When to use: `npm test` main-process suite.
 * Expected outcome: Parser throws with a stable error class.
 * Exceptions: None.
 */
function testRoadRailParseRejectsNonBoolean(): void {
  const text = JSON.stringify({
    schema_version: '1.1.0',
    resolution: 4,
    records: [{ h3_index: '8401341ffffffff', road_sides: [1, 0, 0, 0, 0, 0], rail_sides: [false, false, false, false, false, false] }],
  });
  assert.throws(() => parseTerrainTacticalRoadRailSidesJson(text));
}

/**
 * Defines the `testOverlayIpcGettersReturnEmptyWhenCacheCleared` function shape (function testOverlayIpcGettersReturnEmptyWhenCacheCleared(): void).

 * Purpose: Locks the non-fatal IPC fallback when the classification cache is not populated.
 * When to use: `npm test` main-process suite.
 * Expected outcome: The overlay getters yield empty arrays without throwing.
 * Exceptions: None.
 */
function testOverlayIpcGettersReturnEmptyWhenCacheCleared(): void {
  clearTerrainClassificationCacheForTests();
  assert.deepStrictEqual(getTacticalCityOverlaysForRenderer(), []);
  assert.deepStrictEqual(getTacticalRoadRailOverlaysForRenderer(), []);
  assert.deepStrictEqual(getStrategicBaselineUrbanHexCountsForRenderer(), []);
}

/**
 * Defines the `testOverlayIpcGettersShapeAfterCacheLoad` function shape (function testOverlayIpcGettersShapeAfterCacheLoad(): void).

 * Purpose: Happy-path contract for serialized payloads used by `game:getTacticalCityOverlays` / `game:getTacticalRoadRailOverlays` handlers.
 * When to use: `npm test` when bundled terrain JSON is present (same precondition as `terrainMetadataParity.test`).
 * Expected outcome: Rows are well-formed; road/rail mask lengths match and are pent/hex only.
 * Exceptions: Skips when `ensureTerrainClassificationCacheLoaded` fails (minimal CI without generated data).
 */
function testOverlayIpcGettersShapeAfterCacheLoad(): void {
  clearTerrainClassificationCacheForTests();
  try {
    ensureTerrainClassificationCacheLoaded();
  } catch {
    console.log('terrainRes4MapOverlay.test: skipped IPC shape test (terrain classification cache load failed)');
    return;
  }
  const cities = getTacticalCityOverlaysForRenderer();
  for (const row of cities) {
    assert.strictEqual(typeof row.h3Index, 'string');
    assert.ok(row.h3Index.length > 0);
    assert.strictEqual(typeof row.label, 'string');
    assert.ok(row.label.length > 0);
  }
  const baselines = getStrategicBaselineUrbanHexCountsForRenderer();
  assert.ok(baselines.length > 0);
  for (const row of baselines) {
    assert.strictEqual(typeof row.h3Index, 'string');
    assert.ok(row.h3Index.length > 0);
    assert.strictEqual(Number.isInteger(row.urbanHexCount), true);
    assert.ok(row.urbanHexCount >= 1);
  }
  const rails = getTacticalRoadRailOverlaysForRenderer();
  for (const row of rails) {
    assert.strictEqual(typeof row.h3Index, 'string');
    assert.ok(row.h3Index.length > 0);
    const { roadSides, railSides } = row;
    assert.strictEqual(roadSides.length, railSides.length);
    assert.ok(roadSides.length === 5 || roadSides.length === 6);
  }
}

/**
 * Defines the `main` function shape (function main(): void).

 * Purpose: Runs overlay unit tests as a standalone Node entrypoint matching repo conventions.
 * When to use: Invoked from `npm test` after `tsc -p tsconfig.main.json`.
 * Expected outcome: Prints a success marker when every assertion passes.
 * Exceptions: Propagates assertion failures to the process exit code.
 */
function main(): void {
  testCityReductionPicksLowestScalerank();
  testCityTieJoinsAndSorts();
  testCityReductionIgnoresOutOfRangeScalerank();
  testRoadRailParseMinimal();
  testRoadRailParseRejectsLengthMismatch();
  testRoadRailParseRejectsNonBoolean();
  testOverlayIpcGettersReturnEmptyWhenCacheCleared();
  testOverlayIpcGettersShapeAfterCacheLoad();
  console.log('terrainRes4MapOverlay.test: ok');
}

main();
