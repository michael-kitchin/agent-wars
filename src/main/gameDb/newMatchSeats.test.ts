import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, isSeatId } from '../../shared/seatIds';
import { playerIdCodeFor } from '../../shared/unitIds';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { DOCTRINES, type Doctrine } from '../../shared/seatRoster';
import {
  dbGetAll,
  dbGetOne,
  dbRun,
  getGameState,
  getScenarioHomeRegionHexes,
  getSeatRoster,
  listScenarioHomeRegions,
} from '../gameDb';
import { setGameOutcomeWithOps } from './gameConfigKv';
import { listGameMaps } from '../gameMap/listGameMaps';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';

/**
 * The first regional map that has at least `count` side groups.
 *
 * Purpose: Seat tests must use group ids read from the installed packs.
 * When to use: Before a regional start in this file.
 * Expected outcome: The list entry, or null when no such pack is extracted.
 * Exceptions: None.
 */
function regionalMapWithGroups(count: number): { id: string; sideGroupIds: string[] } | null {
  const map = listGameMaps().find((entry) => entry.id === 'western_asia_north' && entry.sideGroups.length >= count)
    ?? listGameMaps().find((entry) => entry.sideGroups.length >= count);
  if (!map) return null;
  return { id: map.id, sideGroupIds: map.sideGroups.slice(0, count).map((group) => group.id) };
}

/**
 * Listed home regions with the most hexes.
 *
 * Purpose: A global start needs regions large enough to hold a side's opening units.
 * When to use: Before a global start in this file.
 * Expected outcome: Up to `count` names, largest first.
 * Exceptions: None.
 */
function largestHomeRegions(count: number): string[] {
  return listScenarioHomeRegions()
    .map((name) => ({ name, hexes: getScenarioHomeRegionHexes(name).length }))
    .filter((region) => region.hexes > 0)
    .sort((a, b) => b.hexes - a.hexes || a.name.localeCompare(b.name))
    .slice(0, count)
    .map((region) => region.name);
}

test('four regional seats each start in their own home', (t) => {
  const map = regionalMapWithGroups(4);
  if (!map) {
    t.skip('no regional map with four side groups is extracted');
    return;
  }
  const seats: NewGameSeatInput[] = [
    { kind: 'human', sideGroupId: map.sideGroupIds[0] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[1] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[2] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[3] },
  ];
  withSeatedTempGameDb('aw-four-seats-', { gameMapId: map.id, fogOfWarEnabled: false, seats }, () => {
    const roster = getSeatRoster();
    assert.deepEqual(roster.map((seat) => seat.seatId), [HUMAN_SEAT_ID, AI_SEAT_IDS[0], AI_SEAT_IDS[1], AI_SEAT_IDS[2]]);
    assert.deepEqual(roster.map((seat) => seat.seatOrder), [1, 2, 3, 4]);
    assertUnitsStandInOwnHomes(roster.map((seat) => seat.seatId));
    assertExclusiveHomesAreControlled(roster.map((seat) => ({ seatId: seat.seatId, homeRegion: seat.homeRegion })));
  });
});

test('three AI seats and no human start with the first AI seat in order 1', (t) => {
  const map = regionalMapWithGroups(3);
  if (!map) {
    t.skip('no regional map with three side groups is extracted');
    return;
  }
  const seats: NewGameSeatInput[] = map.sideGroupIds.map((sideGroupId) => ({ kind: 'ai' as const, sideGroupId }));
  withSeatedTempGameDb('aw-observe-seats-', { gameMapId: map.id, fogOfWarEnabled: false, seats }, () => {
    const roster = getSeatRoster();
    assert.equal(roster[0]?.seatId, AI_SEAT_IDS[0]);
    assert.equal(roster[0]?.seatOrder, 1);
    assert.equal(roster.some((seat) => seat.kind === 'human'), false);
    const players = new Set(dbGetAll<{ player: string }>('SELECT player FROM units').map((row) => row.player));
    assert.equal(players.has(HUMAN_SEAT_ID), false);
  });
});

