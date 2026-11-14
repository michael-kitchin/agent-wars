/**
 * Launch and cancel commands against a seeded match.
 *
 * Purpose: A letter must launch the briefing's row, and a cancel must free or keep the stored operation.
 * When to use: After changes to `applyOperationCommands`.
 * Expected outcome: Process exit 0. The match is temporary.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { isWithinGridRangePure } from '../../shared/h3GridRangePure';
import { canLandUnitTraverseEdge, getLandStepDistances, landUnitCanOccupyHex, STRATEGIC_LAND_MAX_WATER_PCT, type LandMassByH3 } from '../../shared/landTraversalStrategic';
import { AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import type { Operation, OperationCandidate } from '../../shared/operationTypes';
import type { KnockoutCoordinates } from '../gameActions/knockoutConsequences';
import { dbGetAll, dbGetOne, dbRun, getGameState, getGameStateForPlayer, listUnitsForSnapshot, type GameStateSnapshot } from '../gameDb';
import { readOperationEventTurn, readOperationOffer, readOperations, writeOperationOffer, writeOperationsForSeat } from '../gameDb/operationMemory';
import { loadCampaignLandMass } from '../openRouter/campaignObjectiveFlow';
import type { LatLng } from '../tools/h3LatLng';
import { generateOrdersForStandingOrders } from '../tools/standingOrders';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { buildLiftTerrain } from './liftTerrain';
import { applyOperationCommands } from './operationCommands';
import { operationCandidatesForSeat } from './operationCandidates';

const SEAT = 'opponent' as const;

/**
 * Coordinate helpers for the seeded hexes.
 *
 * Purpose: A march stores the center of its hex.
 * When to use: Before applying a command.
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
 * The snapshot the command reads, including units fog would hide.
 *
 * Purpose: A launch judges the same force the turn advance would.
 * When to use: Immediately before `applyOperationCommands` or a candidate search.
 * Expected outcome: The seat's view with the full unit list.
 * Exceptions: None.
 */
function seatState(): GameStateSnapshot {
  const viewed = getGameStateForPlayer(SEAT, { maskUnexploredTerrain: false });
  return { ...viewed, units: listUnitsForSnapshot() };
}

/**
 * A port the ground units can walk to and a distant enemy coastal city a ship can reach.
 *
 * Purpose: The launch needs one force, one port, and one city.
 * When to use: The start of a case that launches.
 * Expected outcome: Four infantry, one ship, and the city hex. Throws when the seeded map has no such pair.
 * Exceptions: Throws when no city can be sailed to from a reachable port.
 */
function arrange(landMass: LandMassByH3): { readonly city: string } {
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
  const viewed = getGameStateForPlayer(SEAT, { maskUnexploredTerrain: false });
  const terrain = buildLiftTerrain({ state: { ...viewed, units: listUnitsForSnapshot() }, seatId: SEAT, landMass });
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
  return { city };
}

/**
 * One stored operation with the fields a cancel does not care about filled in.
 *
 * Purpose: A cancel case names the phase and the id.
 * When to use: Before writing a row that the reply will cancel.
 * Expected outcome: A sea operation on turn 1.
 * Exceptions: None.
 */
function storedOperation(patch: Partial<Operation> & Pick<Operation, 'id' | 'phase'>): Operation {
  return {
    method: 'sea',
    objectiveH3: 'city',
    musterH3: 'port',
    landingH3: null,
    unitIds: ['inf-a', 'inf-b'],
    carrierIds: ['ship-1'],
    source: 'engine',
    launchedTurn: 1,
    phaseTurn: 1,
    ...patch,
  };
}

