import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BONUS_LEVELS, bonusLevelOf, parseActiveBonusLevel, parseBonusLevel } from './bonusLevel';

test('bonus levels parse with tolerance and fall back on anything else', () => {
  for (const level of BONUS_LEVELS) assert.equal(parseBonusLevel(level, 'off'), level);
  assert.equal(parseBonusLevel('  HIGH ', 'off'), 'high');
  assert.equal(parseBonusLevel('extreme', 'off'), 'off');
  assert.equal(parseBonusLevel(undefined, 'low'), 'low');
  assert.equal(parseBonusLevel(2, 'off'), 'off');
});

test('a persisted level is high only when it says high', () => {
  assert.equal(parseActiveBonusLevel(' High'), 'high');
  assert.equal(parseActiveBonusLevel('off'), 'low');
  assert.equal(parseActiveBonusLevel('junk'), 'low');
  assert.equal(parseActiveBonusLevel(null), 'low');
});

test('a disabled bonus is off whatever its level says', () => {
  assert.equal(bonusLevelOf(false, 'high'), 'off');
  assert.equal(bonusLevelOf(undefined, 'high'), 'off');
  assert.equal(bonusLevelOf(true, undefined), 'low');
  assert.equal(bonusLevelOf(true, 'high'), 'high');
});
