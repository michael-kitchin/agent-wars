/**
 * Compact production and credit marks.
 *
 * Purpose: The symbols and the hire-price spelling stay stable when a fee equals upkeep and when it exceeds it.
 * When to use: After changing `economySymbols`.
 * Expected outcome: The assertions below.
 * Exceptions: AssertionError when a string drifts.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CREDITS_SYMBOL,
  PRODUCTION_CAPACITY_SYMBOL,
  formatCompactHireCost,
  formatCompactRaiseCost,
  formatCreditsAmount,
  formatProductionCapacityAmount,
} from './economySymbols';

test('production and credit amounts keep the caller grouping and gain a symbol', () => {
  assert.equal(formatProductionCapacityAmount('1,530'), `${PRODUCTION_CAPACITY_SYMBOL}1,530`);
  assert.equal(formatCreditsAmount('120'), `${CREDITS_SYMBOL}120`);
});

test('a hire price omits the one-time amount when the fee equals upkeep', () => {
  assert.equal(formatCompactHireCost(3, 3), `${CREDITS_SYMBOL}3 / turn`);
  assert.equal(
    formatCompactRaiseCost(20, 3, 3),
    `${PRODUCTION_CAPACITY_SYMBOL}20 + ${formatCompactHireCost(3, 3)}`
  );
});

test('a hire price shows only the extra above one turn when the fee is higher', () => {
  assert.equal(formatCompactHireCost(6, 3), `${CREDITS_SYMBOL}3 + ${CREDITS_SYMBOL}3 / turn`);
  assert.equal(
    formatCompactRaiseCost(20, 6, 3),
    `${PRODUCTION_CAPACITY_SYMBOL}20 + ${formatCompactHireCost(6, 3)}`
  );
});