test('launching A stores a commander muster and the expansion includes its marches', () => {
  withTempGameDb('aw-operation-command-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    arrange(landMass);
    dbRun('UPDATE turn_state SET turn_number = ? WHERE id = 1', [6]);
    const db = { getOne: dbGetOne, run: dbRun };
    writeOperationOffer(db, SEAT, { announcedTurn: 4, clearOfferTurn: 4 });
    const state = seatState();
    const candidates = operationCandidatesForSeat({ state, seatId: SEAT, active: [] });
    assert.ok(candidates.length >= 1, 'expected a listed operation');
    const result = applyOperationCommands({
      state,
      seatId: SEAT,
      commands: [{ action: 'launch', option: 'A' }],
      coordinates: coordinates(),
      candidates,
    });
    assert.deepEqual(result.dropReasons, []);
    assert.equal(result.appliedCount, 1);
    const stored = readOperations({ getOne: dbGetOne }).get(SEAT) ?? [];
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.source, 'commander');
    assert.equal(stored[0]?.phase, 'muster');
    assert.equal(readOperationOffer(db, SEAT).announcedTurn, 4);
    assert.equal(readOperationOffer(db, SEAT).clearOfferTurn, null);
    assert.equal(readOperationEventTurn(db, SEAT), 6);
    const coords = coordinates();
    const generated = generateOrdersForStandingOrders(SEAT, seatState(), coords.latLngByH3, coords.resolveToH3, { mutateProgress: false });
    const moving = new Set(generated.movementOrders.map((order) => order.unitId));
    for (const unitId of [...(stored[0]?.unitIds ?? []), ...(stored[0]?.carrierIds ?? [])]) {
      assert.equal(moving.has(unitId), true, unitId);
    }
  });
});

test('a force already at the port embarks and the cargo has no movement row', () => {
  withTempGameDb('aw-operation-command-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    arrange(landMass);
    const preview = operationCandidatesForSeat({ state: seatState(), seatId: SEAT, active: [] });
    const candidate = preview[0];
    assert.ok(candidate, 'expected a listed operation');
    for (const unitId of [...candidate.unitIds, ...candidate.carrierIds]) {
      dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [candidate.musterH3, unitId]);
    }
    const result = applyOperationCommands({
      state: seatState(),
      seatId: SEAT,
      commands: [{ action: 'launch', option: 'A' }],
      coordinates: coordinates(),
      candidates: [candidate],
    });
    assert.deepEqual(result.dropReasons, []);
    const stored = readOperations({ getOne: dbGetOne }).get(SEAT) ?? [];
    assert.equal(stored[0]?.phase, 'transit');
    const aboard = new Set(dbGetAll<{ landUnitId: string }>('SELECT land_unit_id AS landUnitId FROM unit_transport_assignments').map((row) => row.landUnitId));
    for (const unitId of stored[0]?.unitIds ?? []) assert.equal(aboard.has(unitId), true, unitId);
    const coords = coordinates();
    const generated = generateOrdersForStandingOrders(SEAT, seatState(), coords.latLngByH3, coords.resolveToH3, { mutateProgress: false });
    const moving = new Set(generated.movementOrders.map((order) => order.unitId));
    for (const shipId of stored[0]?.carrierIds ?? []) assert.equal(moving.has(shipId), true, shipId);
    for (const unitId of stored[0]?.unitIds ?? []) assert.equal(moving.has(unitId), false, unitId);
  });
});

test('launching C with two candidates is dropped', () => {
  withTempGameDb('aw-operation-command-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    arrange(landMass);
    const candidates = operationCandidatesForSeat({ state: seatState(), seatId: SEAT, active: [] });
    assert.ok(candidates[0], 'expected a listed operation');
    const result = applyOperationCommands({
      state: seatState(),
      seatId: SEAT,
      commands: [{ action: 'launch', option: 'C' }],
      coordinates: coordinates(),
      candidates: [candidates[0], candidates[0]],
    });
    assert.deepEqual(result.dropReasons, ['operations launch dropped: option C is not listed this turn.']);
    assert.equal(result.appliedCount, 0);
    assert.equal(readOperations({ getOne: dbGetOne }).get(SEAT), undefined);
  });
});

