/**
 * Serves hillshade tiles on the `agentwars-basemap` scheme.
 *
 * Purpose: The renderer loads tiles from the app instead of a remote host.
 * When to use: Register `handleBasemapProtocol` with `protocol.handle` after the scheme is privileged.
 * Expected outcome: A WebP response. This module does not import Electron and does not unpack at registration time.
 * Exceptions: A corrupt pack is logged and returned as 404.
 */

import { logError } from '../logger';
import { resolveBasemapTile } from './basemapTileResolve';

/**
 * Handles one protocol request.
 *
 * Purpose: Electron calls this for every `agentwars-basemap:` URL.
 * When to use: As the callback passed to `protocol.handle`.
 * Expected outcome: Status 200 with `image/webp` and a one-year cache, or 404.
 * Exceptions: None. Failures inside the resolver become 404.
 */
export async function handleBasemapProtocol(request: { url: string }): Promise<Response> {
  try {
    const resolved = await resolveBasemapTile(request.url);
    if (resolved.status !== 200 || !resolved.body) return new Response(null, { status: 404 });
    return new Response(resolved.body, {
      status: 200,
      headers: {
        'Content-Type': resolved.contentType,
        'Cache-Control': resolved.cacheControl,
      },
    });
  } catch (err) {
    logError('basemapProtocolHandler handleBasemapProtocol: failed', err);
    return new Response(null, { status: 404 });
  }
}
