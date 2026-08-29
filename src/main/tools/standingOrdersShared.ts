import type { PlanRouteOk } from './pathfinding';
import type { HumanOrderPreviewSegment } from '../../shared/ipc/humanOrderPreviewTypes';

/**
 * Standing-order types that steer a unit hex by hex and therefore cannot apply to air units.
 *
 * Purpose: Air units reposition by ferry and attack by air strike; they never march across hexes, so such an
 * order leaves a stored row that re-requests an unsatisfiable land route on every turn.
 * When to use: Checked by `assignOrder` before persisting a new order, and by `expireAndUpdateStatus` to
 * clear rows persisted before this restriction existed.
 * Expected outcome: Contains the movement order types only; `defend` and `hold_fire` stay valid for air
 * because they drive air-strike engagement rather than movement.
 * Exceptions: None.
 */
export const AIR_INELIGIBLE_ORDER_TYPES: ReadonlySet<string> = new Set(['march', 'pursue', 'patrol']);

/**
 * Reports whether a unit type may be given a particular standing-order type.
 *
 * Purpose: The rejection in `assignOrder` and the briefing content that invites orders must agree, or the prompt will
 * keep suggesting a march to an air unit that `assignOrder` then refuses.
 * When to use: Before persisting an order, and before offering a movement destination for a unit in the briefing.
 * Expected outcome: False only for air units given a hex-by-hex movement order; true otherwise.
 * Exceptions: None.
 */
export function canAssignStandingOrderType(unitType: string, orderType: string): boolean {
  return !(unitType === 'air' && AIR_INELIGIBLE_ORDER_TYPES.has(orderType));
}

/**
 * JSON payload persisted in `standing_orders.computed_route` for march and pursue orders.
 *
 * Purpose: Stores turn progress plus optional display cache so `listHumanStandingOrders` can reuse polylines without replanning.
 * When to use: Serialize via `toComputedRoutePayload` after `executePlanRouteWithSession`; parse with `parseStandingOrderComputedRoute`.
 * Expected outcome: Always includes `turnsRemaining`, `nextMoveHex`, and `totalPath`; cache fields present after route assignment or turn refresh.
 * Exceptions: None.
 */
export interface StandingOrderComputedRoutePayload {
  /**
   * Specifies the contract for the `turnsRemaining` member (turnsRemaining: number;).
   *
   * Contract: Describes stable behavior for callers of `turnsRemaining` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  turnsRemaining: number;
  /**
   * Specifies the contract for the `nextMoveHex` member (nextMoveHex: [number, number];).
   *
   * Contract: Describes stable behavior for callers of `nextMoveHex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  nextMoveHex: [number, number];
  /**
   * Specifies the contract for the `totalPath` member (totalPath: [number, number][];).
   *
   * Contract: Describes stable behavior for callers of `totalPath` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  totalPath: [number, number][];
  /**
   * res1 H3 where the cached route was planned; display reuse when the unit is still at this cell.
   *
   * Contract: Matches the unit cell at route assignment or turn refresh; `listHumanStandingOrders` reuses `cachedRouteSegments` only when current H3 equals this value.
   * When to use: Persisted in `computed_route` after `toComputedRoutePayload`; read by standing-order list IPC for stable overlay rendering.
   * Expected outcome: Optional on legacy rows; present on newly assigned or refreshed march/pursue orders.
   * Exceptions: None.
   */
  cachedOriginH3?: string;
  /**
   * Turn-partitioned lat/lng segments for stable standing-order line rendering.
   *
   * Contract: Same shape as `HumanOrderPreviewSegment[]`; valid only together with matching `cachedOriginH3`.
   * When to use: Returned from `rowToOrderResponse` and consumed by `listHumanStandingOrders` on cache hit.
   * Expected outcome: Skips replanning when origin H3 still matches the unit position.
   * Exceptions: None.
   */
  cachedRouteSegments?: HumanOrderPreviewSegment[];
}

