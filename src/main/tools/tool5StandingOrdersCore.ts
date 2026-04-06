import { gridDistance } from 'h3-js';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { dbRun, dbGetOne, dbGetAll, saveDatabase } from '../gameDb';
import { getRange } from '../combatConstants';
import { createPathfindingSession, executePlanRouteWithSession } from './tool1Pathfinding';
import type { LatLng } from './tool1Pathfinding';
import { terrainIsPassableForDomain } from '../pathfinding';
import type { PassableDomain } from '../pathfinding';
import { LATLNG_DECIMAL_PLACES } from '../mapData';
import { logDebug, logError, logTrace } from '../logger';
import {
  parseComputedRoute,
  parseOrderParams,
  toComputedRoutePayload,
  type AssignOrderParams,
  type StandingOrderRow,
} from './tool5StandingOrdersShared';
export { expireAndUpdateStatus, generateOrdersForStandingOrders } from './tool5StandingOrdersGeneration';

/** Status values that trigger the ⚠ warning prefix in the injection. */
const WARNING_STATUSES = new Set([
  'blocked',
  'target_lost',
  'target_out_of_range',
  'target_destroyed',
  'arrived',
  'contact',
]);

/**
 * Validates and persists a standing order for a unit. Uses Tool 1 (executePlanRoute) for march and pursue.
 * Returns spec-shaped response with computedRoute for march/pursue, or error. New orders take effect next turn.
 */