test('the passed row wins when the board would list a different objective', () => {
  withTempGameDb('aw-operation-command-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    const passed = operationCandidatesForSeat({ state: seatState(), seatId: SEAT, active: [] });
    assert.equal(passed[0]?.objectiveH3, city);
    dbRun('UPDATE res_s_infrastructure SET urban_hex_count = 0 WHERE h3_index = ?', [city]);
    const rebuilt = operationCandidatesForSeat({ state: seatState(), seatId: SEAT, active: [] });
    assert.ok(rebuilt.every((row) => row.objectiveH3 !== city));
    const result = applyOperationCommands({
      state: seatState(),
      seatId: SEAT,
      commands: [{ action: 'launch', option: 'A' }],
      coordinates: coordinates(),
      candidates: passed,
    });
    assert.equal(result.appliedCount, 1);
    const stored = readOperations({ getOne: dbGetOne }).get(SEAT) ?? [];
    assert.equal(stored[0]?.objectiveH3, city);
  });
});

test('cancelling a muster removes it and cancels its marches', () => {
  withTempGameDb('aw-operation-command-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    arrange(landMass);
    const state = seatState();
    const candidates = operationCandidatesForSeat({ state, seatId: SEAT, active: [] });
    const coords = coordinates();
    applyOperationCommands({ state, seatId: SEAT, commands: [{ action: 'launch', option: 'A' }], coordinates: coords, candidates });
    const launched = (readOperations({ getOne: dbGetOne }).get(SEAT) ?? [])[0];
    assert.ok(launched, 'expected a stored operation');
    const result = applyOperationCommands({
      state: seatState(),
      seatId: SEAT,
      commands: [{ action: 'cancel', id: launched.id }],
      coordinates: coords,
      candidates: [],
    });
    assert.deepEqual(result.dropReasons, []);
    assert.equal((readOperations({ getOne: dbGetOne }).get(SEAT) ?? []).length, 0);
    const orders = dbGetAll<{ unit_id: string }>('SELECT unit_id FROM standing_orders WHERE player_id = ?', [SEAT]);
    const remaining = new Set(orders.map((row) => row.unit_id));
    for (const unitId of [...launched.unitIds, ...launched.carrierIds]) {
      assert.equal(remaining.has(unitId), false, unitId);
    }
  });
});

test('cancelling an unknown id is dropped', () => {
  withTempGameDb('aw-operation-command-', () => {
    const result = applyOperationCommands({
      state: seatState(),
      seatId: SEAT,
      commands: [{ action: 'cancel', id: 'missing' }],
      coordinates: coordinates(),
      candidates: [],
    });
    assert.deepEqual(result.dropReasons, ['operations cancel dropped: missing is not one of your operations.']);
    assert.equal(result.appliedCount, 0);
  });
});

test('cancelling a return is dropped and leaves it stored', () => {
  withTempGameDb('aw-operation-command-', () => {
    const db = { getOne: dbGetOne, run: dbRun };
    const operation = storedOperation({ id: 'opponent-op1', phase: 'return' });
    writeOperationsForSeat(db, SEAT, [operation]);
    const result = applyOperationCommands({
      state: seatState(),
      seatId: SEAT,
      commands: [{ action: 'cancel', id: operation.id }],
      coordinates: coordinates(),
      candidates: [],
    });
    assert.deepEqual(result.dropReasons, [`operations cancel dropped: ${operation.id} is already returning.`]);
    assert.equal(result.appliedCount, 0);
    assert.equal((readOperations({ getOne: dbGetOne }).get(SEAT) ?? [])[0]?.phase, 'return');
  });
});

