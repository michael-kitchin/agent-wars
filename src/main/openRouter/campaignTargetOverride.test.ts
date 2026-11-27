/**
 * Commander campaign-target override.
 * Run with: node dist/main/openRouter/campaignTargetOverride.test.js
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
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { codeToH3, h3ToCode } from '../briefing/map/hexCodeTranslator';
import { ensureStrategicCoordinateRegistryInitialized, listStrategicH3Indexes } from '../briefing/map/hexCoordinates';
import { dbGetOne, dbRun, getGameState, getGameStateForPlayer, listUnitsForSnapshot, type GameStateSnapshot } from '../gameDb';
import { readCampaignObjectives, writeCampaignObjectiveForSeat } from '../gameDb/campaignObjectiveMemory';
import { writePosture } from '../gameDb/postureMemory';
import { gameDbOps } from '../gameDb/dbConnection';
import { insertSideAgreement } from '../gameDb/sideAgreementStore';
import { buildLiftTerrain } from '../operations/liftTerrain';
import { ensureTerrainClassificationCacheLoaded } from '../terrainClassificationCache';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { applyCampaignTargetH3, applyCampaignTargetOverride } from './campaignTargetOverride';
import { campaignInputsFromState, campaignLandSteps, loadCampaignLandMass } from './campaignObjectiveFlow';
import { CAMPAIGN_REACH_LIMIT_STEPS } from './campaignRules';
import { CAMPAIGN_MAX_LAND_STEPS, type CampaignCity } from './campaignTargetSelection';

const STRATEGIC = { mode: 'strategic' } as const;
const SEAT = AI_SEAT_IDS[0];

/**
 * Database ops the campaign row uses.
 *
 * Purpose: The override and the assertions share one connection.
 * When to use: Inside a temporary match.
 * Expected outcome: The same get and run the game database exports.
 * Exceptions: None.
 */
function ops() {
  return { getOne: dbGetOne, run: dbRun };
}

/**
 * A two-character code `codeToH3` rejects.
 *
 * Purpose: The drop path needs a code that is not on this map.
 * When to use: The unknown-code case.
 * Expected outcome: One code. Throws when every two-character code resolves.
 * Exceptions: Throws when the registry accepts every candidate.
 */
function unknownCode(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (const left of alphabet) {
    for (const right of alphabet) {
      const code = `${left}${right}`;
      try {
        codeToH3(code, STRATEGIC);
      } catch {
        return code;
      }
    }
  }
  throw new Error('every two-character code is on this map');
}

/**
 * A snapshot whose ground force can reach one enemy city by land.
 *
 * Purpose: A seeded home can sit farther than the reach limit from the starting force.
 * When to use: The override case, inside a temporary match.
 * Expected outcome: The city and a snapshot that places one ground unit on a land hex within the reach limit.
 * Exceptions: Throws when the seat has no ground unit or the city has no land approach.
 */
function stateThatReachesACity(
  state: GameStateSnapshot,
  landMass: LandMassByH3,
  seat: string
): { readonly state: GameStateSnapshot; readonly city: CampaignCity } {
  const registered = new Set(listStrategicH3Indexes());
  const inputs = campaignInputsFromState(state, landMass);
  const cities = inputs.cities.filter((city) => registered.has(city.h3Index));
  assert.ok(cities.length > 0, 'no known enemy city has a briefing code');
  const fromForce = campaignLandSteps(inputs, landMass, inputs.groundUnits.map((unit) => unit.h3Index));
  const already = cities.find((city) => fromForce.has(city.h3Index));
  if (already) return { state, city: already };
  const candidate = cities[0]!;
  const fromCity = campaignLandSteps(inputs, landMass, [candidate.h3Index]);
  let approach: string | undefined;
  for (const [h3Index, steps] of fromCity) {
    if (steps > 0 && steps <= CAMPAIGN_REACH_LIMIT_STEPS && landUnitCanOccupyHex(h3Index, landMass)) {
      approach = h3Index;
      break;
    }
  }
  assert.ok(approach, 'enemy city has no land approach within the reach limit');
  const unit = state.units.find(
    (row) => row.player === seat && (row.unitType === 'infantry' || row.unitType === 'armor') && !row.embarkedOnCarrierUnitId
  );
  assert.ok(unit, 'the seat has no ground unit');
  const moved = {
    ...state,
    units: state.units.map((row) => (row.id === unit.id ? { ...row, h3Index: approach } : row)),
  };
  const movedInputs = campaignInputsFromState(moved, landMass);
  const movedSteps = campaignLandSteps(movedInputs, landMass, movedInputs.groundUnits.map((row) => row.h3Index));
  const city = movedInputs.cities.find((row) => row.h3Index === candidate.h3Index);
  assert.ok(city && movedSteps.has(city.h3Index), 'moving one unit onto the approach did not make the city reachable');
  return { state: moved, city };
}

