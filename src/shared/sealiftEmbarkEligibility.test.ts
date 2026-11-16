/**
 * Contract tests for shared embark eligibility. Run with: node dist/shared/sealiftEmbarkEligibility.test.js
 */

import assert from 'node:assert/strict';
import { canEmbarkAtHex, canManualDebarkAtHex } from './sealiftEmbarkEligibility';

/**
 * Locks the embark truth table that stack UI and IPC must match.
 *
 * Purpose: Coastal and land seaports embark without control; water seaports need acting-player control.
 * When to use: After edits to `canEmbarkAtHex` or before changing sealift stack context mode.
 * Expected outcome: Native coastal and land seaports true; controlled water seaport true; open water and uncontrolled water seaport false.
 * Exceptions: Propagates assertion errors.
 */
function testCanEmbarkAtHexTerrainPortAndControl(): void {
  assert.equal(
    canEmbarkAtHex({ nativeTerrain: 'coastal', hasSeaport: false, hexControlledByPlayer: false, seaAccess: true }),
    true
  );
  assert.equal(
    canEmbarkAtHex({ nativeTerrain: 'land', hasSeaport: true, hexControlledByPlayer: false, seaAccess: true }),
    true
  );
  assert.equal(
    canEmbarkAtHex({ nativeTerrain: 'water', hasSeaport: true, hexControlledByPlayer: true, seaAccess: true }),
    true
  );
  assert.equal(
    canEmbarkAtHex({ nativeTerrain: 'water', hasSeaport: true, hexControlledByPlayer: false, seaAccess: true }),
    false
  );
  assert.equal(
    canEmbarkAtHex({ nativeTerrain: 'water', hasSeaport: false, hexControlledByPlayer: true, seaAccess: true }),
    false
  );
}

/**
 * Boarding at a land seaport needs sea access; unloading there does not.
 *
 * Purpose: A ship stuck at a port with only land around it must still be able to put its cargo ashore.
 * When to use: After edits to the land-seaport branches of `canEmbarkAtHex` or `canManualDebarkAtHex`.
 * Expected outcome: Embark false and debark true for a land seaport with no sea access.
 * Exceptions: Propagates assertion errors.
 */
function testLandSeaportBoardingNeedsSeaAccess(): void {
  const port = { nativeTerrain: 'land', hasSeaport: true, hexControlledByPlayer: false };
  assert.equal(canEmbarkAtHex({ ...port, seaAccess: false }), false);
  assert.equal(canManualDebarkAtHex(port), true);
}

/**
 * Runs shared embark eligibility tests.
 *
 * Purpose: Node test entrypoint for shared discovery.
 * When to use: `node dist/shared/sealiftEmbarkEligibility.test.js`.
 * Expected outcome: Throws on failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testCanEmbarkAtHexTerrainPortAndControl();
  testLandSeaportBoardingNeedsSeaAccess();
  console.log('sealiftEmbarkEligibility.test.ts passed');
}

run();
