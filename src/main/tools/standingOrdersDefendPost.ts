/**
 * Defend-post progress for standing orders.
 *
 * Purpose: A defender off its post walks back. The briefing has to say so, and an explicit move can move the post.
 * When to use: `expireAndUpdateStatus` before a strategic briefing or standing-order generation, and after a validated model move.
 * Expected outcome: `holding` on the post, `en_route` with a route back, or `blocked` when no route exists. Air defenders are unchanged.
 * Exceptions: A missing or unresolvable post is left as stored.
 */

import { strategicCellAt } from '../../shared/h3Resolutions';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { dbGetOne, dbRun, saveDatabase } from '../gameDb';
import { logDebug, logError, logTrace } from '../logger';
import { executePlanRouteWithSession, type PathfindingSession } from './pathfinding';
import {
  parseOrderParams,
  toComputedRoutePayload,
  type StandingOrderComputedRoutePayload,
  type StandingOrderRow,
} from './standingOrdersShared';

/**
 * Resolves a defend order's stored post to a strategic cell.
 *
 * Purpose: Status and walk-back both compare the unit's cell with the post, and the stored value is a lat/lng center.
 * When to use: Before deciding whether a defender is on its post.
 * Expected outcome: The strategic H3 of `params.defendHex`, or undefined when the post is missing or cannot be resolved.
 * Exceptions: A throw from `strategicCellAt` is logged and returned as undefined.
 */