test('a reachable enemy city is stored, an echo keeps the phase, and bad codes are dropped', () => {
  ensureTerrainClassificationCacheLoaded();
  withTempGameDb('aw-campaign-target-', () => {
    ensureStrategicCoordinateRegistryInitialized();
    const seat = AI_SEAT_IDS[0];
    const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const landMass = loadCampaignLandMass(seat);
    assert.ok(landMass);
    const reached = stateThatReachesACity(state, landMass, seat);
    const code = h3ToCode(reached.city.h3Index, STRATEGIC);
    const applied = applyCampaignTargetOverride({ state: reached.state, code, context: STRATEGIC });
    assert.deepEqual(applied.dropReasons, []);
    assert.equal(applied.applied, true);
    const stored = readCampaignObjectives(ops()).get(seat);
    assert.ok(stored);
    assert.equal(stored.targetH3, reached.city.h3Index);
    assert.equal(stored.source, 'commander');
    assert.equal(stored.phase, stored.stagingH3 === null ? 'assault' : 'assemble');
    assert.equal(stored.chosenTurn, state.turnNumber);

    writeCampaignObjectiveForSeat(ops(), seat, { ...stored, phase: 'assault' });
    const echo = applyCampaignTargetOverride({ state: reached.state, code, context: STRATEGIC });
    assert.deepEqual(echo.dropReasons, []);
    assert.equal(readCampaignObjectives(ops()).get(seat)?.phase, 'assault');

    const registered = new Set(listStrategicH3Indexes());
    const ownCity = (state.strategicInfrastructure ?? []).find(
      (row) =>
        row.urbanHexCount > 0 &&
        registered.has(row.h3Index) &&
        state.strategicControl?.find((control) => control.h3Index === row.h3Index)?.controllerPlayerId === seat
    );
    assert.ok(ownCity, 'the seat controls no city');
    const ownCode = h3ToCode(ownCity.h3Index, STRATEGIC);
    const ownDrop = applyCampaignTargetOverride({ state, code: ownCode, context: STRATEGIC });
    assert.deepEqual(ownDrop.dropReasons, [`campaignTarget dropped: ${ownCode} is not a known enemy city.`]);

    const missing = unknownCode();
    const missingDrop = applyCampaignTargetOverride({ state, code: missing, context: STRATEGIC });
    assert.deepEqual(missingDrop.dropReasons, [`campaignTarget dropped: ${missing} is not a hex code on this map.`]);
  });
});

test('a known reachable city hex is stored as a commander target', () => {
  ensureTerrainClassificationCacheLoaded();
  withTempGameDb('aw-campaign-target-h3-', () => {
    ensureStrategicCoordinateRegistryInitialized();
    const seat = AI_SEAT_IDS[0];
    const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const landMass = loadCampaignLandMass(seat);
    assert.ok(landMass);
    const reached = stateThatReachesACity(state, landMass, seat);
    const applied = applyCampaignTargetH3({
      state: reached.state,
      targetH3: reached.city.h3Index,
      label: h3ToCode(reached.city.h3Index, STRATEGIC),
      allowSea: false,
    });
    assert.deepEqual(applied.dropReasons, []);
    assert.equal(applied.applied, true);
    const stored = readCampaignObjectives(ops()).get(seat);
    assert.equal(stored?.targetH3, reached.city.h3Index);
    assert.equal(stored?.source, 'commander');
  });
});

test('a commander target keeps an active skip, and naming the skipped city clears it', () => {
  ensureTerrainClassificationCacheLoaded();
  withTempGameDb('aw-campaign-target-skip-', () => {
    ensureStrategicCoordinateRegistryInitialized();
    const seat = AI_SEAT_IDS[0];
    const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const landMass = loadCampaignLandMass(seat);
    assert.ok(landMass);
    const reached = stateThatReachesACity(state, landMass, seat);
    const label = h3ToCode(reached.city.h3Index, STRATEGIC);
    const previous = {
      targetH3: 'previous-target',
      stagingH3: null,
      phase: 'assault',
      source: 'engine',
      chosenTurn: state.turnNumber,
    } as const;

    writeCampaignObjectiveForSeat(ops(), seat, { ...previous, skippedTargetH3: 'skipped-city', skippedTurn: state.turnNumber });
    applyCampaignTargetH3({ state: reached.state, targetH3: reached.city.h3Index, label, allowSea: false });
    const kept = readCampaignObjectives(ops()).get(seat);
    assert.equal(kept?.targetH3, reached.city.h3Index);
    assert.equal(kept?.skippedTargetH3, 'skipped-city');
    assert.equal(kept?.skippedTurn, state.turnNumber);

    writeCampaignObjectiveForSeat(ops(), seat, { ...previous, skippedTargetH3: reached.city.h3Index, skippedTurn: state.turnNumber });
    applyCampaignTargetH3({ state: reached.state, targetH3: reached.city.h3Index, label, allowSea: false });
    const named = readCampaignObjectives(ops()).get(seat);
    assert.equal(named?.targetH3, reached.city.h3Index);
    assert.equal(named?.skippedTargetH3, undefined);
    assert.equal(named?.skippedTurn, undefined);
  });
});

