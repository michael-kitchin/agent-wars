/**
 * Loads `terrain_res1_base.csv` (h3_index, terrain) for world H3 resolution 1 seeding.
 * Resolves the file for dev (repo layout) and packaged Electron (under app root / asar).
 */

import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError, logTrace } from './logger';
import { isPipelineTerrainKind, type PipelineTerrainKind } from '../shared/pipelineTerrain';

/**
 * Documents the module-scope binding `CSV_FILENAME` (CSV_FILENAME).

 * Purpose: Supports maintainability by documenting why `CSV_FILENAME` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const CSV_FILENAME = 'terrain_res1_base.csv';
/**
 * Documents the module-scope binding `CSV_REL_SEGMENTS` (CSV_REL_SEGMENTS).

 * Purpose: Supports maintainability by documenting why `CSV_REL_SEGMENTS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const CSV_REL_SEGMENTS = ['data', 'generated', CSV_FILENAME];

/**
 * Defines the `resolveTerrainStrategicCsvPath` function shape (export function resolveTerrainStrategicCsvPath(): string).

 * Purpose: Supports maintainability by documenting why `resolveTerrainStrategicCsvPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveTerrainStrategicCsvPath(): string {
  logDebug('terrainRes1Csv resolveTerrainRes1CsvPath');
  const candidates: string[] = [];

  const fromMainDir = path.join(__dirname, '..', '..', ...CSV_REL_SEGMENTS);
  candidates.push(fromMainDir);

  candidates.push(path.join(process.cwd(), ...CSV_REL_SEGMENTS));

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as { app?: { getAppPath?: () => string } };
    const ap = app?.getAppPath?.();
    if (ap) candidates.push(path.join(ap, ...CSV_REL_SEGMENTS));
  } catch {
    // not in Electron (e.g. some test runners)
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      logDebug('terrainRes1Csv resolveTerrainRes1CsvPath: found', { path: p });
      return p;
    }
  }

  const msg = `terrain CSV not found; tried: ${candidates.join('; ')}`;
  logError('terrainRes1Csv resolveTerrainRes1CsvPath: missing file', new Error(msg));
  throw new Error(msg);
}

/**
 * Defines the `parseTerrainStrategicCsvText` function shape (export function parseTerrainStrategicCsvText(fileText: string): Map<string, PipelineTerrainKind> { logDebug('terrainStrategicCsv parseTerrainStrategicCsvText', { byteLength).

 * Purpose: Supports maintainability by documenting why `parseTerrainStrategicCsvText` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function parseTerrainStrategicCsvText(fileText: string): Map<string, PipelineTerrainKind> {
  logDebug('terrainRes1Csv parseTerrainRes1CsvText', { byteLength: fileText.length });
  const lines = fileText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('terrain CSV: expected header and at least one data row');
  }
  const header = lines[0]!.toLowerCase();
  if (!header.includes('h3_index') || !header.includes('terrain')) {
    throw new Error(`terrain CSV: unexpected header: ${lines[0]}`);
  }
  const map = new Map<string, PipelineTerrainKind>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const comma = line.indexOf(',');
    if (comma <= 0) throw new Error(`terrain CSV: bad line ${i + 1}`);
    const h3 = line.slice(0, comma).trim();
    const terrain = line.slice(comma + 1).trim();
    if (!h3) throw new Error(`terrain CSV: empty h3_index at line ${i + 1}`);
    if (!isPipelineTerrainKind(terrain)) {
      logDebug('terrainRes1Csv parseTerrainRes1CsvText invalid terrain label', { line: i + 1, terrain });
      throw new Error(`terrain CSV: invalid terrain "${terrain}" at line ${i + 1}`);
    }
    if (map.has(h3)) throw new Error(`terrain CSV: duplicate h3_index ${h3}`);
    map.set(h3, terrain);
  }
  return map;
}

/**
 * Defines the `loadTerrainStrategicCsvFromPath` function shape (export function loadTerrainStrategicCsvFromPath(absPath: string): Map<string, PipelineTerrainKind> { logDebug('terrainStrategicCsv loadTerrainStrategicCsvFromPath', { absPa).

 * Purpose: Supports maintainability by documenting why `loadTerrainStrategicCsvFromPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadTerrainStrategicCsvFromPath(absPath: string): Map<string, PipelineTerrainKind> {
  logDebug('terrainRes1Csv loadTerrainRes1CsvFromPath', { absPath });
  try {
    const text = fs.readFileSync(absPath, 'utf8');
    return parseTerrainStrategicCsvText(text);
  } catch (err) {
    logError('terrainRes1Csv loadTerrainRes1CsvFromPath: failed', err);
    throw err;
  }
}

/**
 * Defines the `assertTerrainCsvMatchesHexList` function shape (export function assertTerrainCsvMatchesHexList().

 * Purpose: Supports maintainability by documenting why `assertTerrainCsvMatchesHexList` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function assertTerrainCsvMatchesHexList(
  byH3: Map<string, PipelineTerrainKind>,
  expectedHexes: string[]
): void {
  logTrace('terrainRes1Csv assertTerrainCsvMatchesHexList', { expectedCount: expectedHexes.length });
  if (byH3.size !== expectedHexes.length) {
    throw new Error(`terrain CSV row count ${byH3.size} !== expected hex count ${expectedHexes.length}`);
  }
  for (const h of expectedHexes) {
    if (!byH3.has(h)) {
      throw new Error(`terrain CSV missing h3_index ${h}`);
    }
  }
}