export function resolveDefendPostH3(row: StandingOrderRow): string | undefined {
  logTrace('standingOrdersDefendPost resolveDefendPostH3', { unitId: row.unit_id });
  const defendHex = parseOrderParams(row).defendHex;
  if (!Array.isArray(defendHex) || defendHex.length < 2) return undefined;
  const lat = Number(defendHex[0]);
  const lng = Number(defendHex[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  try {
    return strategicCellAt(lat, lng);
  } catch (err) {
    logError('standingOrdersDefendPost resolveDefendPostH3: unresolved', { unitId: row.unit_id, err });
    return undefined;
  }
}

/**
 * Writes a defend order's status and route without saving the database.
 *
 * Purpose: `expireAndUpdateStatus` saves once after every row, so each defend write must not save on its own.
 * When to use: Only from `refreshDefendPostProgress`.
 * Expected outcome: One update of `status` and `computed_route` for that player and unit.
 * Exceptions: Propagates a database write failure.
 */
function writeDefendProgress(
  playerId: string,
  unitId: string,
  status: string,
  computedRoute: StandingOrderComputedRoutePayload | { readonly turnsRemaining: number }
): void {
  dbRun(
    'UPDATE standing_orders SET status = ?, computed_route = ? WHERE player_id = ? AND unit_id = ?',
    [status, JSON.stringify(computedRoute), playerId, unitId]
  );
}

/**
 * Sets a defend order's status and the route the briefing will show.
 *
 * Purpose: An off-post defender is walked back every turn. The stored status and next step have to say that before the briefing is built.
 * When to use: `expireAndUpdateStatus` for each defend row. Air units hold station and are not rewritten.
 * Expected outcome: On the post, `holding` and `{"turnsRemaining":0}` with no next step. Off the post with a route, `en_route` and a full route payload. Off the post with no route, `blocked` and `{"turnsRemaining":0}`. A missing post is left unchanged.
 * Exceptions: None. A route error is stored as `blocked` and logged.
 */
export function refreshDefendPostProgress(args: {
  readonly playerId: string;
  readonly row: StandingOrderRow;
  readonly unit: GameStateSnapshot['units'][number];
  readonly getRouteSession: () => PathfindingSession;
}): void {
  logDebug('standingOrdersDefendPost refreshDefendPostProgress', {
    playerId: args.playerId,
    unitId: args.row.unit_id,
    unitType: args.unit.unitType,
  });
  if (args.unit.unitType === 'air') return;
  const postH3 = resolveDefendPostH3(args.row);
  if (!postH3) return;
  if (args.unit.h3Index === postH3) {
    writeDefendProgress(args.playerId, args.row.unit_id, 'holding', { turnsRemaining: 0 });
    return;
  }
  const defendHex = parseOrderParams(args.row).defendHex as [number, number];
  const routeResult = executePlanRouteWithSession(
    args.row.unit_id,
    [Number(defendHex[0]), Number(defendHex[1])],
    { avoidEnemies: false },
    args.getRouteSession()
  );
  if (routeResult.status === 'ok' && routeResult.path.length > 0) {
    writeDefendProgress(
      args.playerId,
      args.row.unit_id,
      'en_route',
      toComputedRoutePayload(routeResult, args.unit.h3Index)
    );
    return;
  }
  const error = routeResult.status === 'error' ? routeResult.error : 'empty path';
  logDebug('standingOrdersDefendPost refreshDefendPostProgress: no route back', {
    playerId: args.playerId,
    unitId: args.row.unit_id,
    error,
  });
  writeDefendProgress(args.playerId, args.row.unit_id, 'blocked', { turnsRemaining: 0 });
}

/**
 * Moves a defend post to the destination of a validated model move.
 *
 * Purpose: An explicit move used to last one turn, and the next refresh walked the unit back to the old post.
 * When to use: After strategic movement validation, when standing-order tools are on. Pass only moves that came from the model.
 * Expected outcome: Each kept row stores the destination center as `defendHex`, status `en_route`, and a null route. The returned ids are the rows that changed. A move onto the current post, an air unit, a non-defend row, and a unit in `skipUnitIds` are left as stored.
 * Exceptions: A destination missing from `latLngByH3` is logged and skipped. A database write failure propagates.
 */
export function moveDefendPostsToExplicitMoveDestinations(args: {
  readonly playerId: string;
  readonly state: GameStateSnapshot;
  readonly moves: readonly { unitId: string; toH3Index: string }[];
  readonly skipUnitIds: ReadonlySet<string>;
  readonly latLngByH3: ReadonlyMap<string, [number, number]>;
}): readonly string[] {
  logDebug('standingOrdersDefendPost moveDefendPostsToExplicitMoveDestinations', {
    playerId: args.playerId,
    moveCount: args.moves.length,
    skipCount: args.skipUnitIds.size,
  });
  const changed: string[] = [];
  for (const move of args.moves) {
    if (args.skipUnitIds.has(move.unitId)) continue;
    const unit = args.state.units.find((candidate) => candidate.id === move.unitId && candidate.player === args.playerId);
    if (!unit || unit.unitType === 'air') continue;
    const row = dbGetOne<StandingOrderRow>(
      'SELECT * FROM standing_orders WHERE player_id = ? AND unit_id = ?',
      [args.playerId, move.unitId]
    );
    if (!row || row.order_type !== 'defend') continue;
    const postH3 = resolveDefendPostH3(row);
    if (postH3 === move.toH3Index) continue;
    const center = args.latLngByH3.get(move.toH3Index);
    if (!center) {
      logError('standingOrdersDefendPost moveDefendPostsToExplicitMoveDestinations: destination has no center', {
        playerId: args.playerId,
        unitId: move.unitId,
        toH3Index: move.toH3Index,
      });
      continue;
    }
    const params = parseOrderParams(row);
    params.defendHex = [center[0], center[1]];
    dbRun(
      'UPDATE standing_orders SET params = ?, status = ?, computed_route = NULL WHERE player_id = ? AND unit_id = ?',
      [JSON.stringify(params), 'en_route', args.playerId, move.unitId]
    );
    logDebug('standingOrdersDefendPost moveDefendPostsToExplicitMoveDestinations: post moved', {
      playerId: args.playerId,
      unitId: move.unitId,
      oldPost: postH3,
      newPost: move.toH3Index,
    });
    changed.push(move.unitId);
  }
  if (changed.length > 0) saveDatabase();
  return changed;
}
