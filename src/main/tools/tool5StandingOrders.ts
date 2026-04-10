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

/**
 * Documents the module-scope binding `AI_PLAYER_ID` (AI_PLAYER_ID).

 * Purpose: Supports maintainability by documenting why `AI_PLAYER_ID` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const AI_PLAYER_ID = 'opponent';
/**
 * Documents the module-scope binding `HUMAN_PLAYER_ID` (HUMAN_PLAYER_ID).

 * Purpose: Supports maintainability by documenting why `HUMAN_PLAYER_ID` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const HUMAN_PLAYER_ID = 'human';

export {
  executeStandingOrderActionForPlayer,
  expireAndUpdateStatus,
  generateOrdersForStandingOrders,
  getInjectionText,
  getStandingOrderForUnit,
};

/**
 * Documents the module-scope binding `TOOL5_NAMES` (TOOL5_NAMES).

 * Purpose: Supports maintainability by documenting why `TOOL5_NAMES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const TOOL5_NAMES = ['query_orders'] as const;

/**
 * Defines the `assignHumanMarchStandingOrder` function shape (export function assignHumanMarchStandingOrder( unitId: string, destination: [number, number], state: GameStateSnapshot, latLngByH3: Map<string, LatL).

 * Purpose: Supports maintainability by documenting why `assignHumanMarchStandingOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Defines the `queryHumanStandingOrders` function shape (export function queryHumanStandingOrders( state: GameStateSnapshot, latLngByH3: Map<string, LatLng>, resolveToH3: (lat: number, lng: number) => string).

 * Purpose: Supports maintainability by documenting why `queryHumanStandingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Defines the `cancelHumanStandingOrder` function shape (export function cancelHumanStandingOrder( unitId: string, state: GameStateSnapshot, latLngByH3: Map<string, LatLng>, resolveToH3: (lat: number, lng:).

 * Purpose: Supports maintainability by documenting why `cancelHumanStandingOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Defines the `executeTool5` function shape (export function executeTool5( toolName: string, args: unknown, state: GameStateSnapshot, latLngByH3: Map<string, LatLng>, resolveToH3: (lat: numb).

 * Purpose: Supports maintainability by documenting why `executeTool5` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
