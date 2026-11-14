/**
 * One sea operation launched from a seeded match, and a hidden defender that blocks it.
 *
 * Purpose: The turn advance must store a muster, refuse a second one, drop a seat that has left, and see defenders fog hides.
 * When to use: After changes to `advanceOperationsForSeat`.
 * Expected outcome: Process exit 0. The match is temporary and the force is placed on the seeded map.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import { isWithinGridRangePure } from '../../shared/h3GridRangePure';
import { canLandUnitTraverseEdge, getLandStepDistances, STRATEGIC_LAND_MAX_WATER_PCT, type LandMassByH3 } from '../../shared/landTraversalStrategic';
import type { KnockoutCoordinates } from '../gameActions/knockoutConsequences';
import { dbGetAll, dbGetOne, dbRun, getGameState, getGameStateForPlayer, listUnitsForSnapshot } from '../gameDb';
import { readOperationEventTurn, readOperationNote, readOperationOffer, readOperations, writeOperationEventTurn, writeOperationNote, writeOperationOffer } from '../gameDb/operationMemory';
import { writePosture } from '../gameDb/postureMemory';
import { loadCampaignLandMass } from '../openRouter/campaignObjectiveFlow';
import type { LatLng } from '../tools/h3LatLng';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { buildLiftTerrain } from './liftTerrain';
import { advanceOperationsAfterTurn, advanceOperationsForSeat } from './operationTurnFlow';

const SEAT = 'opponent' as const;

/**
 * Coordinate helpers for the seeded hexes.
 *
 * Purpose: The launch writes marches, and those marches need a center for the port.
 * When to use: Before each advance.
 * Expected outcome: A center for every hex, resolved back at res 1.
 * Exceptions: None. An unresolvable center returns undefined.
 */
function coordinates(): KnockoutCoordinates {
  const state = getGameState();
  return {
    latLngByH3: new Map<string, LatLng>(state.hexes.map((hex) => [hex.h3Index, cellToLatLng(hex.h3Index)])),
    resolveToH3: (lat, lng) => {
      try {
        return latLngToCell(lat, lng, 1);
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * Sets the planning turn the operation tick will read.
 *
 * Purpose: The window compares the stored turn with the match's turn number.
 * When to use: Before an advance that must see a chosen turn.
 * Expected outcome: The next snapshot reports that turn.
 * Exceptions: None.
 */
function setTurn(turnNumber: number): void {
  dbRun('UPDATE turn_state SET turn_number = ? WHERE id = 1', [turnNumber]);
}

/**
 * A port the ground units can walk to and a distant enemy coastal city a ship can reach.
 *
 * Purpose: The launch needs one force, one port, and one city, with no other city left in the match.
 * When to use: The start of each case. Pass `defender` to put an enemy unit on the city.
 * Expected outcome: Four infantry, one ship, and the city hex. Throws when the seeded map has no such pair.
 * Exceptions: Throws when no city can be sailed to from a reachable port.
 */
function arrange(landMass: LandMassByH3, defender: boolean): { readonly city: string } {
  dbRun('DELETE FROM standing_orders');
  dbRun('DELETE FROM unit_transport_assignments');
  dbRun('DELETE FROM units');
  dbRun('UPDATE res_s_infrastructure SET urban_hex_count = 0');
  const state = getGameState();
  const hexById = new Map(state.hexes.map((hex) => [hex.h3Index, hex]));
  const hexSet = new Set(hexById.keys());
  const aiHome = state.homeRegionHexesBySeat?.opponent ?? [];
  const humanHome = new Set(state.homeRegionHexesBySeat?.human ?? []);
  const origin = aiHome.find((hex) => {
    const record = landMass.get(hex);
    return record !== undefined && record.waterPct < STRATEGIC_LAND_MAX_WATER_PCT;
  });
  assert.ok(origin, 'expected walkable land in the AI home');
  const steps = getLandStepDistances({ originH3s: [origin], hexSet, data: landMass, maxDepth: 8 });
  const port = [...steps.keys()].find((hex) => {
    const row = hexById.get(hex);
    return hex !== origin && (row?.terrain === 'coastal' || row?.terrainKind === 'coastal');
  });
  assert.ok(port, 'expected a coastal hex the infantry can reach');
  const infantryHex = gridDisk(port, 1).find(
    (hex) => hex !== port && hexById.get(hex)?.terrain !== 'water' && canLandUnitTraverseEdge(hex, port, landMass),
  );
  assert.ok(infantryHex, 'expected land beside the port the infantry can enter from');
  const shipHex = gridDisk(port, 1).find((hex) => hexById.get(hex)?.terrain === 'water');
  assert.ok(shipHex, 'expected water beside the port');
  dbRun(
    `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
     VALUES (?, 0, 0, 1)
     ON CONFLICT(h3_index) DO UPDATE SET seaport_count = 1`,
    [port],
  );
  dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [port, SEAT]);
  for (const id of ['inf-a', 'inf-b', 'inf-c', 'inf-d']) {
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, SEAT, 'infantry', infantryHex]);
  }
  dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', ['ship-1', SEAT, 'naval', shipHex]);
  const seatState = getGameStateForPlayer(SEAT, { maskUnexploredTerrain: false });
  const terrain = buildLiftTerrain({
    state: { ...seatState, units: listUnitsForSnapshot() },
    seatId: SEAT,
    landMass,
  });
  const city = [...humanHome].find((hex) => {
    const row = hexById.get(hex);
    if (row?.terrain !== 'coastal' && row?.terrainKind !== 'coastal') return false;
    if (isWithinGridRangePure(shipHex, hex, 7)) return false;
    return terrain.landingHexes(hex).some((landing) => terrain.sailTurns(port, landing) !== null);
  });
  assert.ok(city, 'expected an enemy coastal city the ship can reach');
  dbRun(
    `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
     VALUES (?, 4, 0, 0)
     ON CONFLICT(h3_index) DO UPDATE SET urban_hex_count = 4`,
    [city],
  );
  dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [city, 'human']);
  if (defender) {
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', ['defender', 'human', 'infantry', city]);
  }
  return { city };
}

