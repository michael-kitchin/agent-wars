/**
 * MCP Tool 5: Standing Orders (assign_order, query_orders, cancel_order).
 * All standing-order logic lives here: CRUD, status update, order generation, and injection text.
 * Uses gameDb (dbRun, dbGetOne, dbGetAll, saveDatabase) for persistence. Route computation uses Tool 1 (executePlanRoute).
 */

import { cellToLatLng, gridDistance } from 'h3-js';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { dbRun, dbGetOne, dbGetAll, saveDatabase } from '../gameDb';
import { getRange } from '../combatConstants';
import { executePlanRoute } from './tool1Pathfinding';
import type { LatLng } from './tool1Pathfinding';
import { terrainIsPassableForDomain } from '../pathfinding';
import type { PassableDomain } from '../pathfinding';
import { LATLNG_DECIMAL_PLACES } from '../mapData';
import { logDebug, logError, logTrace } from '../logger';

const AI_PLAYER_ID = 'opponent';
const HUMAN_PLAYER_ID = 'human';

/** Status values that trigger the ⚠ warning prefix in the injection. */
const WARNING_STATUSES = new Set([
  'blocked',
  'target_lost',
  'target_out_of_range',
  'target_destroyed',
  'arrived',
  'contact',
]);

interface StandingOrderRow extends Record<string, unknown> {
  player_id: string;
  unit_id: string;
  order_type: string;
  params: string;
  computed_route: string | null;
  status: string;
  created_turn: number;
  origin_hex: string;
}

