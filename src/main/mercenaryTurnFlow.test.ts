/**
 * The end of the turn pays mercenaries and fills hire orders on a temporary match.
 *
 * Purpose: Payroll, hiring, and the place action meet the database.
 * When to use: After changing `resolveMercenariesAtEndOfTurn` or `executePlaceHireOrder`.
 * Expected outcome: The cases below. Each case removes its temporary match.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unitCostFor } from '../shared/gameRules';
import {
  HIRE_REASON_NOT_PLANNING,
  MERCENARY_RAISE_CAPACITY_MULTIPLIER,
  RAISE_REASON_OCCUPIED,
  mercenaryHireFee,
} from '../shared/mercenaryRules';
import { HUMAN_SEAT_ID, type SeatId } from '../shared/seatIds';
import {
  dbGetAll,
  dbGetOne,
  dbRun,
  getScenarioHomeRegionHexes,
  getSeatRoster,
  getTreasuryCredits,
  insertHireOrder,
  listAllHireOrders,
  setStrategicInfrastructureForHex,
  setTreasuryCredits,
} from './gameDb';
import { gameDbOps } from './gameDb/dbConnection';
import { mercenaryUpkeepForUnit } from './gameDb/mercenaryEconomyRead';
import { executePlaceHireOrder, readHexHireView } from './gameActions/hireOrders';
import { resolveMercenariesAtEndOfTurn } from './gameActions/mercenaryTurnStep';
import { createStrategicUnit } from './gameActions/strategicUnitSpawn';
import { convertUnitsToNeutral } from './gameActions/unitOwnershipTransfer';
import { buildLatLngCoordinateMap, getOrderedHexList } from './mapData';
import { withTempGameDb } from './testSupport/withTempGameDb';

/**
 * The raise or rehire fee for infantry born on this hex in the open match.
 *
 * Purpose: Advanced tech doubles upkeep, so the expected charge follows the hex.
 * When to use: Inside `withTempGameDb`, after the hex is chosen.
 * Expected outcome: One turn of upkeep for a raise, or twice that for a rehire.
 * Exceptions: None.
 */
function infantryFee(h3Index: string, kind: 'raise' | 'rehire'): number {
  const upkeep = mercenaryUpkeepForUnit(gameDbOps, { unitType: 'infantry', birthH3Index: h3Index });
  return mercenaryHireFee(kind, upkeep);
}

test('a raise on an empty city creates mercenaries, charges the fee, and deletes the order', () => {
  withTempGameDb('aw-hire-raise-', () => {
    const h3 = emptyRaiseHex();
    assert.ok(10 * MERCENARY_RAISE_CAPACITY_MULTIPLIER >= unitCostFor('infantry'));
    setTreasuryCredits(HUMAN_SEAT_ID, 100);
    insertHireOrder({
      playerId: HUMAN_SEAT_ID,
      kind: 'raise',
      h3Index: h3,
      unitType: 'infantry',
      unitCount: 1,
      neutralUnitId: null,
      createdTurn: 1,
    });
    resolveMercenariesAtEndOfTurn({ turnNumber: 1, coordinates: buildLatLngCoordinateMap(getOrderedHexList()) });
    const hired = dbGetOne<{ player: string; mercenary: number; birth: string | null; formed: number }>(
      `SELECT player, is_mercenary AS mercenary, birth_h3_index AS birth, formed_turn AS formed
       FROM units WHERE h3_index = ? AND is_mercenary = 1`,
      [h3]
    );
    assert.equal(hired?.player, HUMAN_SEAT_ID);
    assert.equal(hired?.mercenary, 1);
    assert.equal(hired?.birth, h3);
    assert.equal(hired?.formed, 2);
    assert.equal(getTreasuryCredits(HUMAN_SEAT_ID), 100 - infantryFee(h3, 'raise'));
    assert.equal(listAllHireOrders().length, 0);
  });
});

