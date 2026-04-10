/**
 * Tool 6: Production queue query/mutation for the opponent AI.
 * Uses gameActions production APIs so JSON and tool-call paths share the same backend validation.
 */

import { LATLNG_DECIMAL_PLACES } from '../mapData';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { BUILD_ENTRY_MAX_COUNT, BUILD_ENTRY_MIN_COUNT, type BuildUnitType, isValidBuildCount } from '../productionRules';
import {
  addHexBuildQueueEntry,
  getHexBuildQueue,
  removeHexBuildQueueEntry,
  updateHexBuildQueueEntry,
  type HexBuildQueueView,
} from '../gameActions';
import type { LatLng } from './tool1Pathfinding';
import { logDebug, logError, logTrace } from '../logger';
import { isTerrainClassificationCacheLoaded } from '../terrainClassificationCache';

/**
 * Documents the module-scope binding `AI_PLAYER_ID` (AI_PLAYER_ID).

 * Purpose: Supports maintainability by documenting why `AI_PLAYER_ID` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const AI_PLAYER_ID = 'opponent';

/**
 * Documents the module-scope binding `TOOL6_NAME_LIST` (TOOL6_NAME_LIST).

 * Purpose: Supports maintainability by documenting why `TOOL6_NAME_LIST` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const TOOL6_NAME_LIST = ['query_production', 'set_build_queue'] as const;
/**
 * Documents the module-scope binding `TOOL6_NAMES` (TOOL6_NAMES).

 * Purpose: Supports maintainability by documenting why `TOOL6_NAMES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const TOOL6_NAMES = TOOL6_NAME_LIST;

/**
 * Defines the `roundCoordinate` function shape (function roundCoordinate(value: number): number).

 * Purpose: Supports maintainability by documenting why `roundCoordinate` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function roundCoordinate(value: number): number {
  return Number(value.toFixed(LATLNG_DECIMAL_PLACES));
}

/**
 * Defines the `toDisplayLatLng` function shape (function toDisplayLatLng(ll: [number, number]): [number, number]).

 * Purpose: Supports maintainability by documenting why `toDisplayLatLng` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function toDisplayLatLng(ll: [number, number]): [number, number] {
  return [roundCoordinate(ll[0]), roundCoordinate(ll[1])];
}

/**
 * Defines the `isBuildUnitType` function shape (function isBuildUnitType(value: unknown): value is BuildUnitType).

 * Purpose: Supports maintainability by documenting why `isBuildUnitType` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isBuildUnitType(value: unknown): value is BuildUnitType {
  return value === 'infantry' || value === 'armor' || value === 'naval' || value === 'air';
}

/**
 * Defines the `resolveHexArgument` function shape (function resolveHexArgument( args: { hex?: unknown }, resolveToH3: (lat: number, lng: number) => string | undefined ): { ok: true; h3Index: string } | {).

 * Purpose: Supports maintainability by documenting why `resolveHexArgument` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function resolveHexArgument(
  args: { hex?: unknown },
  resolveToH3: (lat: number, lng: number) => string | undefined
): { ok: true; h3Index: string } | { ok: false; error: string } {
  const rawHex = args.hex;
  if (!Array.isArray(rawHex) || rawHex.length < 2) return { ok: false, error: 'hex must be [lat,lng].' };
  const lat = Number(rawHex[0]);
  const lng = Number(rawHex[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: 'hex must contain finite lat/lng values.' };
  const h3Index = resolveToH3(lat, lng);
  if (!h3Index) return { ok: false, error: 'hex does not resolve to a known map cell.' };
  return { ok: true, h3Index };
}

/**
 * Defines the `summarizeQueue` function shape (function summarizeQueue(queue: HexBuildQueueView, latLngByH3: Map<string, LatLng>): Record<string, unknown>).

 * Purpose: Supports maintainability by documenting why `summarizeQueue` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function summarizeQueue(queue: HexBuildQueueView, latLngByH3: Map<string, LatLng>): Record<string, unknown> {
  const ll = latLngByH3.get(queue.h3Index);
  return {
    hex: ll ? toDisplayLatLng(ll) : null,
    controllerPlayerId: queue.controllerPlayerId,
    controlledByRequester: queue.controlledByRequester,
    urbanHexCount: queue.urbanHexCount,
    airportCount: queue.airportCount,
    seaportCount: queue.seaportCount,
    availableUnitTypes: queue.availableUnitTypes,
    buildSectionVisible: queue.buildSectionVisible,
    noBuildReason: queue.noBuildReason,
    entries: queue.entries.map((entry) => ({
      entryId: entry.id,
      queueIndex: entry.queueIndex,
      unitType: entry.unitType,
      count: entry.count,
    })),
  };
}

/**
 * Defines the `queryProduction` function shape (function queryProduction( args: { hex?: unknown; all?: unknown }, state: GameStateSnapshot, latLngByH3: Map<string, LatLng>, resolveToH3: (lat: numb).

 * Purpose: Supports maintainability by documenting why `queryProduction` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function queryProduction(
  args: { hex?: unknown; all?: unknown },
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logTrace('tool6Production queryProduction', { hasHex: args.hex !== undefined, all: args.all === true });
  if (!isTerrainClassificationCacheLoaded()) {
    logDebug('tool6Production queryProduction: terrain cache unavailable', { stateTurn: state.turnNumber });
    return {
      status: 'ok',
      production: { controlledHexQueues: [] as unknown[] },
      unavailableReason: 'terrain classification cache not loaded',
    };
  }
  if (args.hex !== undefined) {
    const resolved = resolveHexArgument(args, resolveToH3);
    if (!resolved.ok) return { status: 'error', error: resolved.error };
    const queue = getHexBuildQueue(resolved.h3Index, AI_PLAYER_ID);
    return { status: 'ok', production: summarizeQueue(queue, latLngByH3) };
  }
  const snapshots = state.hexes
    .map((hex) => getHexBuildQueue(hex.h3Index, AI_PLAYER_ID))
    .filter((queue) => queue.controlledByRequester)
    .map((queue) => summarizeQueue(queue, latLngByH3));
  return { status: 'ok', production: { controlledHexQueues: snapshots } };
}

/**
 * Defines the `setBuildQueue` function shape (function setBuildQueue( args: { hex?: unknown; unitType?: unknown; count?: unknown }, latLngByH3: Map<string, LatLng>, resolveToH3: (lat: number, lng:).

 * Purpose: Supports maintainability by documenting why `setBuildQueue` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function setBuildQueue(
  args: { hex?: unknown; unitType?: unknown; count?: unknown },
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('tool6Production setBuildQueue', { hasHex: args.hex !== undefined });
  const resolved = resolveHexArgument(args, resolveToH3);
  if (!resolved.ok) return { status: 'error', error: resolved.error };
  if (!isBuildUnitType(args.unitType)) {
    return { status: 'error', error: 'set_build_queue requires unitType (infantry|armor|naval|air).' };
  }
  const count = Number(args.count);
  if (!isValidBuildCount(count)) {
    return {
      status: 'error',
      error: `set_build_queue count must be an integer from ${BUILD_ENTRY_MIN_COUNT} to ${BUILD_ENTRY_MAX_COUNT}.`,
    };
  }
  const currentQueue = getHexBuildQueue(resolved.h3Index, AI_PLAYER_ID);
  if (!currentQueue.controlledByRequester) {
    return { status: 'error', error: currentQueue.noBuildReason ?? 'Hex is not controlled by requester.' };
  }
  if (!currentQueue.buildSectionVisible) {
    return { status: 'error', error: currentQueue.noBuildReason ?? 'Build section is not available for this hex.' };
  }
  if (!currentQueue.availableUnitTypes.includes(args.unitType)) {
    return {
      status: 'error',
      error: `set_build_queue unitType ${args.unitType} is not available for this hex.`,
    };
  }
  const orderedEntries = [...currentQueue.entries].sort((a, b) => a.queueIndex - b.queueIndex);
  if (orderedEntries.length > 0) {
    const entryToKeep = orderedEntries[0]!;
    const updateResult = updateHexBuildQueueEntry(resolved.h3Index, entryToKeep.id, args.unitType, count, AI_PLAYER_ID);
    if (!updateResult.success || !updateResult.queue) {
      return { status: 'error', error: updateResult.reason ?? 'Failed to update primary queue entry.' };
    }
    let queueAfter = updateResult.queue;
    for (const entry of orderedEntries.slice(1)) {
      const removeResult = removeHexBuildQueueEntry(resolved.h3Index, entry.id, AI_PLAYER_ID);
      if (!removeResult.success || !removeResult.queue) {
        return { status: 'error', error: removeResult.reason ?? 'Failed to remove obsolete queue entry.' };
      }
      queueAfter = removeResult.queue;
    }
    return { status: 'ok', production: summarizeQueue(queueAfter, latLngByH3) };
  }

  const addResult = addHexBuildQueueEntry(resolved.h3Index, AI_PLAYER_ID);
  if (!addResult.success || !addResult.queue) {
    return { status: 'error', error: addResult.reason ?? 'Failed to create build queue entry.' };
  }
  const newEntry = [...addResult.queue.entries].sort((a, b) => b.queueIndex - a.queueIndex)[0];
  if (!newEntry) {
    return { status: 'error', error: 'Failed to identify newly added entry.' };
  }
  const updateResult = updateHexBuildQueueEntry(resolved.h3Index, newEntry.id, args.unitType, count, AI_PLAYER_ID);
  if (!updateResult.success || !updateResult.queue) {
    return { status: 'error', error: updateResult.reason ?? 'Failed to set build queue entry.' };
  }
  return { status: 'ok', production: summarizeQueue(updateResult.queue, latLngByH3) };
}

/**
 * Defines the `executeTool6` function shape (export function executeTool6( toolName: string, args: unknown, state: GameStateSnapshot, latLngByH3: Map<string, LatLng>, resolveToH3: (lat: numb).

 * Purpose: Supports maintainability by documenting why `executeTool6` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function executeTool6(
  toolName: string,
  args: unknown,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('tool6Production executeTool6', { toolName, stateTurn: state.turnNumber });
  try {
    const request = (args ?? {}) as {
      hex?: unknown;
      unitType?: unknown;
      count?: unknown;
      all?: unknown;
    };
    if (toolName === 'query_production') return queryProduction(request, state, latLngByH3, resolveToH3);
    if (toolName === 'set_build_queue') return setBuildQueue(request, latLngByH3, resolveToH3);
    return { status: 'error', error: `Unknown tool: ${toolName}` };
  } catch (err) {
    logError('tool6Production executeTool6: exception', toolName, err);
    return { status: 'error', error: String(err) };
  }
}
