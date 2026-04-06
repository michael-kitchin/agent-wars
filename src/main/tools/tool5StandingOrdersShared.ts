import type { PlanRouteOk } from './tool1Pathfinding';

export interface StandingOrderRow extends Record<string, unknown> {
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
export interface AssignOrderParams {
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

export function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function parseOrderParams(row: Pick<StandingOrderRow, 'params'>): Record<string, unknown> {
  return safeParseJson<Record<string, unknown>>(row.params, {});
}

export function parseComputedRoute(row: Pick<StandingOrderRow, 'computed_route'>): Record<string, unknown> | null {
  return safeParseJson<Record<string, unknown> | null>(row.computed_route, null);
}

/**
 * Why this exists:
 *     Normalizes Tool 1 route results into the persisted standing-order route payload so assign and generation flows
 *     do not drift in field semantics.
 * When to use:
 *     When writing `computed_route` for march/pursue/defend updates.
 * What to expect:
 *     Returns `turnsRemaining`, `nextMoveHex`, and `totalPath` in the canonical shape used by standing-order logic.
 */
export function toComputedRoutePayload(routeResult: PlanRouteOk): {
  turnsRemaining: number;
  nextMoveHex: [number, number];
  totalPath: [number, number][];
} {
  const totalPath = routeResult.path.flatMap((seg) => seg.hexes);
  const nextMoveHex = routeResult.path.length > 0 ? routeResult.path[0]!.endHex : routeResult.destination;
  return {
    turnsRemaining: routeResult.turnsRequired,
    nextMoveHex,
    totalPath,
  };
}
