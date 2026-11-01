/**
 * Contracts for the head-on initiative roll.
 * Run with: node dist/main/headOnInitiative.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHeadOnInitiativePicker } from './headOnInitiative';

test('the held cell is reproducible and ignores argument order', () => {
  const scope = { kind: 'strategic' as const, turnNumber: 3 };
  const pick = createHeadOnInitiativePicker(12345, scope);
  const forward = pick('cell-a', 'cell-b');
  const reverse = pick('cell-b', 'cell-a');
  const again = createHeadOnInitiativePicker(12345, scope)('cell-a', 'cell-b');
  assert.equal(forward, reverse);
  assert.equal(forward, again);
  assert.ok(forward === 'cell-a' || forward === 'cell-b');
});

test('different pairs reach both cells', () => {
  const pick = createHeadOnInitiativePicker(12345, {
    kind: 'tactical',
    strategicTurnNumber: 3,
    battleId: 'battle-1',
    tacticalTurnNumber: 2,
  });
  const held = Array.from({ length: 64 }, (_, index) => pick(`cell-${index}-a`, `cell-${index}-b`));
  assert.ok(held.some((cell) => cell.endsWith('-a')));
  assert.ok(held.some((cell) => cell.endsWith('-b')));
});