test('one call stores a muster and the next call does not store another', () => {
  withTempGameDb('aw-operation-turn-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    arrange(landMass, false);
    const coords = coordinates();
    const ops = { getOne: dbGetOne };
    setTurn(5);
    advanceOperationsForSeat(SEAT, coords);
    assert.equal(readOperations(ops).get(SEAT), undefined);
    assert.deepEqual(readOperationOffer(ops, SEAT), { announcedTurn: 5, clearOfferTurn: 5 });
    assert.equal(readOperationEventTurn(ops, SEAT), 5);
    setTurn(6);
    advanceOperationsForSeat(SEAT, coords);
    const first = readOperations(ops).get(SEAT) ?? [];
    assert.equal(first.length, 1);
    assert.equal(first[0]?.phase, 'muster');
    assert.equal(first[0]?.unitIds.length, 2);
    assert.deepEqual(first[0]?.carrierIds, ['ship-1']);
    assert.equal(readOperationOffer(ops, SEAT).clearOfferTurn, null);
    assert.equal(readOperationEventTurn(ops, SEAT), 6);
    const orders = dbGetAll<{ unit_id: string; order_type: string }>(
      'SELECT unit_id, order_type FROM standing_orders WHERE player_id = ? ORDER BY unit_id',
      [SEAT],
    );
    const marching = new Set(orders.filter((row) => row.order_type === 'march').map((row) => row.unit_id));
    for (const unitId of [...(first[0]?.unitIds ?? []), ...(first[0]?.carrierIds ?? [])]) {
      assert.equal(marching.has(unitId), true, unitId);
    }
    advanceOperationsForSeat(SEAT, coords);
    const second = readOperations(ops).get(SEAT) ?? [];
    assert.equal(second.length, 1);
    assert.equal(second[0]?.id, first[0]?.id);
  });
});