/**
 * Documents the `StandingOrderRow` interface as a named contract surface (export interface StandingOrderRow extends Record<string, unknown>).

 * Purpose: Supports maintainability by documenting why `StandingOrderRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface StandingOrderRow extends Record<string, unknown> {
    /**
   * Specifies the contract for the `player_id` member (player_id: string;).

   * Contract: Describes stable behavior for callers of `player_id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
player_id: string;
    /**
   * Specifies the contract for the `unit_id` member (unit_id: string;).

   * Contract: Describes stable behavior for callers of `unit_id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unit_id: string;
    /**
   * Specifies the contract for the `order_type` member (order_type: string;).

   * Contract: Describes stable behavior for callers of `order_type` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
order_type: string;
    /**
   * Specifies the contract for the `params` member (params: string;).

   * Contract: Describes stable behavior for callers of `params` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
params: string;
    /**
   * Specifies the contract for the `computed_route` member (computed_route: string | null;).

   * Contract: Describes stable behavior for callers of `computed_route` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
computed_route: string | null;
    /**
   * Specifies the contract for the `status` member (status: string;).

   * Contract: Describes stable behavior for callers of `status` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
status: string;
    /**
   * Specifies the contract for the `created_turn` member (created_turn: number;).

   * Contract: Describes stable behavior for callers of `created_turn` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
created_turn: number;
    /**
   * Specifies the contract for the `origin_hex` member (origin_hex: string;).

   * Contract: Describes stable behavior for callers of `origin_hex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
origin_hex: string;
}

/**
 * Documents the `AssignOrderParams` interface as a named contract surface (export interface AssignOrderParams).

 * Purpose: Supports maintainability by documenting why `AssignOrderParams` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface AssignOrderParams {
    /**
   * Specifies the contract for the `type` member (type: 'defend' | 'march' | 'pursue' | 'patrol' | 'hold_fire';).

   * Contract: Describes stable behavior for callers of `type` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
type: 'defend' | 'march' | 'pursue' | 'patrol' | 'hold_fire';
    /**
   * Specifies the contract for the `defendHex` member (defendHex?: [number, number];).

   * Contract: Describes stable behavior for callers of `defendHex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
defendHex?: [number, number];
    /**
   * Specifies the contract for the `engageRange` member (engageRange?: number;).

   * Contract: Describes stable behavior for callers of `engageRange` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
engageRange?: number;
    /**
   * Specifies the contract for the `destination` member (destination?: [number, number];).

   * Contract: Describes stable behavior for callers of `destination` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
destination?: [number, number];
    /**
   * Specifies the contract for the `avoidEnemies` member (avoidEnemies?: boolean;).

   * Contract: Describes stable behavior for callers of `avoidEnemies` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
avoidEnemies?: boolean;
    /**
   * Specifies the contract for the `engageEnRoute` member (engageEnRoute?: boolean;).

   * Contract: Describes stable behavior for callers of `engageEnRoute` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
engageEnRoute?: boolean;
    /**
   * Specifies the contract for the `targetUnitId` member (targetUnitId?: string;).

   * Contract: Describes stable behavior for callers of `targetUnitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
targetUnitId?: string;
    /**
   * Specifies the contract for the `maxDistance` member (maxDistance?: number;).

   * Contract: Describes stable behavior for callers of `maxDistance` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
maxDistance?: number;
    /**
   * Specifies the contract for the `waypoints` member (waypoints?: [number, number][];).

   * Contract: Describes stable behavior for callers of `waypoints` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
waypoints?: [number, number][];
}

/**
 * Defines the `safeParseJson` function shape (export function safeParseJson<T>(raw: string | null | undefined, fallback: T): T).

 * Purpose: Supports maintainability by documenting why `safeParseJson` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Defines the `parseOrderParams` function shape (export function parseOrderParams(row: Pick<StandingOrderRow, 'params'>): Record<string, unknown>).

 * Purpose: Supports maintainability by documenting why `parseOrderParams` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function parseOrderParams(row: Pick<StandingOrderRow, 'params'>): Record<string, unknown> {
  return safeParseJson<Record<string, unknown>>(row.params, {});
}

/**
 * Defines the `parseComputedRoute` function shape (export function parseComputedRoute(row: Pick<StandingOrderRow, 'computed_route'>): Record<string, unknown> | null).

 * Purpose: Supports maintainability by documenting why `parseComputedRoute` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function parseComputedRoute(row: Pick<StandingOrderRow, 'computed_route'>): Record<string, unknown> | null {
  return safeParseJson<Record<string, unknown> | null>(row.computed_route, null);
}

/**
 * Parses `computed_route` JSON into a typed standing-order route payload.
 *
 * Purpose: Reads persisted route progress and optional display cache fields from the DB row.
 * When to use: `rowToOrderResponse`, turn generation, and any code that inspects stored march routes.
 * Expected outcome: Returns null when the column is empty or invalid JSON; cache fields are optional for legacy rows.
 * Exceptions: None.
 */
export function parseStandingOrderComputedRoute(
  row: Pick<StandingOrderRow, 'computed_route'>
): StandingOrderComputedRoutePayload | null {
  const raw = parseComputedRoute(row);
  if (!raw) return null;
  const turnsRemaining = typeof raw.turnsRemaining === 'number' ? raw.turnsRemaining : 0;
  const nextMoveHex =
    Array.isArray(raw.nextMoveHex) && raw.nextMoveHex.length >= 2
      ? (raw.nextMoveHex as [number, number])
      : ([0, 0] as [number, number]);
  const totalPath = Array.isArray(raw.totalPath) ? (raw.totalPath as [number, number][]) : ([] as [number, number][]);
  const cachedOriginH3 = typeof raw.cachedOriginH3 === 'string' ? raw.cachedOriginH3 : undefined;
  const cachedRouteSegments = Array.isArray(raw.cachedRouteSegments)
    ? (raw.cachedRouteSegments as HumanOrderPreviewSegment[])
    : undefined;
  return { turnsRemaining, nextMoveHex, totalPath, cachedOriginH3, cachedRouteSegments };
}

/**
 * Builds the JSON payload persisted in `standing_orders.computed_route` after a successful route plan.
 *
 * Purpose: Stores turn progress plus display cache keyed by the unit's planning origin H3.
 * When to use: After `executePlanRouteWithSession` in assign and turn-generation paths.
 * Expected outcome: Includes `cachedOriginH3` and `cachedRouteSegments` for stable overlay reuse while the unit remains at the origin cell.
 * Exceptions: None.
 */
export function toComputedRoutePayload(routeResult: PlanRouteOk, originH3: string): StandingOrderComputedRoutePayload {
  const totalPath = routeResult.path.flatMap((seg) => seg.hexes);
  const nextMoveHex = routeResult.path.length > 0 ? routeResult.path[0]!.endHex : routeResult.destination;
  const cachedRouteSegments: HumanOrderPreviewSegment[] = routeResult.path.map((seg) => ({
    turn: seg.turn,
    hexes: seg.hexes,
  }));
  return {
    turnsRemaining: routeResult.turnsRequired,
    nextMoveHex,
    totalPath,
    cachedOriginH3: originH3,
    cachedRouteSegments,
  };
}
