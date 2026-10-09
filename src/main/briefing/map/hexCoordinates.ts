/**
 * Stable 2-character code registries for strategic and tactical H3 cells.
 *
 * Purpose: Provides deterministic, context-scoped codes for LLM-facing coordinates without exposing raw H3 strings.
 * When to use: Initialize before strategic briefing or tool translation, and again for each tactical battle. A profile change clears both tables.
 * Expected outcome: Round-trip stability for all registered cells within the active context.
 * Exceptions: Lookups return undefined until the matching registry is initialized. Translators that require a code throw.
 */

import { cellToLatLng } from 'h3-js';
import { registerActiveGameMapReset } from '../../../shared/activeGameMap';
import { buildStrategicH3ToCodeMap } from '../../../shared/hexLlmCodeAssignment';
import { tacticalBattleFootprint } from '../../../shared/tacticalBattleFootprint';
import {
  isStrategicCell,
  strategicCellAt,
  strategicH3Resolution,
  tacticalCellAt,
} from '../../../shared/h3Resolutions';
import { logDebug, logError, logTrace } from '../../logger';
import type { CoordinateContext } from './coordinateContext';
import { HEX_CODE_PATTERN } from './coordinateContext';

let strategicH3ToCode: Map<string, string> | null = null;
let strategicCodeToH3: Map<string, string> | null = null;

const tacticalRegistries = new Map<
  string,
  { h3ToCode: Map<string, string>; codeToH3: Map<string, string>; parentStrategic: string }
>();

/**
 * Drops the strategic and tactical hex-code tables.
 *
 * Purpose: Those tables belong to the active map. A profile change must not keep the previous grid's codes.
 * When to use: Registered when this module loads. Callers use `ensureStrategicCoordinateRegistryInitialized` and `initTacticalCoordinateRegistry`.
 * Expected outcome: The next strategic init rebuilds. Tactical battles must be registered again.
 * Exceptions: None.
 */
function resetStrategicCoordinateCaches(): void {
  strategicH3ToCode = null;
  strategicCodeToH3 = null;
  tacticalRegistries.clear();
}

registerActiveGameMapReset(resetStrategicCoordinateCaches);

/**
 * Initializes the strategic registry for the map that is loaded.
 *
 * Purpose: Builds the code tables from the current footprint, or from every strategic cell when no footprint is installed.
 * When to use: Before any strategic briefing, tool translation, or parser validation for strategic mode. Safe to call again; each call rebuilds.
 * Expected outcome: `strategicH3ToCode` and `strategicCodeToH3` match the footprint and strategic resolution current at this call.
 * Exceptions: Propagates H3 library failures as errors.
 */
export function initStrategicCoordinateRegistry(): void {
  logDebug('hex-coordinates initStrategicCoordinateRegistry: building strategic registry');
  try {
    const h3ToCode = new Map(buildStrategicH3ToCodeMap());
    const codeToH3 = new Map<string, string>();
    for (const [h3, code] of h3ToCode.entries()) {
      codeToH3.set(code, h3);
    }
    strategicH3ToCode = h3ToCode;
    strategicCodeToH3 = codeToH3;
    logDebug('hex-coordinates initStrategicCoordinateRegistry: complete', {
      cellCount: h3ToCode.size,
      strategicResolution: strategicH3Resolution(),
    });
  } catch (err) {
    logError('hex-coordinates initStrategicCoordinateRegistry: failed', err);
    throw err;
  }
}

/**
 * Initializes a tactical registry for one battle under its enclosing strategic parent.
 *
 * Purpose: Tactical codes are stable for the battle only; they reuse the 2-character space independently of strategic codes.
 * When to use: At tactical AI consultation start, keyed by `battleId`.
 * Expected outcome: Codes cover the playable battle cells, including the three-ring margin, in the footprint's stable order.
 * Exceptions: Throws if the enclosing index is not a cell.
 */
export function initTacticalCoordinateRegistry(battleId: string, enclosingStrategicH3Index: string): void {
  logDebug('hex-coordinates initTacticalCoordinateRegistry: building tactical registry', {
    battleId,
    enclosingStrategicH3Index,
  });
  try {
    const footprint = tacticalBattleFootprint(enclosingStrategicH3Index);
    const h3ToCode = new Map(footprint.codeByH3);
    const codeToH3 = new Map<string, string>();
    for (const [h3, code] of footprint.codeByH3) codeToH3.set(code, h3);
    tacticalRegistries.set(battleId, { h3ToCode, codeToH3, parentStrategic: enclosingStrategicH3Index });
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
    const strategic =
      isStrategicCell(h3Index)
        ? h3Index
        : strategicCellAt(...cellToLatLng(h3Index));
    return strategicH3ToCode?.get(strategic);
  }
  const battleId = context.battleId;
  if (!battleId) return undefined;
  const [lat, lng] = cellToLatLng(h3Index);
  const h4 = tacticalCellAt(lat, lng);
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
 * Expected outcome: A profile change clears the table. The next call builds it for the footprint and strategic resolution current at that call.
 * Exceptions: None beyond `initStrategicCoordinateRegistry`.
 */
export function ensureStrategicCoordinateRegistryInitialized(): void {
  const ready = strategicH3ToCode !== null && strategicCodeToH3 !== null;
  logTrace('hex-coordinates ensureStrategicCoordinateRegistryInitialized', { ready });
  if (ready) return;
  initStrategicCoordinateRegistry();
}

/**
 * Lists every strategic H3 index currently registered (post-init).
 *
 * Purpose: Supports bounding-box selection without importing private registry maps.
 * When to use: `computeMapHexes` and tests that need every strategic cell of the loaded match.
 * Expected outcome: One entry per registered strategic cell; order is not guaranteed. A cleared table is rebuilt for the map current at this call.
 * Exceptions: Throws when initialization leaves the table empty.
 */
export function listStrategicH3Indexes(): string[] {
  ensureStrategicCoordinateRegistryInitialized();
  if (!strategicCodeToH3) {
    const err = new Error('hex-coordinates: strategic registry missing after init');
    logError('hex-coordinates listStrategicH3Indexes: missing registry', err);
    throw err;
  }
  return [...strategicCodeToH3.values()];
}
