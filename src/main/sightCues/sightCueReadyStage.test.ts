import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { SIGHT_CUE_SEEN_UNITS_CONFIG_KEY } from '../../shared/sightCueSettings';
import { ready } from '../gameActions';
import { clearMeleeInterceptPendingSnapshot } from '../gameActions/meleeInterceptPendingState';
import { dbGetOne, dbRun } from '../gameDb';
import { listGameMaps } from '../gameMap/listGameMaps';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';

/**
 * The first listed regional map with two homes.
 *
 * Purpose: Sight cues need two sides on a real map, and the global row has no side groups.
 * When to use: Each ready-stage test.
 * Expected outcome: The map id and its first two side-group ids, or null when none is listed.
 * Exceptions: None.
 */
function twoGroupMap(): { id: string; sideGroupIds: string[] } | null {
  const map = listGameMaps().find((entry) => entry.sideGroups.length >= 2);
  if (!map) return null;
  return { id: map.id, sideGroupIds: map.sideGroups.slice(0, 2).map((group) => group.id) };
}

/**
 * One infantry of a player.
 *
 * Purpose: Placement has to move a real unit onto a neighboring hex.
 * When to use: Before `ready`.
 * Expected outcome: The id and hex, or undefined when that player has no infantry.
 * Exceptions: None.
 */
function infantryAt(player: string): { id: string; h3Index: string } | undefined {
  return dbGetOne<{ id: string; h3Index: string }>(
    `SELECT id, h3_index AS h3Index FROM units WHERE player = ? AND unit_type = 'infantry' LIMIT 1`,
    [player]
  );
}

/**
 * A neighboring hex infantry can stand on.
 *
 * Purpose: Vision of one hex reaches a neighbor that is land, coastal, or wetlands.
 * When to use: After choosing the spotter's hex.
 * Expected outcome: A hex in the map whose terrain is not water, or undefined.
 * Exceptions: None.
 */
function passableNeighbor(h3Index: string): string | undefined {
  for (const candidate of gridDisk(h3Index, 1)) {
    if (candidate === h3Index) continue;
    const row = dbGetOne<{ terrain: string }>('SELECT terrain FROM hexes WHERE h3_index = ?', [candidate]);
    if (row && row.terrain !== 'water') return candidate;
  }
  return undefined;
}

/**
 * Moves one unit onto a hex.
 *
 * Purpose: The two sides start on their homes, which may be farther apart than infantry vision.
 * When to use: Before `ready`, while the turn is still in planning.
 * Expected outcome: That unit's hex is `hex`. The phase is left alone.
 * Exceptions: None.
 */
function moveUnit(unitId: string, hex: string): void {
  dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [hex, unitId]);
}

/**
 * The stored seen-unit memory, or undefined when the row is absent.
 *
 * Purpose: The tests check that Ready writes the row only when the stage is allowed to.
 * When to use: After `ready`.
 * Expected outcome: The parsed object, or undefined.
 * Exceptions: Throws when the stored value is not JSON.
 */
function storedSeenUnits(): Record<string, string[]> | undefined {
  const row = dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [SIGHT_CUE_SEEN_UNITS_CONFIG_KEY]);
  if (!row) return undefined;
  return JSON.parse(row.value) as Record<string, string[]>;
}

/**
 * Puts seat B's infantry on a passable neighbor of seat A's infantry.
 *
 * Purpose: The beam tests need one infantry sighting and no shared hex.
 * When to use: After the match exists and before `ready`.
 * Expected outcome: The spotter hex, the target hex, and the moved unit id.
 * Exceptions: Assertion failure when either seat has no infantry or the spotter hex has no passable neighbor.
 */
function placeInfantryInSight(spotterPlayer: string, targetPlayer: string): { fromHex: string; toHex: string; targetId: string } {
  const spotter = infantryAt(spotterPlayer);
  const target = infantryAt(targetPlayer);
  assert.ok(spotter, `${spotterPlayer} has no infantry`);
  assert.ok(target, `${targetPlayer} has no infantry`);
  const toHex = passableNeighbor(spotter.h3Index);
  assert.ok(toHex, `${spotter.h3Index} has no passable neighbor`);
  moveUnit(target.id, toHex);
  return { fromHex: spotter.h3Index, toHex, targetId: target.id };
}

