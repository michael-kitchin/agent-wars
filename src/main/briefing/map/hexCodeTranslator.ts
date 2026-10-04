/**
 * Thin translation helpers between briefing hex codes and engine H3 / display lat-lng.
 *
 * Purpose: Centralizes context-aware lookups so tools and parsers do not duplicate registry rules.
 * When to use: Any OpenRouter-facing boundary that still needs lat/lng internally after the LLM contract moved to codes.
 * Expected outcome: Throws on unknown codes to fail fast during AI order application.
 * Exceptions: Throws when codes are unknown for the active context.
 */

import { cellToLatLng, latLngToCell } from 'h3-js';
import { STRATEGIC_H3_RESOLUTION, TACTICAL_H3_RESOLUTION } from '../../../shared/h3Resolutions';
import { LATLNG_DECIMAL_PLACES } from '../../mapData';
import { logError, logTrace } from '../../logger';
import type { CoordinateContext } from './coordinateContext';
import { HEX_CODE_PATTERN } from './coordinateContext';
import { getHexCodeForContext, getH3IndexForCode, isHexCodeValidForContext } from './hexCoordinates';

/**
 * Translates a briefing hex code to its authoritative H3 index for the active context.
 *
 * Purpose: Primary inbound translation for tools and parsers.
 * When to use: After validating `HEX_CODE_PATTERN` and registry membership.
 * Expected outcome: Deterministic H3 index for valid codes.
 * Exceptions: Throws when the code is unknown.
 */
export function codeToH3(code: string, context: CoordinateContext): string {
  logTrace('hex-code-translator codeToH3', { code, mode: context.mode, battleId: context.battleId ?? null });
  if (!HEX_CODE_PATTERN.test(code)) {
    const err = new Error(`hex-code-translator: invalid hex code format "${code}"`);
    logError('hex-code-translator codeToH3: invalid format', err);
    throw err;
  }
  const h3 = getH3IndexForCode(code, context);
  if (!h3) {
    const err = new Error(`hex-code-translator: unknown hex code "${code}" for mode=${context.mode}`);
    logError('hex-code-translator codeToH3: unknown code', err);
    throw err;
  }
  return h3;
}

/**
 * Translates an H3 index to its briefing hex code for the active context.
 *
 * Purpose: Outbound translation for prompts and tool payloads shown to the LLM.
 * When to use: When serializing any strategic/tactical cell the registry was built for.
 * Expected outcome: Two-character code string.
 * Exceptions: Throws when the H3 is not registered in the active context (caller bug or stale index).
 */
export function h3ToCode(h3Index: string, context: CoordinateContext): string {
  logTrace('hex-code-translator h3ToCode', { h3Index, mode: context.mode });
  const code = getHexCodeForContext(h3Index, context);
  if (!code) {
    const err = new Error(`hex-code-translator: no code for H3 in active context (mode=${context.mode})`);
    logError('hex-code-translator h3ToCode: missing mapping', err);
    throw err;
  }
  return code;
}

/**
 * Rounds an H3 cell center to the game's standard lat/lng decimal precision.
 *
 * Purpose: Keeps legacy lat/lng consumers stable while codes are the LLM-facing surface.
 * When to use: When bridging decoded codes into APIs that still accept rounded tuples.
 * Expected outcome: Tuple rounded per `LATLNG_DECIMAL_PLACES`.
 * Exceptions: Inherits `codeToH3` throw behavior.
 */
export function codeToLatLngRounded(code: string, context: CoordinateContext): [number, number] {
  logTrace('hex-code-translator codeToLatLngRounded', { code, mode: context.mode });
  const h3 = codeToH3(code, context);
  const [lat, lng] = cellToLatLng(h3);
  const r = LATLNG_DECIMAL_PLACES;
  return [Number(lat.toFixed(r)), Number(lng.toFixed(r))];
}

/**
 * Snaps a WGS84 point to the active context grid and returns its briefing hex code.
 *
 * Purpose: Implements the plan’s migration helper for legacy lat/lng references at the LLM boundary.
 * When to use: When translating arbitrary lat/lng (e.g. stored tuples) into the same code space as maps and parsers.
 * Expected outcome: Two-character code when the snapped cell is registered; otherwise throws with a clear error.
 * Exceptions: Throws when the snapped cell is not in the active registry or H3 snapping fails.
 */
export function latLngToCode(lat: number, lng: number, context: CoordinateContext): string {
  logTrace('hex-code-translator latLngToCode', { lat, lng, mode: context.mode, battleId: context.battleId ?? null });
  try {
    const res =
      context.mode === 'strategic'
        ? latLngToCell(lat, lng, STRATEGIC_H3_RESOLUTION)
        : latLngToCell(lat, lng, TACTICAL_H3_RESOLUTION);
    const code = getHexCodeForContext(res, context);
    if (!code) {
      throw new Error(`hex-code-translator: lat/lng snaps to unregistered cell for mode=${context.mode}`);
    }
    return code;
  } catch (err) {
    logError('hex-code-translator latLngToCode: failed', err);
    throw err;
  }
}

/**
 * Validates a briefing code string against the active registry.
 *
 * Purpose: Parser and tool preflight checks.
 * When to use: Before attempting translation or partial JSON repair.
 * Expected outcome: Boolean membership test without throwing.
 * Exceptions: None.
 */
export function isValidHexCode(code: string, context: CoordinateContext): boolean {
  logTrace('hex-code-translator isValidHexCode', { code, mode: context.mode });
  return isHexCodeValidForContext(code, context);
}
