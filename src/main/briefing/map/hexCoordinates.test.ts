/**
 * Contract tests for the strategic hex-code registry.
 *
 * Purpose: Guards uniqueness, round-trip coverage, and a rebuild after the active map changes, without coupling to OpenRouter.
 * When to use: Run via `npm test` after `build:main`. Failures indicate registry ordering, H3 enumeration drift, or a table left from the previous map.
 * Expected outcome: Every registered strategic cell maps to a distinct code, and a profile change replaces that table.
 * Exceptions: None; assertions surface regressions as test failures.
 */

import * as assert from 'assert';
import { cellToLatLng, latLngToCell } from 'h3-js';
import { GLOBAL_GAME_MAP, resetActiveGameMap, withGameMap } from '../../../shared/activeGameMap';
import { setLoadedStrategicFootprint } from '../../../shared/loadedStrategicFootprint';
import { tacticalCellAt, tacticalChildrenOf } from '../../../shared/h3Resolutions';
import { tacticalBattleFootprint } from '../../../shared/tacticalBattleFootprint';
import { projectToGrid } from './hexGridProjection';
import {
  ensureStrategicCoordinateRegistryInitialized,
  getHexCodeForContext,
  getH3IndexForCode,
  initStrategicCoordinateRegistry,
  initTacticalCoordinateRegistry,
  listStrategicH3Indexes,
} from './hexCoordinates';

/**
 * Documents the module-scope binding `STRATEGIC_CTX` (STRATEGIC_CTX).

 * Purpose: Reuses one frozen strategic coordinate context for registry lookups in this suite.
 * When to use: Any assertion that calls `getHexCodeForContext` / `getH3IndexForCode` in strategic mode.
 * Expected outcome: `{ mode: 'strategic' }` satisfies `CoordinateContext` without optional battle fields.
 * Exceptions: None.
 */
const STRATEGIC_CTX = { mode: 'strategic' as const };

/**
 * Defines the `testStrategicCodesAreUniqueAcrossAllStrategicCells` function shape (function testStrategicCodesAreUniqueAcrossAllStrategicCells(): void).

 * Purpose: Ensures the 2-character code space is not reused across the full strategic Earth strategic set.
 * When to use: Regression guard whenever registry assignment logic changes.
 * Expected outcome: Set size equals population count for derived codes.
 * Exceptions: None.
 */
function testStrategicCodesAreUniqueAcrossAllCells(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const cells = listStrategicH3Indexes();
  const codes = cells.map((h3) => getHexCodeForContext(h3, STRATEGIC_CTX));
  assert.strictEqual(new Set(codes).size, codes.length, 'strategic res1 codes must be unique');
}

/**
 * Defines the `testStrategicFullRoundTripForEveryStrategicCell` function shape (function testStrategicFullRoundTripForEveryStrategicCell(): void).

 * Purpose: Verifies encode/decode symmetry for every registered strategic cell.
 * When to use: After changes to `sortCellsForRegistry`, resolution constants, or alphabet ordering.
 * Expected outcome: `getH3IndexForCode(getHexCodeForContext(h3))` returns the same strategic index.
 * Exceptions: None.
 */
