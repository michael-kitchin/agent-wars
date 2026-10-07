/**
 * Essential contracts for naming JSON parsing and scalerank name lists.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  EXPECTED_HEX_NAMING_SCHEMA_VERSION,
  loadTerrainStrategicNamingFromPath,
  namesForFirstOccurringScalerank,
  namesForFirstOccurringScalerankList,
} from './terrainNamingLoad';

/**
 * Defines the `testNamesForFirstOccurringScalerankKeepsFirstRankOnly` function shape (function testNamesForFirstOccurringScalerankKeepsFirstRankOnly(): void).

 * Purpose: Supports maintainability by documenting why `testNamesForFirstOccurringScalerankKeepsFirstRankOnly` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNamesForFirstOccurringScalerankKeepsFirstRankOnly(): void {
  const line = namesForFirstOccurringScalerank([
    { name: 'Bridgeport', scalerank: 4 },
    { name: 'Stamford', scalerank: 8 },
  ]);
  assert.strictEqual(line, 'Bridgeport');
}

/**
 * Defines the `testNamesForFirstOccurringScalerankListKeepsSourceOrder` function shape (function testNamesForFirstOccurringScalerankListKeepsSourceOrder(): void).

 * Purpose: Supports maintainability by documenting why `testNamesForFirstOccurringScalerankListKeepsSourceOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNamesForFirstOccurringScalerankListKeepsSourceOrder(): void {
  const list = namesForFirstOccurringScalerankList([
    { name: 'B', scalerank: 2 },
    { name: 'A', scalerank: 2 },
    { name: 'C', scalerank: 3 },
  ]);
  assert.deepStrictEqual(list, ['B', 'A']);
}

/**
 * Writes a one-record strategic naming file whose single country row has the given code.
 *
 * Purpose: Exercises the real loader path with a minimal envelope.
 * When to use: In country-code validation tests.
 * Expected outcome: Absolute path to a temp JSON file; the caller removes its directory.
 * Exceptions: Throws on file-system errors.
 */
function writeStrategicNamingWithCountryCode(dir: string, countryCode: unknown): string {
  const filePath = path.join(dir, 'terrain_res1_naming.json');
  const envelope = {
    schema_version: EXPECTED_HEX_NAMING_SCHEMA_VERSION,
    resolution: 1,
    record_count: 1,
    records: [
      {
        h3_index: '81003ffffffffff',
        states: [],
        countries: [
          { name: 'France', continent: 'Europe', region: 'Western Europe', population: 1, scalerank: 0, country_code: countryCode },
        ],
        water: [],
      },
    ],
  };
  fs.writeFileSync(filePath, JSON.stringify(envelope), 'utf8');
  return filePath;
}

/**
 * Valid and null country codes load; lowercase codes and the Natural Earth `-99` sentinel are rejected.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testCountryCodeValidation(): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrain-naming-load-'));
  try {
    const loaded = loadTerrainStrategicNamingFromPath(writeStrategicNamingWithCountryCode(dir, 'FR'));
    assert.strictEqual(loaded.records[0]?.countries[0]?.countryCode, 'FR');
    const loadedNull = loadTerrainStrategicNamingFromPath(writeStrategicNamingWithCountryCode(dir, null));
    assert.strictEqual(loadedNull.records[0]?.countries[0]?.countryCode, null);
    for (const bad of ['fr', '-99']) {
      assert.throws(
        () => loadTerrainStrategicNamingFromPath(writeStrategicNamingWithCountryCode(dir, bad)),
        /country_code must be two uppercase letters or null/
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Runs all loader tests.
 *
 * Purpose: Entry point for the compiled test file.
 * When to use: Invoked by the test runner via `node`.
 * Expected outcome: Logs `ok`, or throws on the first failed assertion.
 * Exceptions: `AssertionError` when a contract is broken.
 */
function main(): void {
  testNamesForFirstOccurringScalerankKeepsFirstRankOnly();
  testNamesForFirstOccurringScalerankListKeepsSourceOrder();
  testCountryCodeValidation();
  console.log('terrainNamingLoad.test: ok');
}

main();
