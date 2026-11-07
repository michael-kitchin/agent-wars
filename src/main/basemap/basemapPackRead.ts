/**
 * Finds an offline basemap pack and reads its manifest, indexes, and shared tiles.
 *
 * Purpose: Tile requests and prefetch share one way to open the packs shipped under `data/generated/basemap`.
 * When to use: From the tile resolver. Do not point the regional JSON reader at this tree.
 * Expected outcome: Manifests and shared WebP bytes. Missing packs return null.
 * Exceptions: Throws when a present pack's manifest or index JSON is not the expected shape.
 */

import * as fs from 'fs';
import * as path from 'path';
import { unzipSync } from 'fflate';
import { logDebug, logError, logTrace } from '../logger';
import { pathCandidates } from '../terrainMetadataPaths';
import type { BasemapPackManifest, BasemapPartitionIndex } from './basemapPackTypes';

const SHARED_BYTE_CACHE = new Map<string, Uint8Array>();

/**
 * Locates `data/generated/basemap` in the dev tree or a packaged app.
 *
 * Purpose: Packs ship beside the regional JSON zips but in their own directory.
 * When to use: Before opening `global` or `regions/<id>`.
 * Expected outcome: The resources copy when a packaged app has one, otherwise the first existing directory. Null when none exists.
 * Exceptions: None.
 */
export function resolveBasemapRoot(): string | null {
  logTrace('basemapPackRead resolveBasemapRoot');
  return selectBasemapRoot(pathCandidates('data', 'generated', 'basemap'), (candidate) => fs.existsSync(candidate));
}

/**
 * Picks the basemap directory that can be read as ordinary files.
 *
 * Purpose: A packaged app ships the packs twice. The copy inside `app.asar` is one large archive, and the first
 *   read of it parses that archive before a tile can unpack. The copy under the resources directory is a normal folder.
 * When to use: From `resolveBasemapRoot`, and from the pack reader test.
 * Expected outcome: The first existing candidate that is not inside `app.asar`. `app.asar.unpacked` still qualifies.
 *   When every existing candidate is inside `app.asar`, the first of those is used.
 * Exceptions: None.
 */
export function selectBasemapRoot(candidates: readonly string[], exists: (candidate: string) => boolean): string | null {
  logTrace('basemapPackRead selectBasemapRoot', { candidates: candidates.length });
  for (const candidate of candidates) {
    if (!isInsideAppAsar(candidate) && exists(candidate)) return candidate;
  }
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

/**
 * Reports whether a candidate is stored inside the packaged application archive.
 *
 * Purpose: Reading a zip through that archive is much slower than reading the resources copy.
 * When to use: While choosing a basemap root. `app.asar.unpacked` is a normal directory and is not a match.
 * Expected outcome: True when a path segment is exactly `app.asar`.
 * Exceptions: None.
 */
function isInsideAppAsar(candidate: string): boolean {
  const normalized = candidate.replaceAll('/', path.sep).replaceAll('\\', path.sep);
  const marker = `${path.sep}app.asar${path.sep}`;
  return normalized.includes(marker) || normalized.endsWith(`${path.sep}app.asar`);
}

/**
 * Absolute directory of the global pack, when that pack is installed.
 *
 * Purpose: Zooms 0 through 7 always read this directory.
 * When to use: From the tile resolver.
 * Expected outcome: The directory that contains `basemap_pack.json.zip`, or null.
 * Exceptions: None.
 */
export function globalPackDirectory(): string | null {
  logTrace('basemapPackRead globalPackDirectory');
  const root = resolveBasemapRoot();
  if (!root) return null;
  const directory = path.join(root, 'global');
  return fs.existsSync(path.join(directory, 'basemap_pack.json.zip')) ? directory : null;
}

/**
 * Absolute directory of one region's pack, when that pack is installed.
 *
 * Purpose: Zooms 8 and 9 read this directory.
 * When to use: From the tile resolver and from native-zoom IPC.
 * Expected outcome: The directory that contains `basemap_pack.json.zip`, or null when the id has no pack.
 * Exceptions: None.
 */
export function regionalPackDirectory(mapId: string): string | null {
  logTrace('basemapPackRead regionalPackDirectory', { mapId });
  if (!/^[a-z0-9_]+$/.test(mapId)) return null;
  const root = resolveBasemapRoot();
  if (!root) return null;
  const directory = path.join(root, 'regions', mapId);
  return fs.existsSync(path.join(directory, 'basemap_pack.json.zip')) ? directory : null;
}

/**
 * Map ids the handler will serve.
 *
 * Purpose: An unknown id is a 404 rather than a path built from the URL.
 * When to use: Before choosing a pack directory.
 * Expected outcome: `global` when the global pack exists, plus each region directory that has a manifest zip.
 * Exceptions: None.
 */
export function knownBasemapMapIds(): readonly string[] {
  logTrace('basemapPackRead knownBasemapMapIds');
  const ids: string[] = [];
  if (globalPackDirectory()) ids.push('global');
  const root = resolveBasemapRoot();
  if (!root) return ids;
  const regions = path.join(root, 'regions');
  if (!fs.existsSync(regions)) return ids;
  for (const name of fs.readdirSync(regions)) {
    if (regionalPackDirectory(name)) ids.push(name);
  }
  return ids;
}

/**
 * Reads `basemap_pack.json` from its zip.
 *
 * Purpose: The manifest names every partition and the shared tiles.
 * When to use: On each tile request that has chosen a pack. The file is small.
 * Expected outcome: The parsed manifest.
 * Exceptions: Throws when the zip or the member is missing, or the JSON is the wrong shape.
 */
export function readBasemapManifest(packDirectory: string): BasemapPackManifest {
  logDebug('basemapPackRead readBasemapManifest', { packDirectory });
  const zipPath = path.join(packDirectory, 'basemap_pack.json.zip');
  let text: string;
  try {
    text = new TextDecoder().decode(unzipMember(zipPath, 'basemap_pack.json'));
  } catch (err) {
    logError('basemapPackRead readBasemapManifest: unreadable', { packDirectory, err });
    throw err;
  }
  return parseManifest(text, zipPath);
}

/**
 * Reads one unpacked partition index.
 *
 * Purpose: The index says which tiles are flat, which are shaded, and which are water by omission.
 * When to use: After the index archive has been unpacked.
 * Expected outcome: The lists, or null when that partition has no index file.
 * Exceptions: Throws when the file exists but is not the expected JSON.
 */
export function readPartitionIndex(indexDirectory: string, partitionKey: string): BasemapPartitionIndex | null {
  logTrace('basemapPackRead readPartitionIndex', { partitionKey });
  const indexPath = path.join(indexDirectory, `${partitionKey}.json`);
  if (!fs.existsSync(indexPath)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as unknown;
  } catch (err) {
    logError('basemapPackRead readPartitionIndex: unreadable', { indexPath, err });
    throw err;
  }
  if (!parsed || typeof parsed !== 'object') throw new Error(`${indexPath}: index must be an object`);
  const document = parsed as Record<string, unknown>;
  return { flat: stringList(document.flat, indexPath), shaded: stringList(document.shaded, indexPath) };
}

/**
 * Reads a shared land or water image, caching the bytes.
 *
 * Purpose: Every flat or water tile is the same file.
 * When to use: When the index says the tile is flat or water.
 * Expected outcome: The file bytes. Later calls for the same path reuse the cache.
 * Exceptions: Throws when the file is missing.
 */
export function readSharedTile(packDirectory: string, fileName: string): Uint8Array {
  logTrace('basemapPackRead readSharedTile', { fileName });
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    throw new Error(`refused shared tile name ${fileName}`);
  }
  const filePath = path.join(packDirectory, fileName);
  const cached = SHARED_BYTE_CACHE.get(filePath);
  if (cached) return cached;
  const bytes = new Uint8Array(fs.readFileSync(filePath));
  SHARED_BYTE_CACHE.set(filePath, bytes);
  return bytes;
}

