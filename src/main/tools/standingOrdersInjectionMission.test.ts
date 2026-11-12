/**
 * Tests for Suggested Destination cells in the units-without-orders table.
 *
 * Purpose: A blind ground unit must be shown a home-region hex it can march to, and an orderless air unit must be shown
 * defend on its current hex. Those are different orders, and the cell is the only place the model is told which is which.
 * When to use: After edits to `getInjectionText` or `suggestApproachDestinationsForOrderlessUnits`.
 * Expected outcome: The land row names the home hex and does not say defend. The air row says defend and names its hex.
 * Exceptions: Throws if no geodesic land chain exists, or if the database cannot be opened.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cellToLatLng, gridDisk } from 'h3-js';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { closeGameDatabaseForTests, dbRun, getGameStateForPlayer, openGameDatabaseAtPathForTests, resetGameForNewMatch } from '../gameDb';
import {
  buildLandChainState,
  findGeodesicLandMassChain,
} from '../testSupport/strategicLandChainFixtures';
import { getInjectionText } from './standingOrders';
import { buildCampaignOrderRows } from './standingOrdersInjectionText';
import type { CampaignPlan } from '../openRouter/campaignRules';

const STRATEGIC: CoordinateContext = { mode: 'strategic' };

/**
 * Returns the markdown row for one unit under Units Without Standing Orders.
 *
 * Purpose: The active-order table can repeat a unit id after expiry, so the assertion has to read the orderless section.
 * When to use: Injection cell checks in this file.
 * Expected outcome: The table row that contains the unit id, or a failed assertion.
 * Exceptions: None. A missing row fails the assertion.
 */
function orderlessRow(text: string, unitId: string): string {
  const section = text.slice(text.indexOf('## Units Without Standing Orders'));
  const row = section.split('\n').find((line) => line.includes(`| ${unitId} |`));
  assert.ok(row, `expected an orderless row for ${unitId}`);
  return row!;
}

/**
 * Ensures a blind land unit is offered its home hex and an orderless air unit is offered defend.
 *
 * Purpose: These are the two cell shapes the coaching text teaches. An em dash, or a march for the air unit, sends the
 * model back to inventing orders the engine drops.
 * When to use: After changing how Suggested Destination is rendered.
 * Expected outcome: Land row contains the nearer home code and not `defend`. Air row contains `defend` and its own code.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testBlindLandMarchAndOrderlessAirDefendCells(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const chain = findGeodesicLandMassChain(4);
  const homeCode = h3ToCode(chain[2]!, STRATEGIC);
  const landText = getInjectionText('opponent', {
    ...buildLandChainState({
      chain,
      units: [{ id: 'opponent-inf-idle', player: 'opponent', unitType: 'infantry', h3Index: chain[0]! }],
    }),
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', nickname: null, outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, thinkTimeMs: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', nickname: null, outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, thinkTimeMs: 0, commander: null }], homeRegionHexesBySeat: { human: [chain[4]!, chain[2]!] },
  });
  const landRow = orderlessRow(landText, 'opponent-inf-idle');
  assert.ok(landRow.includes(homeCode), `land row must name the home hex ${homeCode}: ${landRow}`);
  assert.ok(!landRow.includes('defend'), `land row must be a bare march hex: ${landRow}`);

  const base = chain[0]!;
  const strikeHex = gridDisk(base, 1).find((h3) => h3 !== base);
  assert.ok(strikeHex, 'expected a neighbor of the air base');
  const airCode = h3ToCode(base, STRATEGIC);
  const airText = getInjectionText('opponent', {
    ...buildLandChainState({
      chain: [base, strikeHex!],
      units: [{ id: 'opponent-air-idle', player: 'opponent', unitType: 'air', h3Index: base }],
    }),
    strategicControl: [{ h3Index: strikeHex!, controllerPlayerId: 'human' }],
    strategicInfrastructure: [
      { h3Index: base, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
      { h3Index: strikeHex!, urbanHexCount: 2, airportCount: 0, seaportCount: 0 },
    ],
  });
  const airRow = orderlessRow(airText, 'opponent-air-idle');
  assert.ok(airRow.includes(`defend ${airCode}`), `air row must defend on ${airCode}: ${airRow}`);
}

/**
 * Campaign Orders names only a unit whose stored order differs.
 *
 * Purpose: A unit already marching to the campaign hex must not be told to change its order.
 * When to use: After edits to `buildCampaignOrderRows` or the Campaign Orders table.
 * Expected outcome: One row for the defending unit, and no Campaign Orders heading when there is no plan.
 * Exceptions: Throws when the seeded match has fewer than two ground units.
 */
