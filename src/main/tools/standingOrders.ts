/**
 * Standing-order tools (`assign_order`, `query_orders`, `cancel_order`).
 * Thin facade that keeps public contracts stable while delegating core standing-order logic
 * to `standingOrdersCore` and the prompt status block to `standingOrdersInjectionText`.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { AiSeatId } from '../../shared/seatIds';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import type { LatLng } from './pathfinding';
import { logDebug, logTrace } from '../logger';
import {
  executeStandingOrderActionForPlayer,
  expireAndUpdateStatus,
  generateOrdersForStandingOrders,
  getStandingOrderForUnit,
} from './standingOrdersCore';
import { getInjectionText } from './standingOrdersInjectionText';
import { holdFireUnitIdsForPlayer } from './standingOrdersGeneration';

export {
  executeStandingOrderActionForPlayer,
  expireAndUpdateStatus,
  generateOrdersForStandingOrders,
  getInjectionText,
  getStandingOrderForUnit,
  holdFireUnitIdsForPlayer,
};
export type { GenerateStandingOrdersOptions } from './standingOrdersGeneration';

/**
 * Documents the module-scope binding `STANDING_ORDER_TOOL_NAMES` (STANDING_ORDER_TOOL_NAMES).

 * Purpose: Supports maintainability by documenting why `STANDING_ORDER_TOOL_NAMES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const STANDING_ORDER_TOOL_NAMES = ['query_orders'] as const;

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
  logDebug('standingOrders assignHumanMarchStandingOrder', { unitId, destination });
  return executeStandingOrderActionForPlayer(
    HUMAN_SEAT_ID,
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
  logTrace('standingOrders queryHumanStandingOrders');
  return executeStandingOrderActionForPlayer(HUMAN_SEAT_ID, 'query_orders', { all: true }, state, latLngByH3, resolveToH3);
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
  logDebug('standingOrders cancelHumanStandingOrder', { unitId });
  return executeStandingOrderActionForPlayer(HUMAN_SEAT_ID, 'cancel_order', { unitId }, state, latLngByH3, resolveToH3);
}

/**
 * Defines the `executeStandingOrders` function shape (export function executeStandingOrders( toolName: string, args: unknown, state: GameStateSnapshot, latLngByH3: Map<string, LatLng>, resolveToH3: (lat: numb).

 * Purpose: Supports maintainability by documenting why `executeStandingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function executeStandingOrders(
  seatId: AiSeatId,
  toolName: string,
  args: unknown,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('standingOrders executeStandingOrders', { seatId, toolName, stateTurn: state.turnNumber });
  if (toolName !== 'assign_order' && toolName !== 'query_orders' && toolName !== 'cancel_order') {
    return { status: 'error', error: `Unknown tool: ${toolName}` };
  }
  return executeStandingOrderActionForPlayer(seatId, toolName, args, state, latLngByH3, resolveToH3);
}
