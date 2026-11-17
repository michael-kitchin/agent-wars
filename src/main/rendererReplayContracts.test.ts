/**
 * Replay stays wired into the renderer files that must ignore a past turn.
 *
 * Purpose: Replay blocks map input at the map's own handlers and keeps live work from replacing a past picture, so each guard has to stay in place.
 * When to use: `npm run build:main`, then `node dist/main/rendererReplayContracts.test.js`.
 * Expected outcome: The guards, the option types, the key bindings, and the styles that hide the live panels are present.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import { assertMatches, getFunctionSource, readRendererSource } from './testSupport/rendererSourceAssertions';

/**
 * Reads a file from the repo root.
 *
 * Purpose: The contract checks static files the renderer bundle does not contain.
 * When to use: Each test that reads HTML or CSS.
 * Expected outcome: The file's UTF-8 text.
 * Exceptions: Throws when the file cannot be read.
 */
function readRepoFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), ...segments), 'utf8');
}

test('applying a snapshot ignores live work during replay and leaves the last-seen markers to replay', () => {
  const source = readRendererSource('core', 'stateSnapshot.ts');
  const body = source.slice(source.indexOf('export async function applyGameStateSnapshot('));
  assertMatches(body, /replayActive\(\)/, 'applyGameStateSnapshot asks whether replay is on');
  assertMatches(body, /if \(options\.replay === undefined\)[^\n]*updateClientStaleEnemyIntel/, 'the stale intel update is skipped for replay applications');
});

test('the window key handler toggles replay and leaves it on Escape', () => {
  const source = readRendererSource('map', 'initCore.ts');
  assertMatches(source, /toggleReplay\(\)/, 'p calls toggleReplay');
  assertMatches(source, /leaveReplay\(\)/, 'Escape calls leaveReplay');
});

test('Ready does nothing and its button is disabled while replay is on', () => {
  const ready = getFunctionSource(readRendererSource('gameplay', 'readyHandler.ts'), 'handleReadyButtonClick');
  assertMatches(ready, /if \(replayActive\(\)\) return;/, 'handleReadyButtonClick returns during replay');
  const button = getFunctionSource(readRendererSource('openRouter', 'openRouterUiHelpers.ts'), 'updateReadyButtonState');
  assertMatches(button, /replayActive\(\)/, 'the button is disabled during replay');
});

