/**
 * Contract tests for shared embark eligibility. Run with: node dist/shared/sealiftEmbarkEligibility.test.js
 */

import assert from 'node:assert/strict';
import { canEmbarkAtHex } from './sealiftEmbarkEligibility';

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
    canEmbarkAtHex({ nativeTerrain: 'coastal', hasSeaport: false, hexControlledByPlayer: false }),
    true
  );
  assert.equal(
    canEmbarkAtHex({ nativeTerrain: 'land', hasSeaport: true, hexControlledByPlayer: false }),
    true
  );
  assert.equal(
    canEmbarkAtHex({ nativeTerrain: 'water', hasSeaport: true, hexControlledByPlayer: true }),
    true
  );
  assert.equal(
    canEmbarkAtHex({ nativeTerrain: 'water', hasSeaport: true, hexControlledByPlayer: false }),
    false
  );
  assert.equal(
    canEmbarkAtHex({ nativeTerrain: 'water', hasSeaport: false, hexControlledByPlayer: true }),
    false
  );
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
  console.log('sealiftEmbarkEligibility.test.ts passed');
}

run();