test('three global seats each receive units', () => {
  const regions = largestHomeRegions(3);
  assert.equal(regions.length, 3);
  const seats: NewGameSeatInput[] = [
    { kind: 'human', homeRegion: regions[0] },
    { kind: 'ai', homeRegion: regions[1] },
    { kind: 'ai', homeRegion: regions[2] },
  ];
  withSeatedTempGameDb('aw-global-seats-', { gameMapId: 'global', seats }, () => {
    const roster = getSeatRoster();
    assert.equal(roster.length, 3);
    assert.deepEqual(roster.map((seat) => seat.homeRegion), regions);
    for (const seat of roster) {
      const count = dbGetAll<{ c: number }>('SELECT COUNT(*) AS c FROM units WHERE player = ?', [seat.seatId]);
      assert.ok((count[0]?.c ?? 0) > 0, seat.seatId);
    }
  });
});

test('the snapshot reports the win rule for the map', (t) => {
  const regional = regionalMapWithGroups(2);
  if (!regional) {
    t.skip('no regional map with two side groups is listed');
    return;
  }
  withSeatedTempGameDb('aw-victory-regional-', {
    gameMapId: regional.id,
    turnLimit: 40,
    seats: [
      { kind: 'human', sideGroupId: regional.sideGroupIds[0] },
      { kind: 'ai', sideGroupId: regional.sideGroupIds[1] },
    ],
  }, () => {
    assert.deepEqual(getGameState().victory, { rule: 'last_side_standing', turnLimit: null });
  });
  const regions = largestHomeRegions(2);
  withSeatedTempGameDb('aw-victory-global-', {
    gameMapId: 'global',
    turnLimit: 40,
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
    ],
  }, () => {
    assert.deepEqual(getGameState().victory, { rule: 'most_city_hexes_at_turn_limit', turnLimit: 40 });
  });
});

test('a random doctrine is drawn from the match seed and hidden until the match is over', (t) => {
  const map = regionalMapWithGroups(2);
  if (!map) {
    t.skip('no regional map with two side groups is extracted');
    return;
  }
  const seats: NewGameSeatInput[] = [
    { kind: 'human', sideGroupId: map.sideGroupIds[0] },
    {
      kind: 'ai',
      sideGroupId: map.sideGroupIds[1],
      commander: { modelId: null, reasoningEffort: null, doctrineChoice: 'random' },
    },
  ];
  const drawn: Doctrine[] = [];
  for (const pass of [1, 2]) {
    withSeatedTempGameDb(`aw-random-doctrine-${pass}-`, {
      gameMapId: map.id,
      fogOfWarEnabled: false,
      seats,
      gameSeed: 404,
    }, () => {
      const ai = getSeatRoster().find((seat) => seat.kind === 'ai');
      assert.ok(ai?.commander);
      assert.equal(ai.commander.doctrineChoice, 'random');
      assert.ok((DOCTRINES as readonly string[]).includes(ai.commander.doctrine));
      drawn.push(ai.commander.doctrine);
      const hidden = getGameState().seats?.find((seat) => seat.seatId === ai.seatId);
      assert.equal(hidden?.commander?.doctrine, null);
      setGameOutcomeWithOps({ run: dbRun, getOne: dbGetOne }, { winnerSeatId: null, endReason: 'mutual_elimination' });
      const revealed = getGameState().seats?.find((seat) => seat.seatId === ai.seatId);
      assert.equal(revealed?.commander?.doctrine, ai.commander.doctrine);
    });
  }
  assert.equal(drawn[0], drawn[1]);
});

test('named homes start those two seats', () => {
  const regions = largestHomeRegions(2);
  withSeatedTempGameDb('aw-named-seats-', {
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
    ],
  }, () => {
    const roster = getSeatRoster();
    assert.deepEqual(roster.map((seat) => seat.seatId), [HUMAN_SEAT_ID, AI_SEAT_IDS[0]]);
    assert.equal(roster[0]?.homeRegion, regions[0]);
    assert.equal(roster[1]?.homeRegion, regions[1]);
  });
});

