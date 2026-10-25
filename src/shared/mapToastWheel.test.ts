import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapToastWheelReachesMap } from './mapToastWheel';

test('mapToastWheelReachesMap zooms when the toast cannot scroll', () => {
  assert.equal(mapToastWheelReachesMap(0, 62, 62, 10), true);
  assert.equal(mapToastWheelReachesMap(0, 62, 80, -10), true);
  assert.equal(mapToastWheelReachesMap(40, 200, 80, 0), true);
});

test('mapToastWheelReachesMap scrolls while the toast still has room, and zooms at the end', () => {
  assert.equal(mapToastWheelReachesMap(40, 200, 80, 10), false);
  assert.equal(mapToastWheelReachesMap(40, 200, 80, -10), false);
  assert.equal(mapToastWheelReachesMap(0, 200, 80, -10), true);
  assert.equal(mapToastWheelReachesMap(120, 200, 80, 10), true);
});
