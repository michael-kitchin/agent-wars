/**
 * Contract tests for terrain CSV parsing, world-list assertion, and pipeline → passability mapping.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { pipelineTerrainToPassability } from '../shared/pipelineTerrain';
import {
  parseTerrainRes1CsvText,
  assertTerrainCsvMatchesHexList,
} from './terrainRes1Csv';

function fixturePath(name: string): string {
  return path.join(__dirname, '..', '..', 'src', 'main', 'fixtures', name);
}

function testPipelineToPassability(): void {
  assert.strictEqual(pipelineTerrainToPassability('ocean'), 'water');
  assert.strictEqual(pipelineTerrainToPassability('coastal'), 'coastal');
  assert.strictEqual(pipelineTerrainToPassability('land'), 'land');
  assert.strictEqual(pipelineTerrainToPassability('forest'), 'land');
  assert.strictEqual(pipelineTerrainToPassability('mountain'), 'land');
  assert.strictEqual(pipelineTerrainToPassability('desert'), 'land');
  assert.strictEqual(pipelineTerrainToPassability('arctic'), 'land');
}

function testParseSampleFixture(): void {
  const p = fixturePath('terrain_res1_sample.csv');
  const text = fs.readFileSync(p, 'utf8');
  const map = parseTerrainRes1CsvText(text);
  assert.strictEqual(map.size, 3);
  assert.strictEqual(map.get('81003ffffffffff'), 'ocean');
  assert.strictEqual(map.get('8102fffffffffff'), 'desert');
  assert.strictEqual(map.get('81037ffffffffff'), 'arctic');
}

function testParseRejectsDuplicateH3(): void {
  const csv = `h3_index,terrain
81003ffffffffff,ocean
81003ffffffffff,land
`;
  assert.throws(() => parseTerrainRes1CsvText(csv), /duplicate h3_index/);
}

function testParseRejectsBadTerrain(): void {
  const csv = `h3_index,terrain
81003ffffffffff,not_a_terrain
`;
  assert.throws(() => parseTerrainRes1CsvText(csv), /invalid terrain/);
}

function testAssertMatchesHexListOk(): void {
  const csv = fs.readFileSync(fixturePath('terrain_res1_sample.csv'), 'utf8');
  const map = parseTerrainRes1CsvText(csv);
  const expected = ['81003ffffffffff', '8102fffffffffff', '81037ffffffffff'];
  assertTerrainCsvMatchesHexList(map, expected);
}

function testAssertMatchesHexListMissing(): void {
  const csv = fs.readFileSync(fixturePath('terrain_res1_sample.csv'), 'utf8');
  const map = parseTerrainRes1CsvText(csv);
  assert.throws(
    () => assertTerrainCsvMatchesHexList(map, ['81003ffffffffff', '8102fffffffffff']),
    /row count/
  );
}

function testAssertMatchesHexListUnknownHex(): void {
  const csv = fs.readFileSync(fixturePath('terrain_res1_sample.csv'), 'utf8');
  const map = parseTerrainRes1CsvText(csv);
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