/**
 * Inflates one named member of a stored zip.
 *
 * Purpose: Manifests and indexes are single JSON members.
 * When to use: From the manifest reader and the unpacker.
 * Expected outcome: The member bytes.
 * Exceptions: Throws when the archive cannot be read, the member name is unsafe, or the member is absent.
 */
export function unzipMember(zipPath: string, memberName: string): Uint8Array {
  if (memberName.includes('..') || memberName.includes('\\') || memberName.startsWith('/')) {
    throw new Error(`${zipPath}: refused ${memberName}`);
  }
  const archive = unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
  const member = archive[memberName];
  if (!member) throw new Error(`${zipPath}: missing ${memberName}`);
  return member;
}

function parseManifest(text: string, label: string): BasemapPackManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (err) {
    logError('basemapPackRead parseManifest: invalid json', { label, err });
    throw err;
  }
  if (!parsed || typeof parsed !== 'object') throw new Error(`${label}: manifest must be an object`);
  const document = parsed as Record<string, unknown>;
  if (document.schema !== 1) throw new Error(`${label}: schema ${String(document.schema)} is not supported`);
  const partitions: Record<string, { zip: string | null; sha256: string | null }> = {};
  const rawPartitions = document.partitions;
  if (!rawPartitions || typeof rawPartitions !== 'object') throw new Error(`${label}: partitions must be an object`);
  for (const [key, value] of Object.entries(rawPartitions as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') throw new Error(`${label}: partition ${key} must be an object`);
    const entry = value as Record<string, unknown>;
    const zip = entry.zip === null ? null : typeof entry.zip === 'string' ? entry.zip : undefined;
    const sha256 = entry.sha256 === null ? null : typeof entry.sha256 === 'string' ? entry.sha256 : undefined;
    if (zip === undefined || sha256 === undefined) throw new Error(`${label}: partition ${key} is missing zip or sha256`);
    partitions[key] = { zip, sha256 };
  }
  return {
    schema: 1,
    kind: requiredString(document.kind, label, 'kind'),
    mapId: requiredString(document.mapId, label, 'mapId'),
    zoomMin: requiredNumber(document.zoomMin, label, 'zoomMin'),
    zoomMax: requiredNumber(document.zoomMax, label, 'zoomMax'),
    settingsHash: requiredString(document.settingsHash, label, 'settingsHash'),
    sourcesHash: requiredString(document.sourcesHash, label, 'sourcesHash'),
    landTile: requiredString(document.landTile, label, 'landTile'),
    waterTile: requiredString(document.waterTile, label, 'waterTile'),
    indexesZip: requiredString(document.indexesZip, label, 'indexesZip'),
    indexesSha256: requiredString(document.indexesSha256, label, 'indexesSha256'),
    partitions,
  };
}

function requiredString(value: unknown, label: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label}: ${field} must be a string`);
  return value;
}

function requiredNumber(value: unknown, label: string, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`${label}: ${field} must be an integer`);
  return value;
}

function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label}: flat and shaded must be string arrays`);
  }
  return value as string[];
}
