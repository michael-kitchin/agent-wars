import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampChatPanelSize } from './chatPanelSize';

test('clampChatPanelSize keeps a size that is inside the limits', () => {
  assert.deepEqual(clampChatPanelSize({ width: 400, height: 300 }, 676), { width: 400, height: 300 });
});

test('clampChatPanelSize holds the width between 280 and 640 and the height inside the map', () => {
  assert.deepEqual(clampChatPanelSize({ width: 100, height: 50 }, 676), { width: 280, height: 140 });
  assert.deepEqual(clampChatPanelSize({ width: 900, height: 900 }, 676), { width: 640, height: 652 });
});

test('clampChatPanelSize rounds to whole pixels', () => {
  assert.deepEqual(clampChatPanelSize({ width: 400.6, height: 300.4 }, 676), { width: 401, height: 300 });
});

test('clampChatPanelSize uses the minimum height on a map too short for it', () => {
  assert.deepEqual(clampChatPanelSize({ width: 400, height: 300 }, 100), { width: 400, height: 140 });
});
