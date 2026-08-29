/**
 * Production queue query/mutation for the opponent AI.
 * Uses gameActions production APIs so JSON and tool-call paths share the same backend validation.
 */

import { LATLNG_DECIMAL_PLACES } from '../mapData';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import {
  BUILD_ENTRY_MAX_COUNT,
  BUILD_ENTRY_MIN_COUNT,
  isBuildUnitType,
  isValidBuildCount,
} from '../productionRules';
import {
  addHexBuildQueueEntry,
  getHexBuildQueue,
  removeHexBuildQueueEntry,
  updateHexBuildQueueEntry,
  type HexBuildQueueView,
} from '../gameActions';
import type { LatLng } from './pathfinding';
import { logDebug, logError, logTrace } from '../logger';
import { isTerrainClassificationCacheLoaded } from '../terrainClassificationCache';
import { getMaxedUnitTypesForPlayer, shouldRejectCappedQueueType, filterQueueableUnitTypes } from '../productionCaps';
import { parseGameSize } from '../../shared/gameSize';

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
 * Documents the module-scope binding `PRODUCTION_TOOL_NAMES` (PRODUCTION_TOOL_NAMES).

 * Purpose: Supports maintainability by documenting why `PRODUCTION_TOOL_NAMES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const PRODUCTION_TOOL_NAMES = TOOL6_NAME_LIST;

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

/**
 * Serializes one hex queue for opponent `query_production` / `set_build_queue` tool results.
 *
 * Purpose: AI summaries must list the same queueable types as the production briefing (omit capped types when an alternative exists).
 * When to use: After reading or mutating a hex queue in this module.
 * Expected outcome: Display lat/lng hex, filtered `availableUnitTypes`, and entry rows; does not change stored availability for the human UI.
 * Exceptions: None.
 */
function summarizeQueue(
  queue: HexBuildQueueView,
  latLngByH3: Map<string, LatLng>,
  maxedTypes: ReadonlySet<string>
): Record<string, unknown> {
  const ll = latLngByH3.get(queue.h3Index);
  return {
    hex: ll ? toDisplayLatLng(ll) : null,
    controllerPlayerId: queue.controllerPlayerId,
    controlledByRequester: queue.controlledByRequester,
    urbanHexCount: queue.urbanHexCount,
    airportCount: queue.airportCount,
    seaportCount: queue.seaportCount,
    availableUnitTypes: filterQueueableUnitTypes(queue.availableUnitTypes, maxedTypes),
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
 * Reads opponent-controlled production queues for the AI, with cap-aware available types.
 *
 * Purpose: Briefing and `query_production` share this path so the model is not shown capped types as buildable when another type remains.
 * When to use: `executeProductionTools` for `query_production`.
 * Expected outcome: `{ status: 'ok', production }` for one hex or `{ controlledHexQueues }`; empty queues with `unavailableReason` when the terrain cache is missing.
 * Exceptions: Returns `{ status: 'error' }` when a requested hex cannot be resolved.
 */
function queryProduction(
  args: { hex?: unknown; all?: unknown },
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logTrace('productionTools queryProduction', { hasHex: args.hex !== undefined, all: args.all === true });
  if (!isTerrainClassificationCacheLoaded()) {
    logDebug('productionTools queryProduction: terrain cache unavailable', { stateTurn: state.turnNumber });
    return {
      status: 'ok',
      production: { controlledHexQueues: [] as unknown[] },
      unavailableReason: 'terrain classification cache not loaded',
    };
  }
  const maxedTypes = new Set(
    getMaxedUnitTypesForPlayer(state.units, AI_PLAYER_ID, parseGameSize(state.gameSize))
  );
  if (args.hex !== undefined) {
    const resolved = resolveHexArgument(args, resolveToH3);
    if (!resolved.ok) return { status: 'error', error: resolved.error };
    const queue = getHexBuildQueue(resolved.h3Index, AI_PLAYER_ID);
    return { status: 'ok', production: summarizeQueue(queue, latLngByH3, maxedTypes) };
  }
  const snapshots = state.hexes
    .map((hex) => getHexBuildQueue(hex.h3Index, AI_PLAYER_ID))
    .filter((queue) => queue.controlledByRequester)
    .map((queue) => summarizeQueue(queue, latLngByH3, maxedTypes));
  return { status: 'ok', production: { controlledHexQueues: snapshots } };
}

/**
 * Replaces the opponent queue on one hex with a single unit type and count.
 *
 * Purpose: Tool calls and `productionOrders` JSON share this path so capped types are rejected when the hex can still build another type, while pre-queue remains allowed if every available type is at cap.
 * When to use: `executeProductionTools` for `set_build_queue`.
 * Expected outcome: `{ status: 'ok', production }` with the updated queue, or `{ status: 'error' }` for invalid hex/type/count, uncontrolled hex, unavailable type, or capped type with an alternative.
 * Exceptions: None beyond the returned error payload.
 */
function setBuildQueue(
  args: { hex?: unknown; unitType?: unknown; count?: unknown },
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  state: GameStateSnapshot
): Record<string, unknown> {
  const requestedType = typeof args.unitType === 'string' ? args.unitType : null;
  logDebug('productionTools setBuildQueue', { hasHex: args.hex !== undefined, unitType: requestedType });
  const reject = (error: string, h3Index?: string): Record<string, unknown> => {
    logDebug('productionTools setBuildQueue: rejected', {
      unitType: requestedType,
      h3Index: h3Index ?? null,
      stateTurn: state.turnNumber,
      error,
    });
    return { status: 'error', error };
  };
  const resolved = resolveHexArgument(args, resolveToH3);
  if (!resolved.ok) return reject(resolved.error);
  if (!isBuildUnitType(args.unitType)) {
    return reject('set_build_queue requires unitType (infantry|armor|naval|air).', resolved.h3Index);
  }
  const count = Number(args.count);
  if (!isValidBuildCount(count)) {
    return reject(
      `set_build_queue count must be an integer from ${BUILD_ENTRY_MIN_COUNT} to ${BUILD_ENTRY_MAX_COUNT}.`,
      resolved.h3Index
    );
  }
  const currentQueue = getHexBuildQueue(resolved.h3Index, AI_PLAYER_ID);
  if (!currentQueue.controlledByRequester) {
    return reject(currentQueue.noBuildReason ?? 'Hex is not controlled by requester.', resolved.h3Index);
  }
  if (!currentQueue.buildSectionVisible) {
    return reject(currentQueue.noBuildReason ?? 'Build section is not available for this hex.', resolved.h3Index);
  }
  if (!currentQueue.availableUnitTypes.includes(args.unitType)) {
    return reject(
      `set_build_queue unitType ${args.unitType} is not available for this hex; available: ${
        currentQueue.availableUnitTypes.join(', ') || 'none'
      }.`,
      resolved.h3Index
    );
  }
  const maxedTypes = new Set(
    getMaxedUnitTypesForPlayer(state.units, AI_PLAYER_ID, parseGameSize(state.gameSize))
  );
  if (shouldRejectCappedQueueType(args.unitType, currentQueue.availableUnitTypes, maxedTypes)) {
    return reject(
      `set_build_queue unitType ${args.unitType} is at deployment cap; queue a still-available type instead.`,
      resolved.h3Index
    );
  }
  const orderedEntries = [...currentQueue.entries].sort((a, b) => a.queueIndex - b.queueIndex);
  if (orderedEntries.length > 0) {
    const entryToKeep = orderedEntries[0]!;
    const updateResult = updateHexBuildQueueEntry(resolved.h3Index, entryToKeep.id, args.unitType, count, AI_PLAYER_ID);
    if (!updateResult.success || !updateResult.queue) {
      return reject(updateResult.reason ?? 'Failed to update primary queue entry.', resolved.h3Index);
    }
    let queueAfter = updateResult.queue;
    for (const entry of orderedEntries.slice(1)) {
      const removeResult = removeHexBuildQueueEntry(resolved.h3Index, entry.id, AI_PLAYER_ID);
      if (!removeResult.success || !removeResult.queue) {
        return reject(removeResult.reason ?? 'Failed to remove obsolete queue entry.', resolved.h3Index);
      }
      queueAfter = removeResult.queue;
    }
    return { status: 'ok', production: summarizeQueue(queueAfter, latLngByH3, maxedTypes) };
  }

  const addResult = addHexBuildQueueEntry(resolved.h3Index, AI_PLAYER_ID);
  if (!addResult.success || !addResult.queue) {
    return reject(addResult.reason ?? 'Failed to create build queue entry.', resolved.h3Index);
  }
  const newEntry = [...addResult.queue.entries].sort((a, b) => b.queueIndex - a.queueIndex)[0];
  if (!newEntry) {
    return reject('Failed to identify newly added entry.', resolved.h3Index);
  }
  const updateResult = updateHexBuildQueueEntry(resolved.h3Index, newEntry.id, args.unitType, count, AI_PLAYER_ID);
  if (!updateResult.success || !updateResult.queue) {
    return reject(updateResult.reason ?? 'Failed to set build queue entry.', resolved.h3Index);
  }
  return { status: 'ok', production: summarizeQueue(updateResult.queue, latLngByH3, maxedTypes) };
}

/**
 * Dispatches opponent production tool names onto query or queue-set handlers.
 *
 * Purpose: OpenRouter tool calls and `productionOrders` JSON share one entry so cap rejection and hex resolution stay consistent.
 * When to use: From `requestOrdersFlow` / `processProductionOrdersArray` when the production tool group is enabled.
 * Expected outcome: `{ status: 'ok' | 'error', ... }` from the named handler, or an unknown-tool error; exceptions are caught and returned as `{ status: 'error' }`.
 * Exceptions: None beyond the returned error payload.
 */
export function executeProductionTools(
  toolName: string,
  args: unknown,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('productionTools executeProductionTools', { toolName, stateTurn: state.turnNumber });
  try {
    const request = (args ?? {}) as {
      hex?: unknown;
      unitType?: unknown;
      count?: unknown;
      all?: unknown;
    };
    if (toolName === 'query_production') return queryProduction(request, state, latLngByH3, resolveToH3);
    if (toolName === 'set_build_queue') return setBuildQueue(request, latLngByH3, resolveToH3, state);
    return { status: 'error', error: `Unknown tool: ${toolName}` };
  } catch (err) {
    logError('productionTools executeProductionTools: exception', toolName, err);
    return { status: 'error', error: String(err) };
  }
}