test('a seat that has left the match loses its stored operations', () => {
  withTempGameDb('aw-operation-turn-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    arrange(landMass, false);
    const coords = coordinates();
    setTurn(5);
    advanceOperationsForSeat(SEAT, coords);
    setTurn(6);
    advanceOperationsForSeat(SEAT, coords);
    assert.equal((readOperations({ getOne: dbGetOne }).get(SEAT) ?? []).length, 1);
    const memory = { getOne: dbGetOne, run: dbRun };
    writeOperationOffer(memory, 'spectator', { announcedTurn: 4, clearOfferTurn: 4 });
    writeOperationEventTurn(memory, 'spectator', 4);
    writeOperationNote(memory, 'spectator', { turn: 4, text: 'operations dropped: expected an array.' });
    dbRun('UPDATE seats SET out_turn = 1 WHERE seat_id = ?', [SEAT]);
    advanceOperationsAfterTurn(coords);
    assert.equal(readOperations({ getOne: dbGetOne }).get(SEAT), undefined);
    assert.equal(readOperationOffer({ getOne: dbGetOne }, SEAT).announcedTurn, null);
    assert.equal(readOperationEventTurn({ getOne: dbGetOne }, SEAT), null);
    assert.equal(readOperationOffer({ getOne: dbGetOne }, 'spectator').announcedTurn, null);
    assert.equal(readOperationEventTurn({ getOne: dbGetOne }, 'spectator'), null);
    assert.equal(readOperationNote({ getOne: dbGetOne }, 'spectator'), null);
  });
});

test('a defender hidden by fog still blocks the launch', () => {
  withTempGameDb('aw-operation-turn-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass, true);
    const visible = new Set(getGameStateForPlayer(SEAT).units.map((unit) => unit.id));
    assert.equal(visible.has('defender'), false);
    assert.equal(listUnitsForSnapshot().some((unit) => unit.id === 'defender' && unit.h3Index === city), true);
    advanceOperationsForSeat(SEAT, coordinates());
    assert.equal(readOperations({ getOne: dbGetOne }).get(SEAT), undefined);
    setTurn(5);
    advanceOperationsForSeat(SEAT, coordinates());
    assert.equal(readOperations({ getOne: dbGetOne }).get(SEAT), undefined);
    assert.equal(readOperationOffer({ getOne: dbGetOne }, SEAT).clearOfferTurn, null);
    setTurn(6);
    advanceOperationsForSeat(SEAT, coordinates());
    assert.equal(readOperations({ getOne: dbGetOne }).get(SEAT), undefined);
    dbRun('DELETE FROM units WHERE id = ?', ['defender']);
    setTurn(7);
    advanceOperationsForSeat(SEAT, coordinates());
    assert.equal(readOperations({ getOne: dbGetOne }).get(SEAT), undefined);
    assert.equal(readOperationOffer({ getOne: dbGetOne }, SEAT).clearOfferTurn, 7);
    setTurn(8);
    advanceOperationsForSeat(SEAT, coordinates());
    assert.equal((readOperations({ getOne: dbGetOne }).get(SEAT) ?? []).length, 1);
  });
});

test('blitz records one defender and launches that sea city on the next turn', () => {
  withTempGameDb('aw-operation-turn-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass, true);
    writePosture({ getOne: dbGetOne, run: dbRun }, SEAT, { posture: 'blitz', sinceTurn: 1 });
    setTurn(5);
    advanceOperationsForSeat(SEAT, coordinates());
    assert.equal(readOperations({ getOne: dbGetOne }).get(SEAT), undefined);
    assert.equal(readOperationOffer({ getOne: dbGetOne }, SEAT).clearOfferTurn, 5);
    setTurn(6);
    advanceOperationsForSeat(SEAT, coordinates());
    const launched = readOperations({ getOne: dbGetOne }).get(SEAT) ?? [];
    assert.equal(launched.length, 1);
    assert.equal(launched[0]?.method, 'sea');
    assert.equal(launched[0]?.objectiveH3, city);
  });
});