function testCampaignOrdersListOnlyDifferingUnits(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const seat = 'opponent' as const;
  const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
  const ground = state.units.filter(
    (unit) =>
      unit.player === seat &&
      (unit.unitType === 'infantry' || unit.unitType === 'armor') &&
      !unit.embarkedOnCarrierUnitId
  );
  assert.ok(ground.length >= 2, 'expected two ground units');
  const unitA = ground[0]!;
  const unitB = ground[1]!;
  const waypoint = state.hexes.find((hex) => hex.h3Index !== unitA.h3Index && hex.h3Index !== unitB.h3Index)?.h3Index;
  assert.ok(waypoint);
  const [defendLat, defendLng] = cellToLatLng(unitA.h3Index);
  const [marchLat, marchLng] = cellToLatLng(waypoint);
  dbRun('DELETE FROM standing_orders WHERE player_id = ?', [seat]);
  dbRun(
    `INSERT INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
     VALUES (?, ?, 'defend', ?, NULL, 'holding', ?, ?)`,
    [seat, unitA.id, JSON.stringify({ type: 'defend', defendHex: [defendLat, defendLng] }), state.turnNumber, JSON.stringify(cellToLatLng(unitA.h3Index))]
  );
  dbRun(
    `INSERT INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
     VALUES (?, ?, 'march', ?, NULL, 'en_route', ?, ?)`,
    [seat, unitB.id, JSON.stringify({ type: 'march', destination: [marchLat, marchLng] }), state.turnNumber, JSON.stringify(cellToLatLng(unitB.h3Index))]
  );
  const plan: CampaignPlan = {
    objective: { targetH3: waypoint, stagingH3: null, phase: 'assault', source: 'engine', chosenTurn: state.turnNumber },
    waypointH3: waypoint,
    campaignUnitIds: new Set([unitA.id, unitB.id]),
    holdUnitIds: new Set(),
    defenderUnitIds: [],
    homeThreatCount: 0,
    homeDefenseCapped: false,
    massedCount: 0,
    threshold: 1,
  };
  const rows = buildCampaignOrderRows({ playerId: seat, state, plan, coordinateContext: STRATEGIC });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]?.unitId, unitA.id);
  assert.strictEqual(rows[0]?.currentOrder, `defend ${h3ToCode(unitA.h3Index, STRATEGIC)}`);
  assert.strictEqual(rows[0]?.campaignOrder, `march ${h3ToCode(waypoint, STRATEGIC)}`);
  const text = getInjectionText(seat, state, STRATEGIC, plan);
  assert.ok(text.includes('## Campaign Orders'));
  assert.ok(text.includes(`| ${unitA.id} |`));
  const without = getInjectionText(seat, state, STRATEGIC);
  assert.ok(!without.includes('Campaign Orders'));
}

/**
 * Campaign Orders recalls a home defender still marching on the campaign.
 *
 * Purpose: A unit that became a defender after it was sent to the target must be told to stay, and its other orders are left alone.
 * When to use: After edits to `buildCampaignOrderRows` or the home-defender recall.
 * Expected outcome: One row for the defender marching on the target, naming defend on its own hex. No row for the defender marching elsewhere. A second plan whose staging hex is that other destination adds a row for the second unit.
 * Exceptions: Throws when the seeded match has fewer than two ground units or fewer than two spare hexes.
 */
