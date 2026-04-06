import { cellToLatLng, gridDistance } from 'h3-js';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { dbRun, dbGetAll, saveDatabase } from '../gameDb';
import { getRange } from '../combatConstants';
import { createPathfindingSession, executePlanRouteWithSession } from './tool1Pathfinding';
import type { LatLng } from './tool1Pathfinding';
import { logDebug } from '../logger';
import {
  parseComputedRoute,
  parseOrderParams,
  toComputedRoutePayload,
  type StandingOrderRow,
} from './tool5StandingOrdersShared';

function deleteStandingOrder(playerId: string, unitId: string): void {
  dbRun('DELETE FROM standing_orders WHERE player_id = ? AND unit_id = ?', [playerId, unitId]);
}

function updateStandingOrderComputedRoute(
  playerId: string,
  unitId: string,
  computedRoute: Record<string, unknown>,
  status?: string
): void {
  if (status) {
    dbRun(
      'UPDATE standing_orders SET status = ?, computed_route = ? WHERE player_id = ? AND unit_id = ?',
      [status, JSON.stringify(computedRoute), playerId, unitId]
    );
    return;
  }
  dbRun(
    'UPDATE standing_orders SET computed_route = ? WHERE player_id = ? AND unit_id = ?',
    [JSON.stringify(computedRoute), playerId, unitId]
  );
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
      deleteStandingOrder(playerId, row.unit_id);
      continue;
    }
    if (row.order_type === 'march') {
      const params = parseOrderParams(row);
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
          deleteStandingOrder(playerId, row.unit_id);
          logDebug('tool5StandingOrders expireAndUpdateStatus: removed arrived march order', {
            playerId,
            unitId: row.unit_id,
          });
        }
      }
    }
    if (row.order_type === 'pursue') {
      const params = parseOrderParams(row);
      const targetId = params.targetUnitId as string | undefined;
      const targetExists = targetId && state.units.some((u) => u.id === targetId && u.player !== playerId);
      if (!targetExists) {
        deleteStandingOrder(playerId, row.unit_id);
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
  const pathfindingSession = createPathfindingSession(state, latLngByH3, resolveToH3);

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
    const params = parseOrderParams(row);
    const computed = parseComputedRoute(row);

    if (row.order_type === 'hold_fire') {
      continue;
    }

    if (row.order_type === 'defend') {
      const defendHex = (params.defendHex as [number, number] | undefined) ?? latLngByH3.get(unit.h3Index) ?? [0, 0];
      const defendH3 = resolveToH3(defendHex[0], defendHex[1]);
      const engageRange = Number(params.engageRange ?? getRange(unit.unitType));
      if (defendH3 && unit.h3Index !== defendH3) {
        const routeResult = executePlanRouteWithSession(
          row.unit_id,
          defendHex,
          { avoidEnemies: false },
          pathfindingSession
        );
        if (routeResult.status === 'ok' && routeResult.path.length > 0) {
          const endHex = routeResult.path[0]!.endHex;
          const toH3 = routeResult.orderToH3;
          if (toH3) movementOrders.push({ unitId: row.unit_id, toH3Index: toH3 });
          const turnsRemaining = Math.max(0, routeResult.turnsRequired - 1);
          updateStandingOrderComputedRoute(playerId, row.unit_id, { nextMoveHex: endHex, turnsRemaining });
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
        updateStandingOrderComputedRoute(playerId, row.unit_id, { turnsRemaining: 0 });
      }
      continue;
    }

    if (row.order_type === 'march') {
      if (row.status === 'arrived' || row.status === 'blocked') continue;
      const dest = params.destination as [number, number] | undefined;
      if (!dest || dest.length < 2) continue;
      const routeResult = executePlanRouteWithSession(
        row.unit_id,
        [dest[0], dest[1]],
        { avoidEnemies: params.avoidEnemies !== false },
        pathfindingSession
      );
      if (routeResult.status === 'error') {
        updateStandingOrderComputedRoute(playerId, row.unit_id, { turnsRemaining: 0 }, 'blocked');
        continue;
      }
      if (routeResult.path.length === 0) {
        deleteStandingOrder(playerId, row.unit_id);
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
        const routePayload = toComputedRoutePayload(routeResult);
        updateStandingOrderComputedRoute(playerId, row.unit_id, {
          nextMoveHex: routePayload.nextMoveHex,
          turnsRemaining: Math.max(0, routePayload.turnsRemaining - 1),
          totalPath: routePayload.totalPath,
        });
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
              dbRun('UPDATE standing_orders SET status = ? WHERE player_id = ? AND unit_id = ?', ['target_out_of_range', playerId, row.unit_id]);
              continue;
            }
          } catch {
            // ignore
          }
        }
      }
      const targetLl = latLngByH3.get(target.h3Index) ?? [0, 0];
      const routeResult = executePlanRouteWithSession(
        row.unit_id,
        targetLl,
        { avoidEnemies: true },
        pathfindingSession
      );
      if (routeResult.status === 'error') continue;
      if (routeResult.path.length > 0) {
        const endHex = routeResult.path[0]!.endHex;
        const toH3 = routeResult.orderToH3;
        if (toH3) movementOrders.push({ unitId: row.unit_id, toH3Index: toH3 });
        const routePayload = toComputedRoutePayload(routeResult);
        updateStandingOrderComputedRoute(
          playerId,
          row.unit_id,
          {
            nextMoveHex: routePayload.nextMoveHex,
            turnsRemaining: Math.max(0, routePayload.turnsRemaining - 1),
            totalPath: routePayload.totalPath,
          },
          'closing'
        );
      } else {
        updateStandingOrderComputedRoute(playerId, row.unit_id, { turnsRemaining: 0 }, 'closing');
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
      const routeResult = executePlanRouteWithSession(
        row.unit_id,
        [wp[0], wp[1]],
        { avoidEnemies: false },
        pathfindingSession
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
          updateStandingOrderComputedRoute(
            playerId,
            row.unit_id,
            { waypointIndex: nextIndex, nextMoveHex: endHex, turnsRemaining },
            'patrolling'
          );
        }
      } else {
        logDebug('tool5StandingOrders patrol: unit at waypoint with empty path, advancing index', {
          unitId: row.unit_id, waypointIndex, nextIndex: (waypointIndex + 1) % waypoints.length,
        });
        const nextIndex = (waypointIndex + 1) % waypoints.length;
        updateStandingOrderComputedRoute(playerId, row.unit_id, { waypointIndex: nextIndex, turnsRemaining: 0 }, 'patrolling');
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