function testStrategicFullRoundTripForEveryCell(): void {
  ensureStrategicCoordinateRegistryInitialized();
  for (const h3 of listStrategicH3Indexes()) {
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
  const sample = listStrategicH3Indexes()[0]!;
  const before = getHexCodeForContext(sample, STRATEGIC_CTX);
  initStrategicCoordinateRegistry();
  const after = getHexCodeForContext(sample, STRATEGIC_CTX);
  assert.strictEqual(before, after);
}

/**
 * Defines the `testStrategicFastPathMatchesRoundTrip` function shape (function testStrategicFastPathMatchesRoundTrip(): void).

 * Purpose: Confirms strategic-index fast-path encoding still round-trips through the strategic registry.
 * When to use: After changes to `getHexCodeForContext` strategic branch.
 * Expected outcome: Sample strategic cell encodes to a two-character code and decodes back to the same index.
 * Exceptions: None.
 */
function testStrategicFastPathMatchesRoundTrip(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const sample = listStrategicH3Indexes()[0]!;
  const code = getHexCodeForContext(sample, STRATEGIC_CTX);
  assert.ok(code && code.length === 2);
  assert.strictEqual(getH3IndexForCode(code, STRATEGIC_CTX), sample);
}

/**
 * Asserts the strategic registry lists exactly one cell.
 *
 * Purpose: A map change must replace the previous registry, including the global cell table.
 * When to use: After installing a one-cell footprint and the matching profile.
 * Expected outcome: `listStrategicH3Indexes()` is that cell. Returns the list for projection.
 * Exceptions: Assertion failure when the registry still holds another map.
 */
function assertRegistryListsOnly(cell: string, message: string): string[] {
  const listed = listStrategicH3Indexes();
  assert.strictEqual(listed.length, 1, message);
  assert.strictEqual(listed[0], cell, message);
  return listed;
}

/**
 * Encodes and decodes one strategic cell through the active registry.
 *
 * Purpose: A rebuilt registry must round-trip the cell it just listed.
 * When to use: After `assertRegistryListsOnly` for that cell.
 * Expected outcome: The two-character code, which decodes back to `h3`.
 * Exceptions: Assertion failure when the code is missing or maps to another cell.
 */
function assertStrategicRoundTrip(h3: string): string {
  const code = getHexCodeForContext(h3, STRATEGIC_CTX);
  assert.ok(code && code.length === 2, `expected two-character code for ${h3}`);
  assert.strictEqual(getH3IndexForCode(code, STRATEGIC_CTX), h3);
  return code;
}

/**
 * Checks that a profile change drops the previous strategic and tactical code tables.
 *
 * Purpose: Briefings after a new match must encode that match's footprint, including when the resolution stays the same.
 * When to use: After the global-registry tests in this file, which leave the full global table populated.
 * Expected outcome: Each installed one-cell footprint is the whole registry, and the tactical battle table is gone after the profile changes.
 * Exceptions: Assertion failure when a table survives the profile change. Restores the global footprint and registry before returning.
 */
function testStrategicRegistryFollowsActiveMap(): void {
  const cellRes2a = latLngToCell(49.2, -123.1, 2);
  const cellRes2b = latLngToCell(40.7, -74.0, 2);
  const cellRes3 = latLngToCell(22.5, 88.4, 3);
  const res2 = { ...GLOBAL_GAME_MAP, strategicResolution: 2, tacticalResolution: 5 };
  const res3 = { ...GLOBAL_GAME_MAP, strategicResolution: 3, tacticalResolution: 6 };
  const tacticalBattleId = 'registry-reset-battle';
  const tacticalCtx = { mode: 'tactical' as const, battleId: tacticalBattleId };
  setLoadedStrategicFootprint([cellRes2a]);
  try {
    withGameMap(res2, () => {
      assertRegistryListsOnly(cellRes2a, 'registry must rebuild for the active footprint');
      assertStrategicRoundTrip(cellRes2a);
      const child = tacticalChildrenOf(cellRes2a).find((h3) => tacticalCellAt(...cellToLatLng(h3)) === h3);
      if (!child) throw new Error('no tactical child round-trips');
      initTacticalCoordinateRegistry(tacticalBattleId, cellRes2a);
      const tacticalCode = getHexCodeForContext(child, tacticalCtx);
      assert.ok(tacticalCode && tacticalCode.length === 2, `expected two-character tactical code for ${child}`);

      setLoadedStrategicFootprint([cellRes2b]);
      withGameMap(res2, () => {
        assertRegistryListsOnly(cellRes2b, 'registry must rebuild when the footprint changes at the same resolution');
        assertStrategicRoundTrip(cellRes2b);
      });

      setLoadedStrategicFootprint([cellRes3]);
      withGameMap(res3, () => {
        const listed = assertRegistryListsOnly(cellRes3, 'registry must rebuild for the active footprint');
        const code = assertStrategicRoundTrip(cellRes3);
        const grid = projectToGrid(listed, STRATEGIC_CTX);
        assert.strictEqual(grid.cells.length, 1);
        assert.strictEqual(grid.cells[0]!.code, code);
      });

      assert.strictEqual(getHexCodeForContext(child, tacticalCtx), undefined);
    });
  } finally {
    setLoadedStrategicFootprint(null);
    resetActiveGameMap();
    initStrategicCoordinateRegistry();
  }
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Executes this module's tests in declaration order for Node's direct execution model.
 * When to use: Default entry when running `node dist/main/briefing/map/hexCoordinates.test.js`.
 * Expected outcome: All tests pass and a single success line is printed.
 * Exceptions: None.
 */
/**
 * Checks that a battle registry includes the margin and round-trips one margin cell.
 *
 * Purpose: Briefing codes and map labels share the footprint, not only the enclosing hex's children.
 * When to use: After the strategic registry tests.
 * Expected outcome: 607 codes for `81263ffffffffff`, and a margin cell maps both ways.
 * Exceptions: Assertion failure when the margin is missing.
 */
function testTacticalRegistryIncludesMargin(): void {
  const enclosing = '81263ffffffffff';
  const battleId = 'margin-registry';
  const context = { mode: 'tactical' as const, battleId };
  withGameMap(GLOBAL_GAME_MAP, () => {
    const footprint = tacticalBattleFootprint(enclosing);
    const margin = footprint.h3Indexes.find((cell) => !footprint.coreChildH3Indexes.includes(cell));
    if (!margin) throw new Error('fixture has no margin cell');
    initTacticalCoordinateRegistry(battleId, enclosing);
    const code = getHexCodeForContext(margin, context);
    assert.strictEqual(footprint.h3Indexes.length, 607);
    assert.ok(code && code.length === 2);
    assert.strictEqual(getH3IndexForCode(code, context), margin);
  });
}

function run(): void {
  testStrategicCodesAreUniqueAcrossAllCells();
  testStrategicFullRoundTripForEveryCell();
  testStrategicRegistryStableAcrossExplicitReInit();
  testStrategicFastPathMatchesRoundTrip();
  testStrategicRegistryFollowsActiveMap();
  testTacticalRegistryIncludesMargin();
  console.log('hexCoordinates.test.ts passed');
}

run();