/**
 * Places eight infantry, two ships, and a port, and picks an enemy city the infantry cannot walk to.
 *
 * Purpose: The routes need one force, one port, and one city that only a ship can reach, with no other city left in the match.
 * When to use: The sea case below.
 * Expected outcome: The city hex. The seat holds the maritime posture, so two ships carry four of the eight infantry.
 * Exceptions: Fails an assertion when the seeded map has no such city.
 */
function arrangeSeaOnlyCity(landMass: LandMassByH3): string {
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
  for (let index = 0; index < 8; index += 1) {
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [`inf-${index}`, SEAT, 'infantry', infantryHex]);
  }
  for (const id of ['ship-1', 'ship-2']) {
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, SEAT, 'naval', shipHex]);
  }
  writePosture({ getOne: dbGetOne, run: dbRun }, SEAT, { posture: 'maritime', sinceTurn: 1 });
  const walkable = getLandStepDistances({ originH3s: [infantryHex], hexSet, data: landMass, maxDepth: CAMPAIGN_MAX_LAND_STEPS });
  const terrain = buildLiftTerrain({
    state: { ...getGameStateForPlayer(SEAT, { maskUnexploredTerrain: false }), units: listUnitsForSnapshot() },
    seatId: SEAT,
    landMass,
  });
  const city = [...humanHome].find((hex) => {
    const row = hexById.get(hex);
    if (row?.terrain !== 'coastal' && row?.terrainKind !== 'coastal') return false;
    if (walkable.has(hex) || isWithinGridRangePure(shipHex, hex, 7)) return false;
    return terrain.landingHexes(hex).some((landing) => terrain.sailTurns(port, landing) !== null);
  });
  assert.ok(city, 'expected an enemy coastal city the infantry cannot walk to');
  dbRun(
    `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
     VALUES (?, 4, 0, 0)
     ON CONFLICT(h3_index) DO UPDATE SET urban_hex_count = 4`,
    [city],
  );
  dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [city, 'human']);
  return city;
}

test('a commander may name a city only a campaign lift can reach, and a land launch may not', () => {
  ensureTerrainClassificationCacheLoaded();
  withTempGameDb('aw-campaign-target-sea-', () => {
    ensureStrategicCoordinateRegistryInitialized();
    const seat = AI_SEAT_IDS[0];
    const landMass = loadCampaignLandMass(seat);
    assert.ok(landMass);
    const city = arrangeSeaOnlyCity(landMass);
    const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const refused = applyCampaignTargetH3({ state, targetH3: city, label: 'the city', allowSea: false });
    assert.deepEqual(refused.dropReasons, ['campaignTarget dropped: no ground unit of yours can reach the city by land.']);
    assert.equal(readCampaignObjectives(ops()).has(seat), false);
    const applied = applyCampaignTargetH3({ state, targetH3: city, label: 'the city', allowSea: true });
    assert.deepEqual(applied.dropReasons, []);
    const stored = readCampaignObjectives(ops()).get(seat);
    assert.equal(stored?.targetH3, city);
    assert.equal(stored?.approach, 'sea');
    assert.equal(stored?.source, 'commander');
    assert.equal(stored?.phase, 'assault');
  });
});

test('echoing an engine target held by a pact partner records it as the commander choice', () => {
  ensureTerrainClassificationCacheLoaded();
  withTempGameDb('aw-campaign-target-pact-', () => {
    ensureStrategicCoordinateRegistryInitialized();
    const state = getGameStateForPlayer(SEAT, { maskUnexploredTerrain: false });
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass);
    const reached = stateThatReachesACity(state, landMass, SEAT);
    const targetH3 = reached.city.h3Index;
    const echo = { state: reached.state, targetH3, label: h3ToCode(targetH3, STRATEGIC), allowSea: false };
    const stored = { targetH3, stagingH3: null, phase: 'assault', source: 'engine', chosenTurn: 1 } as const;
    writeCampaignObjectiveForSeat(ops(), SEAT, stored);
    applyCampaignTargetH3(echo);
    assert.deepEqual(readCampaignObjectives(ops()).get(SEAT), stored);
    insertSideAgreement(gameDbOps, {
      seatId: SEAT, counterpartSeatId: reached.city.ownerSeatId, kind: 'non_aggression', terms: 'No strikes.', zoneH3: [], againstSeatId: null,
      startTurn: state.turnNumber, endTurn: state.turnNumber + 3, status: 'active', intent: 'keep', reason: '',
    });
    assert.deepEqual(applyCampaignTargetH3(echo), { applied: true, dropReasons: [] });
    assert.deepEqual(readCampaignObjectives(ops()).get(SEAT), { ...stored, source: 'commander' });
  });
});