test('map clicks, double-clicks, right-clicks, and entry buttons do nothing in replay', () => {
  const map = readRendererSource('map', 'mainMapInteractions.ts');
  const guard = 'if (newGameOverlayIsOpen() || replayActive()) return;';
  for (const opening of ["addEventListener('pointerdown', (e) => {", "addEventListener('click', async (e) => {", "addEventListener('dblclick', (e) => {"]) {
    const at = map.indexOf(opening);
    assert.ok(at >= 0, `${opening} exists`);
    assert.equal(map.slice(at + opening.length).trimStart().startsWith(guard), true, `${opening} guards replay`);
  }
  assertMatches(
    map,
    /addEventListener\('contextmenu', \(e\) => \{\r?\n\s+e\.preventDefault\(\);\r?\n\s+if \(newGameOverlayIsOpen\(\) \|\| replayActive\(\)\) return;/,
    'contextmenu guards replay'
  );
  const doubleClick = getFunctionSource(readRendererSource('map', 'mapDoubleClickHandler.ts'), 'handleMainMapDoubleClick');
  assertMatches(doubleClick, /replayActive\(\)/, 'handleMainMapDoubleClick guards replay');
  assertMatches(readRendererSource('map', 'initCore.ts'), /buildEntryLayer\?\.addEventListener\('click', \(e\) => \{\r?\n\s+if \(replayActive\(\)\) return;/, 'build entry click guards replay');
  assertMatches(readRendererSource('map', 'tacticalEntryLayer.ts'), /replayActive\(\)\) \{/, 'the tactical entry layer hides in replay');
});

test('the console disables Orders and committed order lines stay hidden in replay', () => {
  const header = getFunctionSource(readRendererSource('chrome', 'consoleFrame.ts'), 'refreshConsoleHeader');
  assertMatches(header, /replayActive\(\)/, 'refreshConsoleHeader treats replay like observing');
  assertMatches(readRendererSource('chrome', 'consoleFrame.ts'), /console-tab-orders' && \([^\n]*replayActive\(\)/, 'the Orders tab click is ignored in replay');
  const paths = getFunctionSource(readRendererSource('rendering', 'canvasPreviewPolicy.ts'), 'shouldDrawCommittedOrderPaths');
  assertMatches(paths, /replayActive\(\)/, 'order lines are not drawn in replay');
});

test('the snapshot options carry the replay marker through every wrapper', () => {
  for (const [segments, label] of [
    [['entryCallbacks.ts'], 'entryCallbacks'],
    [['gameplay', 'readyHandlerTypes.ts'], 'readyHandlerTypes'],
    [['core', 'stateSnapshot.ts'], 'stateSnapshot'],
  ] as const) {
    assertMatches(readRendererSource(...segments), /replay\?: 'step' \| 'leave';/, `${label} names the replay option`);
  }
});

test('the stylesheet hides the live panels and the build buttons in replay', () => {
  const css = readRepoFile('static', 'replayChrome.css');
  assert.equal(readRepoFile('static', 'index.html').includes('replayChrome.css'), true);
  for (const id of ['selection-panel', 'chat-panel', 'build-entry-layer']) {
    assert.equal(css.includes(`body[data-replay="on"] #${id}`), true, `${id} is hidden in replay`);
  }
});

const REPLAY_PANEL_IDS = [
  'replay-panel',
  'replay-panel-seek',
  'replay-turn-input',
  'replay-slider',
  'replay-panel-bar',
  'replay-panel-expand',
  'replay-panel-label',
  'replay-step-back',
  'replay-step-forward',
  'replay-play',
] as const;

test('the replay panel markup is on the page once, and the panel code uses the shared rules without innerHTML', () => {
  const html = readRepoFile('static', 'index.html');
  for (const id of REPLAY_PANEL_IDS) {
    const marker = `id="${id}"`;
    assert.equal(html.split(marker).length - 1, 1, marker);
  }
  const panel = readRendererSource('replay', 'replayPanel.ts');
  for (const call of ['parseTurnEntry(', 'canStepBack(', 'canStepForward(', 'canPlay(', 'replayLabel(']) {
    assert.equal(panel.includes(call), true, `${call} is used`);
  }
  assert.equal(panel.includes("'aria-invalid'"), true);
  assert.equal(panel.includes('innerHTML'), false);
});

test('replay shows both dialogs from the shared plan without filing or logging them again', () => {
  const dialogs = readRendererSource('replay', 'replayDialogs.ts');
  assertMatches(dialogs, /announceResolutionTurnUpdate\(/, 'the update dialog uses the announcer');
  for (const required of ['skipReport: true', 'destroyedParents: []', 'viewerSeatId:', 'seats:', 'exploredHexes:', 'showCommanderMessageTabs(']) {
    assert.equal(dialogs.includes(required), true, required);
  }
  assertMatches(dialogs, /appendOpenRouterLog: \(\) => \{\}/, 'the activity log is not written');
  const tabs = readRendererSource('openRouter', 'commanderMessageTabsUi.ts');
  assertMatches(tabs, /if \(replayActive\(\) && options\?\.fromReplay !== true\) return;/, 'a background commander cannot open its dialog over a past turn');
});

test('the live turn takes its playback plan from the shared function, which only computes values', () => {
  const ready = getFunctionSource(readRendererSource('gameplay', 'readyHandler.ts'), 'handleReadyButtonClick');
  assertMatches(ready, /planResolutionPlayback\(/, 'handleReadyButtonClick calls planResolutionPlayback');
  const plan = readRendererSource('gameplay', 'resolutionPlaybackPlan.ts');
  assert.equal(/\bS\.[A-Za-z_]+\s*=[^=]/.test(plan), false, 'no assignment to shared state');
  assert.equal(/\bawait\b/.test(plan.replace(/\/\*\*[\s\S]*?\*\//g, '')), false, 'no await');
  assert.equal(plan.includes('window.gameApi'), false, 'no main process call');
});

test('a watch waits during replay, the menu and a new match leave it, and the smoke run covers the key', () => {
  assertMatches(readRendererSource('gameplay', 'observeChrome.ts'), /if \(replayActive\(\) \|\| !autoAdvanceReady\(\)/, 'auto advance waits during replay');
  assertMatches(getFunctionSource(readRendererSource('replay', 'replayMode.ts'), 'leaveReplay'), /maybeObserveAutoAdvance\(\)/, 'leaving asks the watch again');
  assertMatches(getFunctionSource(readRendererSource('chrome', 'gameMenu.ts'), 'openGameMenu'), /requestReplayLeave\(\)/, 'the menu leaves replay');
  assertMatches(readRendererSource('gameplay', 'newGame.ts'), /abandonReplay\(\);/, 'a new match drops replay');
  assert.equal(readRepoFile('scripts', 'ui-smoke', 'ui-smoke-checks.cjs').includes('#replay-panel'), true);
});

test('the live turn builds and starts its strategic animation through the shared functions', () => {
  const ready = getFunctionSource(readRendererSource('gameplay', 'readyHandler.ts'), 'handleReadyButtonClick');
  assertMatches(ready, /buildStrategicResolutionAnimation\(/, 'handleReadyButtonClick builds the animation with the shared function');
  assertMatches(ready, /startResolutionAnimationFrames\(deps\.tickResolutionMoveAnimation\)/, 'handleReadyButtonClick starts the frames with the shared function');
});

test('Play runs the recorded steps through the shared animation and never notifies the main process', () => {
  const play = readRendererSource('replay', 'replayPlayback.ts');
  for (const call of [
    'planResolutionPlayback(',
    'buildStrategicResolutionAnimation(',
    'startResolutionAnimationFrames(',
    'waitForNextResolutionPlaybackFinished(',
    'nextPlaybackIndex(',
    'hasQueuedResolutionPlaybackCompleteNotify(',
    'REPLAY_PLAYBACK_DWELL_MS',
  ]) {
    assert.equal(play.includes(call), true, `${call} is used`);
  }
  assertMatches(play, /\} finally \{/, 'playback ends its flags in a finally');
  assert.equal(play.split('setTimeout(').length - 1, 1, 'the hold is the only timer');
  assertMatches(getFunctionSource(play, 'holdReplayStep'), /setTimeout\(/, 'the timer is inside holdReplayStep');
  for (const banned of ['setInterval', 'scheduleResolutionPlaybackCompleteNotify', 'notifyResolutionPlaybackComplete']) {
    assert.equal(play.includes(banned), false, `${banned} is not used`);
  }
  assert.equal(readRendererSource('replay', 'replayMode.ts').includes("from './replayPlayback'"), false, 'replayMode does not import the play loop');
});

test('leaving replay stops playback before showing the last step, and a played step applies without a redraw', () => {
  const mode = readRendererSource('replay', 'replayMode.ts');
  const leave = getFunctionSource(mode, 'leaveReplay');
  const cleared = leave.indexOf('playing: false');
  const cancelled = leave.indexOf('clearResolutionPlaybackAnimationState()');
  assert.ok(cleared >= 0 && cancelled > cleared, 'playing is cleared before the animation is cancelled');
  assertMatches(getFunctionSource(mode, 'presentReplayStep'), /redraw: !options\.forPlayback/, 'a played step applies with redraw off');
  assertMatches(getFunctionSource(mode, 'showReplayStep'), /playing/, 'stepping does nothing while Play runs');
});

test('inside a battle replay keeps the battle view out of full activation and Exit Battle off', () => {
  const mode = readRendererSource('replay', 'replayMode.ts');
  assertMatches(getFunctionSource(mode, 'leaveReplay'), /restoreBattleState\(\)/, 'leaveReplay puts the battle state back');
  assertMatches(getFunctionSource(mode, 'restoreBattleState'), /S\.tacticalPendingMarches = savedBattle\.marches/, 'queued marches are restored');
  assertMatches(
    getFunctionSource(readRendererSource('tactical', 'tacticalExitButtonDom.ts'), 'syncTacticalExitButtonElementVisibility'),
    /replayActive\(\)/,
    'Exit Battle reads replayActive'
  );
  const snapshot = readRendererSource('core', 'stateSnapshot.ts');
  assertMatches(
    snapshot,
    /if \(restored && options\.replay === 'step'\) \{[\s\S]*?S\.tacticalBattleSnapshot = restored;[\s\S]*?\} else if \(restored && deps\.applyRestoredTacticalBattleFromMain\)/,
    'a replay step stores the recorded battle without activating it'
  );
});

test('the live beat and the replay update dialog share the beat playback test', () => {
  assertMatches(getFunctionSource(readRendererSource('gameplay', 'readyTacticalCommit.ts'), 'runTacticalReadyCommit'), /tacticalPlaybackNeeded\(playback\)/, 'the live beat calls tacticalPlaybackNeeded');
  assertMatches(readRendererSource('replay', 'replayDialogs.ts'), /tacticalPlaybackNeeded\(playback\)/, 'replay calls tacticalPlaybackNeeded');
});

test('the live beat and replay build a beat animation through the same function', () => {
  const live = getFunctionSource(readRendererSource('gameplay', 'readyTacticalCommit.ts'), 'runTacticalReadyCommit');
  assertMatches(live, /tacticalPlaybackNeeded\(playback\)/, 'the live beat tests its playback with the shared function');
  assertMatches(live, /buildTacticalResolutionAnimation\(/, 'the live beat builds its animation with the shared function');
  const play = readRendererSource('replay', 'replayPlayback.ts');
  assertMatches(play, /tacticalPlaybackNeeded\(/, 'replay tests the recorded playback with the shared function');
  assertMatches(play, /buildTacticalResolutionAnimation\(\{[^}]*subUnitsBefore: view\.subUnitsBefore/, 'replay builds the beat animation from the recorded sub-units');
});

test('draft order lines are not drawn over a past turn or beat', () => {
  const policy = getFunctionSource(readRendererSource('rendering', 'canvasPreviewPolicy.ts'), 'shouldDrawPendingOrderOverlays');
  assertMatches(policy, /return !replayActive\(\);/, 'the pending-order policy is off during replay');
  const stages = readRendererSource('rendering', 'orderOverlayStages.ts');
  // The signature holds an object type, so the body is read from the declaration to the end of the file.
  const stack = stages.slice(stages.indexOf('export function drawPendingMarchesHoverAndSupportOrderStack('));
  const guard = stack.indexOf('if (!shouldDrawPendingOrderOverlays()) return;');
  assert.ok(guard >= 0, 'the overlay stack asks the pending-order policy');
  assert.ok(guard < stack.indexOf('drawTacticalPendingMarchesFirst?.()'), 'the guard comes before the queued battle marches');
  assert.ok(guard < stack.indexOf('drawPendingSupportOrderOverlays('), 'the guard comes before the support orders');
});

test('the commander cards cannot change a commander and a cost refresh leaves the past seats alone during replay', () => {
  const cards = readRendererSource('openRouter', 'commanderCardsUi.ts');
  assertMatches(getFunctionSource(cards, 'cardElement'), /summary\.disabled = presentation\.summaryDisabled \|\| replayActive\(\);/, 'the summary button is disabled in replay');
  assertMatches(getFunctionSource(cards, 'openSeatCommander'), /if \(replayActive\(\) \|\|/, 'the popover does not open in replay');
  assertMatches(getFunctionSource(cards, 'saveCommander'), /^[^\n]*\{\r?\n\s+if \(replayActive\(\)\) return;/, 'a save does nothing in replay');
  assertMatches(cards, /onReplayChange\(/, 'the cards repaint when replay turns on or off');
  const pool = getFunctionSource(readRendererSource('openRouter', 'commanderPoolClient.ts'), 'refreshSeatCosts');
  assert.equal(pool.split('replayActive()').length - 1, 2, 'the seat-cost refresh checks replay before the read and before it writes');
});

test('replay keeps the selection from before it and puts it back on leaving', () => {
  const mode = readRendererSource('replay', 'replayMode.ts');
  const toggle = getFunctionSource(mode, 'toggleReplay');
  const saved = toggle.indexOf('savedSelection = [...S.selectedUnitIds];');
  assert.ok(saved >= 0 && saved < toggle.indexOf('clearSelectionLikeRightClick('), 'the selection is copied before it is cleared');
  const leave = getFunctionSource(mode, 'leaveReplay');
  assert.ok(leave.indexOf('restoreSelection(selection)') > leave.indexOf('applyGameStateSnapshot(live'), 'the selection returns after the live snapshot');
  assertMatches(getFunctionSource(mode, 'restoreSelection'), /replaceSelection\(/, 'the restored ids are reconciled through replaceSelection');
});

test('a replay animation never moves the watch camera', () => {
  assertMatches(getFunctionSource(readRendererSource('gameplay', 'observeChrome.ts'), 'frameAutomaticWatchCamera'), /if \(replayActive\(\) \|\|/, 'the watch camera does nothing in replay');
  const frame = readRendererSource('map', 'unitFrameCamera.ts');
  assertMatches(getFunctionSource(frame, 'frameStrategicUnits'), /replayActive\(\)\) return;/, 'strategic framing does nothing in replay');
  assertMatches(getFunctionSource(frame, 'frameBattleUnits'), /replayActive\(\)\) return;/, 'battle framing does nothing in replay');
});

test('a played step starts no frames when replay was left while it was presented', () => {
  const step = getFunctionSource(readRendererSource('replay', 'replayPlayback.ts'), 'playReplayStep');
  const check = step.indexOf('S.resolutionMoveAnimation !== animation');
  assert.ok(check > step.indexOf('await presentReplayStep('), 'the animation is checked after the step is presented');
  assert.ok(check < step.indexOf('startResolutionAnimationFrames('), 'the check comes before the frames start');
  assertMatches(step, /!continues\(\)/, 'the step asks whether playback continues');
});

test('entering over the world map drops a kept battle, and leaving waits for a loading step', () => {
  const mode = readRendererSource('replay', 'replayMode.ts');
  assertMatches(getFunctionSource(mode, 'toggleReplay'), /savedBattle = timeline\.scope === 'tactical' \? copyBattleState\(\) : null;/, 'a strategic entry clears the kept battle');
  const leave = getFunctionSource(mode, 'leaveReplay');
  assert.equal(/state\.busy\) return;/.test(leave), false, 'a loading step does not cancel leaving');
  assertMatches(leave, /await waitForStepToSettle\(\);/, 'leaving waits for the step to settle');
});
