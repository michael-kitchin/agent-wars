/**
 * Contract tests for terrain CSV parsing, world-list assertion, and pipeline → passability mapping.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { pipelineTerrainToPassability } from '../shared/pipelineTerrain';
import {
  parseTerrainStrategicCsvText,
  assertTerrainCsvMatchesHexList,
} from './terrainStrategicCsv';

/**
 * Defines the `fixturePath` function shape (function fixturePath(name: string): string).

 * Purpose: Supports maintainability by documenting why `fixturePath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function fixturePath(name: string): string {
  return path.join(__dirname, '..', '..', 'src', 'main', 'fixtures', name);
}

/**
 * Defines the `testPipelineToPassability` function shape (function testPipelineToPassability(): void).

 * Purpose: Supports maintainability by documenting why `testPipelineToPassability` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPipelineToPassability(): void {
  assert.strictEqual(pipelineTerrainToPassability('water'), 'water');
  assert.strictEqual(pipelineTerrainToPassability('coastal'), 'coastal');
  assert.strictEqual(pipelineTerrainToPassability('wetlands'), 'wetlands');
  assert.strictEqual(pipelineTerrainToPassability('plains'), 'land');
  assert.strictEqual(pipelineTerrainToPassability('forest'), 'land');
  assert.strictEqual(pipelineTerrainToPassability('mountain'), 'land');
  assert.strictEqual(pipelineTerrainToPassability('desert'), 'land');
  assert.strictEqual(pipelineTerrainToPassability('arctic'), 'land');
}

/**
 * Defines the `testParseSampleFixture` function shape (function testParseSampleFixture(): void).

 * Purpose: Supports maintainability by documenting why `testParseSampleFixture` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testParseSampleFixture(): void {
  const p = fixturePath('terrain_res1_sample.csv');
  const text = fs.readFileSync(p, 'utf8');
  const map = parseTerrainStrategicCsvText(text);
  assert.strictEqual(map.size, 3);
  assert.strictEqual(map.get('81003ffffffffff'), 'water');
  assert.strictEqual(map.get('8102fffffffffff'), 'desert');
  assert.strictEqual(map.get('81037ffffffffff'), 'arctic');
}

/**
 * Defines the `testParseRejectsDuplicateH3` function shape (function testParseRejectsDuplicateH3(): void).

 * Purpose: Supports maintainability by documenting why `testParseRejectsDuplicateH3` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testParseRejectsDuplicateH3(): void {
  const csv = `h3_index,terrain
81003ffffffffff,water
81003ffffffffff,plains
`;
  assert.throws(() => parseTerrainStrategicCsvText(csv), /duplicate h3_index/);
}

/**
 * Defines the `testParseRejectsBadTerrain` function shape (function testParseRejectsBadTerrain(): void).

 * Purpose: Supports maintainability by documenting why `testParseRejectsBadTerrain` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testParseRejectsBadTerrain(): void {
  const csv = `h3_index,terrain
81003ffffffffff,not_a_terrain
`;
  assert.throws(() => parseTerrainStrategicCsvText(csv), /invalid terrain/);
}

/**
 * Defines the `testAssertMatchesHexListOk` function shape (function testAssertMatchesHexListOk(): void).

 * Purpose: Supports maintainability by documenting why `testAssertMatchesHexListOk` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAssertMatchesHexListOk(): void {
  const csv = fs.readFileSync(fixturePath('terrain_res1_sample.csv'), 'utf8');
  const map = parseTerrainStrategicCsvText(csv);
  const expected = ['81003ffffffffff', '8102fffffffffff', '81037ffffffffff'];
  assertTerrainCsvMatchesHexList(map, expected);
}

/**
 * Defines the `testAssertMatchesHexListMissing` function shape (function testAssertMatchesHexListMissing(): void).

 * Purpose: Supports maintainability by documenting why `testAssertMatchesHexListMissing` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAssertMatchesHexListMissing(): void {
  const csv = fs.readFileSync(fixturePath('terrain_res1_sample.csv'), 'utf8');
  const map = parseTerrainStrategicCsvText(csv);
  assert.throws(
    () => assertTerrainCsvMatchesHexList(map, ['81003ffffffffff', '8102fffffffffff']),
    /row count/
  );
}

/**
 * Defines the `testAssertMatchesHexListUnknownHex` function shape (function testAssertMatchesHexListUnknownHex(): void).

 * Purpose: Supports maintainability by documenting why `testAssertMatchesHexListUnknownHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAssertMatchesHexListUnknownHex(): void {
  const csv = fs.readFileSync(fixturePath('terrain_res1_sample.csv'), 'utf8');
  const map = parseTerrainStrategicCsvText(csv);
  assert.throws(
    () =>
      assertTerrainCsvMatchesHexList(map, [
        '81003ffffffffff',
        '8102fffffffffff',
        'fffffffffffffff',
      ]),
    /missing h3_index/
  );
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testPipelineToPassability();
  testParseSampleFixture();
  testParseRejectsDuplicateH3();
  testParseRejectsBadTerrain();
  testAssertMatchesHexListOk();
  testAssertMatchesHexListMissing();
  testAssertMatchesHexListUnknownHex();
  console.log('terrainRes1Csv.test.ts passed');
}

run();