test('a rehire makes a Neutral unit a mercenary and charges twice its upkeep', () => {
  withTempGameDb('aw-hire-rehire-', () => {
    const h3 = emptyRaiseHex();
    const unitId = createStrategicUnit({
      owner: otherSeat(),
      unitType: 'infantry',
      h3Index: h3,
      turnNumber: 1,
      isMercenary: false,
    });
    dbRun('BEGIN');
    convertUnitsToNeutral([unitId], buildLatLngCoordinateMap(getOrderedHexList()));
    dbRun('COMMIT');
    setTreasuryCredits(HUMAN_SEAT_ID, 100);
    insertHireOrder({
      playerId: HUMAN_SEAT_ID,
      kind: 'rehire',
      h3Index: h3,
      unitType: 'infantry',
      unitCount: 1,
      neutralUnitId: unitId,
      createdTurn: 1,
    });
    resolveMercenariesAtEndOfTurn({ turnNumber: 1, coordinates: buildLatLngCoordinateMap(getOrderedHexList()) });
    const hired = dbGetOne<{ player: string; mercenary: number }>(
      'SELECT player, is_mercenary AS mercenary FROM units WHERE id = ?',
      [unitId]
    );
    assert.equal(hired?.player, HUMAN_SEAT_ID);
    assert.equal(hired?.mercenary, 1);
    assert.equal(getTreasuryCredits(HUMAN_SEAT_ID), 100 - infantryFee(h3, 'rehire'));
  });
});

test('two seats ordering one Neutral unit leave the loser\'s treasury unchanged', () => {
  withTempGameDb('aw-hire-race-', () => {
    const h3 = emptyRaiseHex();
    const opponent = otherSeat();
    const unitId = createStrategicUnit({
      owner: opponent,
      unitType: 'infantry',
      h3Index: h3,
      turnNumber: 1,
      isMercenary: false,
    });
    dbRun('BEGIN');
    convertUnitsToNeutral([unitId], buildLatLngCoordinateMap(getOrderedHexList()));
    dbRun('COMMIT');
    setTreasuryCredits(HUMAN_SEAT_ID, 100);
    setTreasuryCredits(opponent, 100);
    for (const playerId of [HUMAN_SEAT_ID, opponent]) {
      insertHireOrder({
        playerId,
        kind: 'rehire',
        h3Index: h3,
        unitType: 'infantry',
        unitCount: 1,
        neutralUnitId: unitId,
        createdTurn: 1,
      });
    }
    resolveMercenariesAtEndOfTurn({ turnNumber: 1, coordinates: buildLatLngCoordinateMap(getOrderedHexList()) });
    const owner = dbGetOne<{ player: string; mercenary: number }>(
      'SELECT player, is_mercenary AS mercenary FROM units WHERE id = ?',
      [unitId]
    );
    assert.equal(owner?.mercenary, 1);
    assert.ok(owner?.player === HUMAN_SEAT_ID || owner?.player === opponent);
    const humanCredits = getTreasuryCredits(HUMAN_SEAT_ID);
    const opponentCredits = getTreasuryCredits(opponent);
    const balances = [humanCredits, opponentCredits].sort((left, right) => left - right);
    assert.deepEqual(balances, [100 - infantryFee(h3, 'rehire'), 100]);
  });
});

test('unpaid mercenaries desert until the rest fits', () => {
  withTempGameDb('aw-hire-desert-', () => {
    const h3 = emptyRaiseHex();
    for (let i = 0; i < 3; i += 1) {
      createStrategicUnit({
        owner: HUMAN_SEAT_ID,
        unitType: 'infantry',
        h3Index: h3,
        turnNumber: 1,
        isMercenary: true,
      });
    }
    setTreasuryCredits(HUMAN_SEAT_ID, 5);
    resolveMercenariesAtEndOfTurn({ turnNumber: 1, coordinates: buildLatLngCoordinateMap(getOrderedHexList()) });
    const rows = dbGetAll<{ player: string; mercenary: number; id: string }>(
      'SELECT id, player, is_mercenary AS mercenary FROM units WHERE h3_index = ?',
      [h3]
    );
    const stillPaid = rows.filter((row) => row.mercenary === 1);
    const deserted = rows.filter((row) => row.player === 'neutral');
    assert.equal(stillPaid.length, 1);
    assert.equal(deserted.length, 2);
    for (const row of deserted) {
      assert.equal(row.mercenary, 0);
      const order = dbGetOne<{ orderType: string }>(
        'SELECT order_type AS orderType FROM standing_orders WHERE unit_id = ? AND player_id = ?',
        [row.id, 'neutral']
      );
      assert.equal(order?.orderType, 'defend');
    }
  });
});

