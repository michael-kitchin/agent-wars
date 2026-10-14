import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legendPopoverPosition, toastBandSpan } from './mapChromePlacement';

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

test('toastBandSpan keeps the band between the chrome on the left and the zoom buttons', () => {
  assert.deepEqual(toastBandSpan({ mapWidth: 904, leftObstacleRight: 310, rightObstacleLeft: 858 }), {
    left: 322,
    right: 58,
    overChrome: false,
  });
});

test('toastBandSpan spans the top of a map too narrow for the band beside the chrome', () => {
  assert.deepEqual(toastBandSpan({ mapWidth: 424, leftObstacleRight: 310, rightObstacleLeft: 378 }), {
    left: 12,
    right: 58,
    overChrome: true,
  });
});

test('toastBandSpan keeps the inset at the right edge when there are no zoom buttons', () => {
  assert.deepEqual(toastBandSpan({ mapWidth: 904, leftObstacleRight: 310, rightObstacleLeft: 904 }), {
    left: 322,
    right: 12,
    overChrome: false,
  });
});
