/**
 * Turns a tool's hex argument into a map cell.
 *
 * Purpose: Production and mercenary tools share one check, and neither imports the other.
 * When to use: After the tool loop has decoded a briefing code into a latitude and longitude pair.
 * Expected outcome: The cell index, or a sentence the model can correct.
 * Exceptions: None. A bad argument is `{ ok: false }`.
 */

import { logDebug } from '../logger';

/**
 * Resolves a `[lat, lng]` hex argument.
 *
 * Purpose: Tool handlers stay on cell indexes while the model speaks in briefing codes.
 * When to use: When the tool named a hex. A missing hex is a failure.
 * Expected outcome: `{ ok: true, h3Index }` or `{ ok: false, error }`.
 * Exceptions: None.
 */
export function resolveHexArgument(
  args: { hex?: unknown },
  resolveToH3: (lat: number, lng: number) => string | undefined
): { ok: true; h3Index: string } | { ok: false; error: string } {
  const rawHex = args.hex;
  logDebug('toolHexArgument resolveHexArgument', { hasHex: rawHex !== undefined });
  if (!Array.isArray(rawHex) || rawHex.length < 2) {
    return {
      ok: false,
      error:
        'hex must be provided as a two-character briefing code from the operational map per the tool schema (decoded to a map cell before this check).',
    };
  }
  const lat = Number(rawHex[0]);
  const lng = Number(rawHex[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      ok: false,
      error:
        'hex argument did not decode to usable numeric coordinates; pass a valid briefing hex code from the map or tables.',
    };
  }
  const h3Index = resolveToH3(lat, lng);
  if (!h3Index) {
    return { ok: false, error: 'hex did not resolve to a known map cell in the current briefing context.' };
  }
  return { ok: true, h3Index };
}
