import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { dbRun, dbGetOne, dbGetAll, saveDatabase } from '../gameDb';
import { createPathfindingSession, executePlanRouteWithSession } from './pathfinding';
import type { LatLng } from './pathfinding';
import { terrainIsPassableForDomain } from '../pathfinding';
import type { PassableDomain } from '../pathfinding';
import { landUnitCanOccupyHex } from '../../shared/landTraversalRes1';
import { getRes1LandMassByH3 } from '../terrainClassificationCache';
import { buildLatLngCoordinateMap } from '../mapData';
import { logDebug, logError, logTrace } from '../logger';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { buildPromptTableLines } from '../promptTableHelpers';
import { SECTION_TITLE_STANDING_ORDER_STATUS, topLevelHeading } from '../openRouter/promptSpec/sectionHeadings';
import {
  canAssignStandingOrderType,
  parseComputedRoute,
  parseStandingOrderComputedRoute,
  parseOrderParams,
  toComputedRoutePayload,
  type AssignOrderParams,
  type StandingOrderRow,
} from './standingOrdersShared';
import { suggestApproachDestinationsForOrderlessUnits } from './orderlessUnitSuggestions';
import { expireAndUpdateStatus, generateOrdersForStandingOrders } from './standingOrdersGeneration';
import { marchStepRecedesFromEnemy, nearestObservedEnemyH3 } from './standingMarchReceding';
export { expireAndUpdateStatus, generateOrdersForStandingOrders };

/**
 * Documents the module-scope binding `WARNING_STATUSES` (WARNING_STATUSES).

 * Purpose: Supports maintainability by documenting why `WARNING_STATUSES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const WARNING_STATUSES = new Set([
  'blocked',
  'target_lost',
  'target_out_of_range',
  'target_destroyed',
  'arrived',
  'contact',
]);

/**
 * Documents the `StandingOrderPromptRow` interface as a named contract surface (interface StandingOrderPromptRow).

 * Purpose: Supports maintainability by documenting why `StandingOrderPromptRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface StandingOrderPromptRow {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `unitType` member (unitType: string;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: string;
    /**
   * Specifies the contract for the `orderType` member (orderType: string;).

   * Contract: Describes stable behavior for callers of `orderType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
orderType: string;
    /**
   * Specifies the contract for the `destination` member (destination: string;).

   * Contract: Describes stable behavior for callers of `destination` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
destination: string;
    /**
   * Specifies the contract for the `status` member (status: string;).

   * Contract: Describes stable behavior for callers of `status` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
status: string;
    /**
   * Specifies the contract for the `nextMove` member (nextMove: string;).

   * Contract: Describes stable behavior for callers of `nextMove` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
nextMove: string;
    /**
   * Specifies the contract for the `turnsRemaining` member (turnsRemaining: string | number;).

   * Contract: Describes stable behavior for callers of `turnsRemaining` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnsRemaining: string | number;
    /**
   * Specifies the contract for the `attention` member (attention: 'yes' | 'no';).

   * Contract: Describes stable behavior for callers of `attention` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
attention: 'yes' | 'no';
}

/**
 * Resolves a stored lat/lng tuple to the briefing hex code shown alongside rosters and maps.
 *
 * Purpose: Keeps standing-order status tables aligned with the JSON hex-code contract while DB rows remain lat/lng.
 * When to use: Only when formatting strategic `getInjectionText` rows.
 * Expected outcome: Two-character code when the tuple snaps to a registered cell; em dash when off-registry or unmapped.
 * Exceptions: None; failures downgrade to an em dash rather than throwing into the prompt builder.
 */
function latLngTupleToBriefingHexDisplay(
  ll: [number, number] | undefined,
  coordinateContext: CoordinateContext,
  resolveToH3: (lat: number, lng: number) => string | undefined
): string {
  if (!ll || ll.length < 2) return '—';
  const h3 = resolveToH3(ll[0], ll[1]);
  if (!h3) return '—';
  return h3ToBriefingHexDisplay(h3, coordinateContext);
}

/**
 * Renders one H3 index as a briefing hex code, downgrading to an em dash instead of throwing.
 *
 * Purpose: `h3ToCode` throws for cells outside the active coordinate registry, and a single unregistered hex must not
 * take down the whole prompt build; standing-order tables would rather show a gap than fail.
 * When to use: Any standing-order table cell that displays a hex the caller already holds as an H3 index.
 * Expected outcome: Two-character code when registered; em dash otherwise.
 * Exceptions: None.
 */
function h3ToBriefingHexDisplay(h3: string, coordinateContext: CoordinateContext): string {
  try {
    return h3ToCode(h3, coordinateContext);
  } catch {
    return '—';
  }
}

