import { cellToLatLng, gridDistance } from 'h3-js';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { AirStrikeTargetType } from '../../shared/ipcTypes';
import { dbRun, dbGetAll, saveDatabase } from '../gameDb';
import { getRange } from '../combatConstants';
import { validateAirStrikeOrder } from '../game-actions/airValidation';
import { isWithinAirStrikeGridRange } from '../game-actions/gridRange';
import { createPathfindingSession, executePlanRouteWithSession, type PathfindingSession } from './tool1Pathfinding';
import type { LatLng } from './tool1Pathfinding';
import { logDebug } from '../logger';
import {
  AIR_INELIGIBLE_ORDER_TYPES,
  parseComputedRoute,
  parseOrderParams,
  toComputedRoutePayload,
  type StandingOrderRow,
} from './tool5StandingOrdersShared';

/**
 * Options for `generateOrdersForStandingOrders` so tactical resolution can preview routes without advancing DB state.
 *
 * Purpose: Keeps tactical Ready merge aligned with strategic standing-order **read** semantics while avoiding double-application of `computed_route` / status mutations before the strategic Ready runs.
 * When to use: Pass `mutateProgress: false` only from tactical commit merge helpers; omit everywhere else (default mutates like strategic Ready).
 * Expected outcome: When `mutateProgress` is false, returned movement/ranged rows mirror the live generator while standing_orders rows remain byte-identical aside from concurrent writers.
 * Exceptions: None.
 */
export type StandingOrderGeneratedAirStrike = {
  unitId: string;
  targetH3Index: string;
  targetType: AirStrikeTargetType;
};

/**
 * Emits one defend-order ranged or air strike against the closest in-range enemy from the unit's current hex.
 *
 * Purpose: DEFEND units auto-engage without waiting to arrive at the defend post; air uses strikes, ground/naval use ranged.
 * When to use: From the `defend` branch of `generateOrdersForStandingOrders` after optional march toward defend hex.
 * Expected outcome: At most one attack row appended; no-op when no legal target exists.
 * Exceptions: None; grid errors skip individual enemies.
 */
function appendDefendStandingOrderEngagement(
  unit: GameStateSnapshot['units'][number],
  playerId: string,
  unitId: string,
  state: GameStateSnapshot,
  rangedAttacks: { unitId: string; targetH3Index: string }[],
  airStrikes: StandingOrderGeneratedAirStrike[]
): void {
  const enemies = state.units.filter((u) => u.player !== playerId);
  if (unit.unitType === 'air') {
    let nearest: { h3Index: string; dist: number } | null = null;
    for (const enemy of enemies) {
      if (!isWithinAirStrikeGridRange(unit.h3Index, enemy.h3Index, 'defendStandingOrderEngagement')) continue;
      const valid = validateAirStrikeOrder(unitId, enemy.h3Index, 'units', { allowedPlayer: playerId });
      if (!valid.valid) continue;
      try {
        const dist = gridDistance(unit.h3Index, enemy.h3Index);
        if (nearest === null || dist < nearest.dist) nearest = { h3Index: enemy.h3Index, dist };
      } catch {
        continue;
      }
    }
    if (nearest) {
      airStrikes.push({ unitId, targetH3Index: nearest.h3Index, targetType: 'units' });
    }
    return;
  }

  const weaponRange = getRange(unit.unitType);
  if (weaponRange < 1) return;
  let nearest: { h3Index: string; dist: number } | null = null;
  for (const enemy of enemies) {
    try {
      const dist = gridDistance(unit.h3Index, enemy.h3Index);
      if (dist <= weaponRange && (nearest === null || dist < nearest.dist)) {
        nearest = { h3Index: enemy.h3Index, dist: dist };
      }
    } catch {
      continue;
    }
  }
  if (nearest) {
    rangedAttacks.push({ unitId, targetH3Index: nearest.h3Index });
  }
}

export type GenerateStandingOrdersOptions = {
  mutateProgress?: boolean;
  /** Reuses an existing pathfinding session from the same AI request when provided. */
  pathfindingSession?: PathfindingSession;
};

/**
 * Defines the `deleteStandingOrder` function shape (function deleteStandingOrder(playerId: string, unitId: string): void).

 * Purpose: Supports maintainability by documenting why `deleteStandingOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function deleteStandingOrder(playerId: string, unitId: string): void {
  dbRun('DELETE FROM standing_orders WHERE player_id = ? AND unit_id = ?', [playerId, unitId]);
}

/**
 * Defines the `updateStandingOrderComputedRoute` function shape (function updateStandingOrderComputedRoute().

 * Purpose: Supports maintainability by documenting why `updateStandingOrderComputedRoute` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
 * Defines the `expireAndUpdateStatus` function shape (export function expireAndUpdateStatus(playerId: string, state: GameStateSnapshot): void).

 * Purpose: Supports maintainability by documenting why `expireAndUpdateStatus` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
    // Clears movement orders stored for air units before assign_order began rejecting them; leaving one
    // in place would request an unsatisfiable land route every turn.
    if (AIR_INELIGIBLE_ORDER_TYPES.has(row.order_type)) {
      const orderedUnit = state.units.find((u) => u.id === row.unit_id);
      if (orderedUnit?.unitType === 'air') {
        logDebug('tool5StandingOrders expireAndUpdateStatus: removed unusable air movement order', {
          playerId,
          unitId: row.unit_id,
          orderType: row.order_type,
        });
        deleteStandingOrder(playerId, row.unit_id);
        continue;
      }
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
 * Defines the `generateOrdersForStandingOrders` function shape (export function generateOrdersForStandingOrders( playerId: string, state: GameStateSnapshot, latLngByH3: Map<string, LatLng>, resolveToH3: (lat: num).

 * Purpose: Expires stale rows, runs Tool 1 routes, emits merged movement/ranged rows, and normally persists `computed_route` / deletes like strategic Ready.
 * When to use: Strategic Ready, AI standing-only paths, and tactical Ready **preview** (`mutateProgress: false`) for parent→sub-unit march merge.
 * Expected outcome: Default path mutates SQLite like today; preview path returns the same order shapes without touching standing_orders progression.
 * Exceptions: None.
 */
