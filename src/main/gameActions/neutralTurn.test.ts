/**
 * Neutral garrisons and loaded ships on a three-seat regional match.
 * Run: `node dist/main/gameActions/neutralTurn.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { AI_SEAT_IDS, NEUTRAL_OWNER_ID } from '../../shared/seatIds';
import { ready } from '../gameActions';
import { dbGetAll, dbGetOne, dbRun, getSeatRoster } from '../gameDb';
import { listGameMaps } from '../gameMap/listGameMaps';
import { buildLatLngCoordinateMap } from '../mapData';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { applyKnockout } from './knockoutConsequences';
import { canManualDebarkFromHex } from './sealift';
import { buildNeutralTurnOrders, prepareNeutralTransportsForTurn } from './neutralTurn';

/**
 * A regional map with at least three side groups.
 *
 * Purpose: Neutral units in these tests come from knocking out the second AI seat.
 * When to use: Before opening the temporary match.
 * Expected outcome: The map id and three group ids, or null when none is listed.
 * Exceptions: None.
 */
function threeGroupMap(): { id: string; sideGroupIds: string[] } | null {
  const map = listGameMaps().find((entry) => entry.id === 'western_asia_north' && entry.sideGroups.length >= 3)
    ?? listGameMaps().find((entry) => entry.sideGroups.length >= 3);
  if (!map) return null;
  return { id: map.id, sideGroupIds: map.sideGroups.slice(0, 3).map((group) => group.id) };
}

/**
 * Three seats on the chosen map.
 *
 * Purpose: Each test starts the same roster.
 * When to use: The `seats` option of `withSeatedTempGameDb`.
 * Expected outcome: One human seat and two AI seats.
 * Exceptions: None.
 */
function threeSeats(sideGroupIds: readonly string[]): NewGameSeatInput[] {
  return [
    { kind: 'human', sideGroupId: sideGroupIds[0] },
    { kind: 'ai', sideGroupId: sideGroupIds[1] },
    { kind: 'ai', sideGroupId: sideGroupIds[2] },
  ];
}

/**
 * Turns the second AI seat into Neutral garrisons.
 *
 * Purpose: The tests need Neutral units without hand-building a roster row.
 * When to use: At the start of each case.
 * Expected outcome: That seat's units have player Neutral.
 * Exceptions: Propagates a knockout error.
 */
function neutralizeSecondSeat(): void {
  const seat = getSeatRoster().find((row) => row.seatId === AI_SEAT_IDS[1]);
  if (!seat) throw new Error('missing second AI seat');
  for (const h3 of dbGetAll<{ h3_index: string }>(
    'SELECT h3_index FROM res_s_control WHERE controller_player_id = ?',
    [seat.seatId]
  )) {
    dbRun('UPDATE res_s_control SET controller_player_id = ? WHERE h3_index = ?', [AI_SEAT_IDS[0], h3.h3_index]);
  }
  const hexes = dbGetAll<{ h3_index: string }>('SELECT h3_index FROM hexes').map((row) => row.h3_index);
  applyKnockout(seat.seatId, buildLatLngCoordinateMap(hexes));
}

/**
 * Coordinate helpers for the loaded hexes.
 *
 * Purpose: Neutral orders need the same centers the turn uses.
 * When to use: Before `prepareNeutralTransportsForTurn` or `buildNeutralTurnOrders`.
 * Expected outcome: A map of every stored hex.
 * Exceptions: None.
 */
function coordinates() {
  const hexes = dbGetAll<{ h3_index: string }>('SELECT h3_index FROM hexes').map((row) => row.h3_index);
  return buildLatLngCoordinateMap(hexes);
}

