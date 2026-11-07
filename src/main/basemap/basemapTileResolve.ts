/**
 * Turns a basemap URL into tile bytes.
 *
 * Purpose: Leaflet asks for `agentwars-basemap://tiles/{mapId}/{z}/{x}/{y}.webp`. This module decides which pack and which class.
 * When to use: From the protocol handler. It does not import Electron.
 * Expected outcome: WebP bytes and status 200, or status 404 when the URL or the map id is not servable.
 * Exceptions: A corrupt pack throws. The protocol handler turns that into a 404 log.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError, logTrace } from '../logger';
import {
  globalPackDirectory,
  knownBasemapMapIds,
  readBasemapManifest,
  readPartitionIndex,
  readSharedTile,
  regionalPackDirectory,
} from './basemapPackRead';
import { unpackBasemapIndexes, unpackBasemapPartition } from './basemapPartitionExtract';
import type { BasemapPackManifest } from './basemapPackTypes';

const TILE_PATH = /^\/([a-z0-9_]+)\/(\d+)\/(\d+)\/(\d+)\.webp$/;
const WEBP_CACHE = 'public, max-age=31536000';

/**
 * Bytes and status for one tile request.
 *
 * Purpose: The protocol handler copies this into a Response.
 * When to use: The return value of `resolveBasemapTile`.
 * Expected outcome: Status 200 carries WebP bytes. Status 404 carries a null body.
 * Exceptions: None.
 */
export interface BasemapTileResult {
  /**
   * HTTP status.
   *
   * Contract: 200 or 404.
   * When to use: As the response status.
   * Expected outcome: 404 when the URL is rejected or the map id is unknown.
   * Exceptions: None.
   */
  readonly status: number;
  /**
   * WebP bytes, or null for a 404.
   *
   * Contract: Present exactly when status is 200.
   * When to use: As the response body.
   * Expected outcome: Land, water, or a shaded tile.
   * Exceptions: None.
   */
  readonly body: Uint8Array | null;
  /**
   * Response content type.
   *
   * Contract: `image/webp` for a tile.
   * When to use: On a 200 response.
   * Expected outcome: `image/webp`.
   * Exceptions: None.
   */
  readonly contentType: string;
  /**
   * Cache header for a tile.
   *
   * Contract: A long public max-age. The bytes are content-addressed by the pack hash.
   * When to use: On a 200 response.
   * Expected outcome: `public, max-age=31536000`.
   * Exceptions: None.
   */
  readonly cacheControl: string;
}

/**
 * Resolves one raw request URL to tile bytes.
 *
 * Purpose: The protocol handler stays a thin wrapper around this function.
 * When to use: For every `agentwars-basemap` request.
 * Expected outcome: Water bytes when the tile is unlisted. Land bytes when it is flat. Shaded bytes after that partition unpacks.
 *   Zoom 0–7 always uses the global pack. Zoom 8–9 uses the region pack, or global water when that pack is missing.
 * Exceptions: Throws when a pack on disk is corrupt. Callers log that and return 404.
 */
export async function resolveBasemapTile(rawUrl: string): Promise<BasemapTileResult> {
  logDebug('basemapTileResolve resolveBasemapTile', { rawUrl });
  if (rawUrl.includes('..') || rawUrl.includes('\\') || rawUrl.includes('%')) return missing();
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (err) {
    logError('basemapTileResolve resolveBasemapTile: bad url', err);
    return missing();
  }
  if (url.host !== 'tiles') return missing();
  const match = TILE_PATH.exec(url.pathname);
  if (!match) return missing();
  const mapId = match[1] ?? '';
  const zoom = Number(match[2]);
  const x = Number(match[3]);
  const y = Number(match[4]);
  if (!knownBasemapMapIds().includes(mapId)) return missing();
  if (zoom >= 0 && zoom <= 7) {
    const pack = globalPackDirectory();
    if (!pack) return missing();
    return serveTile(pack, 'global', zoom, x, y);
  }
  if (zoom === 8 || zoom === 9) {
    const regional = mapId === 'global' ? null : regionalPackDirectory(mapId);
    if (!regional) {
      logDebug('basemapTileResolve resolveBasemapTile: regional pack missing, serving water', { mapId, zoom });
      const pack = globalPackDirectory();
      if (!pack) return missing();
      const manifest = readBasemapManifest(pack);
      return tileResult(readSharedTile(pack, manifest.waterTile));
    }
    return serveTile(regional, mapId, zoom, x, y);
  }
  return missing();
}

