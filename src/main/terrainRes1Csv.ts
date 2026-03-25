/**
 * Loads `terrain_res1_base.csv` (h3_index, terrain) for world H3 resolution 1 seeding.
 * Resolves the file for dev (repo layout) and packaged Electron (under app root / asar).
 */

import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError, logTrace } from './logger';
import { isPipelineTerrainKind, type PipelineTerrainKind } from '../shared/pipelineTerrain';

const CSV_FILENAME = 'terrain_res1_base.csv';
const CSV_REL_SEGMENTS = ['data', 'generated', CSV_FILENAME];

/**
 * Resolves the absolute path to the bundled terrain CSV. Tries paths relative to the compiled
 * main bundle, then `process.cwd()`, then `app.getAppPath()` when Electron is available.
 * Throws if the file is missing everywhere (caller should surface a user-visible error).
 */
export function resolveTerrainRes1CsvPath(): string {
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
 * Parses CSV text into a map of H3 index → pipeline terrain kind. Validates each terrain label.
 * Expects a header line `h3_index,terrain`. Duplicate H3 indices throw.
 */
export function parseTerrainRes1CsvText(fileText: string): Map<string, PipelineTerrainKind> {
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
 * Reads the terrain CSV from disk and returns a validated map. Use during hex seeding.
 * On I/O or parse errors, logs at error and rethrows.
 */
export function loadTerrainRes1CsvFromPath(absPath: string): Map<string, PipelineTerrainKind> {
  logDebug('terrainRes1Csv loadTerrainRes1CsvFromPath', { absPath });
  try {
    const text = fs.readFileSync(absPath, 'utf8');
    return parseTerrainRes1CsvText(text);
  } catch (err) {
    logError('terrainRes1Csv loadTerrainRes1CsvFromPath: failed', err);
    throw err;
  }
}

/**
 * Ensures the CSV contains exactly the expected H3 set (world res1 list). Throws on mismatch.
 * Call after parse/load so seeding never runs with partial or extra rows.
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
