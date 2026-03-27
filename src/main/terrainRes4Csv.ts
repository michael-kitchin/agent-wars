/**
 * Loads `terrain_res4_exceptions.csv` (h3_index,parent_h3,terrain,parent_terrain) for renderer-only overlays.
 * The file only stores child cells whose terrain differs from their res1 parent terrain.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError, logTrace } from './logger';
import { isPipelineTerrainKind, type PipelineTerrainKind } from '../shared/pipelineTerrain';

const CSV_FILENAME = 'terrain_res4_exceptions.csv';
const CSV_REL_SEGMENTS = ['data', 'generated', CSV_FILENAME];

let cachedOverrides: Map<string, PipelineTerrainKind> | null = null;

/**
 * Resolves the absolute path to the bundled res4 exceptions CSV.
 */
function resolveTerrainRes4ExceptionsCsvPath(): string {
  logDebug('terrainRes4Csv resolveTerrainRes4ExceptionsCsvPath');
  const candidates: string[] = [];
  candidates.push(path.join(__dirname, '..', '..', ...CSV_REL_SEGMENTS));
  candidates.push(path.join(process.cwd(), ...CSV_REL_SEGMENTS));
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as { app?: { getAppPath?: () => string } };
    const ap = app?.getAppPath?.();
    if (ap) candidates.push(path.join(ap, ...CSV_REL_SEGMENTS));
  } catch {
    /* ignore non-Electron contexts */
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const message = `terrain res4 exceptions CSV not found; tried: ${candidates.join('; ')}`;
  logError('terrainRes4Csv resolveTerrainRes4ExceptionsCsvPath: missing file', new Error(message));
  throw new Error(message);
}

/**
 * Parses `terrain_res4_exceptions.csv` rows into a child-h3 → terrain-kind map.
 */
function parseTerrainRes4ExceptionsCsv(fileText: string): Map<string, PipelineTerrainKind> {
  logTrace('terrainRes4Csv parseTerrainRes4ExceptionsCsv');
  const lines = fileText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return new Map<string, PipelineTerrainKind>();
  const map = new Map<string, PipelineTerrainKind>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',');
    if (cols.length < 3) throw new Error(`terrain res4 exceptions CSV: bad line ${i + 1}`);
    const h3Index = cols[0]!.trim();
    const terrainKind = cols[2]!.trim();
    if (!h3Index) throw new Error(`terrain res4 exceptions CSV: empty h3_index at line ${i + 1}`);
    if (!isPipelineTerrainKind(terrainKind)) {
      throw new Error(`terrain res4 exceptions CSV: invalid terrain "${terrainKind}" at line ${i + 1}`);
    }
    if (map.has(h3Index)) throw new Error(`terrain res4 exceptions CSV: duplicate h3_index ${h3Index}`);
    map.set(h3Index, terrainKind);
  }
  return map;
}

/**
 * Why this exists:
 *     Supplies renderer with deterministic res4 terrain override rows for fine-grained zoom overlays.
 * When to use:
 *     IPC handler for renderer startup/loading.
 * What to expect:
 *     Returns cached rows after first successful parse.
 */
export function getRes4TerrainOverridesForRenderer(): Array<{ h3Index: string; terrainKind: PipelineTerrainKind }> {
  logTrace('terrainRes4Csv getRes4TerrainOverridesForRenderer');
  try {
    if (cachedOverrides === null) {
      const csvPath = resolveTerrainRes4ExceptionsCsvPath();
      const text = fs.readFileSync(csvPath, 'utf8');
      cachedOverrides = parseTerrainRes4ExceptionsCsv(text);
      logDebug('terrainRes4Csv loaded overrides', { count: cachedOverrides.size });
    }
    return Array.from(cachedOverrides.entries()).map(([h3Index, terrainKind]) => ({ h3Index, terrainKind }));
  } catch (err) {
    logError('terrainRes4Csv getRes4TerrainOverridesForRenderer: failed', err);
    return [];
  }
}
