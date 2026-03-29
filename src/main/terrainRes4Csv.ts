/**
 * Parses `terrain_res4_exceptions.csv` for parity tests against metadata-derived renderer overrides.
 * Runtime res-4 overlays use `terrainClassificationCache` + `terrain_res4_metadata.json` instead.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError, logTrace } from './logger';
import { isPipelineTerrainKind, type PipelineTerrainKind } from '../shared/pipelineTerrain';

type LegacyRes4CsvTerrainKind = PipelineTerrainKind | 'urban';

const CSV_FILENAME = 'terrain_res4_exceptions.csv';
const CSV_REL_SEGMENTS = ['data', 'generated', CSV_FILENAME];

/**
 * Why this exists:
 *     Resolve the generated exceptions CSV for parity harnesses (same search order as former runtime loader).
 * When to use:
 *     Parity tests that compare TS metadata classification to pipeline CSV output.
 * What to expect:
 *     Throws when the file is missing from all candidate locations.
 */
export function resolveTerrainRes4ExceptionsCsvPath(): string {
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
 * Why this exists:
 *     Parse `terrain_res4_exceptions.csv` rows into a child-h3 → terrain-kind map.
 * When to use:
 *     From `terrainMetadataParity.test.ts` or offline QA scripts.
 * What to expect:
 *     Duplicate `h3_index` rows throw; invalid terrain labels throw.
 */
export function parseTerrainRes4ExceptionsCsvText(fileText: string): Map<string, LegacyRes4CsvTerrainKind> {
  logTrace('terrainRes4Csv parseTerrainRes4ExceptionsCsvText');
  const lines = fileText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return new Map<string, LegacyRes4CsvTerrainKind>();
  const map = new Map<string, LegacyRes4CsvTerrainKind>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',');
    if (cols.length < 3) throw new Error(`terrain res4 exceptions CSV: bad line ${i + 1}`);
    const h3Index = cols[0]!.trim();
    const terrainKind = cols[2]!.trim();
    if (!h3Index) throw new Error(`terrain res4 exceptions CSV: empty h3_index at line ${i + 1}`);
    if (terrainKind !== 'urban' && !isPipelineTerrainKind(terrainKind)) {
      throw new Error(`terrain res4 exceptions CSV: invalid terrain "${terrainKind}" at line ${i + 1}`);
    }
    if (map.has(h3Index)) throw new Error(`terrain res4 exceptions CSV: duplicate h3_index ${h3Index}`);
    map.set(h3Index, terrainKind);
  }
  return map;
}
