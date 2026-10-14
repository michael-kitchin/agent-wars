import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampSelectionPanelSize } from './selectionPanelSize';

test('clampSelectionPanelSize keeps a size that is inside the limits', () => {
  assert.deepEqual(clampSelectionPanelSize({ width: 500, height: 300 }, 676), { width: 500, height: 300 });
});

test('clampSelectionPanelSize holds the width between 320 and 640 and the height inside the map', () => {
  assert.deepEqual(clampSelectionPanelSize({ width: 100, height: 50 }, 676), { width: 320, height: 140 });
  assert.deepEqual(clampSelectionPanelSize({ width: 900, height: 900 }, 676), { width: 640, height: 652 });
});

test('clampSelectionPanelSize uses the minimum height on a map too short for it', () => {
  assert.deepEqual(clampSelectionPanelSize({ width: 400, height: 300 }, 100), { width: 400, height: 140 });
});
