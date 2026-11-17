#!/usr/bin/env node
'use strict';

/**
 * Unit tests for the UI smoke checks, the battle-status pattern the scenes wait on, and the observed battle's hex edit.
 *
 * Purpose: Covers how a check result is decided, which top-bar controls the placeholder check expects disabled, what the Game Options, game menu, and follow-units checks accept, which battle header lines a beat wait accepts, which hex the observed battle is set up on, what a missing battle reports, and which march attempts skip a unit, without starting Electron.
 * When to use: Discovered by `scripts/run-main-node-tests.cjs` as an extra CJS test.
 * Expected outcome: Exits 0 when the pass, missing-element, and thrown-check contracts hold.
 * Exceptions: Assertion failures abort the process via node:test.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SCENES, probeSelectors, runChecks } = require('./ui-smoke-checks.cjs');
const { aiContestedHexStatements, battleStatusPattern, missingBattleMessage } = require('./ui-smoke-beat-limit.cjs');
const { attemptUnitMarch } = require('./ui-smoke-march-attempt.cjs');

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

test('the placeholder check leaves the settings button out, since it opens Game Options', () => {
  const disabled = { disabled: true };
  const probe = {
    viewport: { w: 800, h: 600, dpr: 1 },
    scroll: { w: 800, h: 600 },
    activeElementId: '',
    elements: { '#topbar-settings-btn': { disabled: false }, '#topbar-help-btn': disabled, '#console-tab-build': disabled, '#console-tab-forces': disabled },
  };
  const result = runChecks(SCENES.strategic, probe).find((row) => row.check === 'placeholders-disabled');
  assert.deepEqual(result, { check: 'placeholders-disabled', status: 'PASS', detail: '' });
});

/**
 * Runs one named real check on a probe that holds only the given elements.
 *
 * Purpose: The Game Options, game menu, and follow-units tests each vary a few element fields.
 * When to use: The tests below that exercise one real check row.
 * Expected outcome: That check's result row, or undefined when the check does not apply to the scene.
 * Exceptions: None.
 */
function runOneCheck(sceneName, checkName, elements, activeElementId = '') {
  const probe = { viewport: { w: 1280, h: 720, dpr: 1 }, scroll: { w: 1280, h: 720 }, activeElementId, elements };
  return runChecks(sceneName, probe).find((row) => row.check === checkName);
}

/**
 * Builds the elements of the Game Options dialog as the match-mode open scene expects them.
 *
 * Purpose: Each Game Options test changes one field from a passing dialog.
 * When to use: With `runOneCheck` for `SCENES.matchOptionsOpen`.
 * Expected outcome: A centered, shown popover in match mode, the backdrop, three locked controls, an enabled victory
 *   rule, Apply shown, and Cancel reading "Cancel". `overrides` replaces whole elements by selector.
 * Exceptions: None.
 */
function openMatchOptionsElements(overrides = {}) {
  const shown = { shown: true, disabled: false, text: '' };
  return {
    '#new-game-options-popover': { ...shown, x: 440, y: 160, w: 400, h: 400, mode: 'match' },
    '#match-options-backdrop': shown,
    '#new-game-human-nickname': { ...shown, disabled: true },
    '#new-game-fog-checkbox': { ...shown, disabled: true },
    '#new-game-auto-start-checkbox': { ...shown, disabled: true },
    '#new-game-victory-select': shown,
    '#match-options-apply': shown,
    '#match-options-cancel': { ...shown, text: 'Cancel' },
    ...overrides,
  };
}

