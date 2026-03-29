/**
 * Parity harness: TS metadata classification vs generated pipeline CSVs (≥99% agreement gate for res-1; res-4 when metadata is populated).
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import type { PipelineTerrainKind } from '../shared/pipelineTerrain';
import {
  clearTerrainClassificationCacheForTests,
  ensureTerrainClassificationCacheLoaded,
  getRes4TerrainOverridesForRenderer,
} from './terrainClassificationCache';
import {
  DEFAULT_CLASSIFIER_THRESHOLDS,
  DEFAULT_NODATA_FALLBACK_TERRAIN,
  loadTerrainRes1MetadataBundled,
  loadTerrainRes4MetadataBundled,
} from './terrainMetadataLoad';
import { classifyCellWithoutUrbanOverride } from './terrainClassifierFromMetadata';
import { parseTerrainRes1CsvText } from './terrainRes1Csv';
import { parseTerrainRes4ExceptionsCsvText, resolveTerrainRes4ExceptionsCsvPath } from './terrainRes4Csv';

const PARITY_MIN = 0.99;

function res1CsvPath(): string {
  return path.join(process.cwd(), 'data', 'generated', 'terrain_res1_base.csv');
}

function parityRatio(matches: number, total: number): number {
  return total === 0 ? 1 : matches / total;
}

function testRes1MetadataVsCsvParity(): void {
  assert.ok(fs.existsSync(res1CsvPath()), 'terrainMetadataParity: missing data/generated/terrain_res1_base.csv');
  const env = loadTerrainRes1MetadataBundled();
  const nodata = DEFAULT_NODATA_FALLBACK_TERRAIN;
  const t = DEFAULT_CLASSIFIER_THRESHOLDS;
  const tsMap = new Map<string, PipelineTerrainKind>();
  for (const row of env.records) {
    tsMap.set(row.h3_index, classifyCellWithoutUrbanOverride(row, t, nodata));
  }
  const csvText = fs.readFileSync(res1CsvPath(), 'utf8');
  const csvMap = parseTerrainRes1CsvText(csvText);
  let matches = 0;
  let total = 0;
  for (const [h3, csvKind] of csvMap) {
    const tsKind = tsMap.get(h3);
    total++;
    if (tsKind === csvKind) matches++;
  }
  const ratio = parityRatio(matches, total);
  assert.ok(
    ratio >= PARITY_MIN,
    `res1 parity ${(ratio * 100).toFixed(2)}% < ${PARITY_MIN * 100}% (${matches}/${total} matches)`
  );
}

function testRes4OverridesVsCsvParity(): void {
  const env = loadTerrainRes4MetadataBundled();
  assert.ok(env.record_count > 0, 'terrainMetadataParity: terrain_res4_metadata.json has no records');
  clearTerrainClassificationCacheForTests();
  ensureTerrainClassificationCacheLoaded();
  const csvPath = resolveTerrainRes4ExceptionsCsvPath();
  const csvMap = parseTerrainRes4ExceptionsCsvText(fs.readFileSync(csvPath, 'utf8'));
  const tsRows = getRes4TerrainOverridesForRenderer();
  const tsMap = new Map(tsRows.map((r) => [r.h3Index, (r.isUrban ? 'urban' : r.terrainKind)] as const));
  let matches = 0;
  let total = 0;
  for (const [h3, csvKind] of csvMap) {
    total++;
    if (tsMap.get(h3) === csvKind) matches++;
  }
  const ratio = parityRatio(matches, total);
  assert.ok(
    ratio >= PARITY_MIN,
    `res4 exceptions parity ${(ratio * 100).toFixed(2)}% < ${PARITY_MIN * 100}% (${matches}/${total} matches)`
  );
}

function main(): void {
  testRes1MetadataVsCsvParity();
  testRes4OverridesVsCsvParity();
  console.log('terrainMetadataParity.test: ok');
}

main();
