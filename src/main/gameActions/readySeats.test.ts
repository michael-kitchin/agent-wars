import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { ready } from '../gameActions';
import { dbGetAll, dbGetOne, dbRun, getSeatRoster } from '../gameDb';
import { listGameMaps } from '../gameMap/listGameMaps';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { EMPTY_OWNER_TURN_ORDERS } from './ownerTurnOrders';

/**
 * A regional map with at least three side groups.
 *
 * Purpose: Turn-resolution tests need a roster with a second AI seat.
 * When to use: Before starting the match in this file.
 * Expected outcome: The map id and three group ids, or null when no such pack is listed.
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
 * Purpose: Each test in this file starts the same kind of match.
 * When to use: As the `seats` option of `withSeatedTempGameDb`.
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
 * An infantry unit of one seat that is not embarked, and a neighboring hex.
 *
 * Purpose: A movement order needs a real unit and a hex that exists.
 * When to use: Before calling `ready` with that unit's order.
 * Expected outcome: The unit id, its hex, and a different hex in the map, or null when none is found.
 * Exceptions: None. An unreadable neighbor ring is skipped.
 */
function infantryStep(player: string): { unitId: string; fromHex: string; toHex: string } | null {
  const unit = dbGetOne<{ id: string; h3_index: string }>(
    `SELECT u.id AS id, u.h3_index AS h3_index FROM units u
     WHERE u.player = ? AND u.unit_type = 'infantry'
       AND NOT EXISTS (SELECT 1 FROM unit_transport_assignments t WHERE t.land_unit_id = u.id)
     LIMIT 1`,
    [player]
  );
  if (!unit) return null;
  let ring: string[] = [];
  try {
    ring = gridDisk(unit.h3_index, 1);
  } catch {
    return null;
  }
  for (const candidate of ring) {
    if (candidate === unit.h3_index) continue;
    const hex = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM hexes WHERE h3_index = ?', [candidate]);
    if (hex) return { unitId: unit.id, fromHex: unit.h3_index, toHex: candidate };
  }
  return null;
}

/**
 * The current strategic turn number.
 *
 * Purpose: Ready tests assert that the turn advanced.
 * When to use: After `ready`.
 * Expected outcome: The stored turn number, or 0 when the row is missing.
 * Exceptions: None.
 */
function turnNumber(): number {
  return dbGetOne<{ turn_number: number }>('SELECT turn_number FROM turn_state WHERE id = 1')?.turn_number ?? 0;
}

test('a second AI seat moves on its own orders and a foreign order is dropped', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  withSeatedTempGameDb('aw-ready-seats-', { gameMapId: map.id, seats: threeSeats(map.sideGroupIds) }, () => {
    const secondAi = AI_SEAT_IDS[1];
    const moving = infantryStep(secondAi);
    assert.ok(moving, 'expected an infantry step for the second AI seat');
    const moved = ready(new Map([[secondAi, {
      ...EMPTY_OWNER_TURN_ORDERS,
      movementOrders: [{ unitId: moving!.unitId, toH3Index: moving!.toHex }],
    }]]));
    assert.equal(moved.success, true);
    assert.equal(turnNumber(), 2);
    const movedHex = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM units WHERE id = ?', [moving!.unitId])?.h3_index;
    assert.equal(movedHex, moving!.toHex);

    const dropped = ready(new Map([[AI_SEAT_IDS[0], {
      ...EMPTY_OWNER_TURN_ORDERS,
      movementOrders: [{ unitId: moving!.unitId, toH3Index: moving!.fromHex }],
    }]]));
    assert.equal(dropped.success, true);
    const stayedHex = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM units WHERE id = ?', [moving!.unitId])?.h3_index;
    assert.equal(stayedHex, moving!.toHex);
  });
});

test('five empty turns leave every seat in the match', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  withSeatedTempGameDb('aw-ready-empty-', { gameMapId: map.id, fogOfWarEnabled: true, seats: threeSeats(map.sideGroupIds) }, () => {
    const before = getSeatRoster().map((seat) => ({
      seatId: seat.seatId,
      seatOrder: seat.seatOrder,
      kind: seat.kind,
      homeRegion: seat.homeRegion,
      outTurn: seat.outTurn,
    }));
    for (let i = 0; i < 5; i += 1) {
      const result = ready();
      assert.equal(result.success, true);
    }
    assert.equal(turnNumber(), 6);
    const intel = new Set(dbGetAll<{ player_id: string }>('SELECT DISTINCT player_id FROM player_hex_intel').map((row) => row.player_id));
    for (const seat of before) assert.equal(intel.has(seat.seatId), true, seat.seatId);
    const after = getSeatRoster().map((seat) => ({
      seatId: seat.seatId,
      seatOrder: seat.seatOrder,
      kind: seat.kind,
      homeRegion: seat.homeRegion,
      outTurn: seat.outTurn,
    }));
    assert.deepEqual(after, before);
  });
});

