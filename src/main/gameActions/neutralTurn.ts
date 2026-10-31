/**
 * Neutral's orders for one strategic turn.
 *
 * Purpose: Loaded ships land or sail, and garrisons fire from their defend orders. Neutral never receives orders from a caller.
 * When to use: At the start of `executeReadyStrategicTurn`, before the pre-move snapshot.
 * Expected outcome: Unloaded troops are on the map, and Neutral's movement, ranged, and air orders are ready.
 * Exceptions: Propagates SQLite and pathfinding errors.
 */

import { gridDistance } from 'h3-js';
import { getMovementBudget } from '../combatConstants';
import { dbGetAll, dbGetOne, dbRun, getGameState } from '../gameDb';
import { logDebug, logError } from '../logger';
import { canManualDebarkFromHex, clearEmbarkAssignmentForLandUnit } from './sealift';
import { NEUTRAL_OWNER_ID, isSeatId } from '../../shared/seatIds';
import { createPathfindingSession, executePlanRouteWithSession, type LatLng } from '../tools/pathfinding';
import { executeStandingOrderActionForPlayer } from '../tools/standingOrdersCore';
import { generateOrdersForStandingOrders } from '../tools/standingOrdersGeneration';
import { EMPTY_OWNER_TURN_ORDERS, type OwnerTurnOrders } from './ownerTurnOrders';
import { chooseNeutralLandingTarget, type LandingCandidate } from './neutralLanding';

/**
 * Hex centers for Neutral's orders.
 *
 * Contract: The same pair the rest of the turn uses for standing orders.
 * When to use: `prepareNeutralTransportsForTurn` and `buildNeutralTurnOrders`.
 * Expected outcome: Every hex in the pair is on the loaded map.
 * Exceptions: None.
 */
export interface NeutralTurnCoordinates {
  /**
   * Center of each strategic hex.
   *
   * Contract: Keys are H3 indexes.
   * When to use: March destinations and defend hexes.
   * Expected outcome: A unit's current hex has a center.
   * Exceptions: None.
   */
  readonly latLngByH3: Map<string, LatLng>;
  /**
   * Resolves a center back to an H3 index.
   *
   * Contract: Undefined when the point is not a known hex.
   * When to use: Standing-order assignment.
   * Expected outcome: The inverse of `latLngByH3` for map hexes.
   * Exceptions: None.
   */
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
}

/**
 * How many Neutral units are on the map.
 *
 * Purpose: Both Neutral steps do nothing when the count is zero.
 * When to use: The start of each Neutral function.
 * Expected outcome: A non-negative integer.
 * Exceptions: None.
 */
function neutralUnitCount(): number {
  return dbGetOne<{ n: number }>('SELECT COUNT(*) AS n FROM units WHERE player = ?', [NEUTRAL_OWNER_ID])?.n ?? 0;
}

/**
 * Grid steps between two hexes.
 *
 * Purpose: The landing search orders candidates by this distance.
 * When to use: `chooseNeutralLandingTarget`.
 * Expected outcome: The H3 grid distance, or null when the pair cannot be measured.
 * Exceptions: None. A thrown measurement becomes null.
 */
function gridSteps(from: string, to: string): number | null {
  try {
    return gridDistance(from, to);
  } catch (err) {
    logDebug('neutralTurn gridSteps skipped a pair H3 cannot measure', { from, to, error: String(err) });
    return null;
  }
}

/**
 * Sailing time from a ship to a hex.
 *
 * Purpose: The landing search needs turns, not only grid distance.
 * When to use: The `sailingTurns` callback.
 * Expected outcome: The route's turn count, or null when there is no route. A route whose length is zero did not reach `toH3`; that candidate is not a landing.
 * Exceptions: None. A pathfinding error is null.
 */
function sailingTurns(
  session: ReturnType<typeof createPathfindingSession>,
  shipId: string,
  toH3: string,
  avoidEnemies: boolean,
  latLngByH3: Map<string, LatLng>
): number | null {
  const destination = latLngByH3.get(toH3);
  if (!destination) return null;
  const result = executePlanRouteWithSession(shipId, destination, { avoidEnemies }, session);
  if (result.status !== 'ok' || result.reachable === false || result.hexDistance === 0) return null;
  return result.turnsRequired;
}

/**
 * Writes one defend order and logs a rejection.
 *
 * Purpose: A garrison, a landed ship, and unloaded cargo all hold the hex they stand on.
 * When to use: After a ship unloads, and nowhere else in this file.
 * Expected outcome: A defend row, or an error log when the assignment is rejected.
 * Exceptions: None.
 */
function assignDefend(unitId: string, h3Index: string, coordinates: NeutralTurnCoordinates): void {
  const snapshot = getGameState();
  const result = executeStandingOrderActionForPlayer(
    NEUTRAL_OWNER_ID,
    'assign_order',
    { unitId, order: { type: 'defend', defendHex: coordinates.latLngByH3.get(h3Index) } },
    snapshot,
    coordinates.latLngByH3,
    coordinates.resolveToH3
  );
  if (result.status === 'error') logError('neutralTurn could not assign defend', { unitId, error: result.error });
}

/**
 * Removes a loaded ship that cannot reach a landing.
 *
 * Purpose: Cargo that can never land does not stay on the map.
 * When to use: When `chooseNeutralLandingTarget` returns null.
 * Expected outcome: The ship, its cargo, their assignments, and their standing orders are gone.
 * Exceptions: Propagates SQLite errors.
 */