test('a cancel beside a launch with no listed row applies the cancel only', () => {
  withTempGameDb('aw-operation-command-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    arrange(landMass);
    const db = { getOne: dbGetOne, run: dbRun };
    writeOperationsForSeat(db, SEAT, [storedOperation({ id: 'opponent-op1', phase: 'muster' })]);
    const result = applyOperationCommands({
      state: seatState(),
      seatId: SEAT,
      commands: [{ action: 'cancel', id: 'opponent-op1' }, { action: 'launch', option: 'A' }],
      coordinates: coordinates(),
      candidates: [],
    });
    assert.equal(result.appliedCount, 1);
    assert.deepEqual(result.dropReasons, ['operations launch dropped: option A is not listed this turn.']);
    assert.equal((readOperations({ getOne: dbGetOne }).get(SEAT) ?? []).length, 0);
  });
});

test('a passed air candidate stores the air method and its launch airport', () => {
  withTempGameDb('aw-operation-command-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    arrange(landMass);
    const infantry = dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM units WHERE id = ?', ['inf-a']);
    assert.ok(infantry);
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', ['air-1', SEAT, 'air', infantry.h3Index]);
    const candidate: OperationCandidate = {
      method: 'air',
      objectiveH3: 'city',
      musterH3: infantry.h3Index,
      landingH3: 'launch-airport',
      unitIds: ['inf-a'],
      carrierIds: ['air-1'],
      etaTurns: 2,
      urbanHexCount: 1,
      inEnemyHome: false,
      knownFortifiedCount: 0,
      defenders: 0,
      reinforcers: 0,
      clear: true,
    };
    const result = applyOperationCommands({
      state: seatState(),
      seatId: SEAT,
      commands: [{ action: 'launch', option: 'A' }],
      coordinates: coordinates(),
      candidates: [candidate],
    });
    assert.deepEqual(result.dropReasons, []);
    const stored = readOperations({ getOne: dbGetOne }).get(SEAT) ?? [];
    assert.equal(stored[0]?.method, 'air');
    assert.equal(stored[0]?.landingH3, 'launch-airport');
    const sea = applyOperationCommands({
      state: seatState(),
      seatId: SEAT,
      commands: [{ action: 'launch', option: 'A' }],
      coordinates: coordinates(),
      candidates: [{ ...candidate, method: 'sea', landingH3: 'beach', unitIds: ['inf-b', 'inf-c'], carrierIds: ['ship-1'] }],
    });
    assert.equal(sea.dropReasons.length, 0);
    const rows = readOperations({ getOne: dbGetOne }).get(SEAT) ?? [];
    const seaRow = rows.find((operation) => operation.method === 'sea');
    assert.equal(seaRow?.landingH3, null);
  });
});

/**
 * The briefing code for one hex of the open match.
 *
 * Purpose: A named launch speaks in codes, and the registry is built lazily.
 * When to use: After the temporary match is open.
 * Expected outcome: The two-character code. Throws when the hex is not on this map.
 * Exceptions: Throws from `h3ToCode` when the hex has no code.
 */
function codeFor(h3Index: string): string {
  ensureStrategicCoordinateRegistryInitialized();
  return h3ToCode(h3Index, { mode: 'strategic' });
}

/**
 * Applies one named launch against the current match.
 *
 * Purpose: The refusal tests share the command shape.
 * When to use: After the city or the code under test is known.
 * Expected outcome: The apply result. The menu candidates are empty, so only the named city can be chosen.
 * Exceptions: None.
 */
function namedLaunch(objective: string, method: 'sea' | 'air') {
  ensureStrategicCoordinateRegistryInitialized();
  return applyOperationCommands({
    state: seatState(),
    seatId: SEAT,
    commands: [{ action: 'launch', objective, method }],
    coordinates: coordinates(),
    candidates: [],
  });
}

test('a named launch against an unknown code is dropped and the translator logs it', () => {
  withTempGameDb('aw-operation-command-', () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (...parts: unknown[]) => {
      errors.push(parts.map((part) => String(part)).join(' '));
    };
    try {
      const result = namedLaunch('ZZ', 'sea');
      assert.deepEqual(result.dropReasons, ['operations launch dropped: ZZ is not a hex code on this map.']);
      assert.equal(result.appliedCount, 0);
      assert.ok(errors.some((line) => line.includes('hex-code-translator codeToH3: unknown code')));
    } finally {
      console.error = original;
    }
  });
});

