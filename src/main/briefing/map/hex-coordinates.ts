/**
 * Stable 2-character code registries for strategic res1 and tactical res4 H3 cells.
 *
 * Purpose: Provides deterministic, context-scoped codes for LLM-facing coordinates without exposing raw H3 strings.
 * When to use: Initialize once per strategic process and per tactical battle before briefing or tool translation.
 * Expected outcome: Round-trip stability for all registered cells within the active context.
 * Exceptions: Throws if registry used before initialization for the requested context.
 */

import { cellToChildren, cellToLatLng, getRes0Cells, latLngToCell } from 'h3-js';
import { logDebug, logError, logTrace } from '../../logger';
import type { CoordinateContext } from './coordinateContext';
import { HEX_CODE_PATTERN } from './coordinateContext';

const STRATEGIC_RESOLUTION = 1;
const TACTICAL_RESOLUTION = 4;

/**
 * Alphabet for 2-character codes: A–Z then 0–9 (36 symbols), 1296 combinations.
 *
 * Purpose: Matches the ASCII map plan: uppercase+digits only, leaving lowercase for overlay symbology.
 * When to use: Code assignment order for both strategic and tactical registries.
 * Expected outcome: Deterministic sequential codes independent of insertion order beyond the global sort.
 * Exceptions: None.
 */
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

let strategicH3ToCode: Map<string, string> | null = null;
let strategicCodeToH3: Map<string, string> | null = null;

const tacticalRegistries = new Map<
  string,
  { h3ToCode: Map<string, string>; codeToH3: Map<string, string>; parentRes1: string }
>();

/**
 * Converts a stable registry index into a 2-character code.
 *
 * Purpose: Shared encoder for strategic and tactical registries.
 * When to use: During registry initialization after sorting candidate cells.
 * Expected outcome: Surjective mapping onto the code space for indices < 1296.
 * Exceptions: Throws if index is out of range for the alphabet (indicates a logic bug).
 */
function indexToCode(index: number): string {
  if (index < 0 || index >= CODE_ALPHABET.length * CODE_ALPHABET.length) {
    logError('hex-coordinates indexToCode: index out of range', { index });
    throw new Error(`hex-coordinates: code index out of range (${index})`);
  }
  const hi = Math.floor(index / CODE_ALPHABET.length);
  const lo = index % CODE_ALPHABET.length;
  return `${CODE_ALPHABET[hi]}${CODE_ALPHABET[lo]}`;
}

/**
 * Sorts H3 cells for stable code assignment (north-first, then west-to-east at equal latitude).
 *
 * Purpose: Implements the plan's deterministic ordering contract.
 * When to use: Before assigning sequential codes for any registry build.
 * Expected outcome: Stable ordering given the same input set.
 * Exceptions: None.
 */
