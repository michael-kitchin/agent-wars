/**
 * Tests for Suggested Destination cells in the units-without-orders table.
 *
 * Purpose: A blind ground unit must be shown a home-region hex it can march to, and a striking air unit must be shown
 * defend on its current hex. Those are different orders, and the cell is the only place the model is told which is which.
 * When to use: After edits to `getInjectionText` or `suggestApproachDestinationsForOrderlessUnits`.
 * Expected outcome: The land row names the home hex and does not say defend. The air row says defend and names its hex.
 * Exceptions: Throws if no geodesic land chain exists, or if the database cannot be opened.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { gridDisk } from 'h3-js';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { closeGameDatabaseForTests, openGameDatabaseAtPathForTests, resetGameForNewMatch } from '../gameDb';
import {
  buildLandChainState,
  findGeodesicLandMassChain,
} from '../testSupport/strategicLandChainFixtures';
import { getInjectionText } from './standingOrders';

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
 * Ensures a blind land unit is offered its home hex and a striking air unit is offered defend.
 *
 * Purpose: These are the two cell shapes the coaching text teaches. An em dash, or a march for the air unit, sends the
 * model back to inventing orders the engine drops.
 * When to use: After changing how Suggested Destination is rendered.
 * Expected outcome: Land row contains the nearer home code and not `defend`. Air row contains `defend` and its own code.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testBlindLandMarchAndStrikingAirDefendCells(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const chain = findGeodesicLandMassChain(4);
  const homeCode = h3ToCode(chain[2]!, STRATEGIC);
  const landText = getInjectionText('opponent', {
    ...buildLandChainState({
      chain,
      units: [{ id: 'opponent-inf-idle', player: 'opponent', unitType: 'infantry', h3Index: chain[0]! }],
    }),
    humanHomeRegionHexes: [chain[4]!, chain[2]!],
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
    testBlindLandMarchAndStrikingAirDefendCells();
    console.log('OK standing order injection renders a blind march and a striking-air defend cell');
  } finally {
    closeGameDatabaseForTests();
  }
}

run();