test('a named launch against a hex that is not an enemy city is dropped', () => {
  withTempGameDb('aw-operation-command-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    const own = (getGameState().homeRegionHexesBySeat?.opponent ?? []).find((hex) => hex !== city);
    assert.ok(own, 'expected a home hex');
    const code = codeFor(own);
    const result = namedLaunch(code, 'sea');
    assert.deepEqual(result.dropReasons, [`operations launch dropped: ${code} is not a known enemy city.`]);
  });
});

test('a named sea launch against a defended city stores a sea operation', () => {
  withTempGameDb('aw-operation-command-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', ['defender', 'human', 'infantry', city]);
    const code = codeFor(city);
    const result = namedLaunch(code, 'sea');
    assert.deepEqual(result.dropReasons, []);
    const stored = readOperations({ getOne: dbGetOne }).get(SEAT) ?? [];
    assert.equal(stored[0]?.method, 'sea');
    assert.equal(stored[0]?.objectiveH3, city);
    assert.equal(stored[0]?.landingH3, null);
  });
});

test('a named launch is dropped when that method already fills its slots', () => {
  withTempGameDb('aw-operation-command-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    writeOperationsForSeat({ getOne: dbGetOne, run: dbRun }, SEAT, [storedOperation({ id: 'opponent-op1', phase: 'transit' })]);
    const code = codeFor(city);
    const result = namedLaunch(code, 'sea');
    assert.deepEqual(result.dropReasons, ['operations launch dropped: you already have as many sea operations as you can run.']);
  });
});

test('a named air launch against an occupied city is dropped before the search', () => {
  withTempGameDb('aw-operation-command-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', ['defender', 'human', 'infantry', city]);
    const code = codeFor(city);
    const result = namedLaunch(code, 'air');
    assert.deepEqual(result.dropReasons, [`operations launch dropped: ${code} is defended, and an air drop needs an empty, unfortified city.`]);
  });
});

test('a named launch against a city the free units cannot reach is dropped', () => {
  withTempGameDb('aw-operation-command-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    dbRun('DELETE FROM units');
    const code = codeFor(city);
    const result = namedLaunch(code, 'sea');
    assert.deepEqual(result.dropReasons, [`operations launch dropped: ${code} cannot be reached by sea with the units you have free.`]);
  });
});

test('a named air launch against an empty city stores the air method and its launch airport', () => {
  withTempGameDb('aw-operation-command-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    dbRun('UPDATE res_s_infrastructure SET fortified_count = 0 WHERE h3_index = ?', [city]);
    assert.equal(landUnitCanOccupyHex(city, landMass), true, 'expected the city to accept infantry');
    const hexById = new Map(getGameState().hexes.map((hex) => [hex.h3Index, hex]));
    const base = gridDisk(city, AIR_STRIKE_RANGE_HEXES).find((hex) => {
      if (hex === city) return false;
      const row = hexById.get(hex);
      return row !== undefined && row.terrain !== 'water' && landUnitCanOccupyHex(hex, landMass);
    });
    assert.ok(base, 'expected land in drop range of the city');
    dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [base, SEAT]);
    dbRun(
      `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
       VALUES (?, 0, 1, 0)
       ON CONFLICT(h3_index) DO UPDATE SET airport_count = 1`,
      [base],
    );
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', ['air-1', SEAT, 'air', base]);
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', ['inf-air', SEAT, 'infantry', base]);
    const code = codeFor(city);
    const result = namedLaunch(code, 'air');
    assert.deepEqual(result.dropReasons, []);
    const stored = readOperations({ getOne: dbGetOne }).get(SEAT) ?? [];
    assert.equal(stored[0]?.method, 'air');
    assert.equal(stored[0]?.objectiveH3, city);
    assert.equal(stored[0]?.landingH3, base);
  });
});
