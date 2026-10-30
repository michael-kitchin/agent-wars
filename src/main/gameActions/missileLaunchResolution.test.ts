/**
 * Missile launch resolution: flag rolls, spent missiles, and rejected launches.
 *
 * Purpose: A face of 1, and a face equal to getAttack('air'), clear every unfortified flag and based air. A face one above getAttack('air'), and a face of 20, spend the missile and leave the target.
 * When to use: After changing `resolveMissileLaunchPhase`.
 * Expected outcome: The cases below. An out-of-range target uses `missileRangeHexes() + 1`.
 * Exceptions: None. Each case opens its own temporary match.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { getAttack } from '../combatConstants';
import { COMBAT_DIE_SIDES } from '../combatDice';
import { missileRangeHexes } from '../../shared/gameRules';
import { HUMAN_SEAT_ID, aiSeatIdForIndex } from '../../shared/seatIds';
import { dbGetAll, dbGetOne, dbRun, getMapHexSet, listTacticalFeatureOverridesForGame, setTacticalCellFortified } from '../gameDb';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { resolveMissileLaunchPhase } from './missileLaunchResolution';
import { insertMissileHoldOrder } from '../tools/missileHoldOrder';

/**
 * An urban airport hex and a neighboring launch hex on the loaded map.
 *
 * Purpose: Destruction cases need a target that has flags and a missile one hex away.
 * When to use: Inside a seated temporary match.
 * Expected outcome: Both hexes, or a thrown assertion when the map has no such pair.
 * Exceptions: None.
 */
function urbanAirportTarget(): { target: string; launch: string } {
  const target = dbGetOne<{ h3Index: string }>(
    `SELECT h3_index AS h3Index FROM res_s_infrastructure
     WHERE urban_hex_count > 0 AND airport_count > 0
     ORDER BY urban_hex_count DESC, h3_index LIMIT 1`
  )?.h3Index;
  assert.ok(target, 'expected a hex with urban cells and an airport');
  const launch = gridDisk(target, 1).find((hex) => hex !== target && getMapHexSet().has(hex));
  assert.ok(launch, 'expected an on-map neighbor of the target');
  return { target, launch };
}

/**
 * Inserts a holding human missile and an enemy air unit on the target.
 *
 * Purpose: The destruction cases need both rows and a standing order to delete.
 * When to use: After `urbanAirportTarget`.
 * Expected outcome: `h1-m1` holds. The air unit sits on the target.
 * Exceptions: Propagates a database error.
 */
function placeMissileAndAir(launch: string, target: string): void {
  dbRun(
    `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES ('h1-m1', ?, 'missile', ?, 1)`,
    [HUMAN_SEAT_ID, launch]
  );
  insertMissileHoldOrder({ playerId: HUMAN_SEAT_ID, unitId: 'h1-m1', h3Index: launch, createdTurn: 1 });
  dbRun(
    `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES ('a2-a1', ?, 'air', ?, 1)`,
    [aiSeatIdForIndex(1), target]
  );
}

/**
 * Turns one die face into the uniform draw the combat die roller expects.
 *
 * Purpose: A boundary case needs every flag in the hex to roll the same face.
 * When to use: The air-attack hit test and the face-above-it miss test.
 * Expected outcome: The combat die roller returns `face`.
 * Exceptions: None. `face` is from 1 through `COMBAT_DIE_SIDES`.
 */
function uniformFace(face: number): () => number {
  return () => (face - 0.5) / COMBAT_DIE_SIDES;
}

test('a launch that rolls 1 clears every flag and the based air', () => {
  withSeatedTempGameDb('aw-missile-launch-hit-', { fogOfWarEnabled: false }, () => {
    const { target, launch } = urbanAirportTarget();
    placeMissileAndAir(launch, target);
    const before = listTacticalFeatureOverridesForGame().filter((row) => row.parentH3Index === target);
    const flagged = before.filter((row) => row.isUrban || row.isAirport || row.isSeaport);
    assert.ok(flagged.length > 0);
    const result = resolveMissileLaunchPhase([{ unitId: 'h1-m1', targetH3Index: target }], () => 0);
    const after = new Map(
      listTacticalFeatureOverridesForGame().filter((row) => row.parentH3Index === target).map((row) => [row.h3Index, row])
    );
    for (const row of flagged) {
      const next = after.get(row.h3Index);
      assert.ok(next);
      assert.equal(next.isUrban, false);
      assert.equal(next.isAirport, false);
      assert.equal(next.isSeaport, false);
      assert.equal(next.isRubble, true);
    }
    const counts = dbGetOne<{ urban: number; airport: number; seaport: number }>(
      `SELECT urban_hex_count AS urban, airport_count AS airport, seaport_count AS seaport
       FROM res_s_infrastructure WHERE h3_index = ?`,
      [target]
    );
    assert.deepEqual(counts, { urban: 0, airport: 0, seaport: 0 });
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['a2-a1']), undefined);
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['h1-m1']), undefined);
    assert.equal(dbGetOne('SELECT unit_id FROM standing_orders WHERE unit_id = ?', ['h1-m1']), undefined);
    assert.equal(result.removedUnits.some((unit) => unit.id === 'a2-a1' && unit.h3Index === target), true);
    const record = result.launches[0];
    assert.ok(record);
    assert.equal(record.urbanBefore, record.urbanDestroyed);
    assert.equal(record.airportsBefore, record.airportsDestroyed);
    assert.equal(record.seaportsBefore, record.seaportsDestroyed);
    assert.deepEqual(record.destroyedAirUnitIds, ['a2-a1']);
  });
});

