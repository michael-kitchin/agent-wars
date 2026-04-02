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

const AI_PLAYER_ID = 'opponent';

const TOOL6_NAME_LIST = ['query_production', 'add_build_entry', 'update_build_entry', 'remove_build_entry'] as const;
export const TOOL6_NAMES = TOOL6_NAME_LIST;

function roundCoordinate(value: number): number {
  return Number(value.toFixed(LATLNG_DECIMAL_PLACES));
}

function toDisplayLatLng(ll: [number, number]): [number, number] {
  return [roundCoordinate(ll[0]), roundCoordinate(ll[1])];
}

function isBuildUnitType(value: unknown): value is BuildUnitType {
  return value === 'infantry' || value === 'armor' || value === 'naval';
}

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

function summarizeQueue(queue: HexBuildQueueView, latLngByH3: Map<string, LatLng>): Record<string, unknown> {
  const ll = latLngByH3.get(queue.h3Index);
  return {
    hex: ll ? toDisplayLatLng(ll) : null,
    controllerPlayerId: queue.controllerPlayerId,
    controlledByRequester: queue.controlledByRequester,
    urbanHexCount: queue.urbanHexCount,
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

function queryProduction(
  args: { hex?: unknown; all?: unknown },
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logTrace('tool6Production queryProduction', { hasHex: args.hex !== undefined, all: args.all === true });
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

function addBuildEntry(
  args: { hex?: unknown; unitType?: unknown; count?: unknown },
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  const resolved = resolveHexArgument(args, resolveToH3);
  if (!resolved.ok) return { status: 'error', error: resolved.error };
  if (!isBuildUnitType(args.unitType)) {
    return { status: 'error', error: 'add_build_entry requires unitType (infantry|armor|naval).' };
  }
  const count = Number(args.count);
  if (!isValidBuildCount(count)) {
    return {
      status: 'error',
      error: `add_build_entry count must be an integer from ${BUILD_ENTRY_MIN_COUNT} to ${BUILD_ENTRY_MAX_COUNT}.`,
    };
  }

  const addResult = addHexBuildQueueEntry(resolved.h3Index, AI_PLAYER_ID);
  if (!addResult.success || !addResult.queue) {
    return { status: 'error', error: addResult.reason ?? 'Failed to add build queue entry.' };
  }
  const newEntry = [...addResult.queue.entries].sort((a, b) => b.queueIndex - a.queueIndex)[0];
  if (!newEntry) {
    return { status: 'error', error: 'Failed to identify newly added entry.' };
  }
  const updateResult = updateHexBuildQueueEntry(resolved.h3Index, newEntry.id, args.unitType, count, AI_PLAYER_ID);
  if (!updateResult.success || !updateResult.queue) {
    removeHexBuildQueueEntry(resolved.h3Index, newEntry.id, AI_PLAYER_ID);
    return { status: 'error', error: updateResult.reason ?? 'Failed to apply build entry specifics.' };
  }
  return { status: 'ok', production: summarizeQueue(updateResult.queue, latLngByH3) };
}

function updateBuildEntry(
  args: { hex?: unknown; entryId?: unknown; unitType?: unknown; count?: unknown },
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  const resolved = resolveHexArgument(args, resolveToH3);
  if (!resolved.ok) return { status: 'error', error: resolved.error };
  if (!Number.isInteger(args.entryId) || Number(args.entryId) <= 0) {
    return { status: 'error', error: 'update_build_entry requires positive integer entryId.' };
  }
  if (!isBuildUnitType(args.unitType)) {
    return { status: 'error', error: 'update_build_entry requires unitType (infantry|armor|naval).' };
  }
  const count = Number(args.count);
  if (!isValidBuildCount(count)) {
    return {
      status: 'error',
      error: `update_build_entry count must be an integer from ${BUILD_ENTRY_MIN_COUNT} to ${BUILD_ENTRY_MAX_COUNT}.`,
    };
  }
  const result = updateHexBuildQueueEntry(resolved.h3Index, Number(args.entryId), args.unitType, count, AI_PLAYER_ID);
  if (!result.success || !result.queue) {
    return { status: 'error', error: result.reason ?? 'Failed to update build queue entry.' };
  }
  return { status: 'ok', production: summarizeQueue(result.queue, latLngByH3) };
}

function removeBuildEntry(
  args: { hex?: unknown; entryId?: unknown },
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  const resolved = resolveHexArgument(args, resolveToH3);
  if (!resolved.ok) return { status: 'error', error: resolved.error };
  if (!Number.isInteger(args.entryId) || Number(args.entryId) <= 0) {
    return { status: 'error', error: 'remove_build_entry requires positive integer entryId.' };
  }
  const result = removeHexBuildQueueEntry(resolved.h3Index, Number(args.entryId), AI_PLAYER_ID);
  if (!result.success || !result.queue) {
    return { status: 'error', error: result.reason ?? 'Failed to remove build queue entry.' };
  }
  return { status: 'ok', production: summarizeQueue(result.queue, latLngByH3) };
}

/**
 * Why this exists:
 *     Central dispatcher for production tool operations so OpenRouter can enforce one stable contract.
 * When to use:
 *     OpenRouter tool-call loop and JSON productionOrders application.
 * What to expect:
 *     Returns `{status:'ok'}` with sanitized production snapshots or `{status:'error', error}` on validation/mutation failures.
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
      entryId?: unknown;
      unitType?: unknown;
      count?: unknown;
      all?: unknown;
    };
    if (toolName === 'query_production') return queryProduction(request, state, latLngByH3, resolveToH3);
    if (toolName === 'add_build_entry') return addBuildEntry(request, latLngByH3, resolveToH3);
    if (toolName === 'update_build_entry') return updateBuildEntry(request, latLngByH3, resolveToH3);
    if (toolName === 'remove_build_entry') return removeBuildEntry(request, latLngByH3, resolveToH3);
    return { status: 'error', error: `Unknown tool: ${toolName}` };
  } catch (err) {
    logError('tool6Production executeTool6: exception', toolName, err);
    return { status: 'error', error: String(err) };
  }
}