test('a neutral armor fires at an adjacent enemy', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  withSeatedTempGameDb('aw-neutral-fire-', { gameMapId: map.id, seats: threeSeats(map.sideGroupIds) }, () => {
    neutralizeSecondSeat();
    const armor = dbGetOne<{ id: string; h3_index: string }>(
      `SELECT id, h3_index FROM units WHERE player = ? AND unit_type = 'armor' LIMIT 1`,
      [NEUTRAL_OWNER_ID]
    );
    const enemy = dbGetOne<{ id: string; h3_index: string }>(
      `SELECT id, h3_index FROM units WHERE player = ? AND unit_type = 'infantry' LIMIT 1`,
      [AI_SEAT_IDS[0]]
    );
    assert.ok(armor);
    assert.ok(enemy);
    let beside: string | null = null;
    for (const neighbor of gridDisk(enemy!.h3_index, 1)) {
      if (neighbor === enemy!.h3_index) continue;
      if (dbGetOne('SELECT h3_index FROM hexes WHERE h3_index = ?', [neighbor])) {
        beside = neighbor;
        break;
      }
    }
    assert.ok(beside);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [beside, armor!.id]);
    const orders = buildNeutralTurnOrders(coordinates());
    const shot = orders.rangedOrders.find((order) => order.unitId === armor!.id);
    assert.equal(shot?.targetH3Index, enemy!.h3_index);
  });
});

test('a neutral infantry with no enemy adjacent does not move', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  withSeatedTempGameDb('aw-neutral-hold-', { gameMapId: map.id, seats: threeSeats(map.sideGroupIds) }, () => {
    neutralizeSecondSeat();
    const infantry = dbGetOne<{ id: string; h3_index: string }>(
      `SELECT id, h3_index FROM units WHERE player = ? AND unit_type = 'infantry'
       AND NOT EXISTS (SELECT 1 FROM unit_transport_assignments WHERE land_unit_id = units.id) LIMIT 1`,
      [NEUTRAL_OWNER_ID]
    );
    assert.ok(infantry);
    const orders = buildNeutralTurnOrders(coordinates());
    assert.equal(orders.movementOrders.some((order) => order.unitId === infantry!.id), false);
    assert.equal(orders.rangedOrders.some((order) => order.unitId === infantry!.id), false);
    const result = ready();
    assert.equal(result.success, true);
    const after = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM units WHERE id = ?', [infantry!.id]);
    assert.equal(after?.h3_index, infantry!.h3_index);
  });
});

test('a loaded neutral ship on a coastal hex unloads', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  withSeatedTempGameDb('aw-neutral-coast-', { gameMapId: map.id, seats: threeSeats(map.sideGroupIds) }, () => {
    neutralizeSecondSeat();
    const pair = markedCoastAndWater();
    const coast = pair ? { h3_index: pair.coast } : null;
    const ship = dbGetOne<{ id: string }>(
      `SELECT id FROM units WHERE player = ? AND unit_type = 'naval' LIMIT 1`,
      [NEUTRAL_OWNER_ID]
    );
    const infantry = dbGetOne<{ id: string }>(
      `SELECT id FROM units WHERE player = ? AND unit_type = 'infantry' LIMIT 1`,
      [NEUTRAL_OWNER_ID]
    );
    assert.ok(coast);
    assert.ok(ship);
    assert.ok(infantry);
    dbRun('UPDATE units SET h3_index = ? WHERE id IN (?, ?)', [coast!.h3_index, ship!.id, infantry!.id]);
    dbRun('DELETE FROM unit_transport_assignments WHERE land_unit_id = ? OR naval_unit_id = ?', [infantry!.id, ship!.id]);
    dbRun(
      'INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)',
      [infantry!.id, ship!.id]
    );
    prepareNeutralTransportsForTurn(coordinates());
    assert.equal(
      dbGetOne('SELECT land_unit_id FROM unit_transport_assignments WHERE land_unit_id = ?', [infantry!.id]),
      undefined
    );
    for (const id of [ship!.id, infantry!.id]) {
      const order = dbGetOne<{ order_type: string }>(
        'SELECT order_type FROM standing_orders WHERE unit_id = ? AND player_id = ?',
        [id, NEUTRAL_OWNER_ID]
      );
      assert.equal(order?.order_type, 'defend');
    }
  });
});

