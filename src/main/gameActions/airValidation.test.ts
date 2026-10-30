/**
 * Strategic ferry validation for a squadron that is already at the destination.
 *
 * Purpose: A ferry onto the current base used to pass range and airport checks and then rewrite the same hex.
 * When to use: After changing `validateFerryOrder`.
 * Expected outcome: The current base is rejected. A neighboring controlled airport is accepted. A group that mixes both still succeeds, and a group of only the unit already there fails.
 * Exceptions: Throws when the seeded match has no neighboring pair of human-controlled airports.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeGridDistancePure } from '../../shared/h3GridRangePure';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { AIR_FERRY_RANGE_HEXES } from '../../shared/tacticalRanges';
import { dbGetAll, dbRun } from '../gameDb';
import { insertUnitRow } from '../gameDb/unitInsert';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { FERRY_REASON_ALREADY_BASED, validateFerryOrder } from './airValidation';
import { validateGroupFerryTarget } from './strategicOrderValidation';

/**
 * Two human-controlled airport hexes one ferry step apart.
 *
 * Purpose: The valid-destination case has to be a real airport the seat controls, not a fabricated hex.
 * When to use: The ferry validation case only.
 * Expected outcome: The origin and a different destination within `AIR_FERRY_RANGE_HEXES`.
 * Exceptions: Throws when no such pair exists in the seeded match.
 */
function neighboringHumanAirports(): { origin: string; destination: string } {
  const hexes = dbGetAll<{ h3Index: string }>(
    `SELECT i.h3_index AS h3Index
     FROM res_s_infrastructure i
     JOIN res_s_control c ON c.h3_index = i.h3_index
     WHERE i.airport_count > 0 AND c.controller_player_id = ?`,
    [HUMAN_SEAT_ID]
  ).map((row) => row.h3Index);
  for (let i = 0; i < hexes.length; i++) {
    for (let j = i + 1; j < hexes.length; j++) {
      const distance = computeGridDistancePure(hexes[i]!, hexes[j]!);
      if (distance !== null && distance >= 1 && distance <= AIR_FERRY_RANGE_HEXES) {
        return { origin: hexes[i]!, destination: hexes[j]! };
      }
    }
  }
  throw new Error('seeded match has no neighboring human-controlled airports');
}

test('a ferry onto the current base is rejected and a neighboring airport is accepted', () => {
  withTempGameDb('aw-ferry-current-base-', () => {
    const { origin, destination } = neighboringHumanAirports();
    insertUnitRow(dbRun, {
      id: 'h1-a900',
      player: HUMAN_SEAT_ID,
      unitType: 'air',
      displayOrder: 900,
      h3Index: origin,
      origin: null,
      formedTurn: 1,
    });
    const sameBase = validateFerryOrder('h1-a900', origin, { allowedPlayer: HUMAN_SEAT_ID });
    const neighbor = validateFerryOrder('h1-a900', destination, { allowedPlayer: HUMAN_SEAT_ID });
    assert.deepEqual(sameBase, { valid: false, reason: FERRY_REASON_ALREADY_BASED });
    assert.deepEqual(neighbor, { valid: true });
  });
});

test('a group ferry is accepted when another selected unit is already at the destination', () => {
  withTempGameDb('aw-ferry-group-current-base-', () => {
    const { origin, destination } = neighboringHumanAirports();
    insertUnitRow(dbRun, {
      id: 'h1-a901',
      player: HUMAN_SEAT_ID,
      unitType: 'air',
      displayOrder: 901,
      h3Index: origin,
      origin: null,
      formedTurn: 1,
    });
    insertUnitRow(dbRun, {
      id: 'h1-a902',
      player: HUMAN_SEAT_ID,
      unitType: 'air',
      displayOrder: 902,
      h3Index: destination,
      origin: null,
      formedTurn: 1,
    });
    const mixed = validateGroupFerryTarget(['h1-a901', 'h1-a902'], destination);
    const onlyHome = validateGroupFerryTarget(['h1-a902'], destination);
    assert.equal(mixed.success, true);
    assert.equal(onlyHome.success, false);
    assert.match(onlyHome.reason ?? '', new RegExp(FERRY_REASON_ALREADY_BASED));
  });
});