test('a launch that rolls 20 spends the missile and leaves the target intact', () => {
  withSeatedTempGameDb('aw-missile-launch-miss-', { fogOfWarEnabled: false }, () => {
    const { target, launch } = urbanAirportTarget();
    placeMissileAndAir(launch, target);
    const before = listTacticalFeatureOverridesForGame().filter((row) => row.parentH3Index === target);
    const result = resolveMissileLaunchPhase([{ unitId: 'h1-m1', targetH3Index: target }], () => 0.999);
    const after = listTacticalFeatureOverridesForGame().filter((row) => row.parentH3Index === target);
    assert.deepEqual(after, before);
    assert.ok(dbGetOne('SELECT id FROM units WHERE id = ?', ['a2-a1']));
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['h1-m1']), undefined);
    const record = result.launches[0];
    assert.ok(record);
    assert.equal(record.urbanDestroyed, 0);
    assert.equal(record.airportsDestroyed, 0);
    assert.equal(record.seaportsDestroyed, 0);
    assert.deepEqual(record.destroyedAirUnitIds, []);
    assert.equal(result.removedUnits.length, 0);
  });
});

test('an out-of-range launch changes nothing', () => {
  withSeatedTempGameDb('aw-missile-launch-range-', { fogOfWarEnabled: false }, () => {
    const { target, launch } = urbanAirportTarget();
    placeMissileAndAir(launch, target);
    const range = missileRangeHexes();
    const inside = new Set(gridDisk(launch, range));
    const outside = gridDisk(launch, range + 1).find((hex) => getMapHexSet().has(hex) && !inside.has(hex));
    assert.ok(outside, `expected an on-map hex outside missile range ${range}`);
    const result = resolveMissileLaunchPhase([{ unitId: 'h1-m1', targetH3Index: outside }], () => 0);
    assert.equal(result.launches.length, 0);
    assert.ok(dbGetOne('SELECT id FROM units WHERE id = ?', ['h1-m1']));
    assert.ok(dbGetOne('SELECT id FROM units WHERE id = ?', ['a2-a1']));
  });
});

