/**
 * The shared modal dialog kit keeps the rules both dialogs rely on.
 *
 * Purpose: The charts dialog and the Game Options dialog use the kit's Tab trap and backdrop dismissal, so those rules are checked once here.
 * When to use: `npm run build:main`, then `node dist/main/rendererModalDialogKitContracts.test.js`.
 * Expected outcome: The kit's source holds the press-start rule, the swallowed events, and the Tab wrap, and both dialogs call the kit.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFunctionSource, readRendererSource } from './testSupport/rendererSourceAssertions';

test('the backdrop dismissal closes only when the press and the click were both on the backdrop', () => {
  const body = getFunctionSource(readRendererSource('chrome', 'modalDialogKit.ts'), 'wireBackdropDismiss');
  assert.equal(body.includes('pressStartedOnBackdrop = event.target === backdrop;'), true);
  assert.equal(body.includes('if (event.target === backdrop && fromBackdrop) onDismiss();'), true);
  assert.equal(body.includes('pressStartedOnBackdrop = false;'), true);
});

test('the backdrop keeps pointer, mouse, double-click, and wheel events away from the map', () => {
  const body = getFunctionSource(readRendererSource('chrome', 'modalDialogKit.ts'), 'wireBackdropDismiss');
  assert.equal(body.includes("['pointerdown', 'mousedown', 'dblclick', 'wheel']"), true);
});

test('the Tab trap wraps from the last control to the first stop and back', () => {
  const body = getFunctionSource(readRendererSource('chrome', 'modalDialogKit.ts'), 'trapTabWithin');
  assert.equal(body.includes('last.focus();'), true);
  assert.equal(body.includes('firstStop.focus();'), true);
  assert.equal(body.includes('event.preventDefault();'), true);
});

test('both dialogs use the kit instead of their own copies', () => {
  const charts = readRendererSource('charts', 'chartsDialog.ts');
  const options = readRendererSource('gameplay', 'matchOptionsDialog.ts');
  assert.equal(getFunctionSource(charts, 'wireChartsDialog').includes('wireBackdropDismiss(overlay'), true);
  assert.equal(getFunctionSource(options, 'wireMatchOptionsDialog').includes('wireBackdropDismiss(backdrop'), true);
  assert.equal(charts.includes('trapTabWithin('), true);
  assert.equal(options.includes('trapTabWithin('), true);
  assert.equal(charts.includes('let pressStartedOnBackdrop'), false);
  assert.equal(options.includes('let pressStartedOnBackdrop'), false);
});
