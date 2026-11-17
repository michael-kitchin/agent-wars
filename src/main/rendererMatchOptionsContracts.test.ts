/**
 * The in-match Game Options dialog keeps its contract in the files the screen loads.
 *
 * Purpose: The dialog reuses the new-game controls, so it must read the live match, put the controls back on close, keep the locked options locked, and stay out of the new-game popover's close paths.
 * When to use: `npm run build:main`, then `node dist/main/rendererMatchOptionsContracts.test.js`.
 * Expected outcome: The markup and the dialog modules match the dialog's contract.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import { getFunctionSource, readRendererSource } from './testSupport/rendererSourceAssertions';

/**
 * Reads a file from the repo root.
 *
 * Purpose: The contract checks the page markup, which the renderer bundle does not contain.
 * When to use: Each test that reads HTML.
 * Expected outcome: The file's UTF-8 text.
 * Exceptions: Throws when the file cannot be read.
 */
function readRepoFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), ...segments), 'utf8');
}

/**
 * Returns the opening tag that carries one id.
 *
 * Purpose: Attribute checks look at one element's tag, not the whole page.
 * When to use: Before asserting an attribute of one control.
 * Expected outcome: The text from the tag's `<` to its `>`.
 * Exceptions: Throws an assertion error when the id is missing.
 */
function openingTagWithId(html: string, id: string): string {
  const marker = html.indexOf(`id="${id}"`);
  assert.notEqual(marker, -1, id);
  const start = html.lastIndexOf('<', marker);
  return html.slice(start, html.indexOf('>', marker) + 1);
}

test('the settings button is enabled and opens a dialog', () => {
  const tag = openingTagWithId(readRepoFile('static', 'index.html'), 'topbar-settings-btn');
  assert.equal(/\sdisabled[\s>=]/.test(tag), false, tag);
  assert.equal(tag.includes('aria-haspopup="dialog"'), true, tag);
});

test('the dialog reads the live match, never the replayed state', () => {
  const dialog = readRendererSource('gameplay', 'matchOptionsDialog.ts');
  assert.equal(dialog.includes('fetchMatchSnapshot()'), true);
  assert.equal(dialog.includes('S.gameState'), false);
});

test('the controls are captured before they are filled, and put back on close', () => {
  const dialog = readRendererSource('gameplay', 'matchOptionsDialog.ts');
  const open = getFunctionSource(dialog, 'openMatchOptionsDialog');
  const capture = open.indexOf('captureOptionControls()');
  const fill = open.indexOf('showLiveSettings(');
  assert.notEqual(capture, -1);
  assert.notEqual(fill, -1);
  assert.equal(capture < fill, true);
  assert.equal(getFunctionSource(dialog, 'showLiveSettings').includes('fillOptionControlsFromMatch('), true);
  assert.equal(getFunctionSource(dialog, 'closeMatchOptionsDialog').includes('restoreOptionControls('), true);
});

test('Nickname, Fog of war, and Auto-start AI are always locked', () => {
  const controls = readRendererSource('gameplay', 'matchOptionsControls.ts');
  const constant = controls.slice(controls.indexOf('const ALWAYS_LOCKED_CONTROL_IDS'));
  const list = constant.slice(0, constant.indexOf(';'));
  for (const id of ['new-game-human-nickname', 'new-game-fog-checkbox', 'new-game-auto-start-checkbox']) {
    assert.equal(list.includes(`'${id}'`), true, id);
  }
  const lock = getFunctionSource(controls, 'lockOptionControls');
  const always = lock.indexOf('ALWAYS_LOCKED_CONTROL_IDS');
  assert.notEqual(always, -1);
  assert.equal(always < lock.indexOf('if (!editable)'), true, 'the locked controls are disabled before the editable check');
});

test('the turn limits come from the shared turn-limit rule', () => {
  const controls = readRendererSource('gameplay', 'matchOptionsControls.ts');
  assert.equal(getFunctionSource(controls, 'lockOptionControls').includes('matchTurnLimitChoice('), true);
  assert.equal(controls.includes('TURN_LIMIT_OPTIONS'), false, 'the controls do not filter the limits themselves');
});

