/**
 * Reads one basemap vector document for the renderer.
 *
 * Purpose: Coastlines, the edge mask, borders, and labels live in zips the renderer cannot open.
 * When to use: From the `game:basemapVectorDocument` handler.
 * Expected outcome: The JSON text, or null when the zip is missing or unreadable. The app still starts.
 * Exceptions: None. Failures are logged and returned as null.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { BasemapVectorName } from '../../shared/vectorPackTypes';
import { logDebug, logError, logInfo } from '../logger';
import { resolveBasemapRoot, unzipMember } from './basemapPackRead';

const textByRootAndName = new Map<string, string>();
const missingLogged = new Set<string>();

/**
 * Returns the JSON text of one vector document.
 *
 * Purpose: The renderer asks by name and never reads the zip itself.
 * When to use: After the packs are installed. Pass `root` only from a test. Production omits it and uses `resolveBasemapRoot`.
 * Expected outcome: UTF-8 text of `<name>.json`. Null when the root or the zip is missing, or the zip cannot be read.
 *   A successful read is cached for that root and name. A missing name is logged once.
 * Exceptions: None.
 */
export function readBasemapVectorText(name: BasemapVectorName, root?: string | null): string | null {
  logDebug('basemapVectorRead readBasemapVectorText', { name, root: root ?? null });
  const resolved = root ?? resolveBasemapRoot();
  if (!resolved) {
    logMissing(name);
    return null;
  }
  const cacheKey = `${resolved}:${name}`;
  const cached = textByRootAndName.get(cacheKey);
  if (cached !== undefined) return cached;
  const zipPath = path.join(resolved, 'vectors', `${name}.json.zip`);
  if (!fs.existsSync(zipPath)) {
    logMissing(name);
    return null;
  }
  try {
    const text = new TextDecoder().decode(unzipMember(zipPath, `${name}.json`));
    textByRootAndName.set(cacheKey, text);
    return text;
  } catch (err) {
    logError('basemapVectorRead readBasemapVectorText: unreadable zip', { name, zipPath, err });
    return null;
  }
}

/**
 * Logs a missing vector document once.
 *
 * Purpose: A missing file is normal before every document is built, and it should not flood the log.
 * When to use: When the root or the zip is absent.
 * Expected outcome: One info line per name for the life of the process.
 * Exceptions: None.
 */
function logMissing(name: string): void {
  if (missingLogged.has(name)) return;
  missingLogged.add(name);
  logInfo('basemapVectorRead missing vector document', { name });
}
