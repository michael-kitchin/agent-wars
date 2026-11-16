/**
 * The charts dialog's pure choices.
 *
 * Purpose: The open check and the quarter-height arithmetic follow their contracts.
 * When to use: `npm run build:main`, then `node dist/shared/chartsDialogState.test.js`.
 * Expected outcome: The dialog opens only with a match and no other modal, and a chart block is a quarter of the dialog.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartBlockHeight, chartPlotHeight, chartsDialogMayOpen } from './chartsDialogState';

test('the dialog opens only with a match and no other modal', () => {
  assert.equal(chartsDialogMayOpen({ matchLoaded: true, otherModalOpen: false }), true);
  assert.equal(chartsDialogMayOpen({ matchLoaded: false, otherModalOpen: false }), false);
  assert.equal(chartsDialogMayOpen({ matchLoaded: true, otherModalOpen: true }), false);
});

test('a chart block is a quarter of the dialog and the plot is what the title row leaves', () => {
  assert.equal(chartBlockHeight(800), 200);
  assert.equal(chartPlotHeight(800, 32), 168);
  assert.equal(chartPlotHeight(200, 32), 18);
  assert.equal(chartPlotHeight(100, 32), 0);
});
