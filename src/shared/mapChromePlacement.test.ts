import assert from 'node:assert/strict';
import { test } from 'node:test';
import { floatingPanelOffset, legendPopoverPosition, messageToastBandWidth, toastBandSpan } from './mapChromePlacement';

test('legendPopoverPosition puts the legend right of the panel when it fits', () => {
  assert.deepEqual(legendPopoverPosition({ mapWidth: 904, panelRight: 310, panelBottom: 214, legendWidth: 110 }), {
    left: 318,
    top: 12,
    beside: true,
  });
});

test('legendPopoverPosition puts the legend under the panel on a narrow map', () => {
  assert.deepEqual(legendPopoverPosition({ mapWidth: 424, panelRight: 310, panelBottom: 214, legendWidth: 110 }), {
    left: 12,
    top: 222,
    beside: false,
  });
});

test('toastBandSpan keeps the inset clear of a right-hand obstacle', () => {
  assert.deepEqual(toastBandSpan({ mapWidth: 904, leftObstacleRight: 310, rightObstacleLeft: 858 }), {
    left: 322,
    right: 58,
    overChrome: false,
  });
});

test('toastBandSpan moves the left offset to the map inset when the gap is under the minimum', () => {
  assert.deepEqual(toastBandSpan({ mapWidth: 424, leftObstacleRight: 310, rightObstacleLeft: 424 }), {
    left: 12,
    right: 12,
    overChrome: true,
  });
});

test('messageToastBandWidth keeps the one-third cap when the tab row fits or is hidden', () => {
  assert.equal(messageToastBandWidth({ mapWidth: 900, available: 566, tabRowOuterWidth: 200 }), 300);
  assert.equal(messageToastBandWidth({ mapWidth: 900, available: 800, tabRowOuterWidth: 0 }), 300);
  assert.equal(messageToastBandWidth({ mapWidth: 900, available: 200, tabRowOuterWidth: 0 }), 200);
  assert.equal(messageToastBandWidth({ mapWidth: 900, available: 800, tabRowOuterWidth: Number.NaN }), 300);
  assert.equal(messageToastBandWidth({ mapWidth: 900, available: 800, tabRowOuterWidth: -10 }), 300);
});

test('messageToastBandWidth grows to the tab row and stops at the map insets', () => {
  assert.equal(messageToastBandWidth({ mapWidth: 900, available: 566, tabRowOuterWidth: 520 }), 520);
  assert.equal(messageToastBandWidth({ mapWidth: 900, available: 200, tabRowOuterWidth: 520 }), 520);
  assert.equal(messageToastBandWidth({ mapWidth: 900, available: 566, tabRowOuterWidth: 2000 }), 876);
});

test('toastBandSpan keeps the inset at the map right edge', () => {
  assert.deepEqual(toastBandSpan({ mapWidth: 904, leftObstacleRight: 310, rightObstacleLeft: 904 }), {
    left: 322,
    right: 12,
    overChrome: false,
  });
});

test('floatingPanelOffset leaves a panel that fits where it was dragged', () => {
  assert.deepEqual(
    floatingPanelOffset({ left: 212, top: 112, panelWidth: 432, panelHeight: 400, mapWidth: 1280, mapHeight: 756 }),
    { left: 212, top: 112 }
  );
});

test('floatingPanelOffset keeps a dragged panel the inset inside every edge', () => {
  assert.deepEqual(
    floatingPanelOffset({ left: 2000, top: -50, panelWidth: 432, panelHeight: 400, mapWidth: 1280, mapHeight: 756 }),
    { left: 836, top: 12 }
  );
  assert.deepEqual(
    floatingPanelOffset({ left: -50, top: 900, panelWidth: 432, panelHeight: 400, mapWidth: 1280, mapHeight: 756 }),
    { left: 12, top: 344 }
  );
});

test('floatingPanelOffset puts a panel larger than the map at the inset', () => {
  assert.deepEqual(
    floatingPanelOffset({ left: 200, top: 200, panelWidth: 432, panelHeight: 800, mapWidth: 800, mapHeight: 556 }),
    { left: 200, top: 12 }
  );
});
