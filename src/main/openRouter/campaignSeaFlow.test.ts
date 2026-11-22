/**
 * Sea routes for a campaign, from a seeded match.
 * Run with: node dist/main/openRouter/campaignSeaFlow.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { isWithinGridRangePure } from '../../shared/h3GridRangePure';
import {
  canLandUnitTraverseEdge,
  getLandStepDistances,
  STRATEGIC_LAND_MAX_WATER_PCT,
  type LandMassByH3,
} from '../../shared/landTraversalStrategic';
import { dbGetOne, dbRun, getGameState, getGameStateForPlayer, listUnitsForSnapshot } from '../gameDb';
import { writePosture } from '../gameDb/postureMemory';
import { buildLiftTerrain } from '../operations/liftTerrain';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { campaignInputsFromState, campaignLandSteps, loadCampaignLandMass } from './campaignObjectiveFlow';
import { CAMPAIGN_SEA_STEP_PENALTY } from './campaignSeaConstants';
import { campaignSeaRoutesForState } from './campaignSeaFlow';
import { CAMPAIGN_MAX_LAND_STEPS } from './campaignTargetSelection';

const SEAT = 'opponent' as const;

/**
 * Places eight infantry, two ships, and a port, and picks an enemy city the infantry cannot walk to.
 *
 * Purpose: The routes need one force, one port, and one city that only a ship can reach, with no other city left in the match.
 * When to use: The start of each case.
 * Expected outcome: The city hex. The seat holds the maritime posture, so two ships carry four of the eight infantry.
 * Exceptions: Fails an assertion when the seeded map has no such city.
 */
function arrange(landMass: LandMassByH3, withShips: boolean): string {
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
  if (withShips) {
    for (const id of ['ship-1', 'ship-2']) {
      dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, SEAT, 'naval', shipHex]);
    }
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

/**
 * Asks for the sea routes of the seat's known cities.
 *
 * Purpose: Every case reads the same inputs the campaign flow builds.
 * When to use: After `arrange`, and after any unit change.
 * Expected outcome: The routes map.
 * Exceptions: Fails an assertion when the terrain cache is missing.
 */
function routes(landMass: LandMassByH3, city: string): ReturnType<typeof campaignSeaRoutesForState> {
  const state = getGameStateForPlayer(SEAT, { maskUnexploredTerrain: false });
  const inputs = campaignInputsFromState(state, landMass);
  return campaignSeaRoutesForState({
    state,
    seatId: SEAT,
    landMass,
    cities: inputs.cities,
    landStepsFromForce: campaignLandSteps(inputs, landMass, inputs.groundUnits.map((unit) => unit.h3Index)),
    mustTestH3: city,
    skipH3: null,
  });
}

test('a city across the water has a route when a lift can carry what waits there', () => {
  withTempGameDb('aw-campaign-sea-flow-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const city = arrange(landMass, true);
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', ['def-1', 'human', 'infantry', city]);
    const route = routes(landMass, city).get(city);
    assert.ok(route, 'expected a sea route to the city');
    assert.ok(route.seaSteps >= CAMPAIGN_SEA_STEP_PENALTY);
  });
});

test('a defended city that needs more than the lift can carry has no route', () => {
  withTempGameDb('aw-campaign-sea-flow-heavy-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const city = arrange(landMass, true);
    for (const id of ['def-1', 'def-2', 'def-3']) {
      dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, 'human', 'infantry', city]);
    }
    assert.equal(routes(landMass, city).has(city), false);
  });
});

test('a seat with no ship has no routes', () => {
  withTempGameDb('aw-campaign-sea-flow-none-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const city = arrange(landMass, false);
    assert.equal(routes(landMass, city).size, 0);
  });
});
