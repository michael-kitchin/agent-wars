/**
 * Applies strategic ferry orders as an airport chain.
 *
 * Purpose: Resolution recomputes the path from the database after movement, so a queued line cannot outrun a wrecked airport.
 * When to use: `executeReadyStrategicTurn`, after ground and naval movement and before cargo sync.
 * Expected outcome: Each air unit is at the destination, still at a legal origin, or deleted when that origin is gone.
 * Exceptions: None. A missing unit is skipped.
 */

import type { FerryAnimationMove, FerryOrder } from '../../shared/ipc/ordersTypes';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { dbGetAll, dbGetOne, dbRun, getHexController, getStrategicInfrastructureForHex } from '../gameDb';
import { logDebug } from '../logger';
import { rememberStrategicHexBeforeMove } from '../strategicUnitPreviousHex';
import { resolveStrategicAirportFerry } from './airFerryRoute';
import { applyTransportLossForRemovedNavalUnits } from './sealift';

/**
 * Moves each ferrying air unit along the chain that exists at resolution time.
 *
 * Purpose: The stored order is only the destination. The path is flown, not a straight hop.
 * When to use: Once per strategic Ready, with the ferry rows that survived the strike and drop filters.
 * Expected outcome: `FerryAnimationMove` rows whose `pathH3Indexes` include the origin and the destination. An unreachable order leaves a still-legal origin in place and deletes the unit when that origin is no longer a base.
 * Exceptions: None.
 */
export function resolveStrategicFerryOrders(orders: readonly FerryOrder[]): FerryAnimationMove[] {
  logDebug('airFerryResolution resolveStrategicFerryOrders', { orderCount: orders.length });
  const moves: FerryAnimationMove[] = [];
  for (const ferry of orders) {
    const unit = dbGetOne<{ id: string; player: string; unit_type: string; h3_index: string }>(
      'SELECT id, player, unit_type, h3_index FROM units WHERE id = ?',
      [ferry.unitId]
    );
    if (!unit || unit.unit_type !== 'air' || unit.h3_index === ferry.destinationH3Index) {
      logDebug('airFerryResolution skip ferry', {
        unitId: ferry.unitId,
        found: unit != null,
        unitType: unit?.unit_type ?? null,
        h3Index: unit?.h3_index ?? null,
      });
      continue;
    }
    const route = resolveStrategicAirportFerry({
      unitId: ferry.unitId,
      originH3Index: unit.h3_index,
      destinationH3Index: ferry.destinationH3Index,
      owner: unit.player,
    });
    if (route.reachable) {
      rememberStrategicHexBeforeMove(ferry.unitId, unit.h3_index, ferry.destinationH3Index);
      dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [ferry.destinationH3Index, ferry.unitId]);
      moves.push({
        unitId: ferry.unitId,
        player: unit.player,
        fromH3Index: unit.h3_index,
        toH3Index: ferry.destinationH3Index,
        pathH3Indexes: route.pathH3Indexes,
      });
      continue;
    }
    const originInfra = getStrategicInfrastructureForHex(unit.h3_index);
    const originController = getHexController(unit.h3_index);
    const originStillABase = originInfra.airportCount > 0 && originController === unit.player;
    logDebug('airFerryResolution unreachable ferry', {
      unitId: ferry.unitId,
      originH3Index: unit.h3_index,
      destinationH3Index: ferry.destinationH3Index,
      reason: route.reason,
      originStillABase,
    });
    if (!originStillABase) {
      applyTransportLossForRemovedNavalUnits([{
        id: unit.id,
        player: unit.player,
        unitType: 'air',
        h3Index: unit.h3_index,
      }]);
      dbRun('DELETE FROM units WHERE id = ?', [ferry.unitId]);
    }
  }
  return moves;
}

/**
 * One infantry unit flying with its air unit.
 *
 * Purpose: Playback uses the same airports as the carrier. The infantry stays on the destination.
 * When to use: The result of `airCargoFollowMoves`.
 * Expected outcome: `pathH3Indexes` is the carrier's path. `player` is set for every owner except the human.
 * Exceptions: None.
 */
export type AirCargoFollowMove = {
  readonly unitId: string;
  readonly fromH3Index: string;
  readonly toH3Index: string;
  readonly pathH3Indexes: readonly string[];
  readonly player?: string;
};

/**
 * Playback rows for infantry whose air unit flew this turn.
 *
 * Purpose: The infantry glide uses the carrier path. A ferry that did not move contributes nothing.
 * When to use: After `resolveStrategicFerryOrders` and before cargo sync, while the infantry is still on the origin.
 * Expected outcome: Human infantry is in `humanMoves`. Every other owner is in `aiMoves` with that owner's id.
 * Exceptions: None.
 */
export function airCargoFollowMoves(ferryMoves: readonly FerryAnimationMove[]): {
  readonly humanMoves: readonly AirCargoFollowMove[];
  readonly aiMoves: readonly AirCargoFollowMove[];
} {
  logDebug('airFerryResolution airCargoFollowMoves', { ferryCount: ferryMoves.length });
  const flown = ferryMoves.filter((move) => move.pathH3Indexes && move.pathH3Indexes.length >= 2 && move.fromH3Index !== move.toH3Index);
  if (flown.length === 0) return { humanMoves: [], aiMoves: [] };
  const byCarrier = new Map(flown.map((move) => [move.unitId, move]));
  const placeholders = flown.map(() => '?').join(', ');
  const cargo = dbGetAll<{ landUnitId: string; player: string; h3Index: string; carrierUnitId: string }>(
    `SELECT lu.id AS landUnitId,
            lu.player AS player,
            lu.h3_index AS h3Index,
            uta.naval_unit_id AS carrierUnitId
     FROM unit_transport_assignments uta
     JOIN units lu ON lu.id = uta.land_unit_id
     WHERE uta.naval_unit_id IN (${placeholders})`,
    flown.map((move) => move.unitId)
  );
  const humanMoves: AirCargoFollowMove[] = [];
  const aiMoves: AirCargoFollowMove[] = [];
  for (const row of cargo) {
    const ferry = byCarrier.get(row.carrierUnitId);
    if (!ferry?.pathH3Indexes || row.h3Index === ferry.toH3Index) continue;
    const move: AirCargoFollowMove = {
      unitId: row.landUnitId,
      fromH3Index: row.h3Index,
      toH3Index: ferry.toH3Index,
      pathH3Indexes: ferry.pathH3Indexes,
    };
    if (row.player === HUMAN_SEAT_ID) humanMoves.push(move);
    else aiMoves.push({ ...move, player: row.player });
  }
  return { humanMoves, aiMoves };
}
