#!/usr/bin/env node
'use strict';

/**
 * Unit tests for the UI smoke checks.
 *
 * Purpose: Covers how a check result is decided, without starting Electron.
 * When to use: Discovered by `scripts/run-main-node-tests.cjs` as an extra CJS test.
 * Expected outcome: Exits 0 when the pass, missing-element, and thrown-check contracts hold.
 * Exceptions: Assertion failures abort the process via node:test.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { probeSelectors, runChecks } = require('./ui-smoke-checks.cjs');

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
