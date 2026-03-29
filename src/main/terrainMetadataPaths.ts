/**
 * Resolves bundled terrain metadata JSON paths for dev (repo layout) and packaged Electron (app root / asar).
 */

import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError } from './logger';

const RES1_SEGMENTS = ['data', 'generated', 'terrain_res1_metadata.json'] as const;
const RES4_SEGMENTS = ['data', 'generated', 'terrain_res4_metadata.json'] as const;

/** Test-only override roots (checked before standard resolution). */
let testOverrideRoot: string | null = null;

/**
 * Why this exists:
 *     Point terrain loaders at fixture directories during main-process tests so classification does not depend on repo `data/generated`.
 * When to use:
 *     Call from test harness before `resetGameForNewMatch` when needed; pair with `clearTerrainMetadataPathOverrideForTests`.
 * What to expect:
 *     When set, resolution tries `join(overrideRoot, ...segments)` first for each metadata file.
 */
export function setTerrainMetadataPathOverrideForTests(overrideRoot: string | null): void {
  logDebug('terrainMetadataPaths setTerrainMetadataPathOverrideForTests', {
    hasOverride: !!overrideRoot,
  });
  testOverrideRoot = overrideRoot;
}

/**
 * Why this exists:
 *     Clear test fixture path override after tests complete.
 * When to use:
 *     In test `finally` blocks after calling `setTerrainMetadataPathOverrideForTests`.
 * What to expect:
 *     Subsequent resolution uses standard bundled paths only.
 */
export function clearTerrainMetadataPathOverrideForTests(): void {
  logDebug('terrainMetadataPaths clearTerrainMetadataPathOverrideForTests');
  testOverrideRoot = null;
}

function pathCandidates(...segments: string[]): string[] {
  const roots: string[] = [];
  if (testOverrideRoot) roots.push(testOverrideRoot);
  roots.push(path.join(__dirname, '..', '..'));
  roots.push(process.cwd());
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as { app?: { getAppPath?: () => string } };
    const ap = app?.getAppPath?.();
    if (ap) roots.push(ap);
  } catch {
    /* non-Electron contexts */
  }
  const uniq = [...new Set(roots)];
  return uniq.map((r) => path.join(r, ...segments));
}

/**
 * Why this exists:
 *     Locate `terrain_res1_metadata.json` for world hex classification at resolution 1.
 * When to use:
 *     From terrain cache initialization and parity tests.
 * What to expect:
 *     Throws if the file is missing from every candidate location.
 */
export function resolveTerrainRes1MetadataPath(): string {
  logDebug('terrainMetadataPaths resolveTerrainRes1MetadataPath');
  return resolveFirstExisting('terrain_res1_metadata.json', [...RES1_SEGMENTS]);
}

/**
 * Why this exists:
 *     Locate `terrain_res4_metadata.json` for renderer override classification at resolution 4.
 * When to use:
 *     From terrain cache when building res-4 override rows.
 * What to expect:
 *     Throws if the file is missing from every candidate location.
 */
export function resolveTerrainRes4MetadataPath(): string {
  logDebug('terrainMetadataPaths resolveTerrainRes4MetadataPath');
  return resolveFirstExisting('terrain_res4_metadata.json', [...RES4_SEGMENTS]);
}

function resolveFirstExisting(label: string, segments: readonly string[]): string {
  const candidates = pathCandidates(...segments);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      logDebug('terrainMetadataPaths resolveFirstExisting: found', { label, path: p });
      return p;
    }
  }
  const msg = `terrain metadata file "${label}" not found; tried: ${candidates.join('; ')}`;
  logError('terrainMetadataPaths resolveFirstExisting: missing file', new Error(msg));
  throw new Error(msg);
}
