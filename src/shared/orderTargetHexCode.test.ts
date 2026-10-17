import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOBAL_GAME_MAP, withGameMap } from './activeGameMap';
import { getStrategicHexCode } from './hexLlmCodeAssignment';
import { orderTargetHexCode } from './orderTargetHexCode';
import { tacticalBattleFootprint, tacticalBattleHexCode } from './tacticalBattleFootprint';

/**
 * A world hex of the global map that has a code and a battle footprint.
 *
 * Purpose: Both theaters' codes are checked against the same hex.
 * When to use: The tests in this file, inside `withGameMap(GLOBAL_GAME_MAP, ...)`.
 * Expected outcome: A valid strategic H3 index.
 * Exceptions: None.
 */
const SAMPLE_HEX = '81263ffffffffff';

test('orderTargetHexCode names a world hex by its two-character code', () => {
  withGameMap(GLOBAL_GAME_MAP, () => {
    const code = getStrategicHexCode(SAMPLE_HEX);
    assert.ok(code);
    assert.equal(orderTargetHexCode(SAMPLE_HEX, null), code);
  });
});

test('orderTargetHexCode names a battle cell by its parent code and its cell code', () => {
  withGameMap(GLOBAL_GAME_MAP, () => {
    const cell = tacticalBattleFootprint(SAMPLE_HEX).h3Indexes[0];
    const expected = `${getStrategicHexCode(SAMPLE_HEX)}.${tacticalBattleHexCode(SAMPLE_HEX, cell)}`;
    assert.equal(orderTargetHexCode(cell, { enclosingStrategicH3Index: SAMPLE_HEX }), expected);
  });
});

test('orderTargetHexCode returns null for a missing or invalid index', () => {
  assert.equal(orderTargetHexCode(null, null), null);
  assert.equal(orderTargetHexCode('not-a-cell', { enclosingStrategicH3Index: 'not-a-cell' }), null);
});
