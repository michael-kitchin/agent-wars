/**
 * Deterministic 2-character codes for LLM-facing hex references (strategic res1 and res4 children under a res1 parent).
 *
 * Purpose: Mirrors `initStrategicCoordinateRegistry` / `initTacticalCoordinateRegistry` ordering so UI tooltips
 * can show the same labels as briefings and tools without an IPC round-trip.
 * When to use: Renderer tooltip prefixes and main-process `hex-coordinates` registry construction.
 * Expected outcome: Stable `A0`…-style codes; res4 codes match per-parent sorted child order used tactically.
 * Exceptions: `indexToCode` throws if the child index exceeds the 36×36 code space (logic bug, not user input).
 */

import { cellToChildren, cellToLatLng, cellToParent, getRes0Cells } from 'h3-js';
import { STRATEGIC_H3_RESOLUTION, TACTICAL_H3_RESOLUTION } from './h3Resolutions';

/**
 * Alphabet for 2-character codes: A–Z then 0–9 (same order as `hex-coordinates`).
 *
 * Purpose: Keeps renderer and main-process encodings identical.
 */
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

let strategicH3ToCodeSingleton: Map<string, string> | null = null;

/**
 * Maps a stable registry index to a two-character code.
 *
 * Purpose: Shared encoder for strategic and per-parent res4 registries.
 * When to use: After sorting candidate H3 cells for assignment.
 * Expected outcome: Two uppercase alphanumeric characters.
 * Exceptions: Throws if `index` is outside the supported code space.
 */
export function indexToCode(index: number): string {
  if (index < 0 || index >= CODE_ALPHABET.length * CODE_ALPHABET.length) {
    throw new Error(`hexLlmCodeAssignment: code index out of range (${index})`);
  }
  const hi = Math.floor(index / CODE_ALPHABET.length);
  const lo = index % CODE_ALPHABET.length;
  return `${CODE_ALPHABET[hi]}${CODE_ALPHABET[lo]}`;
}

/**
 * Sorts H3 cells north-first, then west-to-east, then by index string (same comparator as `hex-coordinates`).
 *
 * Purpose: Deterministic ordering before sequential code assignment.
 * When to use: Building strategic and per-parent res4 code tables.
 * Expected outcome: New array; does not mutate the input.
 * Exceptions: None; relies on `cellToLatLng` for each cell.
 */
export function sortCellsForStableLlmCodes(cells: readonly string[]): string[] {
  const decorated = cells.map((h3) => {
    const [lat, lng] = cellToLatLng(h3);
    return { h3, lat, lng };
  });
  decorated.sort((a, b) => {
    if (a.lat !== b.lat) return b.lat - a.lat;
    if (a.lng !== b.lng) return a.lng - b.lng;
    return a.h3.localeCompare(b.h3);
  });
  return decorated.map((d) => d.h3);
}

/**
 * Builds the full strategic res1 `h3 → code` map for all Earth res1 children of res0 cells.
 *
 * Purpose: One-shot table used by main and lazy singleton readers in the renderer.
 * When to use: `hex-coordinates` init and first `getStrategicRes1H3ToCodeMap` call.
 * Expected outcome: Bijection between registered res1 indexes and distinct codes.
 * Exceptions: Propagates H3 library failures.
 */
export function buildStrategicRes1H3ToCodeMap(): Map<string, string> {
  const res0 = getRes0Cells();
  const res1Set = new Set<string>();
  for (const r0 of res0) {
    for (const child of cellToChildren(r0, STRATEGIC_H3_RESOLUTION)) {
      res1Set.add(child);
    }
  }
  const sorted = sortCellsForStableLlmCodes([...res1Set]);
  const h3ToCode = new Map<string, string>();
  for (let i = 0; i < sorted.length; i++) {
    h3ToCode.set(sorted[i]!, indexToCode(i));
  }
  return h3ToCode;
}

/**
 * Returns a cached read-only view of the strategic res1 code map (built once per renderer/main load).
 *
 * Purpose: Avoids rebuilding thousands of mappings on every tooltip frame.
 * When to use: Any lookup of strategic codes in UI hot paths.
 * Expected outcome: Same map identity after the first call.
 * Exceptions: None.
 */
export function getStrategicRes1H3ToCodeMap(): ReadonlyMap<string, string> {
  if (!strategicH3ToCodeSingleton) {
    strategicH3ToCodeSingleton = buildStrategicRes1H3ToCodeMap();
  }
  return strategicH3ToCodeSingleton;
}

/**
 * Returns the two-character strategic code for a res1 H3 index, if it appears in the global registry.
 *
 * Purpose: `(XX)` prefix in res1 tooltips and the parent segment of `(XX.YY)` for res4.
 * When to use: After the map has been warmed via `getStrategicRes1H3ToCodeMap`.
 * Expected outcome: Two-character string or `undefined` for unknown indexes.
 * Exceptions: None.
 */
export function getStrategicRes1HexCode(h3Index: string): string | undefined {
  return getStrategicRes1H3ToCodeMap().get(h3Index);
}

/**
 * Returns the tactical-style two-character code for one res4 child under a given res1 parent.
 *
 * Purpose: `YY` in `(XX.YY)` matches `initTacticalCoordinateRegistry` for that parent.
 * When to use: Res4 zoom tooltips where the naming target resolution is 4.
 * Expected outcome: Code for the child's position in the sorted child list, or `undefined` if not a child.
 * Exceptions: None.
 */
export function getRes4ChildCodeWithinParent(
  parentRes1H3Index: string,
  childRes4H3Index: string,
  childResolution: number = TACTICAL_H3_RESOLUTION
): string | undefined {
  const children = sortCellsForStableLlmCodes(cellToChildren(parentRes1H3Index, childResolution));
  const idx = children.indexOf(childRes4H3Index);
  if (idx < 0) return undefined;
  return indexToCode(idx);
}

/**
 * Builds the parenthesized location label for tooltip badges: `(XX)` or `(XX.YY)` (no HTML).
 *
 * Purpose: Lets callers wrap the result in `<strong>` for consistent styling.
 * When to use: From renderer code that already has a `NamingLookupTarget` aligned with the IPC naming request.
 * Expected outcome: Non-null string only when both required codes exist.
 * Exceptions: None.
 */
export function getLlmHexLocationParenLabelForNamingTarget(target: {
  h3Index: string;
  resolution: 1 | 4;
}): string | null {
  if (target.resolution === 1) {
    const c = getStrategicRes1HexCode(target.h3Index);
    return c ? `(${c})` : null;
  }
  const parent = cellToParent(target.h3Index, STRATEGIC_H3_RESOLUTION);
  const parentCode = getStrategicRes1HexCode(parent);
  const childCode = getRes4ChildCodeWithinParent(parent, target.h3Index);
  return parentCode && childCode ? `(${parentCode}.${childCode})` : null;
}
