/**
 * The shared sea-candidate search stops when a slot or the terrain is unavailable.
 *
 * Purpose: A full seat and a failed search must not invent a landing.
 * When to use: After changes to `operationCandidatesForSeat`.
 * Expected outcome: Process exit 0.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { isWithinGridRangePure } from '../../shared/h3GridRangePure';
import {
  canLandUnitTraverseEdge,
  getLandStepDistances,
  landUnitCanOccupyHex,
  STRATEGIC_LAND_MAX_WATER_PCT,
  type LandMassByH3,
} from '../../shared/landTraversalStrategic';
import { POSTURE_SETTINGS } from '../../shared/postureTypes';
import type { GameStateSnapshot } from '../gameDb';
import { dbGetOne, dbRun, getGameState, getGameStateForPlayer } from '../gameDb';
import { writePosture } from '../gameDb/postureMemory';
import { loadCampaignLandMass } from '../openRouter/campaignObjectiveFlow';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import type { Operation, OperationCandidate } from '../../shared/operationTypes';
import { buildLiftTerrain } from './liftTerrain';
import { operationCandidatesForSeat, operationMenuRows, operationSlotsForState } from './operationCandidates';

/**
 * One stored sea operation.
 *
 * Purpose: A small match has one sea slot, so this row fills it.
 * When to use: The full-slot case.
 * Expected outcome: A muster operation.
 * Exceptions: None.
 */
function fillingOperation(): Operation {
  return {
    id: 'opponent-op1',
    method: 'sea',
    objectiveH3: 'city',
    musterH3: 'port',
    landingH3: null,
    unitIds: ['inf-a', 'inf-b'],
    carrierIds: ['ship-1'],
    phase: 'muster',
    source: 'engine',
    launchedTurn: 1,
    phaseTurn: 1,
  };
}

test('full sea slots give no candidates', () => {
  const state = { gameSize: 'small' } as GameStateSnapshot;
  const candidates = operationCandidatesForSeat({
    state,
    seatId: 'opponent',
    active: [fillingOperation()],
  });
  assert.deepEqual(candidates, []);
});

/**
 * One menu row named by its objective, so a composition test can see the order.
 *
 * Purpose: The menu cut does not read the route, only the two lists.
 * When to use: The composition cases.
 * Expected outcome: A sea or air candidate whose objective is the given hex.
 * Exceptions: None.
 */
function row(method: 'land' | 'sea' | 'air', objectiveH3: string): OperationCandidate {
  return {
    method,
    objectiveH3,
    musterH3: 'muster',
    landingH3: 'landing',
    unitIds: method === 'air' ? ['inf-a'] : ['inf-a', 'inf-b'],
    carrierIds: method === 'air' ? ['air-1'] : ['ship-1'],
    etaTurns: 3,
    urbanHexCount: 1,
    inEnemyHome: false,
    knownFortifiedCount: 0,
    defenders: 0,
    reinforcers: 0,
    clear: true,
  };
}