test('the Game Options check passes a centered match-mode dialog and names an unlocked control or an off-center box', () => {
  const name = 'settings-button-opens-game-options-centered-with-locked-controls';
  assert.equal(runOneCheck(SCENES.matchOptionsOpen, name, openMatchOptionsElements()).status, 'PASS');
  const unlocked = runOneCheck(SCENES.matchOptionsOpen, name, openMatchOptionsElements({ '#new-game-fog-checkbox': { shown: true, disabled: false } }));
  assert.deepEqual(unlocked, { check: name, status: 'FAIL', detail: 'controls that should be locked during a match: #new-game-fog-checkbox' });
  const anchored = openMatchOptionsElements({ '#new-game-options-popover': { shown: true, x: 0, y: 44, w: 400, h: 400, mode: 'match' } });
  assert.match(runOneCheck(SCENES.matchOptionsOpen, name, anchored).detail, /expected centered in the 1280x720 window$/);
  const newGameMode = openMatchOptionsElements({ '#new-game-options-popover': { shown: true, x: 440, y: 160, w: 400, h: 400, mode: null } });
  assert.match(runOneCheck(SCENES.matchOptionsOpen, name, newGameMode).detail, /data-mode "null", expected shown in match mode$/);
});

test('the Game Options close check wants the popover hidden, out of match mode, and focus on the settings button', () => {
  const name = 'game-options-cancel-closes-and-returns-focus';
  const closed = { '#new-game-options-popover': { shown: false, mode: null }, '#match-options-backdrop': { shown: false } };
  assert.equal(runOneCheck(SCENES.matchOptionsClosed, name, closed, 'topbar-settings-btn').status, 'PASS');
  const stuck = { ...closed, '#new-game-options-popover': { shown: false, mode: 'match' } };
  assert.equal(runOneCheck(SCENES.matchOptionsClosed, name, stuck, 'topbar-settings-btn').detail, 'Game Options keeps data-mode "match" after Cancel');
  assert.equal(runOneCheck(SCENES.matchOptionsClosed, name, closed, '').detail, 'focus is on "", expected the settings button');
});

test('the game menu check wants Playback and Metrics enabled with their keys, and How to play enabled', () => {
  const name = 'game-menu-playback-metrics-and-how-to-play';
  const item = { shown: true, disabled: false };
  const elements = {
    '#game-menu-playback-btn': item,
    '#game-menu-metrics-btn': item,
    '#game-menu-playback-btn kbd': { text: 'P' },
    '#game-menu-metrics-btn kbd': { text: 'C' },
    '#game-menu-how-to-play-btn': item,
  };
  assert.equal(runOneCheck(SCENES.gameMenuOpen, name, elements).status, 'PASS');
  assert.equal(runOneCheck(SCENES.gameMenuOpen, name, { ...elements, '#game-menu-metrics-btn kbd': { text: 'M' } }).detail, 'Metrics… shows the key "M", expected "C"');
  assert.equal(runOneCheck(SCENES.gameMenuOpen, name, { ...elements, '#game-menu-how-to-play-btn': { shown: true, disabled: true } }).detail, 'How to play is disabled');
});

test('the follow-units check wants the replay toggle shown, named, and not pressed', () => {
  const name = 'replay-panel-shows-the-follow-units-toggle-off';
  const toggle = { shown: true, disabled: false, label: 'Follow units', pressed: 'false' };
  assert.equal(runOneCheck(SCENES.replayOpen, name, { '#replay-follow-units': toggle }).status, 'PASS');
  assert.match(runOneCheck(SCENES.replayOpen, name, { '#replay-follow-units': { ...toggle, pressed: 'true' } }).detail, /aria-pressed "true"/);
  assert.equal(runOneCheck(SCENES.replayClosed, name, { '#replay-follow-units': toggle }), undefined);
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

test('a unit whose selection times out is skipped, and any other error still fails the march search', async () => {
  const unit = { id: 'u1', unitType: 'armor', h3Index: 'hex' };
  const timeout = Object.assign(new Error('waiting for the selection'), { name: 'TimeoutError' });
  const skipped = [];
  assert.equal(await attemptUnitMarch(async () => { throw timeout; }, unit, skipped), false);
  assert.deepEqual(skipped, ['u1']);
  assert.equal(await attemptUnitMarch(async () => true, unit, skipped), true);
  await assert.rejects(attemptUnitMarch(async () => { throw new TypeError('broken'); }, unit, skipped), /broken/);
  assert.deepEqual(skipped, ['u1']);
});
