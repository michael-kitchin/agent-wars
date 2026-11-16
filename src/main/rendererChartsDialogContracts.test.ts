/**
 * The charts dialog's markup, key wiring, and chart modules stay in the files the screen loads.
 *
 * Purpose: Text must not be inserted as HTML, the dialog must be wired to the charts key and Escape, and each chart module must use the shared rules.
 * When to use: `npm run build:main`, then `node dist/main/rendererChartsDialogContracts.test.js`.
 * Expected outcome: The markup, the styles, and the renderer sources match the dialog's contract.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import { getFunctionSource, readRendererSource } from './testSupport/rendererSourceAssertions';

const DIALOG_IDS = ['charts-overlay', 'charts-dialog', 'charts-dialog-title', 'charts-dialog-close', 'charts-dialog-body'] as const;

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

test('the markup holds each dialog id once and links both stylesheets', () => {
  const html = readRepoFile('static', 'index.html');
  for (const id of DIALOG_IDS) {
    const marker = `id="${id}"`;
    assert.equal(html.split(marker).length - 1, 1, marker);
  }
  assert.equal(html.includes('chartsChrome.css'), true);
  assert.equal(html.includes('vendor/uplot/uPlot.min.css'), true);
  assert.equal(html.indexOf('id="charts-overlay"') < html.indexOf('vendor/leaflet/leaflet.js'), true);
});

test('the window key handler routes the charts key and Escape to the dialog', () => {
  const source = readRendererSource('map', 'initCore.ts');
  assert.equal(source.includes('chartsDialogIsOpen'), true);
  assert.equal(source.includes('toggleChartsDialog'), true);
  const escape = source.slice(source.indexOf("if (e.key === 'Escape') {"));
  assert.equal(escape.slice(0, escape.indexOf('tacticalBattlesDialogIsOpen')).includes('stopImmediatePropagation'), true);
});

test('the dialog and its chart modules paint text as text', () => {
  for (const file of ['chartsDialog.ts', 'lineChart.ts', 'relationshipStack.ts', 'relationshipTimeline.ts']) {
    assert.equal(readRendererSource('charts', file).includes('innerHTML'), false, file);
  }
  assert.equal(readRendererSource('chrome', 'blockingDialogGuards.ts').includes('innerHTML'), false);
});

test('the blocking-dialog guard names each dialog except the game-over panel', () => {
  const guard = readRendererSource('chrome', 'blockingDialogGuards.ts');
  for (const name of [
    'knockout-dialog',
    'start-confirm-dialog',
    'load-confirm-dialog',
    'tactical-annihilation-overlay',
    'new-game-options-popover',
    'melee-intercept-frame',
    'isGameMenuOpen',
    'commanderPopoverIsOpen',
    'tacticalBattlesDialogIsOpen',
  ]) {
    assert.equal(guard.includes(name), true, name);
  }
  assert.equal(guard.includes('game-over-overlay'), false);
});

test('the line chart uses the shared zoom, pan, and tooltip rules and listens for the wheel', () => {
  const chart = readRendererSource('charts', 'lineChart.ts');
  for (const name of ['zoomedTurnRange', 'pannedTurnRange', 'chartTooltip']) {
    assert.equal(chart.includes(name), true, name);
  }
  assert.equal(chart.includes("'wheel'"), true);
});

test('the dialog sizes plots by the quarter rule and builds every chart from the shared rules', () => {
  const dialog = readRendererSource('charts', 'chartsDialog.ts');
  for (const name of ['chartPlotHeight', 'lineChartData', 'relationshipRows', 'relationshipStrip', 'currentRendererMatchEpoch']) {
    assert.equal(dialog.includes(name), true, name);
  }
  assert.equal(readRendererSource('charts', 'relationshipStack.ts').includes('spokePositions'), true);
  assert.equal(readRendererSource('charts', 'relationshipStack.ts').includes('createElementNS'), true);
});

test('the stance strip zooms and pans through the shared rules and listens for the wheel', () => {
  const strip = readRendererSource('charts', 'relationshipTimeline.ts');
  assert.equal(strip.includes('zoomedTurnRange'), true);
  assert.equal(strip.includes('pannedTurnRange'), true);
  assert.equal(strip.includes("'wheel'"), true);
});

test('the turn handler refreshes the open dialog and closes it before a dialog that needs a choice', () => {
  const ready = readRendererSource('gameplay', 'readyHandler.ts');
  assert.equal(ready.includes('refreshChartsDialogIfOpen'), true);
  assert.equal(ready.includes('closeChartsDialogIfOpen'), true);
  assert.equal(getFunctionSource(readRendererSource('charts', 'chartsDialog.ts'), 'toggleChartsDialog').includes('blockingDialogIsOpen'), true);
});