test('an observed match returns a beam and stores who was seen', (t) => {
  const map = twoGroupMap();
  if (!map) {
    t.skip('no regional map with two side groups is listed');
    return;
  }
  const seats: NewGameSeatInput[] = [
    { kind: 'ai', sideGroupId: map.sideGroupIds[0] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[1] },
  ];
  withSeatedTempGameDb('aw-sight-cues-observe-', { gameMapId: map.id, seats }, () => {
    try {
      dbRun("INSERT OR REPLACE INTO game_config (key, value) VALUES ('ai_only_battles', 'none')");
      const placed = placeInfantryInSight(AI_SEAT_IDS[0], AI_SEAT_IDS[1]);
      const result = ready();
      assert.equal(result.success, true);
      if (!result.success) return;
      const beam = result.sightCues?.find((entry) => entry.seatId === AI_SEAT_IDS[0] && entry.fromH3Index === placed.fromHex && entry.toH3Index === placed.toHex);
      assert.ok(beam);
      assert.ok(result.sightCues?.every((entry) => (AI_SEAT_IDS as readonly string[]).includes(entry.seatId)));
      const seen = storedSeenUnits();
      assert.ok(seen?.[AI_SEAT_IDS[0]]?.includes(placed.targetId));
    } finally {
      clearMeleeInterceptPendingSnapshot();
    }
  });
});

test('a human who is still playing stores memory and returns no beams', (t) => {
  const map = twoGroupMap();
  if (!map) {
    t.skip('no regional map with two side groups is listed');
    return;
  }
  const seats: NewGameSeatInput[] = [
    { kind: 'human', sideGroupId: map.sideGroupIds[0] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[1] },
  ];
  withSeatedTempGameDb('aw-sight-cues-human-', { gameMapId: map.id, seats }, () => {
    try {
      dbRun("INSERT OR REPLACE INTO game_config (key, value) VALUES ('ai_only_battles', 'none')");
      const placed = placeInfantryInSight(AI_SEAT_IDS[0], HUMAN_SEAT_ID);
      const result = ready();
      assert.equal(result.success, true);
      if (!result.success) return;
      assert.equal(result.sightCues, undefined);
      const seen = storedSeenUnits();
      assert.ok(seen?.[AI_SEAT_IDS[0]]?.includes(placed.targetId));
    } finally {
      clearMeleeInterceptPendingSnapshot();
    }
  });
});

test('a match with sight cues off returns no beams and writes no memory', (t) => {
  const map = twoGroupMap();
  if (!map) {
    t.skip('no regional map with two side groups is listed');
    return;
  }
  const seats: NewGameSeatInput[] = [
    { kind: 'ai', sideGroupId: map.sideGroupIds[0] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[1] },
  ];
  withSeatedTempGameDb('aw-sight-cues-off-', { gameMapId: map.id, seats }, () => {
    try {
      dbRun("INSERT OR REPLACE INTO game_config (key, value) VALUES ('ai_only_battles', 'none')");
      dbRun("INSERT OR REPLACE INTO game_config (key, value) VALUES ('sight_cues', '0')");
      placeInfantryInSight(AI_SEAT_IDS[0], AI_SEAT_IDS[1]);
      const result = ready();
      assert.equal(result.success, true);
      if (!result.success) return;
      assert.equal(result.sightCues, undefined);
      assert.equal(storedSeenUnits(), undefined);
    } finally {
      clearMeleeInterceptPendingSnapshot();
    }
  });
});

test('fog off returns no beams and writes no memory', (t) => {
  const map = twoGroupMap();
  if (!map) {
    t.skip('no regional map with two side groups is listed');
    return;
  }
  const seats: NewGameSeatInput[] = [
    { kind: 'ai', sideGroupId: map.sideGroupIds[0] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[1] },
  ];
  withSeatedTempGameDb('aw-sight-cues-fog-', { gameMapId: map.id, seats, fogOfWarEnabled: false }, () => {
    try {
      dbRun("INSERT OR REPLACE INTO game_config (key, value) VALUES ('ai_only_battles', 'none')");
      placeInfantryInSight(AI_SEAT_IDS[0], AI_SEAT_IDS[1]);
      const result = ready();
      assert.equal(result.success, true);
      if (!result.success) return;
      assert.equal(result.sightCues, undefined);
      assert.equal(storedSeenUnits(), undefined);
    } finally {
      clearMeleeInterceptPendingSnapshot();
    }
  });
});
