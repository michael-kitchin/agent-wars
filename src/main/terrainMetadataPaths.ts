/**
 * Resolves bundled terrain generated JSON paths for dev (repo layout) and packaged Electron (app root / asar).
 */

import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError } from './logger';

/**
 * Documents the module-scope binding `RES1_SEGMENTS` (RES1_SEGMENTS).

 * Purpose: Supports maintainability by documenting why `RES1_SEGMENTS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const RES1_SEGMENTS = ['data', 'generated', 'terrain_res1_metadata.json'] as const;
/**
 * Documents the module-scope binding `RES4_SEGMENTS` (RES4_SEGMENTS).

 * Purpose: Supports maintainability by documenting why `RES4_SEGMENTS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const RES4_SEGMENTS = ['data', 'generated', 'terrain_res4_metadata.json'] as const;
/**
 * Documents the module-scope binding `RES1_NAMING_SEGMENTS` (RES1_NAMING_SEGMENTS).

 * Purpose: Supports maintainability by documenting why `RES1_NAMING_SEGMENTS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const RES1_NAMING_SEGMENTS = ['data', 'generated', 'terrain_res1_naming.json'] as const;
/**
 * Documents the module-scope binding `RES4_NAMING_SEGMENTS` (RES4_NAMING_SEGMENTS).

 * Purpose: Supports maintainability by documenting why `RES4_NAMING_SEGMENTS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const RES4_NAMING_SEGMENTS = ['data', 'generated', 'terrain_res4_naming.json'] as const;

/**
 * Documents the module-scope binding `testOverrideRoot` (testOverrideRoot: string | null).

 * Purpose: Supports maintainability by documenting why `testOverrideRoot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let testOverrideRoot: string | null = null;

/**
 * Defines the `setTerrainMetadataPathOverrideForTests` function shape (export function setTerrainMetadataPathOverrideForTests(overrideRoot: string | null): void).

 * Purpose: Supports maintainability by documenting why `setTerrainMetadataPathOverrideForTests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setTerrainMetadataPathOverrideForTests(overrideRoot: string | null): void {
  logDebug('terrainMetadataPaths setTerrainMetadataPathOverrideForTests', {
    hasOverride: !!overrideRoot,
  });
  testOverrideRoot = overrideRoot;
}

/**
 * Defines the `clearTerrainMetadataPathOverrideForTests` function shape (export function clearTerrainMetadataPathOverrideForTests(): void).

 * Purpose: Supports maintainability by documenting why `clearTerrainMetadataPathOverrideForTests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearTerrainMetadataPathOverrideForTests(): void {
  logDebug('terrainMetadataPaths clearTerrainMetadataPathOverrideForTests');
  testOverrideRoot = null;
}

/**
 * Defines the `pathCandidates` function shape (function pathCandidates(...segments: string[]): string[]).

 * Purpose: Supports maintainability by documenting why `pathCandidates` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function pathCandidates(...segments: string[]): string[] {
  const roots: string[] = [];
  if (testOverrideRoot) roots.push(testOverrideRoot);
  roots.push(path.join(__dirname, '..', '..'));
  roots.push(process.cwd());
  const processResourcesPath =
    typeof process !== 'undefined' && typeof process.resourcesPath === 'string' ? process.resourcesPath : null;
  if (processResourcesPath) {
    // Packaged app fallback: support resources/data and app.asar.unpacked roots.
    roots.push(processResourcesPath);
    roots.push(path.join(processResourcesPath, 'app.asar.unpacked'));
  }
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
 * Defines the `resolveTerrainRes1MetadataPath` function shape (export function resolveTerrainRes1MetadataPath(): string).

 * Purpose: Supports maintainability by documenting why `resolveTerrainRes1MetadataPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveTerrainRes1MetadataPath(): string {
  logDebug('terrainMetadataPaths resolveTerrainRes1MetadataPath');
  return resolveFirstExisting('terrain_res1_metadata.json', [...RES1_SEGMENTS]);
}

/**
 * Defines the `resolveTerrainRes4MetadataPath` function shape (export function resolveTerrainRes4MetadataPath(): string).

 * Purpose: Supports maintainability by documenting why `resolveTerrainRes4MetadataPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveTerrainRes4MetadataPath(): string {
  logDebug('terrainMetadataPaths resolveTerrainRes4MetadataPath');
  return resolveFirstExisting('terrain_res4_metadata.json', [...RES4_SEGMENTS]);
}

/**
 * Defines the `resolveTerrainRes1NamingPath` function shape (export function resolveTerrainRes1NamingPath(): string).

 * Purpose: Supports maintainability by documenting why `resolveTerrainRes1NamingPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveTerrainRes1NamingPath(): string {
  logDebug('terrainMetadataPaths resolveTerrainRes1NamingPath');
  return resolveFirstExisting('terrain_res1_naming.json', [...RES1_NAMING_SEGMENTS]);
}

/**
 * Defines the `resolveTerrainRes4NamingPath` function shape (export function resolveTerrainRes4NamingPath(): string).

 * Purpose: Supports maintainability by documenting why `resolveTerrainRes4NamingPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveTerrainRes4NamingPath(): string {
  logDebug('terrainMetadataPaths resolveTerrainRes4NamingPath');
  return resolveFirstExisting('terrain_res4_naming.json', [...RES4_NAMING_SEGMENTS]);
}

/**
 * Defines the `resolveFirstExisting` function shape (function resolveFirstExisting(label: string, segments: readonly string[]): string).

 * Purpose: Supports maintainability by documenting why `resolveFirstExisting` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