/**
 * Defines the `toStandingOrderPromptRow` function shape (function toStandingOrderPromptRow().

 * Purpose: Supports maintainability by documenting why `toStandingOrderPromptRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function toStandingOrderPromptRow(
  row: StandingOrderRow,
  unitTypeById: Map<string, string>,
  coordinateContext: CoordinateContext,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  unitH3: string | undefined,
  enemyH3s: readonly string[]
): StandingOrderPromptRow {
  const params = parseOrderParams(row);
  const computed = parseComputedRoute(row);
  const nextMove = computed?.nextMoveHex;
  const turnsRemaining = Number(computed?.turnsRemaining ?? 0);
  let destination = '—';
  if (row.order_type === 'march' && params.destination) {
    destination = latLngTupleToBriefingHexDisplay(params.destination as [number, number], coordinateContext, resolveToH3);
  }
  if (row.order_type === 'defend' && params.defendHex) {
    destination = latLngTupleToBriefingHexDisplay(params.defendHex as [number, number], coordinateContext, resolveToH3);
  }
  if (row.order_type === 'pursue' && params.targetUnitId) {
    destination = String(params.targetUnitId);
  }
  let nextMoveText = '—';
  let turnsRemainingText: string | number = '—';
  if (turnsRemaining > 0 && nextMove) {
    nextMoveText = latLngTupleToBriefingHexDisplay(nextMove as [number, number], coordinateContext, resolveToH3);
    turnsRemainingText = turnsRemaining;
  } else if (row.status === 'en_route' || row.status === 'closing') {
    if (nextMove) {
      nextMoveText = latLngTupleToBriefingHexDisplay(nextMove as [number, number], coordinateContext, resolveToH3);
    } else {
      nextMoveText = 'pending route refresh';
    }
    turnsRemainingText = 'pending';
  }
  const receding = standingOrderRowRecedesFromEnemy(row, unitTypeById.get(row.unit_id), unitH3, enemyH3s, resolveToH3);
  return {
    unitId: row.unit_id,
    unitType: unitTypeById.get(row.unit_id) ?? '—',
    orderType: row.order_type.toUpperCase(),
    destination,
    status: row.status,
    nextMove: nextMoveText,
    turnsRemaining: turnsRemainingText,
    attention: WARNING_STATUSES.has(row.status) || receding ? 'yes' : 'no',
  };
}

/**
 * True when this standing-order row's next step increases hop distance to the nearest enemy.
 *
 * Purpose: Attention column must flag receding marches, not only stalled statuses.
 * When to use: `toStandingOrderPromptRow` after next-move and destination text are computed.
 * Expected outcome: False for air units, non-march/pursue orders, and unmeasurable geometry.
 * Exceptions: None.
 */
