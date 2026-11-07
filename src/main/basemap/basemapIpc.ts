/**
 * IPC for the offline hillshade: native zoom and battle prefetch.
 *
 * Purpose: The renderer cannot see the pack files. These handlers answer from the main process.
 * When to use: Register from `registerIpcHandlers`.
 * Expected outcome: Native zoom does not unpack. Prefetch returns before its unpacks finish.
 * Exceptions: None. A bad payload still returns the documented result.
 */

import * as fs from 'fs';
import * as path from 'path';
import { IPC_GAME } from '../../shared/ipc/channels';
import { logDebug, logError, logInfo } from '../logger';
import { resolveGeneratedRegionsDirectory } from '../gameMap/regionManifestRead';
import { regionalPackDirectory } from './basemapPackRead';
import { startBasemapPrefetch, type BasemapPrefetchRequest } from './basemapPrefetch';

/**
 * Registers the two basemap channels.
 *
 * Purpose: Keeps the protocol file free of Electron and keeps `main.ts` from growing by the handler bodies.
 * When to use: From `registerIpcHandlers`.
 * Expected outcome: `game:basemapNativeZoom` and `game:basemapPrefetch` are handled.
 * Exceptions: None.
 */
export function registerBasemapIpc(ipcMain: { handle: (channel: string, listener: (event: unknown, payload: unknown) => unknown) => void }): void {
  logDebug('basemapIpc registerBasemapIpc');
  ipcMain.handle(IPC_GAME.basemapNativeZoom, (_event, payload) => nativeZoomForMap(payload));
  ipcMain.handle(IPC_GAME.basemapPrefetch, (_event, payload) => {
    const request = prefetchRequest(payload);
    if (request) {
      void startBasemapPrefetch(request).catch((err) => logError('basemapIpc prefetch: failed', err));
    }
    return { accepted: true as const };
  });
}

/**
 * Chooses 7 or 9 for a map id.
 *
 * Purpose: Leaflet stretches tiles only up to the finest zoom that pack actually has.
 * When to use: From the native-zoom channel.
 * Expected outcome: 9 only when that region's `basemap_pack.json.zip` exists. Otherwise 7.
 *   An id that is not global and not a shipped region is logged.
 * Exceptions: None.
 */
export function nativeZoomForMap(mapId: unknown): { nativeZoom: 7 | 9 } {
  logDebug('basemapIpc nativeZoomForMap', { mapId });
  if (typeof mapId === 'string' && regionalPackDirectory(mapId)) return { nativeZoom: 9 };
  if (typeof mapId !== 'string' || (mapId !== 'global' && !regionDirectoryExists(mapId))) {
    logInfo('basemapIpc nativeZoomForMap: unknown map', { mapId });
  }
  return { nativeZoom: 7 };
}

function regionDirectoryExists(mapId: string): boolean {
  const regions = resolveGeneratedRegionsDirectory();
  return regions !== null && fs.existsSync(path.join(regions, mapId));
}

function prefetchRequest(payload: unknown): BasemapPrefetchRequest | null {
  if (!payload || typeof payload !== 'object') return null;
  const document = payload as Record<string, unknown>;
  if (typeof document.gameMapId !== 'string' || !Array.isArray(document.childH3Indexes)) return null;
  const cells = document.childH3Indexes.filter((cell): cell is string => typeof cell === 'string');
  return { gameMapId: document.gameMapId, childH3Indexes: cells };
}
