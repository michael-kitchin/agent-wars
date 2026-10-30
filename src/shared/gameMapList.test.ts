import assert from 'node:assert/strict';
import test from 'node:test';
import { PRODUCTION_CAPACITY_SYMBOL } from './economySymbols';
import {
  formatAdvancedTechLine,
  formatUnitCostLabel,
  pickDistinctIndexes,
  pickIndexExcept,
} from './gameMapList';

test('cost text for the global and western europe columns', () => {
  assert.equal(formatUnitCostLabel(20), `${PRODUCTION_CAPACITY_SYMBOL}20`);
  assert.equal(formatUnitCostLabel(65), `${PRODUCTION_CAPACITY_SYMBOL}65`);
  assert.equal(formatAdvancedTechLine(60), `Advanced tech: ${PRODUCTION_CAPACITY_SYMBOL}60+ hexes`);
});

test('side randomization never returns two equal indexes when two or more exist', () => {
  for (let i = 0; i < 40; i += 1) {
    const picked = pickDistinctIndexes(4, () => (i % 7) / 7);
    assert.ok(picked);
    assert.notEqual(picked.first, picked.second);
    const single = pickIndexExcept(4, picked.first, () => (i % 5) / 5);
    assert.notEqual(single, picked.first);
  }
  assert.equal(pickDistinctIndexes(1), null);
  assert.equal(pickIndexExcept(1, 0), null);
});
