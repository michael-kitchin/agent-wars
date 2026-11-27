/**
 * Standing-order fire the engine aims itself never chooses a side in the owner's automatic-fire list.
 * Run with: node dist/main/tools/standingOrdersHoldAutomaticFireAgainst.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { dbGetOne, dbRun, getGameState, type GameStateSnapshot } from '../gameDb';
import { writeHoldAutomaticFireAgainstSeatIds } from '../gameDb/holdAutomaticFireAgainstMemory';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { safeGridHexDistance } from './assessUnitProximity';
import { generateOrdersForStandingOrders } from './standingOrders';

const OWNER = AI_SEAT_IDS[0];
const OPS = { getOne: dbGetOne, run: dbRun };

/**
 * Generates the owner's standing-order rows without advancing stored progress.
 *
 * Purpose: Each case reads the same stored order twice, with and without a list.
 * When to use: After the standing order and the enemy are in place.
 * Expected outcome: The generator's movement, ranged, and air rows.
 * Exceptions: Propagates database failures.
 */
function generate(state: GameStateSnapshot): ReturnType<typeof generateOrdersForStandingOrders> {
  const latLngByH3 = new Map(state.hexes.map((h) => [h.h3Index, cellToLatLng(h.h3Index) as [number, number]]));
  /**
   * Resolves a coordinate back to a hex of the case's map.
   *
   * Purpose: The generator needs a resolver.
   * When to use: Passed to the standing-order generator.
   * Expected outcome: The matching hex, or undefined.
   * Exceptions: None.
   */
  const resolveToH3 = (lat: number, lng: number): string | undefined => {
    try {
      return latLngToCell(lat, lng, 1);
    } catch {
      return undefined;
    }
  };
  return generateOrdersForStandingOrders(OWNER, state, latLngByH3, resolveToH3, { mutateProgress: false });
}

/**
 * Stores one standing order for the owner.
 *
 * Purpose: Both cases insert a row the same way.
 * When to use: Before generating.
 * Expected outcome: One `en_route` row for the unit.
 * Exceptions: Propagates database failures.
 */
function insertOrder(
  unit: GameStateSnapshot['units'][number],
  turnNumber: number,
  params: Record<string, unknown> & { type: string },
): void {
  dbRun(
    `INSERT OR REPLACE INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      OWNER,
      unit.id,
      params.type,
      JSON.stringify(params),
      null,
      'en_route',
      turnNumber,
      JSON.stringify(cellToLatLng(unit.h3Index)),
    ]
  );
}

/**
 * How many attacks the generator aimed for one unit.
 *
 * Purpose: Air produces strikes and everything else ranged rows; both count as fire.
 * When to use: Asserting on one unit's automatic fire.
 * Expected outcome: The ranged plus air rows naming the unit.
 * Exceptions: None.
 */
function attackCount(generated: ReturnType<typeof generate>, unitId: string): number {
  return (
    generated.rangedAttacks.filter((row) => row.unitId === unitId).length +
    generated.airStrikes.filter((row) => row.unitId === unitId).length
  );
}

test('a DEFEND unit does not fire at a listed side, and fires once the list is empty', (t) => {
  withTempGameDb('aw-automatic-fire-defend-', () => {
    const state = getGameState();
    const armor = state.units.find((u) => u.player === OWNER && u.unitType === 'armor');
    const occupied = new Set(state.units.map((u) => u.h3Index));
    const hexSet = new Set(state.hexes.map((h) => h.h3Index));
    const enemyH3 = armor && gridDisk(armor.h3Index, 1).find(
      (h3) => hexSet.has(h3) && !occupied.has(h3) && safeGridHexDistance(armor.h3Index, h3) === 1
    );
    if (!armor || !enemyH3) {
      t.skip('seed lacks opponent armor with a free neighbour');
      return;
    }
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES (?, ?, 'infantry', ?, 97)`,
      ['automatic-fire-defend-target', HUMAN_SEAT_ID, enemyH3]
    );
    insertOrder(armor, state.turnNumber, { type: 'defend', defendHex: cellToLatLng(armor.h3Index) });
    writeHoldAutomaticFireAgainstSeatIds(OPS, OWNER, [HUMAN_SEAT_ID], 1);
    assert.equal(attackCount(generate(getGameState()), armor.id), 0);
    writeHoldAutomaticFireAgainstSeatIds(OPS, OWNER, [], 1);
    assert.equal(attackCount(generate(getGameState()), armor.id), 1);
  });
});

test('a march with engageEnRoute does not fire at a listed side and still moves', (t) => {
  withTempGameDb('aw-automatic-fire-enroute-', () => {
    const state = getGameState();
    const naval = state.units.find((u) => u.player === OWNER && u.unitType === 'naval');
    if (!naval) {
      t.skip('no opponent naval unit in seed');
      return;
    }
    const hexByH3 = new Map(state.hexes.map((h) => [h.h3Index, h]));
    const occupied = new Set(state.units.map((u) => u.h3Index));
    const targetH3 = gridDisk(naval.h3Index, 2).find(
      (h3) => hexByH3.has(h3) && !occupied.has(h3) && safeGridHexDistance(naval.h3Index, h3) === 2
    );
    const marchDest = state.hexes.find(
      (h) => h.terrain === 'water' && h.h3Index !== naval.h3Index && h.h3Index !== targetH3
    );
    if (!targetH3 || !marchDest) {
      t.skip('seed lacks a range-2 target or march destination');
      return;
    }
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES (?, ?, 'naval', ?, 98)`,
      ['automatic-fire-enroute-target', HUMAN_SEAT_ID, targetH3]
    );
    insertOrder(naval, state.turnNumber, {
      type: 'march',
      destination: cellToLatLng(marchDest.h3Index),
      avoidEnemies: false,
      engageEnRoute: true,
    });
    writeHoldAutomaticFireAgainstSeatIds(OPS, OWNER, [HUMAN_SEAT_ID], 1);
    const held = generate(getGameState());
    assert.equal(attackCount(held, naval.id), 0);
    assert.ok(held.movementOrders.some((row) => row.unitId === naval.id), 'the march still moves');
    writeHoldAutomaticFireAgainstSeatIds(OPS, OWNER, [], 1);
    assert.equal(attackCount(generate(getGameState()), naval.id), 1);
  });
});
