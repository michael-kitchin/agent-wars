/**
 * Contract tests for `hex-code-translator` (Phase 5A surface used at the LLM boundary).
 *
 * Purpose: Verifies `isValidHexCode`, `latLngToCode` snapping, and `codeToH3` / `h3ToCode` round-trip helpers.
 * When to use: Run after `build:main` alongside other briefing-map tests.
 * Expected outcome: Strategic registry lookups behave deterministically for known cells.
 * Exceptions: None; failures indicate registry or translator drift.
 */

import * as assert from 'assert';
import { cellToLatLng } from 'h3-js';
import {
  codeToH3,
  h3ToCode,
  isValidHexCode,
  latLngToCode,
} from './hexCodeTranslator';
import { ensureStrategicCoordinateRegistryInitialized, listStrategicRes1H3Indexes } from './hexCoordinates';

/**
 * Defines the `testIsValidHexCodeMatchesRegistry` function shape (function testIsValidHexCodeMatchesRegistry(): void).

 * Purpose: Ensures `isValidHexCode` accepts assigned strategic codes and rejects garbage strings.
 * When to use: Regression guard when `HEX_CODE_PATTERN` or registry membership rules change.
 * Expected outcome: Known-good code true; malformed or unassigned strings false.
 * Exceptions: None.
 */
function testIsValidHexCodeMatchesRegistry(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const ctx = { mode: 'strategic' as const };
  const sample = listStrategicRes1H3Indexes()[0]!;
  const code = h3ToCode(sample, ctx);
  assert.strictEqual(isValidHexCode(code, ctx), true);
  assert.strictEqual(isValidHexCode('!!', ctx), false);
  assert.strictEqual(isValidHexCode('aa', ctx), false);
}

/**
 * Defines the `testLatLngToCodeMatchesCellCenterStrategic` function shape (function testLatLngToCodeMatchesCellCenterStrategic(): void).

 * Purpose: Confirms `latLngToCode` snaps WGS84 to the same strategic code as `h3ToCode` for a res1 center.
 * When to use: Validates Phase 5A “snap then lookup” semantics for migration helpers.
 * Expected outcome: `latLngToCode(cellToLatLng(h3))` equals `h3ToCode(h3)` for res1 registry cells.
 * Exceptions: None.
 */
function testLatLngToCodeMatchesCellCenterStrategic(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const ctx = { mode: 'strategic' as const };
  const h3 = listStrategicRes1H3Indexes()[0]!;
  const [lat, lng] = cellToLatLng(h3);
  assert.strictEqual(latLngToCode(lat, lng, ctx), h3ToCode(h3, ctx));
}

/**
 * Defines the `testCodeToH3RoundTripSample` function shape (function testCodeToH3RoundTripSample(): void).

 * Purpose: Smoke test for `codeToH3` after `h3ToCode` on one cell.
 * When to use: Catches accidental changes to reverse-map wiring.
 * Expected outcome: `codeToH3(h3ToCode(h3)) === h3` for a strategic cell.
 * Exceptions: None.
 */
function testCodeToH3RoundTripSample(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const ctx = { mode: 'strategic' as const };
  const h3 = listStrategicRes1H3Indexes()[1]!;
  const code = h3ToCode(h3, ctx);
  assert.strictEqual(codeToH3(code, ctx), h3);
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Runs this module’s tests under Node without a separate test runner.
 * When to use: Invoked via `node dist/main/briefing/map/hex-code-translator.test.js`.
 * Expected outcome: All assertions pass.
 * Exceptions: None.
 */
function run(): void {
  testIsValidHexCodeMatchesRegistry();
  testLatLngToCodeMatchesCellCenterStrategic();
  testCodeToH3RoundTripSample();
  console.log('hex-code-translator.test.ts passed');
}

run();