test('the menu keeps sea rows first and reserves the last rows for air', () => {
  const threeSea = ['s1', 's2', 's3'].map((id) => row('sea', id));
  const twoAir = ['a1', 'a2'].map((id) => row('air', id));
  assert.deepEqual(
    operationMenuRows({ sea: threeSea, air: twoAir }).map((candidate) => candidate.objectiveH3),
    ['s1', 's2', 's3', 'a1', 'a2']
  );
  const sixSea = ['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => row('sea', id));
  assert.deepEqual(
    operationMenuRows({ sea: sixSea, air: [row('air', 'a1')] }).map((candidate) => candidate.objectiveH3),
    ['s1', 's2', 's3', 's4', 'a1']
  );
  const fiveSea = ['s1', 's2', 's3', 's4', 's5'].map((id) => row('sea', id));
  assert.deepEqual(
    operationMenuRows({ sea: fiveSea, air: twoAir }).map((candidate) => candidate.objectiveH3),
    ['s1', 's2', 's3', 'a1', 'a2']
  );
  assert.deepEqual(
    operationMenuRows({ sea: [], air: twoAir }).map((candidate) => candidate.objectiveH3),
    ['a1', 'a2']
  );
});

test('land rows come first and sea takes the seats that remain', () => {
  const land = ['l1', 'l2'].map((id) => row('land', id));
  const sea = ['s1', 's2', 's3', 's4'].map((id) => row('sea', id));
  const air = ['a1', 'a2'].map((id) => row('air', id));
  assert.deepEqual(
    operationMenuRows({ land, sea, air }).map((candidate) => candidate.objectiveH3),
    ['l1', 'l2', 's1', 'a1', 'a2'],
  );
});

test('air and sea slots are counted separately', () => {
  const state = { gameSize: 'small' } as GameStateSnapshot;
  assert.equal(operationSlotsForState(state, 'sea'), 1);
  assert.equal(operationSlotsForState(state, 'air'), 1);
  assert.equal(operationSlotsForState(state, 'air', POSTURE_SETTINGS.blitz), 2);
  assert.equal(operationSlotsForState(state, 'sea', POSTURE_SETTINGS.blitz), 1);
});

/**
 * A sea city, a nearby land city, and an air unit on the port.
 *
 * Purpose: The order test needs one row of each method from the real map.
 * When to use: Inside a temporary match, after the terrain cache is loaded.
 * Expected outcome: Infantry and a ship can reach a distant coastal city, and the air unit can drop on a city beside the port.
 * Exceptions: Throws when the seeded map has no such port or city.
 */
function placeMixedForce(landMass: LandMassByH3): void {
  const seat = 'opponent';
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
  assert.ok(infantryHex, 'expected land beside the port');
  const shipHex = gridDisk(port, 1).find((hex) => hexById.get(hex)?.terrain === 'water');
  assert.ok(shipHex, 'expected water beside the port');
  const nearCity = gridDisk(port, 1).find(
    (hex) => hex !== port && hex !== infantryHex && landUnitCanOccupyHex(hex, landMass) && canLandUnitTraverseEdge(infantryHex, hex, landMass),
  );
  assert.ok(nearCity, 'expected a city hex beside the port the infantry can enter');
  dbRun(
    `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
     VALUES (?, 0, 1, 1)
     ON CONFLICT(h3_index) DO UPDATE SET airport_count = 1, seaport_count = 1`,
    [port],
  );
  dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [port, seat]);
  dbRun(
    `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
     VALUES (?, 4, 0, 0)
     ON CONFLICT(h3_index) DO UPDATE SET urban_hex_count = 4`,
    [nearCity],
  );
  dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [nearCity, 'human']);
  for (const id of ['inf-a', 'inf-b', 'inf-c', 'inf-d']) {
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, seat, 'infantry', infantryHex]);
  }
  dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', ['ship-1', seat, 'naval', shipHex]);
  dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', ['air-1', seat, 'air', port]);
  const seatState = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
  const terrain = buildLiftTerrain({
    state: { ...seatState, units: seatState.units },
    seatId: seat,
    landMass,
  });
  const farCity = [...humanHome].find((hex) => {
    const row = hexById.get(hex);
    if (row?.terrain !== 'coastal' && row?.terrainKind !== 'coastal') return false;
    if (isWithinGridRangePure(shipHex, hex, 7)) return false;
    return terrain.landingHexes(hex).some((landing) => terrain.sailTurns(port, landing) !== null);
  });
  assert.ok(farCity, 'expected an enemy coastal city the ship can reach');
  dbRun(
    `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
     VALUES (?, 4, 0, 0)
     ON CONFLICT(h3_index) DO UPDATE SET urban_hex_count = 4`,
    [farCity],
  );
  dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [farCity, 'human']);
}

/**
 * Methods of the briefing list for one stored posture.
 *
 * Purpose: The order test reads the same search the briefing uses.
 * When to use: After `placeMixedForce` and the posture row is written.
 * Expected outcome: The method of each returned row.
 * Exceptions: None.
 */
function briefingMethods(posture: 'maritime' | 'blitz'): string[] {
  writePosture({ getOne: dbGetOne, run: dbRun }, 'opponent', { posture, sinceTurn: 1 });
  const state = getGameStateForPlayer('opponent', { maskUnexploredTerrain: false });
  return operationCandidatesForSeat({
    state,
    seatId: 'opponent',
    active: [],
    includeLand: true,
  }).map((candidate) => candidate.method);
}

test('a stored posture orders the briefing list', () => {
  withTempGameDb('aw-posture-menu-', () => {
    const landMass = loadCampaignLandMass('opponent');
    assert.ok(landMass, 'expected the terrain cache');
    placeMixedForce(landMass);
    const maritime = briefingMethods('maritime');
    const blitz = briefingMethods('blitz');
    assert.ok(maritime.includes('sea') && maritime.includes('air') && maritime.includes('land'), `maritime rows: ${maritime.join(',')}`);
    assert.ok(blitz.includes('air') && blitz.includes('land') && blitz.includes('sea'), `blitz rows: ${blitz.join(',')}`);
    assert.deepEqual([...new Set(maritime)], ['sea', 'air', 'land'].filter((method) => maritime.includes(method)));
    assert.deepEqual([...new Set(blitz)], ['air', 'land', 'sea'].filter((method) => blitz.includes(method)));
    const fillingAir: Operation = { ...fillingOperation(), method: 'air', id: 'opponent-op9', carrierIds: ['air-stored'], unitIds: ['inf-stored'] };
    writePosture({ getOne: dbGetOne, run: dbRun }, 'opponent', { posture: 'blitz', sinceTurn: 1 });
    const state = getGameStateForPlayer('opponent', { maskUnexploredTerrain: false });
    const withOneAir = operationCandidatesForSeat({
      state,
      seatId: 'opponent',
      active: [fillingAir],
      includeLand: true,
    });
    assert.equal(withOneAir.some((candidate) => candidate.method === 'air'), true);
    const blocked = operationCandidatesForSeat({
      state,
      seatId: 'opponent',
      active: [fillingAir, { ...fillingAir, id: 'opponent-op8' }],
    });
    assert.equal(blocked.some((candidate) => candidate.method === 'air'), false);
  });
});

test('a search that throws gives no candidates', () => {
  const state = new Proxy({ gameSize: 'small' }, {
    get(target, property) {
      if (property === 'gameSize') return target.gameSize;
      throw new Error('snapshot unavailable');
    },
  }) as GameStateSnapshot;
  const candidates = operationCandidatesForSeat({ state, seatId: 'opponent', active: [] });
  assert.deepEqual(candidates, []);
});
