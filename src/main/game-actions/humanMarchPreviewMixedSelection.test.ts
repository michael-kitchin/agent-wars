/**
 * Unit tests for mixed land + naval selection predicates.
 * Run with: node dist/main/game-actions/humanMarchPreviewMixedSelection.test.js
 */

import * as assert from 'assert';
import {
  hexSupportsMixedLandAndNaval,
  selectionHasMixedLandAndNaval,
} from './humanMarchPreviewMixedSelection';

/**
 * Regression guard for mixed land and naval unit type detection in march preview selection.
 *
 * Purpose: Ensures `selectionHasMixedLandAndNaval` distinguishes infantry/armor from naval without treating air as land.
 * When to use: Run via `npm test` after changes to mixed-stack march preview predicates.
 * Expected outcome: Returns true only when selection includes land and naval unit types together.
 * Exceptions: None.
 */
function testSelectionHasMixedLandAndNaval(): void {
  assert.strictEqual(
    selectionHasMixedLandAndNaval([{ unitType: 'infantry' }, { unitType: 'naval' }]),
    true
  );
  assert.strictEqual(selectionHasMixedLandAndNaval([{ unitType: 'infantry' }]), false);
  assert.strictEqual(selectionHasMixedLandAndNaval([{ unitType: 'naval' }]), false);
  assert.strictEqual(selectionHasMixedLandAndNaval([{ unitType: 'air' }, { unitType: 'naval' }]), false);
}

/**
 * Regression guard for coastal-only mixed-stack destination eligibility.
 *
 * Purpose: Ensures `hexSupportsMixedLandAndNaval` accepts coastal/littoral res1 hexes and rejects pure land or water.
 * When to use: Run via `npm test` after changes to mixed land/naval destination validation.
 * Expected outcome: Coastal terrain kinds return true; plains, wetlands, and water return false.
 * Exceptions: None.
 */
function testHexSupportsMixedLandAndNaval(): void {
  assert.strictEqual(
    hexSupportsMixedLandAndNaval({ h3Index: 'coastal', terrain: 'coastal', terrainKind: 'coastal' }),
    true
  );
  assert.strictEqual(
    hexSupportsMixedLandAndNaval({ h3Index: 'wetlands', terrain: 'land', terrainKind: 'wetlands' }),
    false
  );
  assert.strictEqual(
    hexSupportsMixedLandAndNaval({ h3Index: 'land', terrain: 'land', terrainKind: 'plains' }),
    false
  );
  assert.strictEqual(
    hexSupportsMixedLandAndNaval({ h3Index: 'water', terrain: 'water', terrainKind: 'water' }),
    false
  );
}

/**
 * Entry point for mixed land/naval predicate unit tests.
 *
 * Purpose: Runs all tests in this module and prints a pass marker for CI harnesses.
 * When to use: Invoked automatically when the compiled test file is executed by `npm test`.
 * Expected outcome: All assertions pass and a success line is logged.
 * Exceptions: Propagates assertion failures to the Node process exit code.
 */
function run(): void {
  testSelectionHasMixedLandAndNaval();
  testHexSupportsMixedLandAndNaval();
  console.log('humanMarchPreviewMixedSelection.test.ts passed');
}

run();