/**
 * Names the partition that stores one tile.
 *
 * Purpose: The same shift the pack writer uses.
 * When to use: While serving and while prefetching a battle.
 * Expected outcome: Partition zoom 0 for zooms 0–5, 3 for 6–7, and 5 for 8–9, with x and y shifted by the difference.
 *   A zoom-0 tile at x=1 is `z0_x1_y0`.
 * Exceptions: Throws when the zoom is outside 0–9 or an index is negative.
 */
export function ancestorKey(zoom: number, x: number, y: number): string {
  logTrace('basemapTileResolve ancestorKey', { zoom, x, y });
  if (x < 0 || y < 0) throw new Error(`tile indexes must be non-negative, got ${x}, ${y}`);
  const partitionZoom = partitionZoomFor(zoom);
  const shift = zoom - partitionZoom;
  return `z${partitionZoom}_x${x >> shift}_y${y >> shift}`;
}

function partitionZoomFor(zoom: number): number {
  if (zoom >= 0 && zoom <= 5) return 0;
  if (zoom <= 7) return 3;
  if (zoom <= 9) return 5;
  throw new Error(`zoom ${zoom} is outside the packed range`);
}

async function serveTile(packDirectory: string, mapId: string, zoom: number, x: number, y: number): Promise<BasemapTileResult> {
  const manifest = readBasemapManifest(packDirectory);
  const indexDirectory = await unpackBasemapIndexes(
    mapId,
    path.join(packDirectory, manifest.indexesZip),
    manifest.indexesSha256,
  );
  const key = ancestorKey(zoom, x, y);
  const index = readPartitionIndex(indexDirectory, key);
  const tileKey = `${zoom}/${x}/${y}`;
  if (!index || (!index.flat.includes(tileKey) && !index.shaded.includes(tileKey))) {
    return tileResult(readSharedTile(packDirectory, manifest.waterTile));
  }
  if (index.flat.includes(tileKey)) return tileResult(readSharedTile(packDirectory, manifest.landTile));
  const entry = manifest.partitions[key];
  if (!entry?.zip || !entry.sha256) return missing();
  const unpacked = await unpackBasemapPartition(mapId, key, path.join(packDirectory, entry.zip), entry.sha256);
  const tilePath = path.join(unpacked, String(zoom), String(x), `${y}.webp`);
  if (!fs.existsSync(tilePath)) {
    logError('basemapTileResolve serveTile: shaded tile missing', { tilePath });
    return missing();
  }
  return tileResult(new Uint8Array(fs.readFileSync(tilePath)));
}

function tileResult(body: Uint8Array): BasemapTileResult {
  return { status: 200, body, contentType: 'image/webp', cacheControl: WEBP_CACHE };
}

function missing(): BasemapTileResult {
  return { status: 404, body: null, contentType: 'image/webp', cacheControl: WEBP_CACHE };
}

/**
 * Reads a manifest when the caller already has the directory.
 *
 * Purpose: Prefetch needs the partition table without serving a tile.
 * When to use: From `startBasemapPrefetch`.
 * Expected outcome: The manifest, or null when the directory has no pack.
 * Exceptions: Throws when the manifest zip is corrupt.
 */
export function manifestForPack(packDirectory: string | null): BasemapPackManifest | null {
  logTrace('basemapTileResolve manifestForPack', { packDirectory });
  if (!packDirectory) return null;
  return readBasemapManifest(packDirectory);
}
