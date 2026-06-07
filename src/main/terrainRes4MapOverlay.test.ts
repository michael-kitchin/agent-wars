/**
 * Unit tests for res4 map inspection overlay reduction and road/rail JSON parsing contracts.
 */

import * as assert from 'assert';
import type { TerrainNamingRecordRes4 } from './terrainNamingLoad';
import {
  clearTerrainClassificationCacheForTests,
  ensureTerrainClassificationCacheLoaded,
  getRes4CityOverlaysForRenderer,
  getRes4RoadRailOverlaysForRenderer,
} from './terrainClassificationCache';
import { reduceRes4CityOverlayLabelsByH3 } from './terrainRes4CityOverlayReduce';
import { parseTerrainRes4RoadRailSidesJson } from './terrainRoadRailSidesLoad';

/**
 * Defines the `testCityReductionPicksLowestScalerank` function shape (function testCityReductionPicksLowestScalerank(): void).

 * Purpose: Guards the scalerank 0..4 filter and lowest-rank winner selection for map labels.
 * When to use: `npm test` main-process suite.
 * Expected outcome: The smallest scalerank among eligible cities becomes the sole label when unique.
 * Exceptions: None.
 */
function testCityReductionPicksLowestScalerank(): void {
  const records: TerrainNamingRecordRes4[] = [
    {
      h3_index: '8401341ffffffff',
      cities: [
        { name: 'Small', state: null, country: null, population: 100, scalerank: 2 },
        { name: 'BigCity', state: null, country: null, population: 9, scalerank: 0 },
        { name: 'Mid', state: null, country: null, population: 50, scalerank: 1 },
      ],
      states: [],
      countries: [],
      water: [],
    },
  ];
  const m = reduceRes4CityOverlayLabelsByH3(records);
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
  const records: TerrainNamingRecordRes4[] = [
    {
      h3_index: '8401349ffffffff',
      cities: [
        { name: 'B', state: null, country: null, population: 5, scalerank: 1 },
        { name: 'A', state: null, country: null, population: 5, scalerank: 1 },
        { name: 'Z', state: null, country: null, population: 10, scalerank: 2 },
      ],
      states: [],
      countries: [],
      water: [],
    },
  ];
  const m = reduceRes4CityOverlayLabelsByH3(records);
  assert.strictEqual(m.get('8401349ffffffff'), 'A / B');
}

/**
 * Defines the `testCityReductionIgnoresOutOfRangeScalerank` function shape (function testCityReductionIgnoresOutOfRangeScalerank(): void).

 * Purpose: Confirms scalerank outside 0..4 never contributes to overlays.
 * When to use: `npm test` main-process suite.
 * Expected outcome: No map entry is produced when no eligible cities exist.
 * Exceptions: None.
 */
function testCityReductionIgnoresOutOfRangeScalerank(): void {
  const records: TerrainNamingRecordRes4[] = [
    {
      h3_index: '840134bffffffff',
      cities: [{ name: 'OnlyFive', state: null, country: null, population: 1, scalerank: 5 }],
      states: [],
      countries: [],
      water: [],
    },
  ];
  const m = reduceRes4CityOverlayLabelsByH3(records);
  assert.ok(!m.has('840134bffffffff'));
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
  const rows = parseTerrainRes4RoadRailSidesJson(text);
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
  assert.throws(() => parseTerrainRes4RoadRailSidesJson(text));
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
  assert.throws(() => parseTerrainRes4RoadRailSidesJson(text));
}

/**
 * Defines the `testOverlayIpcGettersReturnEmptyWhenCacheCleared` function shape (function testOverlayIpcGettersReturnEmptyWhenCacheCleared(): void).

 * Purpose: Mirrors Phase 2 IPC non-fatal fallback when classification cache is not populated.
 * When to use: `npm test` main-process suite.
 * Expected outcome: Both getters yield empty arrays without throwing.
 * Exceptions: None.
 */
function testOverlayIpcGettersReturnEmptyWhenCacheCleared(): void {
  clearTerrainClassificationCacheForTests();
  assert.deepStrictEqual(getRes4CityOverlaysForRenderer(), []);
  assert.deepStrictEqual(getRes4RoadRailOverlaysForRenderer(), []);
}

/**
 * Defines the `testOverlayIpcGettersShapeAfterCacheLoad` function shape (function testOverlayIpcGettersShapeAfterCacheLoad(): void).

 * Purpose: Happy-path contract for serialized payloads used by `game:getRes4CityOverlays` / `game:getRes4RoadRailOverlays` handlers.
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
  const cities = getRes4CityOverlaysForRenderer();
  for (const row of cities) {
    assert.strictEqual(typeof row.h3Index, 'string');
    assert.ok(row.h3Index.length > 0);
    assert.strictEqual(typeof row.label, 'string');
    assert.ok(row.label.length > 0);
  }
  const rails = getRes4RoadRailOverlaysForRenderer();
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
