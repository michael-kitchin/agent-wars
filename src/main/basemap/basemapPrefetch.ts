/**
 * Unpacks the regional partitions that cover a battle before the player zooms into them.
 *
 * Purpose: A battle view should not sit on empty tiles while a zip unpacks.
 * When to use: From the prefetch IPC handler. Do not await it on the IPC return.
 * Expected outcome: `{ accepted: true }` is the IPC result. Unpack failures are logged and do not reject the battle.
 * Exceptions: None from `startBasemapPrefetch`. The partition unpacker still throws into the catch below.
 */

import { cellToLatLng } from 'h3-js';
import * as path from 'path';
import { longitudeIntervalFromCenters, mapExtentBoxForHexes } from '../../shared/mapExtent';
import { logDebug, logError } from '../logger';
import { regionalPackDirectory } from './basemapPackRead';
import { unpackBasemapPartition } from './basemapPartitionExtract';
import { ancestorKey, manifestForPack } from './basemapTileResolve';

const MERCATOR_LAT = 85.0511287798066;

/**
 * The prefetch IPC body.
 *
 * Purpose: The renderer already has the battle's child cells and the current map id.
 * When to use: As the argument of `game:basemapPrefetch`.
 * Expected outcome: A region id and the tactical cells of the battle.
 * Exceptions: None.
 */
export interface BasemapPrefetchRequest {
  /**
   * `global` or a region id.
   *
   * Contract: The id the basemap layer is using.
   * When to use: `global` and a missing region pack unpack nothing.
   * Expected outcome: A short id.
   * Exceptions: None.
   */
  readonly gameMapId: string;
  /**
   * Tactical cells of the battle, including the margin the view already computed.
   *
   * Contract: H3 indexes. An empty list unpacks nothing.
   * When to use: The same array passed to `enterTacticalMapView`.
   * Expected outcome: The cells whose camera box selects zoom-5 partitions.
   * Exceptions: None.
   */
  readonly childH3Indexes: readonly string[];
}

/**
 * Zoom-5 partition keys that cover a battle's cells.
 *
 * Purpose: Prefetch only the partitions the battle can see, not the whole region.
 * When to use: From the prefetch handler and from its unit test.
 * Expected outcome: Sorted `z5_x*_y*` keys. A box that crosses 180° contributes keys from both sides.
 * Exceptions: None. An empty or unreadable cell list returns an empty array.
 */
export function partitionKeysForBattle(childH3Indexes: readonly string[]): string[] {
  logDebug('basemapPrefetch partitionKeysForBattle', { cells: childH3Indexes.length });
  const longitudes: number[] = [];
  for (const cell of childH3Indexes) {
    try {
      longitudes.push(cellToLatLng(cell)[1]);
    } catch (err) {
      logError('basemapPrefetch partitionKeysForBattle: bad cell', { cell, err });
    }
  }
  const box = mapExtentBoxForHexes(longitudeIntervalFromCenters(longitudes), [...childH3Indexes]);
  if (!box) return [];
  const keys = new Set<string>();
  for (const part of splitWorldBox(box.west, box.south, box.east, box.north)) {
    const range = tileRangeForBox(part.west, part.south, part.east, part.north, 9);
    if (!range) continue;
    for (let x = range.xMin; x <= range.xMax; x += 1) {
      for (let y = range.yMin; y <= range.yMax; y += 1) {
        keys.add(ancestorKey(9, x, y));
      }
    }
  }
  return [...keys].sort();
}

/**
 * Starts unpacking the battle's regional partitions.
 *
 * Purpose: The IPC handler returns before this finishes.
 * When to use: Fire and forget from `game:basemapPrefetch`.
 * Expected outcome: Nothing is unpacked for `global` or a missing region pack. Each partition with a zip is unpacked
 *   through the same lock as a tile request, after a turn of the event loop, so a battle with many partitions does not
 *   write them all before the window can paint. A failure is logged and does not throw.
 * Exceptions: None.
 */
export async function startBasemapPrefetch(request: BasemapPrefetchRequest): Promise<void> {
  logDebug('basemapPrefetch start', { gameMapId: request.gameMapId, cells: request.childH3Indexes.length });
  if (request.gameMapId === 'global') return;
  const packDirectory = regionalPackDirectory(request.gameMapId);
  if (!packDirectory) return;
  let manifest;
  try {
    manifest = manifestForPack(packDirectory);
  } catch (err) {
    logError('basemapPrefetch start: manifest unreadable', err);
    return;
  }
  if (!manifest) return;
  for (const key of partitionKeysForBattle(request.childH3Indexes)) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const entry = manifest.partitions[key];
    if (!entry?.zip || !entry.sha256) continue;
    try {
      await unpackBasemapPartition(request.gameMapId, key, path.join(packDirectory, entry.zip), entry.sha256);
      logDebug('basemapPrefetch finished', { key });
    } catch (err) {
      logError('basemapPrefetch failed', { key, err });
    }
  }
}

function splitWorldBox(west: number, south: number, east: number, north: number): { west: number; south: number; east: number; north: number }[] {
  if (east <= 180 && west >= -180) return [{ west, south, east, north }];
  const parts: { west: number; south: number; east: number; north: number }[] = [];
  if (west < -180) {
    parts.push({ west: west + 360, south, east: 180, north });
    parts.push({ west: -180, south, east: Math.min(180, east), north });
  } else if (east > 180) {
    parts.push({ west: Math.max(-180, west), south, east: 180, north });
    parts.push({ west: -180, south, east: east - 360, north });
  }
  return parts.filter((part) => part.west < part.east);
}

function tileRangeForBox(
  west: number,
  south: number,
  east: number,
  north: number,
  zoom: number,
): { xMin: number; xMax: number; yMin: number; yMax: number } | null {
  const northwest = lonLatToTile(west, north, zoom);
  const southeast = lonLatToTile(east, south, zoom);
  if (west > east || south > north || northwest.x > southeast.x || northwest.y > southeast.y) return null;
  return { xMin: northwest.x, xMax: southeast.x, yMin: northwest.y, yMax: southeast.y };
}

function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const clamped = Math.max(-MERCATOR_LAT, Math.min(MERCATOR_LAT, lat));
  const world = 256 * 2 ** zoom;
  const pixelX = ((lon + 180) / 360) * world;
  const pixelY = (1 - Math.asinh(Math.tan((clamped * Math.PI) / 180)) / Math.PI) / 2 * world;
  const last = 2 ** zoom - 1;
  return { x: clampTile(pixelX, last), y: clampTile(pixelY, last) };
}

function clampTile(pixel: number, last: number): number {
  const tile = Math.floor(pixel / 256);
  if (tile < 0) return 0;
  if (tile > last) return last;
  return tile;
}