test('a loaded neutral ship on open water sails to a coast and unloads', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  withSeatedTempGameDb('aw-neutral-sail-', { gameMapId: map.id, seats: threeSeats(map.sideGroupIds) }, () => {
    neutralizeSecondSeat();
    const pair = markedCoastAndWater();
    const water = pair?.water ?? null;
    const coast = pair?.coast ?? null;
    const ship = dbGetOne<{ id: string }>(
      `SELECT id FROM units WHERE player = ? AND unit_type = 'naval' LIMIT 1`,
      [NEUTRAL_OWNER_ID]
    );
    const infantry = dbGetOne<{ id: string }>(
      `SELECT id FROM units WHERE player = ? AND unit_type = 'infantry' LIMIT 1`,
      [NEUTRAL_OWNER_ID]
    );
    assert.ok(water && coast, 'expected a coastal hex beside open water');
    assert.ok(ship);
    assert.ok(infantry);
    dbRun('UPDATE units SET h3_index = ? WHERE id IN (?, ?)', [water, ship!.id, infantry!.id]);
    dbRun('DELETE FROM unit_transport_assignments WHERE land_unit_id = ? OR naval_unit_id = ?', [infantry!.id, ship!.id]);
    dbRun(
      'INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)',
      [infantry!.id, ship!.id]
    );
    dbRun('DELETE FROM standing_orders WHERE unit_id = ?', [infantry!.id]);
    prepareNeutralTransportsForTurn(coordinates());
    const march = dbGetOne<{ params: string }>(
      `SELECT params FROM standing_orders WHERE unit_id = ? AND player_id = ? AND order_type = 'march'`,
      [ship!.id, NEUTRAL_OWNER_ID]
    );
    assert.ok(march);
    const params = JSON.parse(march!.params) as { engageEnRoute?: boolean };
    assert.equal(params.engageEnRoute, true);
    let landing: string | null = null;
    for (let turn = 0; turn < 6 && !landing; turn += 1) {
      const result = ready();
      assert.equal(result.success, true);
      const hex = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM units WHERE id = ?', [ship!.id])?.h3_index;
      if (hex && canManualDebarkFromHex(hex, NEUTRAL_OWNER_ID)) landing = hex;
    }
    assert.ok(landing);
    const unloaded = ready();
    assert.equal(unloaded.success, true);
    assert.equal(
      dbGetOne('SELECT land_unit_id FROM unit_transport_assignments WHERE land_unit_id = ?', [infantry!.id]),
      undefined
    );
    const infantryHex = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM units WHERE id = ?', [infantry!.id]);
    assert.equal(infantryHex?.h3_index, landing);
  });
});

/**
 * Two adjacent stored hexes, marked coastal and open water.
 *
 * Purpose: This regional pack does not store a coastal terrain value, so the landing tests mark a real pair.
 * When to use: The unload test and the sailing test.
 * Expected outcome: A coastal hex and a neighboring water hex, or null when no adjacent pair exists.
 * Exceptions: A hex whose neighbor ring cannot be read is skipped.
 */
function markedCoastAndWater(): { coast: string; water: string } | null {
  const hexes = dbGetAll<{ h3_index: string }>('SELECT h3_index FROM hexes');
  for (const row of hexes) {
    let ring: string[] = [];
    try {
      ring = gridDisk(row.h3_index, 1);
    } catch {
      continue;
    }
    for (const neighbor of ring) {
      if (neighbor === row.h3_index) continue;
      const stored = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM hexes WHERE h3_index = ?', [neighbor]);
      if (!stored) continue;
      dbRun(`UPDATE hexes SET terrain = 'coastal', terrain_kind = 'coastal' WHERE h3_index = ?`, [row.h3_index]);
      dbRun(`UPDATE hexes SET terrain = 'water', terrain_kind = 'water' WHERE h3_index = ?`, [neighbor]);
      dbRun('UPDATE res_s_infrastructure SET seaport_count = 0 WHERE h3_index = ?', [neighbor]);
      return { coast: row.h3_index, water: neighbor };
    }
  }
  return null;
}
