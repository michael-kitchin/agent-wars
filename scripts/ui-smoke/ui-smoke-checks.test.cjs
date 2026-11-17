#!/usr/bin/env node
'use strict';

/**
 * Unit tests for the UI smoke checks, the battle-status pattern the scenes wait on, and the observed battle's hex edit.
 *
 * Purpose: Covers how a check result is decided, which battle header lines a beat wait accepts, which hex the observed battle is set up on, and what a missing battle reports, without starting Electron.
 * When to use: Discovered by `scripts/run-main-node-tests.cjs` as an extra CJS test.
 * Expected outcome: Exits 0 when the pass, missing-element, and thrown-check contracts hold.
 * Exceptions: Assertion failures abort the process via node:test.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { probeSelectors, runChecks } = require('./ui-smoke-checks.cjs');
const { aiContestedHexStatements, battleStatusPattern, missingBattleMessage } = require('./ui-smoke-beat-limit.cjs');

/**
 * A one-row check table for these tests.
 *
 * Purpose: The tests must not depend on the real checks, which change with the layout.
 * When to use: Pass as the `checks` argument of `runChecks` and `probeSelectors`.
 * Expected outcome: The `wide` check passes when `#panel` is at least 100 pixels wide.
 * Exceptions: None.
 */
const TEST_CHECKS = Object.freeze([
  {
    name: 'wide',
    scenes: ['scene'],
    needs: ['#panel'],
    run: (p, el) => (el('#panel').w >= 100 ? null : `#panel is ${el('#panel').w} wide`),
  },
]);

/**
 * Builds a probe holding one `#panel` element of the given width, or none.
 *
 * Purpose: Keeps each test to the one value it varies.
 * When to use: Each test below.
 * Expected outcome: The shape `probePage` returns, with only what the test check reads.
 * Exceptions: None.
 */
function probeWithPanel(width) {
  return { viewport: { w: 800, h: 600, dpr: 1 }, scroll: { w: 800, h: 600 }, activeElementId: '', elements: { '#panel': width === null ? null : { w: width } } };
}

test('runChecks passes a check whose rule holds, for a sized scene name', () => {
  assert.deepEqual(probeSelectors(TEST_CHECKS), ['#panel']);
  assert.deepEqual(runChecks('scene@800x600', probeWithPanel(120), TEST_CHECKS), [{ check: 'wide', status: 'PASS', detail: '' }]);
});

test('runChecks fails a check whose element is missing, and names it', () => {
  assert.deepEqual(runChecks('scene', probeWithPanel(null), TEST_CHECKS), [{ check: 'wide', status: 'FAIL', detail: 'not in page: #panel' }]);
});

test('runChecks reports a failing rule and a thrown error as FAIL', () => {
  assert.deepEqual(runChecks('scene', probeWithPanel(40), TEST_CHECKS), [{ check: 'wide', status: 'FAIL', detail: '#panel is 40 wide' }]);
  const throwing = [{ ...TEST_CHECKS[0], run: () => { throw new Error('boom'); } }];
  assert.deepEqual(runChecks('scene', probeWithPanel(120), throwing), [{ check: 'wide', status: 'FAIL', detail: 'check threw: boom' }]);
});

test('a beat wait accepts the beats-left count and rejects a longer beat number', () => {
  const planning = new RegExp(battleStatusPattern(1, ' · Tactical planning'));
  assert.equal(planning.test('Beat 1 (29 left) · Tactical planning · April, Year 1'), true);
  assert.equal(planning.test('Beat 1 · Tactical planning · April, Year 1'), true);
  assert.equal(planning.test('Beat 12 · Tactical planning'), false);
  const last = new RegExp(battleStatusPattern(30, ''));
  assert.equal(last.test('Beat 30 (0 left) · Tactical planning'), true);
  assert.equal(new RegExp(battleStatusPattern(3, '')).test('Beat 30 · Tactical planning'), false);
});

test('the battle hex is one the first side holds alone, and ships keep their cargo out of it', () => {
  const state = {
    seats: [{ seatId: 'ai-1', outTurn: null }, { seatId: 'ai-2', outTurn: null }, { seatId: 'ai-3', outTurn: 2 }],
    units: [
      { id: 'a1', player: 'ai-1', unitType: 'infantry', h3Index: 'shared', embarkedOnCarrierUnitId: null },
      { id: 'x1', player: 'ai-3', unitType: 'armor', h3Index: 'shared' },
      { id: 'a2', player: 'ai-1', unitType: 'armor', h3Index: 'sea', embarkedOnCarrierUnitId: 'n1' },
      { id: 'a3', player: 'ai-1', unitType: 'infantry', h3Index: 'alone' },
      { id: 'b1', player: 'ai-2', unitType: 'infantry', h3Index: 'home' },
      { id: 'b2', player: 'ai-2', unitType: 'armor', h3Index: 'sea2', embarkedOnCarrierUnitId: 'n2' },
      { id: 'b3', player: 'ai-2', unitType: 'naval', h3Index: 'home' },
    ],
  };
  const edit = aiContestedHexStatements(state);
  assert.equal(edit.h3Index, 'alone');
  assert.deepEqual(edit.statements, [{ sql: 'UPDATE units SET h3_index = ? WHERE id = ?', params: ['alone', 'b1'] }]);
  const onlyShips = { ...state, units: state.units.filter((unit) => unit.id !== 'b1') };
  assert.throws(() => aiContestedHexStatements(onlyShips), /land units by side: ai-1 2, ai-2 0/);
});

test('a battle that was not offered names the turns and the hex', () => {
  const state = { turnNumber: 5, gameOver: false, units: [{ player: 'ai-1', h3Index: 'hex' }, { player: 'ai-1', h3Index: 'hex' }, { player: 'ai-2', h3Index: 'other' }] };
  assert.equal(missingBattleMessage(4, state, 'hex'), 'Ready resolved turn 4 without offering a battle (now turn 5); hex hex holds ai-1 2');
  assert.match(missingBattleMessage(4, { ...state, gameOver: true, units: [] }, 'hex'), /, and the match ended\); hex hex holds no units$/);
});