function testCampaignOrdersRecallMarchingDefenders(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const seat = 'opponent' as const;
  const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
  const ground = state.units.filter(
    (unit) =>
      unit.player === seat &&
      (unit.unitType === 'infantry' || unit.unitType === 'armor') &&
      !unit.embarkedOnCarrierUnitId
  );
  assert.ok(ground.length >= 2, 'expected two ground units');
  const unitA = ground[0]!;
  const unitB = ground[1]!;
  const spare = state.hexes
    .map((hex) => hex.h3Index)
    .filter((h3) => h3 !== unitA.h3Index && h3 !== unitB.h3Index);
  assert.ok(spare.length >= 2, 'expected two spare hexes');
  const target = spare[0]!;
  const elsewhere = spare[1]!;
  dbRun('DELETE FROM standing_orders WHERE player_id = ?', [seat]);
  for (const [unit, destination] of [
    [unitA, target],
    [unitB, elsewhere],
  ] as const) {
    const [lat, lng] = cellToLatLng(destination);
    dbRun(
      `INSERT INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES (?, ?, 'march', ?, NULL, 'en_route', ?, ?)`,
      [seat, unit.id, JSON.stringify({ type: 'march', destination: [lat, lng] }), state.turnNumber, JSON.stringify(cellToLatLng(unit.h3Index))]
    );
  }
  const plan: CampaignPlan = {
    objective: { targetH3: target, stagingH3: null, phase: 'assault', source: 'engine', chosenTurn: state.turnNumber },
    waypointH3: target,
    campaignUnitIds: new Set(),
    holdUnitIds: new Set(),
    defenderUnitIds: [unitA.id, unitB.id],
    homeThreatCount: 2,
    homeDefenseCapped: false,
    massedCount: 0,
    threshold: 1,
  };
  const rows = buildCampaignOrderRows({ playerId: seat, state, plan, coordinateContext: STRATEGIC });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]?.unitId, unitA.id);
  assert.strictEqual(rows[0]?.currentOrder, `march ${h3ToCode(target, STRATEGIC)}`);
  assert.strictEqual(rows[0]?.campaignOrder, `defend ${h3ToCode(unitA.h3Index, STRATEGIC)}`);
  const staged: CampaignPlan = { ...plan, objective: { ...plan.objective, stagingH3: elsewhere } };
  const both = buildCampaignOrderRows({ playerId: seat, state, plan: staged, coordinateContext: STRATEGIC });
  assert.strictEqual(both.length, 2);
  assert.strictEqual(both.find((row) => row.unitId === unitB.id)?.campaignOrder, `defend ${h3ToCode(unitB.h3Index, STRATEGIC)}`);
}

/**
 * Opens a temporary game database, runs the cell contract, and closes the database.
 *
 * Purpose: `getInjectionText` reads standing orders, so it needs an open database even when no orders exist.
 * When to use: Direct node invocation of this file.
 * Expected outcome: The cell contract passes and the temporary database is closed.
 * Exceptions: Closes the database if the contract throws, then rethrows.
 */
function run(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-orderless-mission-'));
  openGameDatabaseAtPathForTests(path.join(tempDir, 't.sqlite'));
  try {
    resetGameForNewMatch();
    testBlindLandMarchAndOrderlessAirDefendCells();
    console.log('OK standing order injection renders a blind march and an orderless-air defend cell');
    testCampaignOrdersListOnlyDifferingUnits();
    console.log('OK campaign orders list only units whose standing order differs from their campaign order');
    testCampaignOrdersRecallMarchingDefenders();
    console.log('OK campaign orders recall a home defender still marching on the campaign');
  } finally {
    closeGameDatabaseForTests();
  }
}

run();
