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
  getTacticalTerrainOverridesForRenderer,
} from './terrainClassificationCache';
import {
  DEFAULT_CLASSIFIER_THRESHOLDS,
  DEFAULT_NODATA_FALLBACK_TERRAIN,
  loadTerrainStrategicMetadataBundled,
  loadTerrainTacticalMetadataBundled,
} from './terrainMetadataLoad';
import { classifyCellWithoutUrbanOverride } from './terrainClassifierFromMetadata';
import { parseTerrainStrategicCsvText } from './terrainStrategicCsv';
import { parseTerrainTacticalExceptionsCsvText, resolveTerrainTacticalExceptionsCsvPath } from './terrainTacticalCsv';

/**
 * Documents the module-scope binding `PARITY_MIN` (PARITY_MIN).

 * Purpose: Supports maintainability by documenting why `PARITY_MIN` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const PARITY_MIN = 0.99;

/**
 * Defines the `strategicCsvPath` function shape (function strategicCsvPath(): string).

 * Purpose: Supports maintainability by documenting why `strategicCsvPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function strategicCsvPath(): string {
  return path.join(process.cwd(), 'data', 'generated', 'terrain_res1_base.csv');
}

/**
 * Defines the `parityRatio` function shape (function parityRatio(matches: number, total: number): number).

 * Purpose: Supports maintainability by documenting why `parityRatio` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function parityRatio(matches: number, total: number): number {
  return total === 0 ? 1 : matches / total;
}

/**
 * Defines the `testStrategicMetadataVsCsvParity` function shape (function testStrategicMetadataVsCsvParity(): void).

 * Purpose: Supports maintainability by documenting why `testStrategicMetadataVsCsvParity` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testStrategicMetadataVsCsvParity(): void {
  if (!fs.existsSync(strategicCsvPath())) {
    console.log('terrainMetadataParity.test: skipped res1 parity (terrain_res1_base.csv missing)');
    return;
  }
  const env = loadTerrainStrategicMetadataBundled();
  const nodata = DEFAULT_NODATA_FALLBACK_TERRAIN;
  const t = DEFAULT_CLASSIFIER_THRESHOLDS;
  const tsMap = new Map<string, PipelineTerrainKind>();
  for (const row of env.records) {
    tsMap.set(row.h3_index, classifyCellWithoutUrbanOverride(row, t, nodata));
  }
  const csvText = fs.readFileSync(strategicCsvPath(), 'utf8');
  const csvMap = parseTerrainStrategicCsvText(csvText);
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

/**
 * Defines the `testTacticalOverridesVsCsvParity` function shape (function testTacticalOverridesVsCsvParity(): void).

 * Purpose: Supports maintainability by documenting why `testTacticalOverridesVsCsvParity` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testTacticalOverridesVsCsvParity(): void {
  let csvPath = '';
  try {
    csvPath = resolveTerrainTacticalExceptionsCsvPath();
  } catch {
    console.log('terrainMetadataParity.test: skipped res4 parity (terrain_res4_exceptions.csv missing)');
    return;
  }
  const env = loadTerrainTacticalMetadataBundled();
  assert.ok(env.record_count > 0, 'terrainMetadataParity: terrain_res4_metadata.json has no records');
  clearTerrainClassificationCacheForTests();
  ensureTerrainClassificationCacheLoaded();
  const csvMap = parseTerrainTacticalExceptionsCsvText(fs.readFileSync(csvPath, 'utf8'));
  const tsRows = getTacticalTerrainOverridesForRenderer();
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

/**
 * Defines the `main` function shape (function main(): void).

 * Purpose: Supports maintainability by documenting why `main` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function main(): void {
  testStrategicMetadataVsCsvParity();
  testTacticalOverridesVsCsvParity();
  console.log('terrainMetadataParity.test: ok');
}

main();