/** Order params as received from the LLM (assign_order). */
interface AssignOrderParams {
  type: 'defend' | 'march' | 'pursue' | 'patrol' | 'hold_fire';
  defendHex?: [number, number];
  engageRange?: number;
  destination?: [number, number];
  avoidEnemies?: boolean;
  engageEnRoute?: boolean;
  targetUnitId?: string;
  maxDistance?: number;
  waypoints?: [number, number][];
}

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
    try {
      const p = JSON.parse(existing.params) as Record<string, unknown>;
      replacedOrder = { type: existing.order_type };
      if (existing.order_type === 'march' && p.destination) replacedOrder.destination = p.destination;
      if (existing.order_type === 'defend' && p.defendHex) replacedOrder.defendHex = p.defendHex;
      if (existing.order_type === 'pursue' && p.targetUnitId) replacedOrder.targetUnitId = p.targetUnitId;
      if (existing.order_type === 'patrol' && p.waypoints) replacedOrder.waypoints = p.waypoints;
    } catch {
      replacedOrder = { type: existing.order_type };
    }
  }

  const createdTurn = state.turnNumber;
  const unitLatLng = latLngByH3.get(unit.h3Index) ?? [0, 0];
  const originHexJson = JSON.stringify(unitLatLng);

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
      avoidEnemies: order.avoidEnemies !== false,
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
      const routeResult = executePlanRoute(
        unitId,
        [Number(dest[0]), Number(dest[1])],
        { avoidEnemies: order.avoidEnemies !== false },
        state,
        latLngByH3,
        resolveToH3
      );
      if (routeResult.status === 'error') {
        return { status: 'error', error: routeResult.error };
      }
      const path = routeResult.path;
      const totalPath = path.flatMap((seg) => seg.hexes);
      const lastHex = path.length > 0 ? path[path.length - 1]!.endHex : routeResult.destination;
      computedRouteJson = JSON.stringify({
        turnsRemaining: routeResult.turnsRequired,
        nextMoveHex: path.length > 0 ? path[0]!.endHex : lastHex,
        totalPath,
      });
    }
  }

  if (orderType === 'pursue') {
    const target = state.units.find((u) => u.id === order.targetUnitId)!;
    const targetLl = latLngByH3.get(target.h3Index) ?? [0, 0];
    const routeResult = executePlanRoute(
      unitId,
      targetLl,
      { avoidEnemies: true },
      state,
      latLngByH3,
      resolveToH3
    );
    if (routeResult.status === 'error') {
      return { status: 'error', error: routeResult.error };
    }
    const path = routeResult.path;
    const totalPath = path.flatMap((seg) => seg.hexes);
    computedRouteJson = JSON.stringify({
      turnsRemaining: routeResult.turnsRequired,
      nextMoveHex: path.length > 0 ? path[0]!.endHex : routeResult.destination,
      totalPath,
    });
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
    try {
      responseOrder.computedRoute = JSON.parse(computedRouteJson);
    } catch {
      responseOrder.computedRoute = null;
    }
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
  const params = (() => {
    try {
      return JSON.parse(row.params) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  const computed = row.computed_route
    ? (() => {
        try {
          return JSON.parse(row.computed_route!) as Record<string, unknown>;
        } catch {
          return null;
        }
      })()
    : null;
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
  try {
    const p = JSON.parse(row.params) as Record<string, unknown>;
    if (p.destination) previousOrder.destination = p.destination;
    if (p.defendHex) previousOrder.defendHex = p.defendHex;
    if (p.targetUnitId) previousOrder.targetUnitId = p.targetUnitId;
    if (p.waypoints) previousOrder.waypoints = p.waypoints;
  } catch {
    // keep previousOrder with just type
  }
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
 * Expires and updates standing order statuses: removes orders for destroyed units, sets arrived/blocked/target_destroyed.
 * Call at the start of each AI turn before generating orders. Mutates DB.
 */
export function expireAndUpdateStatus(playerId: string, state: GameStateSnapshot): void {
  logDebug('tool5StandingOrders expireAndUpdateStatus', { playerId, turnNumber: state.turnNumber });
  const existingUnitIds = new Set(state.units.filter((u) => u.player === playerId).map((u) => u.id));
  const rows = dbGetAll<StandingOrderRow>(
    'SELECT * FROM standing_orders WHERE player_id = ?',
    [playerId]
  );
  for (const row of rows) {
    if (!existingUnitIds.has(row.unit_id)) {
      dbRun('DELETE FROM standing_orders WHERE player_id = ? AND unit_id = ?', [playerId, row.unit_id]);
      continue;
    }
    if (row.order_type === 'march') {
      const params = (() => {
        try {
          return JSON.parse(row.params) as Record<string, unknown>;
        } catch {
          return {};
        }
      })();
      const dest = params.destination as [number, number] | undefined;
      const unit = state.units.find((u) => u.id === row.unit_id);
      if (unit && dest && dest.length >= 2) {
        let destH3: string | undefined;
        let bestDist = Infinity;
        for (const h of state.hexes) {
          try {
            const [hlat, hlng] = cellToLatLng(h.h3Index);
            const d = (hlat - dest[0]) ** 2 + (hlng - dest[1]) ** 2;
            if (d < bestDist) {
              bestDist = d;
              destH3 = h.h3Index;
            }
          } catch {
            continue;
          }
        }
        if (destH3 && unit.h3Index === destH3) {
          dbRun('DELETE FROM standing_orders WHERE player_id = ? AND unit_id = ?', [playerId, row.unit_id]);
          logDebug('tool5StandingOrders expireAndUpdateStatus: removed arrived march order', {
            playerId,
            unitId: row.unit_id,
          });
        }
      }
    }
    if (row.order_type === 'pursue') {
      const params = (() => {
        try {
          return JSON.parse(row.params) as Record<string, unknown>;
        } catch {
          return {};
        }
      })();
      const targetId = params.targetUnitId as string | undefined;
      const targetExists = targetId && state.units.some((u) => u.id === targetId && u.player !== playerId);
      if (!targetExists) {
        dbRun('DELETE FROM standing_orders WHERE player_id = ? AND unit_id = ?', [playerId, row.unit_id]);
      }
    }
  }
  saveDatabase();
}

/**
 * Generates concrete movement and ranged orders from all active standing orders for this turn.
 * Calls expireAndUpdateStatus first, then for each remaining order produces one movement and/or ranged order.
 * Returns orders in the same shape as LLM orders for merging in requestOrders.
 */
export function generateOrdersForStandingOrders(
  playerId: string,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): { movementOrders: { unitId: string; toH3Index: string }[]; rangedAttacks: { unitId: string; targetH3Index: string }[] } {
  logDebug('tool5StandingOrders generateOrdersForStandingOrders', { playerId, turnNumber: state.turnNumber });
  expireAndUpdateStatus(playerId, state);

  const movementOrders: { unitId: string; toH3Index: string }[] = [];
  const rangedAttacks: { unitId: string; targetH3Index: string }[] = [];

  const rows = dbGetAll<StandingOrderRow>(
    'SELECT * FROM standing_orders WHERE player_id = ? ORDER BY unit_id',
    [playerId]
  );
  const existingUnitIds = new Set(state.units.filter((u) => u.player === playerId).map((u) => u.id));

  for (const row of rows) {
    if (!existingUnitIds.has(row.unit_id)) continue;
    const unit = state.units.find((u) => u.id === row.unit_id);
    if (!unit) continue;
    const params = (() => {
      try {
        return JSON.parse(row.params) as Record<string, unknown>;
      } catch {
        return {};
      }
    })();
    const computed = row.computed_route
      ? (() => {
          try {
            return JSON.parse(row.computed_route!) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : null;

    if (row.order_type === 'hold_fire') {
      continue;
    }

    if (row.order_type === 'defend') {
      const defendHex = (params.defendHex as [number, number] | undefined) ?? latLngByH3.get(unit.h3Index) ?? [0, 0];
      const defendH3 = resolveToH3(defendHex[0], defendHex[1]);
      const engageRange = Number(params.engageRange ?? getRange(unit.unitType));
      if (defendH3 && unit.h3Index !== defendH3) {
        const routeResult = executePlanRoute(
          row.unit_id,
          defendHex,
          { avoidEnemies: false },
          state,
          latLngByH3,
          resolveToH3
        );
        if (routeResult.status === 'ok' && routeResult.path.length > 0) {
          const endHex = routeResult.path[0]!.endHex;
          const toH3 = routeResult.orderToH3;
          if (toH3) movementOrders.push({ unitId: row.unit_id, toH3Index: toH3 });
          const turnsRemaining = Math.max(0, routeResult.turnsRequired - 1);
          dbRun(
            'UPDATE standing_orders SET computed_route = ? WHERE player_id = ? AND unit_id = ?',
            [JSON.stringify({ nextMoveHex: endHex, turnsRemaining }), playerId, row.unit_id]
          );
        }
      } else if (defendH3 && engageRange >= 0) {
        const enemies = state.units.filter((u) => u.player !== playerId);
        let nearest: { id: string; h3Index: string; dist: number } | null = null;
        for (const e of enemies) {
          try {
            const d = gridDistance(defendH3, e.h3Index);
            if (d <= engageRange && (nearest === null || d < nearest.dist)) {
              nearest = { id: e.id, h3Index: e.h3Index, dist: d };
            }
          } catch {
            continue;
          }
        }
        if (nearest && getRange(unit.unitType) >= 1 && nearest.dist <= getRange(unit.unitType)) {
          rangedAttacks.push({ unitId: row.unit_id, targetH3Index: nearest.h3Index });
        }
        dbRun(
          'UPDATE standing_orders SET computed_route = ? WHERE player_id = ? AND unit_id = ?',
          [JSON.stringify({ turnsRemaining: 0 }), playerId, row.unit_id]
        );
      }
      continue;
    }

    if (row.order_type === 'march') {
      if (row.status === 'arrived' || row.status === 'blocked') continue;
      const dest = params.destination as [number, number] | undefined;
      if (!dest || dest.length < 2) continue;
      const routeResult = executePlanRoute(
        row.unit_id,
        [dest[0], dest[1]],
        { avoidEnemies: params.avoidEnemies !== false },
        state,
        latLngByH3,
        resolveToH3
      );
      if (routeResult.status === 'error') {
        dbRun(
          'UPDATE standing_orders SET status = ?, computed_route = ? WHERE player_id = ? AND unit_id = ?',
          ['blocked', JSON.stringify({ turnsRemaining: 0 }), playerId, row.unit_id]
        );
        continue;
      }
      if (routeResult.path.length === 0) {
        dbRun('DELETE FROM standing_orders WHERE player_id = ? AND unit_id = ?', [playerId, row.unit_id]);
        logDebug('tool5StandingOrders generateOrdersForStandingOrders: removed arrived march order', {
          playerId,
          unitId: row.unit_id,
        });
        continue;
      }
      const endHex = routeResult.path[0]!.endHex;
      const toH3 = routeResult.orderToH3;
      if (toH3) {
        movementOrders.push({ unitId: row.unit_id, toH3Index: toH3 });
        const turnsRemaining = Math.max(0, routeResult.turnsRequired - 1);
        dbRun(
          'UPDATE standing_orders SET computed_route = ? WHERE player_id = ? AND unit_id = ?',
          [JSON.stringify({ nextMoveHex: endHex, turnsRemaining }), playerId, row.unit_id]
        );
      }
      if (params.engageEnRoute === true) {
        const enemies = state.units.filter((u) => u.player !== playerId);
        for (const e of enemies) {
          try {
            if (gridDistance(unit.h3Index, e.h3Index) === 1 && getRange(unit.unitType) >= 1) {
              rangedAttacks.push({ unitId: row.unit_id, targetH3Index: e.h3Index });
              break;
            }
          } catch {
            continue;
          }
        }
      }
      continue;
    }

    if (row.order_type === 'pursue') {
      const targetId = params.targetUnitId as string | undefined;
      const target = targetId ? state.units.find((u) => u.id === targetId && u.player !== playerId) : undefined;
      if (!target) continue;
      const maxDistance = params.maxDistance as number | undefined;
      if (maxDistance != null) {
        let originH3: string | undefined;
        try {
          const o = JSON.parse(row.origin_hex) as [number, number];
          originH3 = resolveToH3(o[0], o[1]);
        } catch {
          originH3 = unit.h3Index;
        }
        if (originH3) {
          try {
            if (gridDistance(originH3, target.h3Index) > maxDistance) {
              dbRun(
                'UPDATE standing_orders SET status = ? WHERE player_id = ? AND unit_id = ?',
                ['target_out_of_range', playerId, row.unit_id]
              );
              continue;
            }
          } catch {
            // ignore
          }
        }
      }
      const targetLl = latLngByH3.get(target.h3Index) ?? [0, 0];
      const routeResult = executePlanRoute(
        row.unit_id,
        targetLl,
        { avoidEnemies: true },
        state,
        latLngByH3,
        resolveToH3
      );
      if (routeResult.status === 'error') continue;
      if (routeResult.path.length > 0) {
        const endHex = routeResult.path[0]!.endHex;
        const toH3 = routeResult.orderToH3;
        if (toH3) movementOrders.push({ unitId: row.unit_id, toH3Index: toH3 });
        const turnsRemaining = Math.max(0, routeResult.turnsRequired - 1);
        dbRun(
          'UPDATE standing_orders SET status = ?, computed_route = ? WHERE player_id = ? AND unit_id = ?',
          ['closing', JSON.stringify({ nextMoveHex: endHex, turnsRemaining }), playerId, row.unit_id]
        );
      } else {
        dbRun(
          'UPDATE standing_orders SET status = ?, computed_route = ? WHERE player_id = ? AND unit_id = ?',
          ['closing', JSON.stringify({ turnsRemaining: 0 }), playerId, row.unit_id]
        );
      }
      if (getRange(unit.unitType) >= 1) {
        try {
          if (gridDistance(unit.h3Index, target.h3Index) <= getRange(unit.unitType)) {
            rangedAttacks.push({ unitId: row.unit_id, targetH3Index: target.h3Index });
          }
        } catch {
          // ignore
        }
      }
      continue;
    }

    if (row.order_type === 'patrol') {
      const waypoints = params.waypoints as [number, number][] | undefined;
      if (!waypoints || waypoints.length < 2) continue;
      const waypointIndex = Number(computed?.waypointIndex ?? 0) % waypoints.length;
      const wp = waypoints[waypointIndex]!;
      const routeResult = executePlanRoute(
        row.unit_id,
        [wp[0], wp[1]],
        { avoidEnemies: false },
        state,
        latLngByH3,
        resolveToH3
      );
      if (routeResult.status === 'error') continue;
      if (routeResult.path.length > 0) {
        const endHex = routeResult.path[0]!.endHex;
        const toH3 = routeResult.orderToH3;
        if (toH3) {
          movementOrders.push({ unitId: row.unit_id, toH3Index: toH3 });
          const arrivesThisTurn = routeResult.turnsRequired <= 1;
          const nextIndex = arrivesThisTurn ? (waypointIndex + 1) % waypoints.length : waypointIndex;
          const turnsRemaining = Math.max(0, routeResult.turnsRequired - 1);
          dbRun(
            'UPDATE standing_orders SET computed_route = ?, status = ? WHERE player_id = ? AND unit_id = ?',
            [
              JSON.stringify({ waypointIndex: nextIndex, nextMoveHex: endHex, turnsRemaining }),
              'patrolling',
              playerId,
              row.unit_id,
            ]
          );
        }
      } else {
        logDebug('tool5StandingOrders patrol: unit at waypoint with empty path, advancing index', {
          unitId: row.unit_id, waypointIndex, nextIndex: (waypointIndex + 1) % waypoints.length,
        });
        const nextIndex = (waypointIndex + 1) % waypoints.length;
        dbRun(
          'UPDATE standing_orders SET computed_route = ?, status = ? WHERE player_id = ? AND unit_id = ?',
          [
            JSON.stringify({ waypointIndex: nextIndex, turnsRemaining: 0 }),
            'patrolling',
            playerId,
            row.unit_id,
          ]
        );
      }
      const enemies = state.units.filter((u) => u.player !== playerId);
      for (const e of enemies) {
        try {
          if (gridDistance(unit.h3Index, e.h3Index) === 1) {
            dbRun(
              'UPDATE standing_orders SET status = ? WHERE player_id = ? AND unit_id = ?',
              ['contact', playerId, row.unit_id]
            );
            break;
          }
        } catch {
          continue;
        }
      }
      continue;
    }
  }

  saveDatabase();
  return { movementOrders, rangedAttacks };
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
  const params = (() => {
    try {
      return JSON.parse(row.params) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
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
    const params = (() => {
      try {
        return JSON.parse(row.params) as Record<string, unknown>;
      } catch {
        return {};
      }
    })();
    const computed = row.computed_route
      ? (() => {
          try {
            return JSON.parse(row.computed_route!) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : null;
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

/** Read-only API tool names; assign_order/cancel_order are applied via final JSON orders[] only. */
export const TOOL5_NAMES = ['query_orders'] as const;

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