test('while Apply is pending, the player cannot close the dialog, and a stored change always reaches the screen', () => {
  const dialog = readRendererSource('gameplay', 'matchOptionsDialog.ts');
  const userClose = getFunctionSource(dialog, 'closeMatchOptionsDialogByPlayer');
  assert.equal(userClose.includes('applyIsPending()'), true);
  const wire = getFunctionSource(dialog, 'wireMatchOptionsDialog');
  assert.equal(wire.includes("'click', closeMatchOptionsDialog)") || wire.includes('closeMatchOptionsDialog();'), false, 'every wired close goes through the player close');
  assert.equal(getFunctionSource(dialog, 'handleDialogKey').includes('closeMatchOptionsDialogByPlayer()'), true);
  const apply = getFunctionSource(dialog, 'applyMatchOptions');
  assert.equal(apply.includes('setCloseButtonsDisabled(true)'), true);
  const shown = apply.indexOf('await showStoredMatchOptions(epoch)');
  assert.notEqual(shown, -1);
  assert.equal(apply.slice(0, shown).includes('counter === openCounter) closeMatchOptionsDialog'), false, 'the snapshot is applied before the same-dialog check');
  const show = getFunctionSource(dialog, 'showStoredMatchOptions');
  assert.equal(show.includes('openCounter') || show.includes('matchOptionsDialogIsOpen'), false, 'the snapshot is applied even after the dialog closed');
});

test('a prompt that needs the player closes the dialog, and the end of Ready re-checks it', () => {
  const ready = readRendererSource('gameplay', 'readyHandler.ts');
  const handler = getFunctionSource(ready, 'handleReadyButtonClick');
  assert.equal(handler.split('closeMatchOptionsDialogIfOpen()').length - 1 >= 2, true, 'battles list and knockout');
  const finallyBlock = handler.slice(handler.lastIndexOf('finally'));
  assert.equal(finallyBlock.includes('refreshMatchOptionsDialogIfOpen()'), true);
  for (const [folder, file] of [['gameplay', 'knockoutDialog.ts'], ['tactical', 'tacticalAnnihilationDialog.ts'], ['chrome', 'confirmDialog.ts']]) {
    assert.equal(readRendererSource(folder, file).includes('closeMatchOptionsDialogIfOpen()'), true, file);
  }
});

test('the new-game popover close paths leave match mode alone', () => {
  const popover = readRendererSource('gameplay', 'newGameOptionsPopover.ts');
  assert.equal(getFunctionSource(popover, 'popoverInMatchMode').includes("dataset.mode === 'match'"), true);
  for (const name of ['closeNewGameOptionsPopover', 'toggleNewGameOptionsPopover']) {
    assert.equal(getFunctionSource(popover, name).includes('popoverInMatchMode()'), true, name);
  }
  const wire = getFunctionSource(popover, 'wireNewGameOptionsPopover');
  assert.equal(wire.includes('popoverInMatchMode()'), true);
});

test('the new-game screen closes the dialog before it resets the controls', () => {
  const uiState = readRendererSource('core', 'uiState.ts');
  const close = uiState.indexOf('closeMatchOptionsDialogIfOpen()');
  assert.notEqual(close, -1);
  assert.equal(close < uiState.indexOf('resetNewGameOptionControls();'), true);
  const newGame = getFunctionSource(readRendererSource('gameplay', 'newGame.ts'), 'openNewGameOverlayFromModelTab');
  assert.equal(newGame.indexOf('closeMatchOptionsDialogIfOpen()') < newGame.indexOf('resetNewGameOptionControls()'), true);
  assert.notEqual(newGame.indexOf('closeMatchOptionsDialogIfOpen()'), -1);
});

test('auto-advance waits while the dialog is open', () => {
  const observe = getFunctionSource(readRendererSource('gameplay', 'observeChrome.ts'), 'autoAdvanceReady');
  assert.equal(observe.includes('matchOptionsDialogIsOpen()'), true);
});

test('the dialog state module imports nothing, so any module can use it', () => {
  assert.equal(/^\s*import\s/m.test(readRendererSource('gameplay', 'matchOptionsDialogState.ts')), false);
});
