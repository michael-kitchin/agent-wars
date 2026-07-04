/**
 * Unit tests for mixed land + naval selection predicates.
 * Run with: node dist/main/game-actions/humanMarchPreviewMixedSelection.test.js
 */

import * as assert from 'assert';
import {
  hexSupportsMixedLandAndNaval,
  selectionHasMixedLandAndNaval,
} from './humanMarchPreviewMixedSelection';

function testSelectionHasMixedLandAndNaval(): void {
  assert.strictEqual(
    selectionHasMixedLandAndNaval([{ unitType: 'infantry' }, { unitType: 'naval' }]),
    true
  );
  assert.strictEqual(selectionHasMixedLandAndNaval([{ unitType: 'infantry' }]), false);
  assert.strictEqual(selectionHasMixedLandAndNaval([{ unitType: 'naval' }]), false);
  assert.strictEqual(selectionHasMixedLandAndNaval([{ unitType: 'air' }, { unitType: 'naval' }]), false);
}

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

function run(): void {
  testSelectionHasMixedLandAndNaval();
  testHexSupportsMixedLandAndNaval();
  console.log('humanMarchPreviewMixedSelection.test.ts passed');
}

run();