export function generateOrdersForStandingOrders(
  playerId: string,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  options?: GenerateStandingOrdersOptions
): {
  movementOrders: { unitId: string; toH3Index: string }[];
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  airStrikes: StandingOrderGeneratedAirStrike[];
} {
  const mutateProgress = options?.mutateProgress !== false;
  logDebug('tool5StandingOrders generateOrdersForStandingOrders', {
    playerId,
    turnNumber: state.turnNumber,
    mutateProgress,
  });
  if (mutateProgress) {
    expireAndUpdateStatus(playerId, state);
  }
  const pathfindingSession =
    options?.pathfindingSession ?? createPathfindingSession(state, latLngByH3, resolveToH3);

  const movementOrders: { unitId: string; toH3Index: string }[] = [];
  const rangedAttacks: { unitId: string; targetH3Index: string }[] = [];
  const airStrikes: StandingOrderGeneratedAirStrike[] = [];

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
      // Air units hold station rather than marching to the defend hex; they reposition only by ferry.
      if (defendH3 && unit.h3Index !== defendH3 && unit.unitType !== 'air') {
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
          if (mutateProgress) {
            updateStandingOrderComputedRoute(playerId, row.unit_id, { nextMoveHex: endHex, turnsRemaining });
          }
        }
      } else if (defendH3 && mutateProgress) {
        updateStandingOrderComputedRoute(playerId, row.unit_id, { turnsRemaining: 0 });
      }
      appendDefendStandingOrderEngagement(unit, playerId, row.unit_id, state, rangedAttacks, airStrikes);
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
        if (mutateProgress) {
          updateStandingOrderComputedRoute(playerId, row.unit_id, { turnsRemaining: 0 }, 'blocked');
        }
        continue;
      }
      if (routeResult.path.length === 0) {
        if (mutateProgress) {
          deleteStandingOrder(playerId, row.unit_id);
        }
        logDebug('tool5StandingOrders generateOrdersForStandingOrders: removed arrived march order', {
          playerId,
          unitId: row.unit_id,
        });
        continue;
      }
      const toH3 = routeResult.orderToH3;
      if (toH3) {
        movementOrders.push({ unitId: row.unit_id, toH3Index: toH3 });
        const routePayload = toComputedRoutePayload(routeResult, unit.h3Index);
        if (mutateProgress) {
          updateStandingOrderComputedRoute(playerId, row.unit_id, {
            nextMoveHex: routePayload.nextMoveHex,
            turnsRemaining: Math.max(0, routePayload.turnsRemaining - 1),
            totalPath: routePayload.totalPath,
            cachedOriginH3: routePayload.cachedOriginH3,
            cachedRouteSegments: routePayload.cachedRouteSegments,
          });
        }
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
              if (mutateProgress) {
                dbRun('UPDATE standing_orders SET status = ? WHERE player_id = ? AND unit_id = ?', [
                  'target_out_of_range',
                  playerId,
                  row.unit_id,
                ]);
              }
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
        const toH3 = routeResult.orderToH3;
        if (toH3) movementOrders.push({ unitId: row.unit_id, toH3Index: toH3 });
        const routePayload = toComputedRoutePayload(routeResult, unit.h3Index);
        if (mutateProgress) {
          updateStandingOrderComputedRoute(
            playerId,
            row.unit_id,
            {
              nextMoveHex: routePayload.nextMoveHex,
              turnsRemaining: Math.max(0, routePayload.turnsRemaining - 1),
              totalPath: routePayload.totalPath,
              cachedOriginH3: routePayload.cachedOriginH3,
              cachedRouteSegments: routePayload.cachedRouteSegments,
            },
            'closing'
          );
        }
      } else {
        if (mutateProgress) {
          updateStandingOrderComputedRoute(playerId, row.unit_id, { turnsRemaining: 0 }, 'closing');
        }
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
          if (mutateProgress) {
            updateStandingOrderComputedRoute(
              playerId,
              row.unit_id,
              { waypointIndex: nextIndex, nextMoveHex: endHex, turnsRemaining },
              'patrolling'
            );
          }
        }
      } else {
        logDebug('tool5StandingOrders patrol: unit at waypoint with empty path, advancing index', {
          unitId: row.unit_id, waypointIndex, nextIndex: (waypointIndex + 1) % waypoints.length,
        });
        const nextIndex = (waypointIndex + 1) % waypoints.length;
        if (mutateProgress) {
          updateStandingOrderComputedRoute(playerId, row.unit_id, { waypointIndex: nextIndex, turnsRemaining: 0 }, 'patrolling');
        }
      }
      const enemies = state.units.filter((u) => u.player !== playerId);
      for (const e of enemies) {
        try {
          if (gridDistance(unit.h3Index, e.h3Index) === 1) {
            if (mutateProgress) {
              dbRun(
                'UPDATE standing_orders SET status = ? WHERE player_id = ? AND unit_id = ?',
                ['contact', playerId, row.unit_id]
              );
            }
            break;
          }
        } catch {
          continue;
        }
      }
      continue;
    }
  }

  if (mutateProgress) {
    saveDatabase();
  }
  return { movementOrders, rangedAttacks, airStrikes };
}
