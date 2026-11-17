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
  const fill = open.indexOf('fillOptionControlsFromMatch(');
  assert.notEqual(capture, -1);
  assert.notEqual(fill, -1);
  assert.equal(capture < fill, true);
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
