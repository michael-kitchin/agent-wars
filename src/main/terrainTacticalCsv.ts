/**
 * Parses `terrain_res4_exceptions.csv` for parity tests against metadata-derived renderer overrides.
 * Runtime res-4 overlays use `terrainClassificationCache` + `terrain_res4_metadata.json` instead.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError, logTrace } from './logger';
import { isPipelineTerrainKind, type PipelineTerrainKind } from '../shared/pipelineTerrain';

/**
 * Documents the `LegacyTacticalCsvTerrainKind` type alias (type LegacyTacticalCsvTerrainKind).

 * Purpose: Supports maintainability by documenting why `LegacyTacticalCsvTerrainKind` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type LegacyTacticalCsvTerrainKind = PipelineTerrainKind | 'urban';

/**
 * Documents the module-scope binding `CSV_FILENAME` (CSV_FILENAME).

 * Purpose: Supports maintainability by documenting why `CSV_FILENAME` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const CSV_FILENAME = 'terrain_res4_exceptions.csv';
/**
 * Documents the module-scope binding `CSV_REL_SEGMENTS` (CSV_REL_SEGMENTS).

 * Purpose: Supports maintainability by documenting why `CSV_REL_SEGMENTS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const CSV_REL_SEGMENTS = ['data', 'generated', CSV_FILENAME];

/**
 * Defines the `resolveTerrainTacticalExceptionsCsvPath` function shape (export function resolveTerrainTacticalExceptionsCsvPath(): string).

 * Purpose: Supports maintainability by documenting why `resolveTerrainTacticalExceptionsCsvPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveTerrainTacticalExceptionsCsvPath(): string {
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
 * Defines the `parseTerrainTacticalExceptionsCsvText` function shape (export function parseTerrainTacticalExceptionsCsvText(fileText: string): Map<string, LegacyTacticalCsvTerrainKind> { logTrace('terrainTacticalCsv parseTerrainTacticalExcepti).

 * Purpose: Supports maintainability by documenting why `parseTerrainTacticalExceptionsCsvText` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function parseTerrainTacticalExceptionsCsvText(fileText: string): Map<string, LegacyTacticalCsvTerrainKind> {
  logTrace('terrainRes4Csv parseTerrainRes4ExceptionsCsvText');
  const lines = fileText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return new Map<string, LegacyTacticalCsvTerrainKind>();
  const map = new Map<string, LegacyTacticalCsvTerrainKind>();
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
