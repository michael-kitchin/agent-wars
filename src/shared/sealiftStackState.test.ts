/**
 * Tests for empty sealift stack factory. Run with: node dist/shared/sealiftStackState.test.js
 */

import assert from 'node:assert/strict';
import { emptySealiftStackState } from './sealiftStackState';

/**
 * Verifies default and custom h3Index plus unsupported empty fields.
 *
 * Purpose: Guards the IPC/tactical empty-state contract.
 * When to use: After changing `emptySealiftStackState`.
 * Expected outcome: Default `h3Index` is `''`; custom index preserved; lists empty; mode unsupported.
 * Exceptions: None.
 */
function testEmptySealiftStackStateContract(): void {
  const defaults = emptySealiftStackState();
  assert.equal(defaults.h3Index, '');
  assert.equal(defaults.showSealiftSection, false);
  assert.equal(defaults.contextMode, 'unsupported');
  assert.equal(defaults.controlsDisabled, true);
  assert.equal(defaults.hasEmbarkedUnitsInStack, false);
  assert.equal(defaults.debarkAllowedAtHex, false);
  assert.deepStrictEqual(defaults.navalRows, []);
  assert.deepStrictEqual(defaults.landOptions, []);

  const custom = emptySealiftStackState('abc');
  assert.equal(custom.h3Index, 'abc');
  assert.equal(custom.contextMode, 'unsupported');
}

/**
 * Runs sealift stack state tests.
 *
 * Purpose: Node test entrypoint for shared discovery.
 * When to use: `node dist/shared/sealiftStackState.test.js`.
 * Expected outcome: Throws on failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testEmptySealiftStackStateContract();
  console.log('sealiftStackState.test.ts passed');
}

run();
