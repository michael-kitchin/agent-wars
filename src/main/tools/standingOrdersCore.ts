import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { MISSILE_HOLD_CANNOT_BE_CANCELLED_REASON, isMissileUnitType } from '../../shared/missileRules';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { dbRun, dbGetOne, dbGetAll, saveDatabase } from '../gameDb';
import { createPathfindingSession, executePlanRouteWithSession } from './pathfinding';
import type { LatLng } from './pathfinding';
import { terrainIsPassableForDomain } from '../pathfinding';
import type { PassableDomain } from '../pathfinding';
import { landUnitCanOccupyHex } from '../../shared/landTraversalStrategic';
import { getStrategicLandMassByH3 } from '../terrainClassificationCache';
import { logDebug, logError, logTrace } from '../logger';
import {
  parseComputedRoute,
  parseStandingOrderComputedRoute,
  parseOrderParams,
  standingOrderTypeRejectionReason,
  toComputedRoutePayload,
  STANDING_ORDER_TYPES,
  type AssignOrderParams,
  type StandingOrderRow,
} from './standingOrdersShared';
import { expireAndUpdateStatus, generateOrdersForStandingOrders } from './standingOrdersGeneration';
export { expireAndUpdateStatus, generateOrdersForStandingOrders };

/**
 * Defines the `assignOrder` function shape (function assignOrder( playerId: string, unitId: string, order: AssignOrderParams, state: GameStateSnapshot, latLngByH3: Map<string, LatLng>, r).

 * Purpose: Supports maintainability by documenting why `assignOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function assignOrder(
  playerId: string,
  unitId: string,
  order: AssignOrderParams,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('standingOrders assignOrder', { playerId, unitId, orderType: order?.type });
  const pathfindingSession = createPathfindingSession(state, latLngByH3, resolveToH3);

  const unit = state.units.find((u) => u.id === unitId);
  if (!unit || unit.player !== playerId) {
    return { status: 'error', error: `Unit not found: ${unitId}` };
  }

  const orderType = order?.type;
  if (
    !orderType ||
    !STANDING_ORDER_TYPES.includes(orderType)
  ) {
    return { status: 'error', error: 'assign_order requires order.type: defend | march | pursue | patrol | hold_fire' };
  }

  const rejection = standingOrderTypeRejectionReason(unit.unitType, orderType);
  if (rejection !== null) {
    return { status: 'error', error: rejection };
  }

  const hexSet = new Set(state.hexes.map((h) => h.h3Index));
  const terrainByH3 = new Map(state.hexes.map((h) => [h.h3Index, h.terrain]));

  // Type-specific validation
  if (orderType === 'patrol') {
    const waypoints = order.waypoints;
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      return { status: 'error', error: 'Patrol requires at least 2 waypoints' };
    }
    const domain: PassableDomain = unit.unitType === 'naval' ? 'water' : 'land';
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      if (!Array.isArray(wp) || wp.length < 2) {
        return {
          status: 'error',
          error: `Patrol waypoint ${i + 1} is not a place on the operational map (expected a briefing hex code).`,
        };
      }
      const h3 = resolveToH3(Number(wp[0]), Number(wp[1]));
      if (!h3 || !hexSet.has(h3)) {
        return {
          status: 'error',
          error: `Patrol waypoint ${i + 1} is off the operational map (coordinates do not resolve to a briefing cell).`,
        };
      }
      const terrain = terrainByH3.get(h3) ?? 'land';
      if (domain === 'land') {
        if (!landUnitCanOccupyHex(h3, getStrategicLandMassByH3())) {
          return {
            status: 'error',
            error: `Patrol waypoint ${i + 1} is impassable for ${unit.unitType} on the operational map.`,
          };
        }
      } else if (!terrainIsPassableForDomain(terrain, domain)) {
        return {
          status: 'error',
          error: `Patrol waypoint ${i + 1} is impassable for ${unit.unitType} on the operational map.`,
        };
      }
    }
  }

  if (orderType === 'pursue') {
    const targetId = order.targetUnitId;
    if (!targetId || typeof targetId !== 'string') {
      return { status: 'error', error: 'Pursue requires targetUnitId' };
    }
    const target = state.units.find((u) => u.id === targetId);
    if (!target || target.player === playerId) {
      return { status: 'error', error: `Target unit not found: ${targetId}` };
    }
  }

  if (orderType === 'march') {
    const dest = order.destination;
    if (!Array.isArray(dest) || dest.length < 2) {
      return {
        status: 'error',
        error: 'March requires destination coordinates that resolve to an on-map cell.',
      };
    }
  }

  // Replace existing order (for replacedOrder response)
  const existing = dbGetOne<StandingOrderRow>(
    'SELECT * FROM standing_orders WHERE player_id = ? AND unit_id = ?',
    [playerId, unitId]
  );
  let replacedOrder: Record<string, unknown> | null = null;
  if (existing) {
    const p = parseOrderParams(existing);
    replacedOrder = { type: existing.order_type };
    if (existing.order_type === 'march' && p.destination) replacedOrder.destination = p.destination;
    if (existing.order_type === 'defend' && p.defendHex) replacedOrder.defendHex = p.defendHex;
    if (existing.order_type === 'pursue' && p.targetUnitId) replacedOrder.targetUnitId = p.targetUnitId;
    if (existing.order_type === 'patrol' && p.waypoints) replacedOrder.waypoints = p.waypoints;
  }

  const createdTurn = state.turnNumber;
  const unitLatLng = latLngByH3.get(unit.h3Index) ?? [0, 0];
  const originHexJson = JSON.stringify(unitLatLng);
  const defaultAvoidEnemiesForPlayer = playerId !== HUMAN_SEAT_ID;

  let status = 'en_route';
  let computedRouteJson: string | null = null;
  const paramsObj: Record<string, unknown> = {
    type: orderType,
    ...(orderType === 'defend' && {
      defendHex: order.defendHex ?? unitLatLng,
      engageRange: order.engageRange,
    }),
    ...(orderType === 'march' && {
      destination: order.destination,
      avoidEnemies: order.avoidEnemies ?? defaultAvoidEnemiesForPlayer,
      engageEnRoute: order.engageEnRoute === true,
    }),
    ...(orderType === 'pursue' && {
      targetUnitId: order.targetUnitId,
      maxDistance: order.maxDistance,
    }),
    ...(orderType === 'patrol' && { waypoints: order.waypoints }),
  };

  if (orderType === 'march') {
    const dest = order.destination!;
    const destH3 = resolveToH3(dest[0], dest[1]);
    if (!destH3 || !hexSet.has(destH3)) {
      return { status: 'error', error: 'March destination is off-map or invalid' };
    }
    const unitH3 = unit.h3Index;
    if (unitH3 === destH3) {
      status = 'arrived';
      computedRouteJson = null;
    } else {
      const routeResult = executePlanRouteWithSession(
        unitId,
        [Number(dest[0]), Number(dest[1])],
        { avoidEnemies: order.avoidEnemies ?? defaultAvoidEnemiesForPlayer },
        pathfindingSession
      );
      if (routeResult.status === 'error') {
        return { status: 'error', error: routeResult.error };
      }
      computedRouteJson = JSON.stringify(toComputedRoutePayload(routeResult, unitH3));
    }
  }

  if (orderType === 'pursue') {
    const target = state.units.find((u) => u.id === order.targetUnitId)!;
    const targetLl = latLngByH3.get(target.h3Index) ?? [0, 0];
    const routeResult = executePlanRouteWithSession(
      unitId,
      targetLl,
      { avoidEnemies: true },
      pathfindingSession
    );
    if (routeResult.status === 'error') {
      return { status: 'error', error: routeResult.error };
    }
    computedRouteJson = JSON.stringify(toComputedRoutePayload(routeResult, unit.h3Index));
  }

  if (orderType === 'patrol') {
    status = 'patrolling';
    computedRouteJson = JSON.stringify({ waypointIndex: 0 });
  }

  if (orderType === 'defend') {
    const defendHex = paramsObj.defendHex as [number, number] | undefined;
    const defendH3 =
      defendHex && defendHex.length >= 2 ? resolveToH3(Number(defendHex[0]), Number(defendHex[1])) : undefined;
    status = unit.unitType === 'air' || (defendH3 !== undefined && unit.h3Index === defendH3) ? 'holding' : 'en_route';
  }

  if (orderType === 'hold_fire') {
    status = 'holding';
  }

  const shouldPersistStandingOrder = !(orderType === 'march' && status === 'arrived');
  if (shouldPersistStandingOrder) {
    dbRun(
      `INSERT OR REPLACE INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        playerId,
        unitId,
        orderType,
        JSON.stringify(paramsObj),
        computedRouteJson,
        status,
        createdTurn,
        originHexJson,
      ]
    );
  } else {
    // March orders are one-time objectives; drop immediately if the unit is already there.
    dbRun('DELETE FROM standing_orders WHERE player_id = ? AND unit_id = ?', [playerId, unitId]);
    logDebug('standingOrders assignOrder: dropped arrived march order', { playerId, unitId });
  }
  saveDatabase();

  const responseOrder: Record<string, unknown> = {
    type: orderType,
    ...(orderType === 'march' && {
      destination: order.destination,
      avoidEnemies: paramsObj.avoidEnemies,
      engageEnRoute: paramsObj.engageEnRoute,
    }),
    ...(orderType === 'defend' && {
      defendHex: paramsObj.defendHex,
      engageRange: paramsObj.engageRange,
    }),
    ...(orderType === 'pursue' && {
      targetUnitId: order.targetUnitId,
      maxDistance: order.maxDistance,
    }),
    ...(orderType === 'patrol' && { waypoints: order.waypoints }),
  };

  if (computedRouteJson) {
    responseOrder.computedRoute = parseComputedRoute({ computed_route: computedRouteJson });
  }

  return {
    status: 'ok',
    error: null,
    unitId,
    order: responseOrder,
    replacedOrder,
  };
}

/**
 * Defines the `queryOrders` function shape (function queryOrders(playerId: string, unitId?: string, all?: boolean): Record<string, unknown> { logTrace('standingOrders queryOrders', { playerId, uni).

 * Purpose: Supports maintainability by documenting why `queryOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function queryOrders(playerId: string, unitId?: string, all?: boolean): Record<string, unknown> {
  logTrace('standingOrders queryOrders', { playerId, unitId, all });

  if (unitId === undefined && all !== true) {
    return { status: 'error', error: 'query_orders requires unitId or all (true)' };
  }

  if (unitId !== undefined) {
    const row = dbGetOne<StandingOrderRow>(
      'SELECT * FROM standing_orders WHERE player_id = ? AND unit_id = ?',
      [playerId, unitId]
    );
    if (!row) {
      return { status: 'error', error: `No standing order found for unit ${unitId}` };
    }
    const orders = [rowToOrderResponse(row)];
    return { status: 'ok', error: null, orders };
  }

  const rows = dbGetAll<StandingOrderRow>(
    'SELECT * FROM standing_orders WHERE player_id = ? ORDER BY unit_id',
    [playerId]
  );
  const orders = rows.map(rowToOrderResponse);
  return { status: 'ok', error: null, orders };
}

/**
 * Defines the `rowToOrderResponse` function shape (function rowToOrderResponse(row: StandingOrderRow): Record<string, unknown>).

 * Purpose: Supports maintainability by documenting why `rowToOrderResponse` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function rowToOrderResponse(row: StandingOrderRow): Record<string, unknown> {
  const params = parseOrderParams(row);
  const computed = parseStandingOrderComputedRoute(row);
  const turnsRemaining = computed?.turnsRemaining ?? 0;
  const nextMoveHex = computed?.nextMoveHex ?? null;
  return {
    unitId: row.unit_id,
    type: row.order_type,
    status: row.status,
    turnsRemaining,
    nextMoveHex,
    ...(computed?.cachedOriginH3 && { cachedOriginH3: computed.cachedOriginH3 }),
    ...(computed?.cachedRouteSegments?.length && { cachedRouteSegments: computed.cachedRouteSegments }),
    ...(row.order_type === 'march' && { destination: params.destination }),
    ...(row.order_type === 'defend' && {
      defendHex: params.defendHex,
      engageRange: params.engageRange,
    }),
    ...(row.order_type === 'pursue' && { targetUnitId: params.targetUnitId }),
    ...(row.order_type === 'patrol' && { waypoints: params.waypoints }),
  };
}

/**
 * Defines the `cancelOrder` function shape (function cancelOrder(playerId: string, unitId: string): Record<string, unknown> { logDebug('standingOrders cancelOrder', { playerId, unitId }); con).

 * Purpose: Supports maintainability by documenting why `cancelOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function cancelOrder(playerId: string, unitId: string): Record<string, unknown> {
  logDebug('standingOrders cancelOrder', { playerId, unitId });

  const row = dbGetOne<StandingOrderRow>(
    'SELECT * FROM standing_orders WHERE player_id = ? AND unit_id = ?',
    [playerId, unitId]
  );
  if (!row) {
    return { status: 'error', error: `No standing order found for unit ${unitId}` };
  }
  const unitType = dbGetOne<{ unit_type: string }>('SELECT unit_type FROM units WHERE id = ?', [unitId]);
  if (unitType && isMissileUnitType(unitType.unit_type)) {
    return { status: 'error', error: MISSILE_HOLD_CANNOT_BE_CANCELLED_REASON };
  }
  const previousOrder: Record<string, unknown> = { type: row.order_type };
  const p = parseOrderParams(row);
  if (p.destination) previousOrder.destination = p.destination;
  if (p.defendHex) previousOrder.defendHex = p.defendHex;
  if (p.targetUnitId) previousOrder.targetUnitId = p.targetUnitId;
  if (p.waypoints) previousOrder.waypoints = p.waypoints;
  dbRun('DELETE FROM standing_orders WHERE player_id = ? AND unit_id = ?', [playerId, unitId]);
  saveDatabase();
  return {
    status: 'ok',
    error: null,
    unitId,
    cancelled: true,
    previousOrder,
  };
}

/**
 * Reads one unit's standing order for assessments and the briefing.
 *
 * Purpose: Unit Status and the receding check need the stored goal and this turn's next step without opening the database themselves.
 * When to use: After `expireAndUpdateStatus` has refreshed defend routes.
 * Expected outcome: The order type, status, and any stored destination, defend post, waypoints, or pursue target. `nextMoveHex` is set only when the stored route has a real next center.
 * Exceptions: None. A missing row returns null.
 */
