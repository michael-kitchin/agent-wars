/**
 * Stay-put friendly occupancy for Best Options / orderless approach dests.
 *
 * Purpose: Approach rows should omit stacks that will still sit on a cell this period, but a cell a friendly is
 * leaving (or already ordered to) is a legal WEGO dest.
 * When to use: Strategic this-turn approach filtering and orderless suggested destinations.
 * Expected outcome: Current hexes of units with a this-period dest other than their origin are not stay-put occupied;
 * dest hexes are not marked occupied unless another stay-put unit is there.
 * Exceptions: Missing or unreadable standing-order routes yield an empty move map (all friendlies treated as stay-put).
 */

import { dbGetAll, isDbReady } from '../gameDb';
import { logError, logTrace } from '../logger';
import { strategicCellAt } from '../../shared/h3Resolutions';
import {
  parseStandingOrderComputedRoute,
  type StandingOrderRow,
} from './standingOrdersShared';

/**
 * Flattens a hex-keyed friendly index into occupant rows.
 *
 * Purpose: Best Options indexes by hex; stay-put occupancy needs per-unit origin plus id so leavers can be dropped.
 * When to use: Before `stayPutFriendlyOccupiedHexes` when the caller has `friendlyUnitsByHex`.
 * Expected outcome: One row per occupant; empty lists contribute nothing.
 * Exceptions: None.
 */
export function friendlyOccupantsFromHexIndex(
  friendlyUnitsByHex: ReadonlyMap<string, ReadonlyArray<{ id: string }>>
): { id: string; h3Index: string }[] {
  logTrace('stayPutFriendlyOccupancy friendlyOccupantsFromHexIndex', {
    hexCount: friendlyUnitsByHex.size,
  });
  const rows: { id: string; h3Index: string }[] = [];
  for (const [h3Index, units] of friendlyUnitsByHex) {
    for (const unit of units) {
      rows.push({ id: unit.id, h3Index });
    }
  }
  return rows;
}

/**
 * Current hexes still held by friendlies that are not moving this period.
 *
 * Purpose: Shared occupancy set for approach dest filtering so Best Options and orderless agree.
 * When to use: After collecting this-period moves for the AI side.
 * Expected outcome: Origin hexes of leavers omitted; dests of leavers not added unless another stay-put unit occupies them.
 * Exceptions: None.
 */
export function stayPutFriendlyOccupiedHexes(
  friendlies: ReadonlyArray<{ id: string; h3Index: string }>,
  thisPeriodMoveByUnitId: ReadonlyMap<string, string>
): Set<string> {
  logTrace('stayPutFriendlyOccupancy stayPutFriendlyOccupiedHexes', {
    friendlyCount: friendlies.length,
    moveCount: thisPeriodMoveByUnitId.size,
  });
  const stay = new Set<string>();
  for (const unit of friendlies) {
    const dest = thisPeriodMoveByUnitId.get(unit.id);
    if (dest !== undefined && dest !== unit.h3Index) continue;
    stay.add(unit.h3Index);
  }
  return stay;
}

/**
 * This-period dests from stored opponent standing-order routes.
 *
 * Purpose: Briefing assembly cannot wait for Ready's standing-order generator; the persisted next step is the dest
 * the engine will apply unless the model overrides it.
 * When to use: Strategic Best Options and orderless suggestion occupancy, when SQLite is open.
 * Expected outcome: `unitId → dest h3` for rows whose computed next step resolves to a strategic cell other than a dummy origin.
 * Exceptions: Returns an empty map when the database is not ready or the query fails.
 */
export function readStandingThisPeriodMoves(playerId: string): Map<string, string> {
  logTrace('stayPutFriendlyOccupancy readStandingThisPeriodMoves', { playerId });
  const moves = new Map<string, string>();
  if (!isDbReady()) return moves;
  try {
    const rows = dbGetAll<Pick<StandingOrderRow, 'unit_id' | 'computed_route'>>(
      'SELECT unit_id, computed_route FROM standing_orders WHERE player_id = ?',
      [playerId]
    );
    for (const row of rows) {
      const computed = parseStandingOrderComputedRoute(row);
      if (!computed) continue;
      const [lat, lng] = computed.nextMoveHex;
      if (lat === 0 && lng === 0 && computed.totalPath.length === 0) continue;
      let destH3: string;
      try {
        destH3 = strategicCellAt(lat, lng);
      } catch {
        continue;
      }
      moves.set(row.unit_id, destH3);
    }
    logTrace('stayPutFriendlyOccupancy readStandingThisPeriodMoves: loaded', {
      playerId,
      moveCount: moves.size,
    });
  } catch (err) {
    logError('stayPutFriendlyOccupancy readStandingThisPeriodMoves: failed', err);
  }
  return moves;
}