/**
 * A hex with no unit, and an on-map neighbor.
 *
 * Purpose: Launch cases need a missile that does not share its hex.
 * When to use: The Ready launch cases in this file.
 * Expected outcome: The empty hex and a different hex from `hexes`.
 * Exceptions: None. A disk that throws is skipped.
 */
function emptyHexAndNeighbor(): { hex: string; neighbor: string } | null {
  const hex = dbGetOne<{ h3_index: string }>(
    `SELECT h.h3_index AS h3_index FROM hexes h
     WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.h3_index = h.h3_index)
     LIMIT 1`
  )?.h3_index;
  if (!hex) return null;
  let ring: string[] = [];
  try {
    ring = gridDisk(hex, 1);
  } catch {
    return null;
  }
  for (const candidate of ring) {
    if (candidate === hex) continue;
    const row = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM hexes WHERE h3_index = ?', [candidate]);
    if (row) return { hex, neighbor: candidate };
  }
  return null;
}

test('an AI missile launch is resolved once and the missile is gone', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  withSeatedTempGameDb('aw-ready-missile-ai-', {
    gameMapId: map.id,
    fogOfWarEnabled: false,
    seats: threeSeats(map.sideGroupIds),
  }, () => {
    const placed = emptyHexAndNeighbor();
    assert.ok(placed);
    const seatId = AI_SEAT_IDS[1];
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES ('a2-m1', ?, 'missile', ?, 1)`,
      [seatId, placed.hex]
    );
    const result = ready(new Map([[seatId, {
      ...EMPTY_OWNER_TURN_ORDERS,
      missileLaunchOrders: [{ unitId: 'a2-m1', targetH3Index: placed.neighbor }],
    }]]));
    assert.equal(result.success, true);
    assert.equal(result.missileLaunches?.length, 1);
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['a2-m1']), undefined);
  });
});

test('a human pending missile launch is resolved once', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  withSeatedTempGameDb('aw-ready-missile-human-', {
    gameMapId: map.id,
    fogOfWarEnabled: false,
    seats: threeSeats(map.sideGroupIds),
  }, () => {
    const placed = emptyHexAndNeighbor();
    assert.ok(placed);
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES ('h1-m1', ?, 'missile', ?, 1)`,
      [HUMAN_SEAT_ID, placed.hex]
    );
    dbRun('INSERT INTO pending_missile_launches (unit_id, target_h3_index) VALUES (?, ?)', ['h1-m1', placed.neighbor]);
    const result = ready();
    assert.equal(result.success, true);
    assert.equal(result.missileLaunches?.length, 1);
    assert.equal(dbGetOne('SELECT unit_id FROM pending_missile_launches'), undefined);
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['h1-m1']), undefined);
  });
});

test('a missile spent before ranged fire is not a removed unit', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  withSeatedTempGameDb('aw-ready-missile-ranged-', {
    gameMapId: map.id,
    fogOfWarEnabled: false,
    seats: threeSeats(map.sideGroupIds),
  }, () => {
    const placed = emptyHexAndNeighbor();
    assert.ok(placed);
    const quietNeighbor = gridDisk(placed.hex, 1).find((candidate) => {
      if (candidate === placed.hex) return false;
      const onMap = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM hexes WHERE h3_index = ?', [candidate]);
      if (!onMap) return false;
      const airport = dbGetOne<{ airport: number }>(
        'SELECT airport_count AS airport FROM res_s_infrastructure WHERE h3_index = ?',
        [candidate]
      )?.airport ?? 0;
      const air = dbGetOne('SELECT id FROM units WHERE h3_index = ? AND unit_type = ?', [candidate, 'air']);
      return airport === 0 && air === undefined;
    });
    assert.ok(quietNeighbor, 'expected a neighbor with no airport and no air unit');
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES ('h1-m1', ?, 'missile', ?, 1)`,
      [HUMAN_SEAT_ID, placed.hex]
    );
    dbRun('INSERT INTO pending_missile_launches (unit_id, target_h3_index) VALUES (?, ?)', ['h1-m1', quietNeighbor]);
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES ('a2-a9', ?, 'armor', ?, 1)`,
      [AI_SEAT_IDS[1], quietNeighbor]
    );
    const result = ready(new Map([[AI_SEAT_IDS[1], {
      ...EMPTY_OWNER_TURN_ORDERS,
      rangedOrders: [{ unitId: 'a2-a9', targetH3Index: placed.hex }],
    }]]));
    assert.equal(result.success, true);
    const removed = result.removedUnits ?? [];
    assert.equal(removed.some((unit) => unit.id === 'h1-m1'), false);
    assert.equal(removed.length, 0);
  });
});
