import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchTurnLimitChoice } from './matchTurnLimitRules';

test('early in a match every limit is open and the chosen one stays', () => {
  assert.deepEqual(matchTurnLimitChoice(1, 30), { openLimits: [20, 30, 40, 50], cityHexesAvailable: true, selectedLimit: 30 });
});

test('a limit equal to the current turn stays open, since the match ends after that turn resolves', () => {
  assert.deepEqual(matchTurnLimitChoice(30, 30), { openLimits: [30, 40, 50], cityHexesAvailable: true, selectedLimit: 30 });
});

test('a chosen limit that has passed moves to the first open one', () => {
  assert.deepEqual(matchTurnLimitChoice(31, 20), { openLimits: [40, 50], cityHexesAvailable: true, selectedLimit: 40 });
  assert.equal(matchTurnLimitChoice(25, null).selectedLimit, 30);
});

test('after the last limit, city hexes is unavailable and no limit is chosen', () => {
  assert.deepEqual(matchTurnLimitChoice(51, 50), { openLimits: [], cityHexesAvailable: false, selectedLimit: null });
});