function assignOrder(
  playerId: string,
  unitId: string,
  order: AssignOrderParams,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('tool5StandingOrders assignOrder', { playerId, unitId, orderType: order?.type });
  const pathfindingSession = createPathfindingSession(state, latLngByH3, resolveToH3);

  const unit = state.units.find((u) => u.id === unitId);
  if (!unit || unit.player !== playerId) {
    return { status: 'error', error: `Unit not found: ${unitId}` };
  }

  const orderType = order?.type;
  if (
    !orderType ||
    !['defend', 'march', 'pursue', 'patrol', 'hold_fire'].includes(orderType)
  ) {
    return { status: 'error', error: 'assign_order requires order.type: defend | march | pursue | patrol | hold_fire' };
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
      if (!Array.isArray(wp) || wp.length < 2) continue;
      const h3 = resolveToH3(Number(wp[0]), Number(wp[1]));
      if (!h3 || !hexSet.has(h3)) {
        return { status: 'error', error: `Waypoint [${wp[0]}, ${wp[1]}] is off-map` };
      }
      const terrain = terrainByH3.get(h3) ?? 'land';
      if (!terrainIsPassableForDomain(terrain, domain)) {
        return { status: 'error', error: `Waypoint [${wp[0]}, ${wp[1]}] is impassable for ${unit.unitType}` };
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
      return { status: 'error', error: 'March requires destination as [lat, lng]' };
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
  const defaultAvoidEnemiesForPlayer = playerId !== 'human';

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
      computedRouteJson = JSON.stringify(toComputedRoutePayload(routeResult));
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
    computedRouteJson = JSON.stringify(toComputedRoutePayload(routeResult));
  }

  if (orderType === 'patrol') {
    status = 'patrolling';
    computedRouteJson = JSON.stringify({ waypointIndex: 0 });
  }

  if (orderType === 'defend') {
    status = 'holding';
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
    logDebug('tool5StandingOrders assignOrder: dropped arrived march order', { playerId, unitId });
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
 * Returns standing orders for a unit or all units for the player. Requires unitId or all === true.
 */
function queryOrders(playerId: string, unitId?: string, all?: boolean): Record<string, unknown> {
  logTrace('tool5StandingOrders queryOrders', { playerId, unitId, all });

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

function rowToOrderResponse(row: StandingOrderRow): Record<string, unknown> {
  const params = parseOrderParams(row);
  const computed = parseComputedRoute(row);
  const turnsRemaining = computed?.turnsRemaining ?? 0;
  const nextMoveHex = computed?.nextMoveHex ?? null;
  return {
    unitId: row.unit_id,
    type: row.order_type,
    status: row.status,
    turnsRemaining,
    nextMoveHex,
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
 * Cancels the standing order for a unit. Returns error if the unit has no standing order.
 */
function cancelOrder(playerId: string, unitId: string): Record<string, unknown> {
  logDebug('tool5StandingOrders cancelOrder', { playerId, unitId });

  const row = dbGetOne<StandingOrderRow>(
    'SELECT * FROM standing_orders WHERE player_id = ? AND unit_id = ?',
    [playerId, unitId]
  );
  if (!row) {
    return { status: 'error', error: `No standing order found for unit ${unitId}` };
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
 * Returns the current standing order for a unit for use in assess_unit (Tool 2). Null if the unit has no standing order.
 * Use to populate currentStandingOrder in the unit assessment response.
 */
export function getStandingOrderForUnit(
  playerId: string,
  unitId: string
): { type: string; destination?: [number, number]; defendHex?: [number, number]; waypoints?: [number, number][]; status: string } | null {
  logTrace('tool5StandingOrders getStandingOrderForUnit', { playerId, unitId });
  const row = dbGetOne<StandingOrderRow>(
    'SELECT * FROM standing_orders WHERE player_id = ? AND unit_id = ?',
    [playerId, unitId]
  );
  if (!row) return null;
  const params = parseOrderParams(row);
  const out: { type: string; destination?: [number, number]; defendHex?: [number, number]; waypoints?: [number, number][]; status: string } = {
    type: row.order_type,
    status: row.status,
  };
  if (row.order_type === 'march' && params.destination) out.destination = params.destination as [number, number];
  if (row.order_type === 'defend' && params.defendHex) out.defendHex = params.defendHex as [number, number];
  if (row.order_type === 'patrol' && params.waypoints) out.waypoints = params.waypoints as [number, number][];
  return out;
}

/**
 * Builds the standing order status injection block for the system prompt (bullets per unit, footer).
 * Call only when Orders tool group is enabled. Injection reflects DB state (call after expire/generate if status should be current).
 */
export function getInjectionText(playerId: string, state: GameStateSnapshot): string {
  logTrace('tool5StandingOrders getInjectionText', { playerId, turnNumber: state.turnNumber });

  const rows = dbGetAll<StandingOrderRow>(
    'SELECT * FROM standing_orders WHERE player_id = ? ORDER BY unit_id',
    [playerId]
  );
  const aiUnitIds = state.units.filter((u) => u.player === playerId).map((u) => u.id);
  const unitIdsWithOrders = new Set(rows.map((r) => r.unit_id));
  const unitIdsWithoutOrders = aiUnitIds.filter((id) => !unitIdsWithOrders.has(id));

  const lines: string[] = [];
  lines.push(`=== STANDING ORDER STATUS (Turn ${state.turnNumber}) ===`);
  for (const row of rows) {
    if (!aiUnitIds.includes(row.unit_id)) continue;
    const params = parseOrderParams(row);
    const computed = parseComputedRoute(row);
    const nextMove = computed?.nextMoveHex;
    const turnsRemaining = Number(computed?.turnsRemaining ?? 0);
    let bullet = `- ${row.unit_id}: ${row.order_type.toUpperCase()}`;
    if (row.order_type === 'march' && params.destination) {
      const d = params.destination as [number, number];
      bullet += ` to [${d[0].toFixed(LATLNG_DECIMAL_PLACES)}, ${d[1].toFixed(LATLNG_DECIMAL_PLACES)}]`;
    }
    if (row.order_type === 'defend' && params.defendHex) {
      const d = params.defendHex as [number, number];
      bullet += ` [${d[0].toFixed(LATLNG_DECIMAL_PLACES)}, ${d[1].toFixed(LATLNG_DECIMAL_PLACES)}]`;
    }
    if (row.order_type === 'pursue' && params.targetUnitId) {
      bullet += ` ${params.targetUnitId}`;
    }
    bullet += ` - ${row.status}`;
    if (turnsRemaining > 0 && nextMove) {
      const ll = nextMove as [number, number];
      bullet += `, ${turnsRemaining} turns remaining, next move to [${ll[0].toFixed(LATLNG_DECIMAL_PLACES)}, ${ll[1].toFixed(LATLNG_DECIMAL_PLACES)}]`;
    }
    if (WARNING_STATUSES.has(row.status)) {
      bullet = '⚠ ' + bullet;
    }
    lines.push(bullet);
  }
  if (aiUnitIds.length === 0) {
    lines.push('No opponent units remain.');
  } else if (unitIdsWithoutOrders.length > 0) {
    lines.push(`Units without standing orders: ${unitIdsWithoutOrders.join(', ')}`);
  } else {
    lines.push('All units have standing orders.');
  }
  return lines.join('\n');
}

/**
 * Why this exists:
 *     Provides a player-scoped standing-order operation entrypoint so renderer-driven human orders can reuse
 *     the same validation, routing, and persistence logic as AI orders.
 * When to use:
 *     Main-process IPC handlers for human order assign/query/cancel and internal AI order application paths.
 * What to expect:
 *     Returns spec-shaped status payloads; validation failures return `{ status: 'error', error }`.
 */
export function executeStandingOrderActionForPlayer(
  playerId: string,
  toolName: 'assign_order' | 'query_orders' | 'cancel_order',
  args: unknown,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('tool5StandingOrders executeStandingOrderActionForPlayer', { playerId, toolName, stateTurn: state.turnNumber });
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
    logError('tool5StandingOrders executeStandingOrderActionForPlayer: exception', playerId, toolName, err);
    return { status: 'error', error: String(err) };
  }
}
