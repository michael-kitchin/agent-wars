/**
 * Standing orders for cargo that is already aboard a carrier.
 *
 * Purpose: A march or a defend walk-back must not queue a step for embarked infantry, and must not rewrite the stored order.
 * When to use: From the standing-order test list, after changes to order generation.
 * Expected outcome: The embarked infantry contributes no movement order. The naval unit's march still does. The stored row stays as inserted.
 * Exceptions: None. The temporary database is removed by `withTempGameDb`.
 */

import * as assert from 'assert';
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { dbGetOne, dbRun, getGameState } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { generateOrdersForStandingOrders } from './standingOrdersGeneration';
import type { GameStateSnapshot } from '../gameDb';

/**
 * Inserts one standing order and returns the snapshot with the infantry marked aboard the naval unit.
 *
 * Purpose: Generation reads the snapshot field, so the assignment table is not required for this contract.
 * When to use: Both the march case and the defend case.
 * Expected outcome: The inserted row is `en_route` with a null computed route. The returned snapshot names the carrier.
 * Exceptions: Throws when the seeded match has no opponent infantry or naval unit, or no on-map destination.
 */
function embarkInfantryWithOrder(orderType: 'march' | 'defend'): {
  readonly state: GameStateSnapshot;
  readonly infantryId: string;
  readonly navalId: string;
} {
  const seeded = getGameState();
  const infantry = seeded.units.find((unit) => unit.player === AI_SEAT_IDS[0] && unit.unitType === 'infantry');
  const naval = seeded.units.find((unit) => unit.player === AI_SEAT_IDS[0] && unit.unitType === 'naval');
  assert.ok(infantry && naval, 'expected an opponent infantry unit and an opponent naval unit');
  const near = new Set(gridDisk(infantry.h3Index, 1));
  const destinationH3 = gridDisk(infantry.h3Index, 2).find(
    (h3) => !near.has(h3) && seeded.hexes.some((hex) => hex.h3Index === h3)
  );
  assert.ok(destinationH3, 'expected an on-map hex two steps away');
  const destination = cellToLatLng(destinationH3);
  const params =
    orderType === 'march'
      ? { type: 'march', destination, avoidEnemies: false, engageEnRoute: false }
      : { type: 'defend', defendHex: destination };
  dbRun('DELETE FROM standing_orders');
  dbRun(
    `INSERT INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      AI_SEAT_IDS[0],
      infantry.id,
      orderType,
      JSON.stringify(params),
      null,
      'en_route',
      seeded.turnNumber,
      JSON.stringify(cellToLatLng(infantry.h3Index)),
    ]
  );
  const state = getGameState();
  const embarked = state.units.find((unit) => unit.id === infantry.id);
  assert.ok(embarked, 'expected the infantry unit on the refreshed snapshot');
  embarked.embarkedOnCarrierUnitId = naval.id;
  return { state, infantryId: infantry.id, navalId: naval.id };
}

/**
 * Builds the coordinate arguments standing-order generation already uses in other tests.
 *
 * Purpose: Route resolution for the naval march needs the same lat/lng map as the rest of the file.
 * When to use: Immediately before `generateOrdersForStandingOrders`.
 * Expected outcome: One entry per snapshot hex, and a resolver at strategic resolution 1.
 * Exceptions: The resolver returns undefined when H3 cannot encode the point.
 */
function coordinateArgs(state: GameStateSnapshot): {
  readonly latLngByH3: Map<string, [number, number]>;
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
} {
  const latLngByH3 = new Map(state.hexes.map((hex) => [hex.h3Index, cellToLatLng(hex.h3Index) as [number, number]]));
  const resolveToH3 = (lat: number, lng: number): string | undefined => {
    try {
      return latLngToCell(lat, lng, 1);
    } catch {
      return undefined;
    }
  };
  return { latLngByH3, resolveToH3 };
}

/**
 * Reads the stored standing order after generation.
 *
 * Purpose: The hold is wrong if the row is advanced even when no movement order is returned.
 * When to use: After `generateOrdersForStandingOrders` for the embarked infantry.
 * Expected outcome: The status and computed route that were inserted.
 * Exceptions: Throws when the row is missing.
 */
function storedOrder(unitId: string): { readonly status: string; readonly computedRoute: string | null } {
  const row = dbGetOne<{ status: string; computedRoute: string | null }>(
    'SELECT status, computed_route AS computedRoute FROM standing_orders WHERE player_id = ? AND unit_id = ?',
    [AI_SEAT_IDS[0], unitId]
  );
  assert.ok(row, `expected a standing order for ${unitId}`);
  return row;
}

/**
 * Checks that embarked infantry stay put while a naval march still queues a step.
 *
 * Purpose: Cargo must not unload because a standing march or a defend post points somewhere else.
 * When to use: The standing-order test list.
 * Expected outcome: No infantry movement order. The stored row is unchanged. The naval unit still receives a movement order.
 * Exceptions: None.
 */
export function testEmbarkedGroundStandingOrdersHold(): void {
  withTempGameDb('aw-embark-hold-', () => {
    const march = embarkInfantryWithOrder('march');
    const naval = march.state.units.find((unit) => unit.id === march.navalId);
    assert.ok(naval, 'expected the naval unit on the snapshot');
    const navalNear = new Set(gridDisk(naval.h3Index, 0));
    const navalDest = gridDisk(naval.h3Index, 1).find(
      (h3) =>
        !navalNear.has(h3) &&
        march.state.hexes.some((hex) => hex.h3Index === h3 && (hex.terrain === 'water' || hex.terrain === 'coastal' || hex.terrainKind === 'coastal'))
    );
    assert.ok(navalDest, 'expected an adjacent water or coastal hex for the naval march');
    const navalLatLng = cellToLatLng(navalDest);
    dbRun(
      `INSERT INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        AI_SEAT_IDS[0],
        naval.id,
        'march',
        JSON.stringify({ type: 'march', destination: navalLatLng, avoidEnemies: false, engageEnRoute: false }),
        null,
        'en_route',
        march.state.turnNumber,
        JSON.stringify(cellToLatLng(naval.h3Index)),
      ]
    );
    const coords = coordinateArgs(march.state);
    const generated = generateOrdersForStandingOrders(AI_SEAT_IDS[0], march.state, coords.latLngByH3, coords.resolveToH3);
    assert.equal(
      generated.movementOrders.some((order) => order.unitId === march.infantryId),
      false,
      'embarked infantry march must not queue a step'
    );
    assert.equal(
      generated.movementOrders.some((order) => order.unitId === march.navalId),
      true,
      'naval march must still queue a step'
    );
    const marchRow = storedOrder(march.infantryId);
    assert.equal(marchRow.status, 'en_route');
    assert.equal(marchRow.computedRoute, null);

    const defend = embarkInfantryWithOrder('defend');
    const defendCoords = coordinateArgs(defend.state);
    const defendGenerated = generateOrdersForStandingOrders(
      AI_SEAT_IDS[0],
      defend.state,
      defendCoords.latLngByH3,
      defendCoords.resolveToH3
    );
    assert.equal(
      defendGenerated.movementOrders.some((order) => order.unitId === defend.infantryId),
      false,
      'embarked infantry defend must not walk back'
    );
    const defendRow = storedOrder(defend.infantryId);
    assert.equal(defendRow.status, 'en_route');
    assert.equal(defendRow.computedRoute, null);
  });
}