export function getStandingOrderForUnit(
  playerId: string,
  unitId: string
): {
  type: string;
  destination?: [number, number];
  defendHex?: [number, number];
  waypoints?: [number, number][];
  status: string;
  targetUnitId?: string;
  /**
   * The next cell this order will enter, as a lat/lng center.
   *
   * Contract: Present when `computed_route.nextMoveHex` is a real center. Absent for a dummy `[0, 0]` or a row with no route.
   * When to use: Receding checks that compare this turn's step rather than the order's final goal.
   * Expected outcome: The stored center, or omitted.
   * Exceptions: None.
   */
  nextMoveHex?: [number, number];
} | null {
  logTrace('standingOrders getStandingOrderForUnit', { playerId, unitId });
  const row = dbGetOne<StandingOrderRow>(
    'SELECT * FROM standing_orders WHERE player_id = ? AND unit_id = ?',
    [playerId, unitId]
  );
  if (!row) return null;
  const params = parseOrderParams(row);
  const out: {
    type: string;
    destination?: [number, number];
    defendHex?: [number, number];
    waypoints?: [number, number][];
    status: string;
    targetUnitId?: string;
    nextMoveHex?: [number, number];
  } = {
    type: row.order_type,
    status: row.status,
  };
  if (row.order_type === 'march' && params.destination) out.destination = params.destination as [number, number];
  if (row.order_type === 'defend' && params.defendHex) out.defendHex = params.defendHex as [number, number];
  const computedRoute = parseStandingOrderComputedRoute(row);
  if (computedRoute) {
    const [lat, lng] = computedRoute.nextMoveHex;
    if (!(lat === 0 && lng === 0)) out.nextMoveHex = computedRoute.nextMoveHex;
  }
  if (row.order_type === 'patrol' && params.waypoints) out.waypoints = params.waypoints as [number, number][];
  if (row.order_type === 'pursue' && params.targetUnitId) out.targetUnitId = String(params.targetUnitId);
  return out;
}

