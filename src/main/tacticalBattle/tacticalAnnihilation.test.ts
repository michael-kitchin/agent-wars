/**
 * Contract tests for tactical annihilation detection. Run with: node dist/main/tacticalBattle/tacticalAnnihilation.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldEndTacticalBattleForAnnihilation } from '../../shared/tacticalAnnihilation';

test('annihilation false when both sides retain sub-units', () => {
  assert.equal(
    shouldEndTacticalBattleForAnnihilation([
      { player: 'human' },
      { player: 'opponent' },
    ]),
    false
  );
});

test('annihilation true when human side has zero sub-units', () => {
  assert.equal(shouldEndTacticalBattleForAnnihilation([{ player: 'opponent' }]), true);
});

test('annihilation true when opponent side has zero sub-units', () => {
  assert.equal(shouldEndTacticalBattleForAnnihilation([{ player: 'human' }]), true);
});

test('annihilation true when both sides are empty', () => {
  assert.equal(shouldEndTacticalBattleForAnnihilation([]), true);
});