test('an unexplored launch changes nothing', () => {
  withSeatedTempGameDb('aw-missile-launch-fog-', {}, () => {
    const unseen = dbGetAll<{ h3Index: string }>(
      `SELECT h.h3_index AS h3Index FROM hexes h
       WHERE NOT EXISTS (
         SELECT 1 FROM player_hex_intel i WHERE i.player_id = ? AND i.h3_index = h.h3_index
       )
       LIMIT 30`,
      [HUMAN_SEAT_ID]
    );
    let pair: { launch: string; target: string } | null = null;
    for (const row of unseen) {
      const launch = gridDisk(row.h3Index, 1).find((hex) => hex !== row.h3Index && getMapHexSet().has(hex));
      if (launch) {
        pair = { launch, target: row.h3Index };
        break;
      }
    }
    assert.ok(pair, 'expected an unexplored hex next to an on-map hex');
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES ('h1-m1', ?, 'missile', ?, 1)`,
      [HUMAN_SEAT_ID, pair.launch]
    );
    const result = resolveMissileLaunchPhase([{ unitId: 'h1-m1', targetH3Index: pair.target }], () => 0);
    assert.equal(result.launches.length, 0);
    assert.ok(dbGetOne('SELECT id FROM units WHERE id = ?', ['h1-m1']));
  });
});

test('a fortified cell loses its fortification on a 1 and keeps the city', () => {
  withSeatedTempGameDb('aw-missile-fort-hit-', { fogOfWarEnabled: false }, () => {
    const { target, launch } = urbanAirportTarget();
    const cell = listTacticalFeatureOverridesForGame().find(
      (row) => row.parentH3Index === target && row.isUrban && !row.isRubble
    );
    assert.ok(cell, 'expected an intact city cell');
    setTacticalCellFortified(cell.h3Index, true);
    const unfortifiedUrban = listTacticalFeatureOverridesForGame().filter(
      (row) => row.parentH3Index === target && row.isUrban && !row.isFortified
    ).length;
    placeMissileAndAir(launch, target);
    const tally = new Map<string, number>();
    const result = resolveMissileLaunchPhase([{ unitId: 'h1-m1', targetH3Index: target }], () => 0, tally);
    const after = listTacticalFeatureOverridesForGame().find((row) => row.h3Index === cell.h3Index);
    assert.equal(after?.isUrban, true);
    assert.equal(after?.isFortified, false);
    assert.equal(after?.isRubble, false);
    const record = result.launches[0];
    assert.equal(record?.fortificationsDestroyed, 1);
    assert.equal(record?.fortificationsBefore, 1);
    assert.equal(tally.get(target), 1);
    assert.equal(record?.urbanBefore, unfortifiedUrban);
  });
});

test('a fortified cell that rolls 20 keeps the fortification and the city', () => {
  withSeatedTempGameDb('aw-missile-fort-save-', { fogOfWarEnabled: false }, () => {
    const { target, launch } = urbanAirportTarget();
    const cell = listTacticalFeatureOverridesForGame().find(
      (row) => row.parentH3Index === target && row.isUrban && !row.isRubble
    );
    assert.ok(cell);
    setTacticalCellFortified(cell.h3Index, true);
    placeMissileAndAir(launch, target);
    const result = resolveMissileLaunchPhase([{ unitId: 'h1-m1', targetH3Index: target }], () => 0.999);
    const after = listTacticalFeatureOverridesForGame().find((row) => row.h3Index === cell.h3Index);
    assert.equal(after?.isUrban, true);
    assert.equal(after?.isFortified, true);
    assert.equal(result.launches[0]?.fortificationsDestroyed, 0);
    assert.equal(result.launches[0]?.fortificationsBefore, 1);
  });
});

test('a launch that rolls the air attack clears unfortified flags, strips one fortification, and destroys based air', () => {
  withSeatedTempGameDb('aw-missile-launch-air-attack-', { fogOfWarEnabled: false }, () => {
    const { target, launch } = urbanAirportTarget();
    const cell = listTacticalFeatureOverridesForGame().find(
      (row) => row.parentH3Index === target && row.isUrban && !row.isAirport && !row.isSeaport && !row.isRubble
    );
    assert.ok(cell, 'expected an intact city cell that is not an airport or a seaport');
    const airportLeft = listTacticalFeatureOverridesForGame().some(
      (row) => row.parentH3Index === target && row.isAirport && row.h3Index !== cell.h3Index
    );
    assert.equal(airportLeft, true);
    setTacticalCellFortified(cell.h3Index, true);
    const unfortifiedUrban = listTacticalFeatureOverridesForGame().filter(
      (row) => row.parentH3Index === target && row.isUrban && !row.isFortified
    ).length;
    placeMissileAndAir(launch, target);
    const tally = new Map<string, number>();
    const result = resolveMissileLaunchPhase(
      [{ unitId: 'h1-m1', targetH3Index: target }],
      uniformFace(getAttack('air')),
      tally
    );
    const after = new Map(
      listTacticalFeatureOverridesForGame().filter((row) => row.parentH3Index === target).map((row) => [row.h3Index, row])
    );
    const fortified = after.get(cell.h3Index);
    assert.ok(fortified);
    assert.equal(fortified.isUrban, true);
    assert.equal(fortified.isFortified, false);
    assert.equal(fortified.isRubble, false);
    for (const [h3Index, row] of after) {
      if (h3Index === cell.h3Index) continue;
      if (!row.isRubble && !row.isUrban && !row.isAirport && !row.isSeaport) continue;
      assert.equal(row.isUrban, false);
      assert.equal(row.isAirport, false);
      assert.equal(row.isSeaport, false);
      assert.equal(row.isRubble, true);
    }
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['a2-a1']), undefined);
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['h1-m1']), undefined);
    const record = result.launches[0];
    assert.equal(record?.fortificationsBefore, 1);
    assert.equal(record?.fortificationsDestroyed, 1);
    assert.equal(record?.urbanBefore, unfortifiedUrban);
    assert.equal(tally.get(target), 1);
    assert.equal(result.removedUnits.some((unit) => unit.id === 'a2-a1'), true);
  });
});

test('a launch that rolls one above the air attack spends the missile and leaves the target', () => {
  withSeatedTempGameDb('aw-missile-launch-above-air-attack-', { fogOfWarEnabled: false }, () => {
    const missFace = getAttack('air') + 1;
    assert.ok(missFace <= COMBAT_DIE_SIDES);
    const { target, launch } = urbanAirportTarget();
    const cell = listTacticalFeatureOverridesForGame().find(
      (row) => row.parentH3Index === target && row.isUrban && !row.isRubble
    );
    assert.ok(cell, 'expected an intact city cell');
    setTacticalCellFortified(cell.h3Index, true);
    placeMissileAndAir(launch, target);
    const before = listTacticalFeatureOverridesForGame().filter((row) => row.parentH3Index === target);
    const result = resolveMissileLaunchPhase(
      [{ unitId: 'h1-m1', targetH3Index: target }],
      uniformFace(missFace)
    );
    const after = listTacticalFeatureOverridesForGame().filter((row) => row.parentH3Index === target);
    assert.deepEqual(after, before);
    assert.ok(dbGetOne('SELECT id FROM units WHERE id = ?', ['a2-a1']));
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['h1-m1']), undefined);
    assert.equal(result.launches[0]?.fortificationsDestroyed, 0);
    assert.equal(result.launches[0]?.urbanDestroyed, 0);
    assert.equal(result.launches[0]?.airportsDestroyed, 0);
    assert.equal(result.launches[0]?.seaportsDestroyed, 0);
    assert.equal(result.removedUnits.length, 0);
  });
});