/**
 * Defines the `executeStandingOrderActionForPlayer` function shape (export function executeStandingOrderActionForPlayer( playerId: string, toolName: 'assign_order' | 'query_orders' | 'cancel_order', args: unknown, st).

 * Purpose: Supports maintainability by documenting why `executeStandingOrderActionForPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function executeStandingOrderActionForPlayer(
  playerId: string,
  toolName: 'assign_order' | 'query_orders' | 'cancel_order',
  args: unknown,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('standingOrders executeStandingOrderActionForPlayer', { playerId, toolName, stateTurn: state.turnNumber });
  try {
    if (toolName === 'assign_order') {
      const a = args as { unitId?: string; order?: AssignOrderParams };
      if (typeof a?.unitId !== 'string') {
        return { status: 'error', error: 'assign_order requires unitId (string)' };
      }
      if (!a?.order || typeof a.order !== 'object') {
        return { status: 'error', error: 'assign_order requires order (object with type)' };
      }
      return assignOrder(
        playerId,
        a.unitId,
        a.order as AssignOrderParams,
        state,
        latLngByH3,
        resolveToH3
      );
    }
    if (toolName === 'query_orders') {
      const a = args as { unitId?: string; all?: boolean };
      return queryOrders(playerId, a?.unitId, a?.all === true);
    }
    const a = args as { unitId?: string };
    if (typeof a?.unitId !== 'string') {
      return { status: 'error', error: 'cancel_order requires unitId (string)' };
    }
    return cancelOrder(playerId, a.unitId);
  } catch (err) {
    logError('standingOrders executeStandingOrderActionForPlayer: exception', playerId, toolName, err);
    return { status: 'error', error: String(err) };
  }
}
