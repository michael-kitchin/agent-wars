/**
 * Mercenary storage: the flag, the treasury, hire orders, and cap exclusion.
 *
 * Purpose: A mercenary round-trips through the snapshot, and mercenaries do not fill a unit cap.
 * When to use: After changing the units check, the treasury, or the hire-order table.
 * Expected outcome: The cases below. Each case removes its temporary match.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMaxUnitsPerType, parseGameSize } from '../shared/gameSize';
import { HUMAN_SEAT_ID } from '../shared/seatIds';
import { processProductionAfterControlResolution } from './gameActions/controlAndProduction';
import {
  addTreasuryCredits,
  dbGetOne,
  dbRun,
  deleteHireOrder,
  getGameState,
  getTreasuryCredits,
  insertHireOrder,
  listHireOrdersForSeat,
  replaceBuildQueueForHex,
  setBuildProgressPointsForHex,
  setStrategicInfrastructureForHex,
  setTreasuryCredits,
} from './gameDb';
import { insertUnitRow } from './gameDb/unitInsert';
import { withTempGameDb } from './testSupport/withTempGameDb';

test('a mercenary round-trips and an ordinary unit omits the flag', () => {
  withTempGameDb('aw-merc-flag-', () => {
    const h3 = humanHex();
    insertUnitRow(dbRun, {
      id: 'h1-i900',
      player: HUMAN_SEAT_ID,
      unitType: 'infantry',
      displayOrder: 900,
      h3Index: h3,
      origin: null,
      formedTurn: 1,
      isMercenary: true,
    });
    const units = getGameState().units;
    const mercenary = units.find((unit) => unit.id === 'h1-i900');
    assert.equal(mercenary?.isMercenary, true);
    const ordinary = units.find((unit) => unit.isMercenary !== true);
    assert.ok(ordinary);
    assert.equal('isMercenary' in ordinary, false);
  });
});

test('a mercenary missile and a neutral mercenary are rejected', () => {
  withTempGameDb('aw-merc-check-', () => {
    const h3 = humanHex();
    assert.throws(() => {
      insertUnitRow(dbRun, {
        id: 'h1-m900',
        player: HUMAN_SEAT_ID,
        unitType: 'missile',
        displayOrder: 900,
        h3Index: h3,
        origin: null,
        formedTurn: 1,
        isMercenary: true,
      });
    });
    insertUnitRow(dbRun, {
      id: 'h1-i901',
      player: HUMAN_SEAT_ID,
      unitType: 'infantry',
      displayOrder: 901,
      h3Index: h3,
      origin: null,
      formedTurn: 1,
      isMercenary: true,
    });
    assert.throws(() => {
      dbRun("UPDATE units SET player = 'neutral' WHERE id = ?", ['h1-i901']);
    });
  });
});

test('the treasury starts at 0 and rejects a negative balance', () => {
  withTempGameDb('aw-merc-treasury-', () => {
    assert.equal(getTreasuryCredits(HUMAN_SEAT_ID), 0);
    assert.throws(() => setTreasuryCredits(HUMAN_SEAT_ID, -1));
    assert.equal(addTreasuryCredits(HUMAN_SEAT_ID, 20), 20);
    assert.equal(getTreasuryCredits(HUMAN_SEAT_ID), 20);
  });
});

test('hire orders round-trip and the table rejects a mismatched kind', () => {
  withTempGameDb('aw-merc-orders-', () => {
    const raiseId = insertHireOrder({
      playerId: HUMAN_SEAT_ID,
      kind: 'raise',
      h3Index: 'hex-a',
      unitType: 'infantry',
      unitCount: 2,
      neutralUnitId: null,
      createdTurn: 1,
      reservedCredits: 0,
    });
    const listed = listHireOrdersForSeat(HUMAN_SEAT_ID);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, raiseId);
    assert.equal(listed[0]?.unitCount, 2);
    assert.equal(deleteHireOrder('opponent', raiseId), false);
    assert.equal(deleteHireOrder(HUMAN_SEAT_ID, raiseId), true);
    assert.equal(listHireOrdersForSeat(HUMAN_SEAT_ID).length, 0);
    assert.throws(() => {
      insertHireOrder({
        playerId: HUMAN_SEAT_ID,
        kind: 'raise',
        h3Index: 'hex-a',
        unitType: 'infantry',
        unitCount: 1,
        neutralUnitId: 'h1-i1',
        createdTurn: 1,
        reservedCredits: 0,
      });
    });
    assert.throws(() => {
      insertHireOrder({
        playerId: HUMAN_SEAT_ID,
        kind: 'rehire',
        h3Index: 'hex-a',
        unitType: 'infantry',
        unitCount: 1,
        neutralUnitId: null,
        createdTurn: 1,
        reservedCredits: 0,
      });
    });
  });
});

test('the build queue accepts a credits row', () => {
  withTempGameDb('aw-merc-credits-row-', () => {
    const h3 = humanHex();
    dbRun(
      `INSERT INTO res_s_build_queue (h3_index, queue_index, unit_type, remaining_count) VALUES (?, 0, 'credits', 1)`,
      [h3]
    );
    const row = dbGetOne<{ unitType: string }>(
      'SELECT unit_type AS unitType FROM res_s_build_queue WHERE h3_index = ?',
      [h3]
    );
    assert.equal(row?.unitType, 'credits');
  });
});

test('mercenary infantry do not consume the infantry cap', () => {
  withTempGameDb('aw-merc-cap-', () => {
    const h3 = humanHex();
    dbRun("DELETE FROM units WHERE player = 'human' AND unit_type = 'infantry'");
    const size = parseGameSize(
      dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', ['game_size'])?.value
    );
    const cap = getMaxUnitsPerType(size).infantry;
    for (let index = 0; index < cap; index += 1) {
      insertUnitRow(dbRun, {
        id: `h1-i${800 + index}`,
        player: HUMAN_SEAT_ID,
        unitType: 'infantry',
        displayOrder: 800 + index,
        h3Index: h3,
        origin: null,
        formedTurn: 1,
        isMercenary: true,
      });
    }
    setStrategicInfrastructureForHex(h3, { urbanHexCount: 1, airportCount: 0, seaportCount: 0 });
    replaceBuildQueueForHex(h3, [{ unitType: 'infantry', remainingCount: 1 }]);
    setBuildProgressPointsForHex(h3, 100);
    processProductionAfterControlResolution();
    const spawned = dbGetOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM units WHERE player = 'human' AND unit_type = 'infantry' AND is_mercenary = 0"
    );
    assert.equal(spawned?.count, 1);
  });
});

/**
 * A hex the human controls at the start of a match.
 *
 * Purpose: Unit inserts need a real hex, and that hex is in the human home region.
 * When to use: Inside `withTempGameDb`.
 * Expected outcome: The hex index.
 * Exceptions: Throws when the seeded map has no human-controlled hex.
 */
function humanHex(): string {
  const hex = getGameState().hexes.find((candidate) => {
    return dbGetOne<{ controller: string }>(
      'SELECT controller_player_id AS controller FROM res_s_control WHERE h3_index = ?',
      [candidate.h3Index]
    )?.controller === HUMAN_SEAT_ID;
  })?.h3Index;
  assert.ok(hex);
  return hex;
}