test('a new match rejects an unusable seat list', () => {
  const region = largestHomeRegions(1)[0] ?? 'missing';
  assert.throws(
    () => withSeatedTempGameDb('aw-five-seats-', {
      seats: [1, 2, 3, 4, 5].map(() => ({ kind: 'ai', homeRegion: region })),
    }, () => {}),
    /A match needs 2 to 4 sides/
  );
  assert.throws(
    () => withSeatedTempGameDb('aw-one-seat-', {
      seats: [{ kind: 'ai', homeRegion: region }],
    }, () => {}),
    /A match needs 2 to 4 sides/
  );
  assert.throws(
    () => withSeatedTempGameDb('aw-two-humans-', {
      seats: [
        { kind: 'human', homeRegion: region },
        { kind: 'human', homeRegion: region },
      ],
    }, () => {}),
    /only one human side/
  );
  assert.throws(
    () => withSeatedTempGameDb('aw-same-region-', {
      seats: [
        { kind: 'ai', homeRegion: region },
        { kind: 'ai', homeRegion: region },
      ],
    }, () => {}),
    /different home region/
  );
});

test('a regional start rejects the same side group twice', (t) => {
  const map = regionalMapWithGroups(1);
  if (!map) {
    t.skip('no regional map is extracted');
    return;
  }
  assert.throws(
    () => withSeatedTempGameDb('aw-same-group-', {
      gameMapId: map.id,
      seats: [
        { kind: 'ai', sideGroupId: map.sideGroupIds[0] },
        { kind: 'ai', sideGroupId: map.sideGroupIds[0] },
      ],
    }, () => {}),
    /different side group/
  );
});

/**
 * Checks that every unit is in its seat's home and uses that seat's id prefix.
 *
 * Purpose: Seeding must not place a side outside the home it was given.
 * When to use: After a regional start in this file.
 * Expected outcome: Every seat has a unit, and every unit id starts with that seat's code.
 * Exceptions: Throws when a unit is outside its home or the id prefix is wrong.
 */
function assertUnitsStandInOwnHomes(seatIds: readonly string[]): void {
  const units = dbGetAll<{ id: string; player: string; h3_index: string }>('SELECT id, player, h3_index FROM units');
  for (const seatId of seatIds) {
    assert.ok(units.some((unit) => unit.player === seatId), seatId);
  }
  for (const unit of units) {
    assert.equal(isSeatId(unit.player), true, unit.id);
    if (!isSeatId(unit.player)) continue;
    const home = new Set(getScenarioHomeRegionHexes(getSeatRoster().find((seat) => seat.seatId === unit.player)?.homeRegion ?? ''));
    assert.equal(home.has(unit.h3_index), true, `${unit.id} on ${unit.h3_index}`);
    assert.equal(unit.id.startsWith(`${playerIdCodeFor(unit.player)}-`), true, unit.id);
  }
}

/**
 * Checks that a home hex belonging to one seat is controlled by that seat.
 *
 * Purpose: Shared homes stay unset by the home pass. Exclusive homes do not.
 * When to use: After a regional start in this file.
 * Expected outcome: Each exclusive home hex's controller is that seat.
 * Exceptions: Throws when an exclusive home hex has another controller.
 */
function assertExclusiveHomesAreControlled(seats: readonly { seatId: string; homeRegion: string }[]): void {
  const homes = seats.map((seat) => ({ seatId: seat.seatId, hexes: new Set(getScenarioHomeRegionHexes(seat.homeRegion)) }));
  const control = new Map(
    dbGetAll<{ h3_index: string; controller_player_id: string | null }>(
      'SELECT h3_index, controller_player_id FROM res_s_control'
    ).map((row) => [row.h3_index, row.controller_player_id])
  );
  for (const home of homes) {
    for (const hex of home.hexes) {
      const owners = homes.filter((other) => other.hexes.has(hex));
      if (owners.length !== 1) continue;
      assert.equal(control.get(hex), home.seatId, hex);
    }
  }
}
