/**
 * Fail-closed airport lookup tests for air return fire. Run with:
 * `node dist/main/returnFireAirportLookup.test.js`
 */

import assert from 'node:assert/strict';
import { hasIntactAirportAtStrategicAirBase, hasIntactAirportAtTacticalAirBase } from './returnFireAirportLookup';

/**
 * Verifies strategic airport lookup returns false when the DB/infra layer is unavailable.
 *
 * Purpose: Tool 3 / Ready must not abort ranged estimates when infra reads throw.
 * When to use: After changing `hasIntactAirportAtStrategicAirBase`.
 * Expected outcome: False (deny air return fire) rather than a thrown error.
 * Exceptions: None.
 */
function testStrategicAirportLookupFailsClosedWithoutDb(): void {
  assert.equal(hasIntactAirportAtStrategicAirBase('891f1d48b9fffff'), false);
}

/**
 * Verifies tactical airport lookup fails closed without DB.
 *
 * Purpose: Tactical Ready beat must not abort ranged resolution on infra errors.
 * When to use: After changing `hasIntactAirportAtTacticalAirBase`.
 * Expected outcome: False rather than throw.
 * Exceptions: None.
 */
function testTacticalAirportLookupFailsClosedWithoutDb(): void {
  assert.equal(hasIntactAirportAtTacticalAirBase('89283082807ffff'), false);
}

function run(): void {
  testStrategicAirportLookupFailsClosedWithoutDb();
  testTacticalAirportLookupFailsClosedWithoutDb();
  console.log('returnFireAirportLookup.test.ts passed');
}

run();
