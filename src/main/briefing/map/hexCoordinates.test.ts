/**
 * Contract tests for the global strategic res1 hex-code registry (Phase 1 style).
 *
 * Purpose: Guards uniqueness, full round-trip coverage, and deterministic rebuild behavior without coupling to OpenRouter.
 * When to use: Run via `npm test` after `build:main`; failures indicate registry ordering or H3 enumeration drift.
 * Expected outcome: Every strategic res1 cell maps to a distinct code and survives explicit re-initialization.
 * Exceptions: None; assertions surface regressions as test failures.
 */

import * as assert from 'assert';
import {
  ensureStrategicCoordinateRegistryInitialized,
  getHexCodeForContext,
  getH3IndexForCode,
  initStrategicCoordinateRegistry,
  listStrategicRes1H3Indexes,
} from './hex-coordinates';

/**
 * Documents the module-scope binding `STRATEGIC_CTX` (STRATEGIC_CTX).

 * Purpose: Reuses one frozen strategic coordinate context for registry lookups in this suite.
 * When to use: Any assertion that calls `getHexCodeForContext` / `getH3IndexForCode` in strategic mode.
 * Expected outcome: `{ mode: 'strategic' }` satisfies `CoordinateContext` without optional battle fields.
 * Exceptions: None.
 */
const STRATEGIC_CTX = { mode: 'strategic' as const };

/**
 * Defines the `testStrategicCodesAreUniqueAcrossAllRes1Cells` function shape (function testStrategicCodesAreUniqueAcrossAllRes1Cells(): void).

 * Purpose: Ensures the 2-character code space is not reused across the full strategic Earth res1 set.
 * When to use: Regression guard whenever registry assignment logic changes.
 * Expected outcome: Set size equals population count for derived codes.
 * Exceptions: None.
 */
function testStrategicCodesAreUniqueAcrossAllRes1Cells(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const cells = listStrategicRes1H3Indexes();
  const codes = cells.map((h3) => getHexCodeForContext(h3, STRATEGIC_CTX));
  assert.strictEqual(new Set(codes).size, codes.length, 'strategic res1 codes must be unique');
}

/**
 * Defines the `testStrategicFullRoundTripForEveryRes1Cell` function shape (function testStrategicFullRoundTripForEveryRes1Cell(): void).

 * Purpose: Verifies encode/decode symmetry for every registered strategic cell.
 * When to use: After changes to `sortCellsForRegistry`, resolution constants, or alphabet ordering.
 * Expected outcome: `getH3IndexForCode(getHexCodeForContext(h3))` returns the same res1 index.
 * Exceptions: None.
 */
function testStrategicFullRoundTripForEveryRes1Cell(): void {
  ensureStrategicCoordinateRegistryInitialized();
  for (const h3 of listStrategicRes1H3Indexes()) {
    const code = getHexCodeForContext(h3, STRATEGIC_CTX);
    assert.ok(code && code.length === 2, `expected two-character code for ${h3}`);
    assert.strictEqual(getH3IndexForCode(code, STRATEGIC_CTX), h3);
  }
}

/**
 * Defines the `testStrategicRegistryStableAcrossExplicitReInit` function shape (function testStrategicRegistryStableAcrossExplicitReInit(): void).

 * Purpose: Confirms repeated `initStrategicCoordinateRegistry` yields identical code assignments.
 * When to use: When investigating lazy-init races or accidental mutation of registry globals.
 * Expected outcome: Sample cell code is identical before and after a second full init.
 * Exceptions: None.
 */
function testStrategicRegistryStableAcrossExplicitReInit(): void {
  initStrategicCoordinateRegistry();
  const sample = listStrategicRes1H3Indexes()[0]!;
  const before = getHexCodeForContext(sample, STRATEGIC_CTX);
  initStrategicCoordinateRegistry();
  const after = getHexCodeForContext(sample, STRATEGIC_CTX);
  assert.strictEqual(before, after);
}

/**
 * Defines the `testStrategicRes1FastPathMatchesRoundTrip` function shape (function testStrategicRes1FastPathMatchesRoundTrip(): void).

 * Purpose: Confirms res1-index fast-path encoding still round-trips through the strategic registry.
 * When to use: After changes to `getHexCodeForContext` strategic branch.
 * Expected outcome: Sample res1 cell encodes to a two-character code and decodes back to the same index.
 * Exceptions: None.
 */
function testStrategicRes1FastPathMatchesRoundTrip(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const sample = listStrategicRes1H3Indexes()[0]!;
  const code = getHexCodeForContext(sample, STRATEGIC_CTX);
  assert.ok(code && code.length === 2);
  assert.strictEqual(getH3IndexForCode(code, STRATEGIC_CTX), sample);
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Executes this module's tests in declaration order for Node's direct execution model.
 * When to use: Default entry when running `node dist/main/briefing/map/hex-coordinates.test.js`.
 * Expected outcome: All tests pass and a single success line is printed.
 * Exceptions: None.
 */
function run(): void {
  testStrategicCodesAreUniqueAcrossAllRes1Cells();
  testStrategicFullRoundTripForEveryRes1Cell();
  testStrategicRegistryStableAcrossExplicitReInit();
  testStrategicRes1FastPathMatchesRoundTrip();
  console.log('hex-coordinates.test.ts passed');
}

run();
