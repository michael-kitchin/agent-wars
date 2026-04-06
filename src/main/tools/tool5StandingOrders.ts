/**
 * MCP Tool 5: Standing Orders (assign_order, query_orders, cancel_order).
 * Thin facade that keeps public contracts stable while delegating core standing-order logic
 * to `tool5StandingOrdersCore` for maintainability.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { LatLng } from './tool1Pathfinding';
import { logDebug, logTrace } from '../logger';
import {
  executeStandingOrderActionForPlayer,
  expireAndUpdateStatus,
  generateOrdersForStandingOrders,
  getInjectionText,
  getStandingOrderForUnit,
} from './tool5StandingOrdersCore';

const AI_PLAYER_ID = 'opponent';
const HUMAN_PLAYER_ID = 'human';

export {
  executeStandingOrderActionForPlayer,
  expireAndUpdateStatus,
  generateOrdersForStandingOrders,
  getInjectionText,
  getStandingOrderForUnit,
};

/** Read-only API tool names; assign_order/cancel_order are applied via final JSON orders[] only. */
export const TOOL5_NAMES = ['query_orders'] as const;

/**
 * Why this exists:
 *     Dedicated helper for renderer-driven human march assignment without exposing player id at callsites.
 * When to use:
 *     IPC handlers that set human long-distance movement orders.
 * What to expect:
 *     Applies march standing order for `human`; returns status payload from shared standing-order logic.
 */
export function assignHumanMarchStandingOrder(
  unitId: string,
  destination: [number, number],
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('tool5StandingOrders assignHumanMarchStandingOrder', { unitId, destination });
  return executeStandingOrderActionForPlayer(
    HUMAN_PLAYER_ID,
    'assign_order',
    { unitId, order: { type: 'march', destination } },
    state,
    latLngByH3,
    resolveToH3
  );
}

/**
 * Why this exists:
 *     Read-only getter for human standing orders used by renderer order list.
 * When to use:
 *     IPC handler that refreshes movement-order list overlays during planning.
 * What to expect:
 *     Returns `orders` array in the same normalized shape as query_orders.
 */
export function queryHumanStandingOrders(
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logTrace('tool5StandingOrders queryHumanStandingOrders');
  return executeStandingOrderActionForPlayer(HUMAN_PLAYER_ID, 'query_orders', { all: true }, state, latLngByH3, resolveToH3);
}

/**
 * Why this exists:
 *     Dedicated helper for per-unit cancel from renderer movement-order list.
 * When to use:
 *     IPC handler for human order cancellation.
 * What to expect:
 *     Returns status payload and removes only the specified human unit order when present.
 */
export function cancelHumanStandingOrder(
  unitId: string,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('tool5StandingOrders cancelHumanStandingOrder', { unitId });
  return executeStandingOrderActionForPlayer(HUMAN_PLAYER_ID, 'cancel_order', { unitId }, state, latLngByH3, resolveToH3);
}

/**
 * Dispatcher for Tool 5: query_orders for the model; assign_order/cancel_order are still invoked internally when applying final JSON orders[].
 * Returns a spec-shaped object (e.g. status/order/unitId) or { status: 'error', error: string }; exceptions are caught and returned as error.
 */
export function executeTool5(
  toolName: string,
  args: unknown,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('tool5StandingOrders executeTool5', { toolName, stateTurn: state.turnNumber });
  if (toolName !== 'assign_order' && toolName !== 'query_orders' && toolName !== 'cancel_order') {
    return { status: 'error', error: `Unknown tool: ${toolName}` };
  }
  return executeStandingOrderActionForPlayer(AI_PLAYER_ID, toolName, args, state, latLngByH3, resolveToH3);
}
