import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { ready } from '../gameActions';
import { dbGetAll, dbGetOne, getSeatRoster } from '../gameDb';
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
