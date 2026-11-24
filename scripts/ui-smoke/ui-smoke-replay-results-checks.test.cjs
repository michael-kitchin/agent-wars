#!/usr/bin/env node
'use strict';

/**
 * Unit tests for the UI smoke checks of replay over a finished match.
 *
 * Purpose: Covers what each of the three replay results-screen checks accepts and the sentence it gives when it fails.
 * When to use: Discovered by `scripts/run-main-node-tests.cjs` as an extra CJS test.
 * Expected outcome: Exits 0 when each check passes on the right probe and fails with its sentence on the wrong one.
 * Exceptions: Assertion failures abort the process via node:test.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SCENES, runChecks } = require('./ui-smoke-checks.cjs');
const { MATCH_SCENES, REPLAY_RESULTS_SCENES } = require('./ui-smoke-scenes.cjs');

const SHOWN = Object.freeze({ shown: true });
const HIDDEN = Object.freeze({ shown: false });

/**
 * Runs one named real check on a probe that holds only the given elements.
 *
 * Purpose: Each test varies a few element fields from a passing page.
 * When to use: Every test below.
 * Expected outcome: That check's result row, or undefined when the check does not apply to the scene.
 * Exceptions: None.
 */
function runOneCheck(sceneName, checkName, elements) {
  const probe = { viewport: { w: 1280, h: 720, dpr: 1 }, scroll: { w: 1280, h: 720 }, activeElementId: '', elements };
  return runChecks(sceneName, probe).find((row) => row.check === checkName);
}

test('the last replay step needs the panel, the results screen, and no console', () => {
  const name = 'replay-over-a-finished-match-opens-on-the-results-screen';
  const pass = { '#replay-panel': SHOWN, '#game-over-overlay': SHOWN, '#game-over-message': SHOWN, '#sidebar': HIDDEN };
  assert.equal(runOneCheck(SCENES.gameOverReplayLast, name, pass).status, 'PASS');
  assert.match(runOneCheck(SCENES.gameOverReplayLast, name, { ...pass, '#game-over-overlay': HIDDEN }).detail, /results screen is not shown/);
  assert.match(runOneCheck(SCENES.gameOverReplayLast, name, { ...pass, '#sidebar': SHOWN }).detail, /console is shown over the results screen/);
});

test('an earlier replay step needs the panel and the match chrome, and no results screen', () => {
  const name = 'replay-sets-the-results-screen-aside-before-the-last-turn';
  const pass = { '#replay-panel': SHOWN, '#game-over-overlay': HIDDEN, '#sidebar': SHOWN, '#app-topbar .topbar-date-block': SHOWN };
  assert.equal(runOneCheck(SCENES.gameOverReplayEarlier, name, pass).status, 'PASS');
  assert.match(runOneCheck(SCENES.gameOverReplayEarlier, name, { ...pass, '#game-over-overlay': SHOWN }).detail, /still shown on an earlier step/);
  assert.match(runOneCheck(SCENES.gameOverReplayEarlier, name, { ...pass, '#sidebar': HIDDEN }).detail, /console is not shown/);
});

test('leaving replay shows the results screen and no panel', () => {
  const name = 'leaving-replay-over-a-finished-match-shows-the-results-screen';
  const pass = { '#replay-panel': HIDDEN, '#game-over-overlay': SHOWN, '#game-over-message': SHOWN };
  assert.equal(runOneCheck(SCENES.gameOverReplayLeft, name, pass).status, 'PASS');
  assert.match(runOneCheck(SCENES.gameOverReplayLeft, name, { ...pass, '#replay-panel': SHOWN }).detail, /panel is still shown/);
  assert.match(runOneCheck(SCENES.gameOverReplayLeft, name, { ...pass, '#game-over-overlay': HIDDEN }).detail, /results screen is not shown/);
  assert.match(runOneCheck(SCENES.gameOverReplayLeft, name, { ...pass, '#game-over-message': HIDDEN }).detail, /results heading is not shown/);
});

test('the scenes that keep the results screen open get no match checks', () => {
  assert.deepEqual([...REPLAY_RESULTS_SCENES], [SCENES.gameOverReplayLast, SCENES.gameOverReplayLeft]);
  for (const scene of REPLAY_RESULTS_SCENES) assert.equal(MATCH_SCENES.includes(scene), false);
  assert.equal(MATCH_SCENES.includes(SCENES.gameOverReplayEarlier), true);
});