test('no mercenary and no order leaves the treasury and units unchanged', () => {
  withTempGameDb('aw-hire-quiet-', () => {
    setTreasuryCredits(HUMAN_SEAT_ID, 11);
    const before = dbGetAll<{ id: string; player: string }>('SELECT id, player FROM units ORDER BY id');
    resolveMercenariesAtEndOfTurn({ turnNumber: 1, coordinates: buildLatLngCoordinateMap(getOrderedHexList()) });
    assert.equal(getTreasuryCredits(HUMAN_SEAT_ID), 11);
    assert.deepEqual(dbGetAll<{ id: string; player: string }>('SELECT id, player FROM units ORDER BY id'), before);
  });
});

test('place accepts an empty city, rejects a visible enemy, and rejects a turn that is not planning', () => {
  withTempGameDb('aw-hire-place-', () => {
    const h3 = emptyRaiseHex();
    const placed = executePlaceHireOrder(HUMAN_SEAT_ID, {
      kind: 'raise',
      h3Index: h3,
      unitType: 'infantry',
      count: 1,
    });
    assert.equal(placed.success, true);
    const view = readHexHireView(h3, HUMAN_SEAT_ID);
    assert.equal(view?.pendingOrders.length, 1);
    assert.equal(view?.pendingOrders[0]?.fee, infantryFee(h3, 'raise'));
    createStrategicUnit({
      owner: otherSeat(),
      unitType: 'infantry',
      h3Index: h3,
      turnNumber: 1,
      isMercenary: false,
    });
    const occupied = executePlaceHireOrder(HUMAN_SEAT_ID, {
      kind: 'raise',
      h3Index: h3,
      unitType: 'infantry',
      count: 1,
    });
    assert.equal(occupied.success, false);
    assert.equal(occupied.reason, RAISE_REASON_OCCUPIED);
    dbRun("UPDATE turn_state SET phase = 'resolution' WHERE id = 1");
    const closed = executePlaceHireOrder(HUMAN_SEAT_ID, {
      kind: 'raise',
      h3Index: h3,
      unitType: 'infantry',
      count: 1,
    });
    assert.equal(closed.success, false);
    assert.equal(closed.reason, HIRE_REASON_NOT_PLANNING);
  });
});

/**
 * A human home hex that can raise infantry and holds no units.
 *
 * Purpose: The flow cases need a city the seat has explored because it is home.
 * When to use: Inside `withTempGameDb`.
 * Expected outcome: The hex index, with ten city cells and no units.
 * Exceptions: Throws when the human home is empty or is also another seat's home.
 */
function emptyRaiseHex(): string {
  const human = getSeatRoster().find((seat) => seat.seatId === HUMAN_SEAT_ID);
  assert.ok(human);
  const others = new Set<string>();
  for (const seat of getSeatRoster()) {
    if (seat.seatId === HUMAN_SEAT_ID) continue;
    for (const h3Index of getScenarioHomeRegionHexes(seat.homeRegion)) others.add(h3Index);
  }
  const h3 = getScenarioHomeRegionHexes(human.homeRegion).find((h3Index) => !others.has(h3Index));
  assert.ok(h3);
  const ids = dbGetAll<{ id: string }>('SELECT id FROM units WHERE h3_index = ?', [h3]).map((row) => row.id);
  if (ids.length > 0) {
    const marks = ids.map(() => '?').join(', ');
    dbRun(`DELETE FROM standing_orders WHERE unit_id IN (${marks})`, ids);
    dbRun(`DELETE FROM unit_transport_assignments WHERE land_unit_id IN (${marks}) OR naval_unit_id IN (${marks})`, [...ids, ...ids]);
    dbRun(`DELETE FROM units WHERE id IN (${marks})`, ids);
  }
  setStrategicInfrastructureForHex(h3, { urbanHexCount: 10, airportCount: 0, seaportCount: 0 });
  return h3;
}

/**
 * An active seat other than the human.
 *
 * Purpose: Rehire races and the occupied-hex rejection need a second owner.
 * When to use: Inside `withTempGameDb`.
 * Expected outcome: That seat's id.
 * Exceptions: Throws when the roster has no other active seat.
 */
function otherSeat(): SeatId {
  const seat = getSeatRoster().find((row) => row.seatId !== HUMAN_SEAT_ID && row.outTurn === null);
  assert.ok(seat);
  return seat.seatId;
}
