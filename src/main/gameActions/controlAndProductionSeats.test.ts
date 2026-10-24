import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { computeGridPathCellsPure } from '../../shared/h3GridRangePure';
import { AI_SEAT_IDS, NEUTRAL_OWNER_ID, type OwnerId } from '../../shared/seatIds';
import { playerIdCodeFor } from '../../shared/unitIds';
import { dbGetAll, dbGetOne, dbRun } from '../gameDb';
import { listGameMaps } from '../gameMap/listGameMaps';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import {
  collectTraversedHexesByPlayer,
  processProductionAfterControlResolution,
  resolveStrategicControlAfterCombatAndMovement,
} from './controlAndProduction';

/**
 * A regional map with at least three side groups.
 *
 * Purpose: Capture and production tests need a roster with a second AI seat.
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
 * Reads the stored controller of one hex.
 *
 * Purpose: Assertions need the row written by control resolution, including a missing row.
 * When to use: After `resolveStrategicControlAfterCombatAndMovement`.
 * Expected outcome: The controller id, or null when the hex has no row.
 * Exceptions: None.
 */
function controllerOf(h3Index: string): string | null {
  return dbGetOne<{ controller_player_id: string | null }>(
    'SELECT controller_player_id FROM res_s_control WHERE h3_index = ?',
    [h3Index]
  )?.controller_player_id ?? null;
}

/**
 * Hexes with no unit and no controller.
 *
 * Purpose: Capture checks need empty hexes the resolution step can reassign.
 * When to use: After the match has been seeded.
 * Expected outcome: Hex ids that are empty and unowned.
 * Exceptions: None.
 */
function emptyHexes(): Set<string> {
  return new Set(
    dbGetAll<{ h3_index: string }>(
      `SELECT h.h3_index AS h3_index FROM hexes h
       WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.h3_index = h.h3_index)
         AND NOT EXISTS (
           SELECT 1 FROM res_s_control c
           WHERE c.h3_index = h.h3_index AND c.controller_player_id IS NOT NULL
         )`
    ).map((row) => row.h3_index)
  );
}

/**
 * An empty path of at least three hexes.
 *
 * Purpose: Pass-through capture needs a middle hex as well as the destination.
 * When to use: With the empty-hex set from the seeded map.
 * Expected outcome: Origin, at least one middle hex, and destination, or null when none is found.
 * Exceptions: Skips an origin whose neighbor ring cannot be computed.
 */
function emptyPath(empty: Set<string>): readonly string[] | null {
  for (const origin of empty) {
    let ring: string[];
    try {
      ring = gridDisk(origin, 2);
    } catch {
      continue;
    }
    for (const destination of ring) {
      if (destination === origin || !empty.has(destination)) continue;
      const path = computeGridPathCellsPure(origin, destination);
      if (path && path.length >= 3 && path.every((hex) => empty.has(hex))) return path;
    }
  }
  return null;
}

