/**
 * Integration contracts for sea access reads on the seeded world map.
 * Run with: node dist/main/gameDb/seaAccessReads.test.js
 */

import * as assert from 'assert';
import { getGameState } from '../gameDb';
import { hexHasSeaport } from '../movementTerrain';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { listLandSeaportsBySeaAccess } from '../testSupport/seaAccessFixtures';
import { seaAccessCheckForHexes } from '../../shared/seaAccess';
import { hexHasSeaAccess, navalBlockedBySeaAccess } from './seaAccessReads';

/**
 * Checks a land seaport with no sea access and one with it.
 *
 * Purpose: The two answers differ only by the water in or next to the hex.
 * When to use: Run from `main`.
 * Expected outcome: The dry port is blocked for naval. The wet port is not.
 * Exceptions: Propagates assertion errors.
 */
function testPortsWithAndWithoutSeaAccess(): void {
  withTempGameDb('aw-sea-access-reads-', () => {
    const { dry, wet } = listLandSeaportsBySeaAccess();
    assert.ok(dry.length > 0, 'seeded map must have a land seaport with no sea access');
    assert.ok(wet.length > 0, 'seeded map must have a land seaport with sea access');
    const dryPort = dry[0]!;
    assert.equal(hexHasSeaport(dryPort), true, `${dryPort} must hold a seaport`);
    assert.equal(hexHasSeaAccess(dryPort), false, `${dryPort} must have no sea access`);
    assert.equal(navalBlockedBySeaAccess(dryPort), true);
    const wetPort = wet[0]!;
    assert.equal(hexHasSeaAccess(wetPort), true, `${wetPort} must have sea access`);
    assert.equal(navalBlockedBySeaAccess(wetPort), false);
  });
}

/**
 * Checks water hexes and land hexes without a seaport.
 *
 * Purpose: Only a seaport hex can be blocked for sea access.
 * When to use: Run from `main`.
 * Expected outcome: A water hex has sea access. A land hex with no seaport is not blocked.
 * Exceptions: Propagates assertion errors.
 */
function testWaterAndPortlessHexes(): void {
  withTempGameDb('aw-sea-access-reads-', () => {
    const hexes = getGameState().hexes;
    const water = hexes.find((hex) => hex.terrain === 'water');
    assert.ok(water, 'expected a water hex');
    assert.equal(hexHasSeaAccess(water!.h3Index), true);
    const portless = hexes.find((hex) => hex.terrain === 'land' && !hexHasSeaport(hex.h3Index));
    assert.ok(portless, 'expected a land hex with no seaport');
    assert.equal(navalBlockedBySeaAccess(portless!.h3Index), false);
  });
}

/**
 * Checks that the database path agrees with the snapshot path.
 *
 * Purpose: `getGameState` is the unmasked snapshot, so equal answers tie the two paths together.
 * When to use: Run from `main`.
 * Expected outcome: Every seaport hex gets the same answer from both.
 * Exceptions: Propagates assertion errors.
 */
function testAgreementWithSnapshotPath(): void {
  withTempGameDb('aw-sea-access-reads-', () => {
    const hexes = getGameState().hexes;
    const check = seaAccessCheckForHexes(hexes);
    for (const hex of hexes) {
      if (!hexHasSeaport(hex.h3Index)) continue;
      assert.equal(hexHasSeaAccess(hex.h3Index), check(hex.h3Index), `sea access disagrees at ${hex.h3Index}`);
    }
  });
}

/**
 * Runs the sea access read tests.
 *
 * Purpose: Entry point for the compiled test file.
 * When to use: Run directly with node.
 * Expected outcome: Prints a pass line.
 * Exceptions: Propagates assertion errors.
 */
function main(): void {
  testPortsWithAndWithoutSeaAccess();
  testWaterAndPortlessHexes();
  testAgreementWithSnapshotPath();
  console.log('seaAccessReads tests passed');
}

main();