function deleteStrandedTransport(shipId: string): void {
  const cargo = dbGetAll<{ id: string }>(
    'SELECT land_unit_id AS id FROM unit_transport_assignments WHERE naval_unit_id = ?',
    [shipId]
  ).map((row) => row.id);
  for (const unitId of [shipId, ...cargo]) {
    dbRun('DELETE FROM standing_orders WHERE unit_id = ?', [unitId]);
  }
  dbRun('DELETE FROM unit_transport_assignments WHERE naval_unit_id = ?', [shipId]);
  for (const unitId of cargo) dbRun('DELETE FROM units WHERE id = ?', [unitId]);
  dbRun('DELETE FROM units WHERE id = ?', [shipId]);
  logDebug('prepareNeutralTransportsForTurn deleted a stranded transport', { shipId, cargoCount: cargo.length });
}

/**
 * Unloads, retargets, or deletes Neutral transports.
 *
 * Purpose: A loaded ship on a landing hex unloads. Any other loaded ship sails, or is deleted when no landing can be reached.
 * When to use: Before the pre-move snapshot, once per strategic turn.
 * Expected outcome: Cargo that can land is no longer assigned. A ship with no route is gone. No Neutral units means no writes.
 * Exceptions: Propagates SQLite and pathfinding errors.
 */
export function prepareNeutralTransportsForTurn(coordinates: NeutralTurnCoordinates): void {
  logDebug('prepareNeutralTransportsForTurn', { hexCount: coordinates.latLngByH3.size });
  if (neutralUnitCount() === 0) return;
  const ships = dbGetAll<{ id: string; h3Index: string }>(
    `SELECT id, h3_index AS h3Index FROM units
     WHERE player = ? AND unit_type = 'naval'
       AND EXISTS (SELECT 1 FROM unit_transport_assignments WHERE naval_unit_id = units.id)`,
    [NEUTRAL_OWNER_ID]
  );
  if (ships.length === 0) return;
  const occupied = new Set(
    dbGetAll<{ player: string; h3Index: string }>('SELECT player, h3_index AS h3Index FROM units')
      .filter((unit) => isSeatId(unit.player))
      .map((unit) => unit.h3Index)
  );
  const candidates: LandingCandidate[] = [];
  for (const h3Index of coordinates.latLngByH3.keys()) {
    if (!canManualDebarkFromHex(h3Index, NEUTRAL_OWNER_ID)) continue;
    candidates.push({ h3Index, occupiedBySeat: occupied.has(h3Index) });
  }
  const occupiedByHex = new Map(candidates.map((candidate) => [candidate.h3Index, candidate.occupiedBySeat]));
  for (const ship of ships) {
    if (canManualDebarkFromHex(ship.h3Index, NEUTRAL_OWNER_ID)) {
      const cargo = dbGetAll<{ id: string }>(
        'SELECT land_unit_id AS id FROM unit_transport_assignments WHERE naval_unit_id = ?',
        [ship.id]
      );
      for (const unit of cargo) clearEmbarkAssignmentForLandUnit(unit.id);
      assignDefend(ship.id, ship.h3Index, coordinates);
      for (const unit of cargo) assignDefend(unit.id, ship.h3Index, coordinates);
      continue;
    }
    const session = createPathfindingSession(getGameState(), coordinates.latLngByH3, coordinates.resolveToH3);
    const choice = chooseNeutralLandingTarget({
      shipH3: ship.h3Index,
      candidates,
      gridDistance: gridSteps,
      navalMovesPerTurn: getMovementBudget('naval'),
      sailingTurns: (to) => sailingTurns(session, ship.id, to, occupiedByHex.get(to) !== true, coordinates.latLngByH3),
    });
    const destination = choice ? coordinates.latLngByH3.get(choice.h3Index) : undefined;
    if (!choice || !destination) {
      deleteStrandedTransport(ship.id);
      continue;
    }
    const snapshot = getGameState();
    const result = executeStandingOrderActionForPlayer(
      NEUTRAL_OWNER_ID,
      'assign_order',
      {
        unitId: ship.id,
        order: {
          type: 'march',
          destination,
          engageEnRoute: true,
          avoidEnemies: !choice.occupiedBySeat,
        },
      },
      snapshot,
      coordinates.latLngByH3,
      coordinates.resolveToH3
    );
    if (result.status === 'error') logError('neutralTurn could not assign a landing march', { shipId: ship.id, error: result.error });
  }
}

/**
 * Neutral's orders for this turn, from the omniscient snapshot.
 *
 * Purpose: Garrisons fire and marching ships move. The caller does not generate Neutral standing orders again.
 * When to use: After `prepareNeutralTransportsForTurn`, once the turn's coordinate map exists.
 * Expected outcome: Movement, ranged, and air orders. Ferry and embark stay empty. No Neutral units returns empty orders.
 * Exceptions: Propagates standing-order errors.
 */
export function buildNeutralTurnOrders(coordinates: NeutralTurnCoordinates): OwnerTurnOrders {
  logDebug('buildNeutralTurnOrders', { hexCount: coordinates.latLngByH3.size });
  if (neutralUnitCount() === 0) return EMPTY_OWNER_TURN_ORDERS;
  const generated = generateOrdersForStandingOrders(
    NEUTRAL_OWNER_ID,
    getGameState(),
    coordinates.latLngByH3,
    coordinates.resolveToH3,
    { mutateProgress: true }
  );
  return {
    movementOrders: generated.movementOrders,
    rangedOrders: generated.rangedAttacks,
    airStrikeOrders: generated.airStrikes,
    ferryOrders: [],
    embarkOrders: [],
    missileLaunchOrders: [],
  };
}