test('empty hexes follow the owner that traversed them', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  const seats: NewGameSeatInput[] = [
    { kind: 'human', sideGroupId: map.sideGroupIds[0] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[1] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[2] },
  ];
  withSeatedTempGameDb('aw-control-seats-', { gameMapId: map.id, seats }, () => {
    const empty = emptyHexes();
    const armorPath = emptyPath(empty);
    assert.ok(armorPath, 'expected an empty path');
    for (const hex of armorPath!) empty.delete(hex);
    const neutralPath = emptyPath(empty);
    assert.ok(neutralPath, 'expected a second empty path');
    for (const hex of neutralPath!) empty.delete(hex);
    const sharedBySeats = empty.values().next().value as string;
    empty.delete(sharedBySeats);
    const sharedWithNeutral = empty.values().next().value as string;
    const secondAi = AI_SEAT_IDS[1];
    const firstAi = AI_SEAT_IDS[0];
    const armorStart = armorPath![0]!;
    const armorEnd = armorPath![armorPath!.length - 1]!;
    const shipStart = neutralPath![0]!;
    const shipEnd = neutralPath![neutralPath!.length - 1]!;
    const collected = collectTraversedHexesByPlayer(
      [
        { unitId: 'armor', toH3Index: armorEnd },
        { unitId: 'ship', toH3Index: shipEnd },
      ],
      [
        { id: 'armor', player: secondAi, h3Index: armorStart, unitType: 'armor' },
        { id: 'ship', player: NEUTRAL_OWNER_ID, h3Index: shipStart, unitType: 'naval' },
      ]
    );
    for (const hex of armorPath!) assert.equal(collected.get(secondAi)?.has(hex), true, hex);
    assert.equal(collected.has(NEUTRAL_OWNER_ID), false);

    const traversed = new Map<OwnerId, Set<string>>([
      [secondAi, new Set([...armorPath!, sharedBySeats])],
      [firstAi, new Set([sharedBySeats, sharedWithNeutral])],
      [NEUTRAL_OWNER_ID, new Set([...neutralPath!, sharedWithNeutral])],
    ]);
    resolveStrategicControlAfterCombatAndMovement(traversed);
    for (const hex of armorPath!) assert.equal(controllerOf(hex), secondAi, hex);
    for (const hex of neutralPath!) assert.equal(controllerOf(hex), NEUTRAL_OWNER_ID, hex);
    assert.equal(controllerOf(sharedBySeats), null);
    assert.equal(controllerOf(sharedWithNeutral), NEUTRAL_OWNER_ID);
  });
});

test('production follows the seat that controls the hex', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  const seats: NewGameSeatInput[] = [
    { kind: 'human', sideGroupId: map.sideGroupIds[0] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[1] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[2] },
  ];
  withSeatedTempGameDb('aw-production-seats-', { gameMapId: map.id, seats }, () => {
    const secondAi = AI_SEAT_IDS[1];
    const spawnHex = dbGetOne<{ h3_index: string }>(
      'SELECT h3_index FROM res_s_control WHERE controller_player_id = ? LIMIT 1',
      [secondAi]
    )?.h3_index;
    assert.ok(spawnHex, 'expected a hex controlled by the second AI seat');
    const neutralHex = [...emptyHexes()][0];
    assert.ok(neutralHex, 'expected an empty hex');
    dbRun(
      `INSERT INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)
       ON CONFLICT(h3_index) DO UPDATE SET controller_player_id = excluded.controller_player_id`,
      [neutralHex, NEUTRAL_OWNER_ID]
    );
    dbRun(
      `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
       VALUES (?, 1, 0, 0), (?, 1, 0, 0)
       ON CONFLICT(h3_index) DO UPDATE SET urban_hex_count = 1`,
      [spawnHex, neutralHex]
    );
    dbRun('DELETE FROM res_s_build_queue WHERE h3_index IN (?, ?)', [spawnHex, neutralHex]);
    dbRun(
      `INSERT INTO res_s_build_queue (h3_index, queue_index, unit_type, remaining_count)
       VALUES (?, 0, 'infantry', 1), (?, 0, 'infantry', 1)`,
      [spawnHex, neutralHex]
    );
    dbRun(
      `INSERT INTO res_s_build_progress (h3_index, stored_points) VALUES (?, 100), (?, 4)
       ON CONFLICT(h3_index) DO UPDATE SET stored_points = excluded.stored_points`,
      [spawnHex, neutralHex]
    );
    dbRun('DELETE FROM units WHERE h3_index = ? AND unit_type = ?', [spawnHex, 'infantry']);
    processProductionAfterControlResolution();
    const spawned = dbGetOne<{ id: string; player: string }>(
      'SELECT id, player FROM units WHERE h3_index = ? AND unit_type = ?',
      [spawnHex, 'infantry']
    );
    assert.equal(spawned?.player, secondAi);
    assert.equal(spawned?.id.startsWith(`${playerIdCodeFor(secondAi)}-`), true);
    const neutralUnit = dbGetOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM units WHERE h3_index = ?',
      [neutralHex]
    )?.c ?? 0;
    assert.equal(neutralUnit, 0);
    const neutralPoints = dbGetOne<{ stored_points: number }>(
      'SELECT stored_points FROM res_s_build_progress WHERE h3_index = ?',
      [neutralHex]
    )?.stored_points ?? -1;
    assert.equal(neutralPoints, 4);
  });
});