function sortCellsForRegistry(cells: string[]): string[] {
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
 * Initializes the global strategic res1 registry (all Earth res1 children of res0 cells).
 *
 * Purpose: Phase 1 registry build; safe to call multiple times (rebuilds identical maps).
 * When to use: Before any strategic briefing, tool translation, or parser validation for strategic mode.
 * Expected outcome: `strategicH3ToCode`/`strategicCodeToH3` populated for all res1 cells.
 * Exceptions: Propagates H3 library failures as errors.
 */
export function initStrategicCoordinateRegistry(): void {
  logDebug('hex-coordinates initStrategicCoordinateRegistry: building strategic res1 registry');
  try {
    const res0 = getRes0Cells();
    const res1Set = new Set<string>();
    for (const r0 of res0) {
      for (const child of cellToChildren(r0, STRATEGIC_RESOLUTION)) {
        res1Set.add(child);
      }
    }
    const sorted = sortCellsForRegistry([...res1Set]);
    const h3ToCode = new Map<string, string>();
    const codeToH3 = new Map<string, string>();
    for (let i = 0; i < sorted.length; i++) {
      const h3 = sorted[i]!;
      const code = indexToCode(i);
      h3ToCode.set(h3, code);
      codeToH3.set(code, h3);
    }
    strategicH3ToCode = h3ToCode;
    strategicCodeToH3 = codeToH3;
    logDebug('hex-coordinates initStrategicCoordinateRegistry: complete', {
      cellCount: h3ToCode.size,
    });
  } catch (err) {
    logError('hex-coordinates initStrategicCoordinateRegistry: failed', err);
    throw err;
  }
}

/**
 * Initializes a tactical res4 registry for one battle under its enclosing res1 parent.
 *
 * Purpose: Tactical codes are stable for the battle only; they reuse the 2-character space independently of strategic codes.
 * When to use: At tactical AI consultation start, keyed by `battleId`.
 * Expected outcome: Codes cover all res4 children returned by H3 for the parent cell.
 * Exceptions: Throws if children cannot be enumerated.
 */
export function initTacticalCoordinateRegistry(battleId: string, enclosingRes1H3Index: string): void {
  logDebug('hex-coordinates initTacticalCoordinateRegistry: building tactical res4 registry', {
    battleId,
    enclosingRes1H3Index,
  });
  try {
    const children = sortCellsForRegistry(cellToChildren(enclosingRes1H3Index, TACTICAL_RESOLUTION));
    const h3ToCode = new Map<string, string>();
    const codeToH3 = new Map<string, string>();
    for (let i = 0; i < children.length; i++) {
      const h3 = children[i]!;
      const code = indexToCode(i);
      h3ToCode.set(h3, code);
      codeToH3.set(code, h3);
    }
    tacticalRegistries.set(battleId, { h3ToCode, codeToH3, parentRes1: enclosingRes1H3Index });
    logDebug('hex-coordinates initTacticalCoordinateRegistry: complete', {
      battleId,
      cellCount: h3ToCode.size,
    });
  } catch (err) {
    logError('hex-coordinates initTacticalCoordinateRegistry: failed', err);
    throw err;
  }
}

/**
 * Returns the stable 2-character code for an H3 index in the active context.
 *
 * Purpose: Primary encoder for prompts, tables, and tool responses.
 * When to use: After the matching registry initializer ran for the active mode.
 * Expected outcome: Defined code for every cell in the registry; undefined if absent (caller may treat as non-map cell).
 * Exceptions: None from H3 for normal inputs; logs trace for cache hits.
 */
export function getHexCodeForContext(h3Index: string, context: CoordinateContext): string | undefined {
  logTrace('hex-coordinates getHexCodeForContext', { h3Index, mode: context.mode });
  if (context.mode === 'strategic') {
    const [lat, lng] = cellToLatLng(h3Index);
    const res1 = latLngToCell(lat, lng, STRATEGIC_RESOLUTION);
    return strategicH3ToCode?.get(res1);
  }
  const battleId = context.battleId;
  if (!battleId) return undefined;
  const [lat, lng] = cellToLatLng(h3Index);
  const h4 = latLngToCell(lat, lng, TACTICAL_RESOLUTION);
  return tacticalRegistries.get(battleId)?.h3ToCode.get(h4);
}

/**
 * Reverse lookup from a 2-character code to an H3 index for the active context.
 *
 * Purpose: Parser and tool inbound translation.
 * When to use: When validating LLM-supplied codes against the active registry.
 * Expected outcome: Returns undefined for unknown codes (caller rejects hard).
 * Exceptions: None.
 */
export function getH3IndexForCode(code: string, context: CoordinateContext): string | undefined {
  logTrace('hex-coordinates getH3IndexForCode', { code, mode: context.mode });
  if (!HEX_CODE_PATTERN.test(code)) return undefined;
  if (context.mode === 'strategic') {
    return strategicCodeToH3?.get(code);
  }
  const battleId = context.battleId;
  if (!battleId) return undefined;
  return tacticalRegistries.get(battleId)?.codeToH3.get(code);
}

/**
 * Returns whether a code string exists in the active context registry.
 *
 * Purpose: Fast validation gate for parsers without throwing.
 * When to use: JSON repair paths and defensive checks before `codeToH3` throws.
 * Expected outcome: True only for assigned codes in the active namespace.
 * Exceptions: None.
 */
export function isHexCodeValidForContext(code: string, context: CoordinateContext): boolean {
  logTrace('hex-coordinates isHexCodeValidForContext', { code, mode: context.mode });
  return getH3IndexForCode(code, context) !== undefined;
}

/**
 * Ensures the strategic registry exists (lazy initialization for callers that skip explicit init).
 *
 * Purpose: Convenience for briefing and tests that expect idempotent setup.
 * When to use: At the boundary of strategic briefing generation if not already initialized.
 * Expected outcome: Strategic registry populated exactly once per process unless explicitly rebuilt.
 * Exceptions: None beyond `initStrategicCoordinateRegistry`.
 */
export function ensureStrategicCoordinateRegistryInitialized(): void {
  if (strategicH3ToCode && strategicCodeToH3) return;
  initStrategicCoordinateRegistry();
}

/**
 * Lists every strategic res1 H3 index currently registered (post-init).
 *
 * Purpose: Supports bounding-box selection without importing private registry maps.
 * When to use: `computeMapHexes` and tests that need a full-world res1 universe.
 * Expected outcome: One entry per registered res1 cell; order is not guaranteed.
 * Exceptions: Throws if the strategic registry has not been initialized.
 */
export function listStrategicRes1H3Indexes(): string[] {
  ensureStrategicCoordinateRegistryInitialized();
  if (!strategicCodeToH3) {
    const err = new Error('hex-coordinates: strategic registry missing after init');
    logError('hex-coordinates listStrategicRes1H3Indexes: missing registry', err);
    throw err;
  }
  return [...strategicCodeToH3.values()];
}