function standingOrderRowRecedesFromEnemy(
  row: StandingOrderRow,
  unitType: string | undefined,
  unitH3: string | undefined,
  enemyH3s: readonly string[],
  resolveToH3: (lat: number, lng: number) => string | undefined
): boolean {
  if (unitType === 'air' || !unitH3) return false;
  if (row.order_type !== 'march' && row.order_type !== 'pursue') return false;
  const enemyH3 = nearestObservedEnemyH3(unitH3, enemyH3s);
  if (!enemyH3) return false;
  const computed = parseComputedRoute(row);
  const nextMove = computed?.nextMoveHex;
  const params = parseOrderParams(row);
  const dest = Array.isArray(params.destination) ? (params.destination as [number, number]) : null;
  const stepLl = (Array.isArray(nextMove) ? nextMove : dest) as [number, number] | null;
  if (!stepLl || stepLl.length < 2) return false;
  const stepH3 = resolveToH3(Number(stepLl[0]), Number(stepLl[1]));
  if (!stepH3) return false;
  return marchStepRecedesFromEnemy(unitH3, stepH3, enemyH3);
}

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
    !['defend', 'march', 'pursue', 'patrol', 'hold_fire'].includes(orderType)
  ) {
    return { status: 'error', error: 'assign_order requires order.type: defend | march | pursue | patrol | hold_fire' };
  }

  if (!canAssignStandingOrderType(unit.unitType, orderType)) {
    return {
      status: 'error',
      error: `Air units cannot take a ${orderType} standing order because they do not move hex by hex. Use an air strike to attack, a ferry order to reposition, or a defend order to keep striking targets in range.`,
    };
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
        if (!landUnitCanOccupyHex(h3, getRes1LandMassByH3())) {
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
 * Defines the `getStandingOrderForUnit` function shape (export function getStandingOrderForUnit( playerId: string, unitId: string ): { type: string; destination?: [number, number]; defendHex?: [number, number]).

 * Purpose: Supports maintainability by documenting why `getStandingOrderForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: March/defend/patrol geometry and pursue `targetUnitId` when present in stored params.
 * Exceptions: None.
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
  } = {
    type: row.order_type,
    status: row.status,
  };
  if (row.order_type === 'march' && params.destination) out.destination = params.destination as [number, number];
  if (row.order_type === 'defend' && params.defendHex) out.defendHex = params.defendHex as [number, number];
  if (row.order_type === 'patrol' && params.waypoints) out.waypoints = params.waypoints as [number, number][];
  if (row.order_type === 'pursue' && params.targetUnitId) out.targetUnitId = String(params.targetUnitId);
  return out;
}

/**
 * Builds the strategic Standing Order Status briefing block for the opponent AI.
 *
 * Purpose: Injects parent-unit standing-order tables into strategic Commander prompts only. Arrived marches are expired first so completed missions are not listed as active.
 * When to use: Strategic `formatBriefing` / `buildSystemPromptForTools` when Orders tools are enabled.
 * Expected outcome: Markdown `# Standing Order Status` (+ units without orders); empty string in tactical mode. Units already at their march destination appear under Units Without Standing Orders, each with a suggested closing destination so the model does not have to join that table against Best Options to find one.
 * Exceptions: None.
 */
export function getInjectionText(
  playerId: string,
  state: GameStateSnapshot,
  coordinateContext?: CoordinateContext
): string {
  const ctx: CoordinateContext = coordinateContext ?? { mode: 'strategic' };
  if (ctx.mode === 'tactical') {
    logDebug('standingOrders getInjectionText: omitted in tactical mode', {
      playerId,
      battleId: ctx.battleId ?? null,
    });
    return '';
  }
  expireAndUpdateStatus(playerId, state);
  ensureStrategicCoordinateRegistryInitialized();
  logDebug('standingOrders getInjectionText', {
    playerId,
    turnNumber: state.turnNumber,
    coordinateMode: ctx.mode,
  });

  const hexList = state.hexes.map((h) => h.h3Index);
  const { resolveToH3 } = buildLatLngCoordinateMap(hexList);
  logTrace('standingOrders getInjectionText: map context', { hexCount: hexList.length });

  const rows = dbGetAll<StandingOrderRow>(
    'SELECT * FROM standing_orders WHERE player_id = ? ORDER BY unit_id',
    [playerId]
  );
  const aiUnits = state.units.filter((u) => u.player === playerId);
  const aiUnitIds = aiUnits.map((u) => u.id);
  const aiUnitTypeById = new Map(aiUnits.map((u) => [u.id, u.unitType]));

  const lines: string[] = [];
  lines.push(topLevelHeading(SECTION_TITLE_STANDING_ORDER_STATUS));
  lines.push('');

  const aiUnitIdSet = new Set(aiUnitIds);
  const unitIdsWithOrders = new Set(rows.map((r) => r.unit_id));
  const unitIdsWithoutOrders = aiUnitIds.filter((id) => !unitIdsWithOrders.has(id));
  const unitH3ById = new Map(aiUnits.map((u) => [u.id, u.h3Index]));
  const enemyH3s = state.units.filter((u) => u.player !== playerId).map((u) => u.h3Index);

  const standingOrderRows = rows
    .filter((row) => aiUnitIdSet.has(row.unit_id))
    .map((row) =>
      toStandingOrderPromptRow(
        row,
        aiUnitTypeById,
        ctx,
        resolveToH3,
        unitH3ById.get(row.unit_id),
        enemyH3s
      )
    )
    .map((row) => [
      row.unitId,
      row.unitType,
      row.orderType,
      row.destination,
      row.status,
      row.nextMove,
      row.turnsRemaining,
      row.attention,
    ]);
  lines.push(
    ...buildPromptTableLines(
      ['Unit ID', 'Unit Type', 'Order Type', 'Destination / Target', 'Status', 'Next Move', 'Turns Remaining', 'Attention'],
      standingOrderRows,
      ['—', '—', '—', '—', '—', '—', '—', '—']
    )
  );
  lines.push('');
  lines.push('## Units Without Standing Orders');
  lines.push('');
  const suggestedDestinations = suggestApproachDestinationsForOrderlessUnits(
    playerId,
    state,
    unitIdsWithoutOrders
  );
  const withoutOrderHeaders = ['Unit ID', 'Unit Type', 'Suggested Destination'];
  const withoutOrderBlanks = ['—', '—', '—'];
  const withoutOrderRows = unitIdsWithoutOrders.map((unitId) => {
    const suggestion = suggestedDestinations.get(unitId);
    return [
      unitId,
      aiUnitTypeById.get(unitId) ?? '—',
      suggestion ? h3ToBriefingHexDisplay(suggestion, ctx) : '—',
    ];
  });
  lines.push(
    ...buildPromptTableLines(
      withoutOrderHeaders,
      aiUnitIds.length === 0 ? [] : withoutOrderRows,
      withoutOrderBlanks
    )
  );
  return lines.join('\n');
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
