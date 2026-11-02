import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectedRingCentroid } from './projectedRingCentroid';

test('the center of a unit square is its middle, and one point is itself', () => {
  assert.deepEqual(
    projectedRingCentroid([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]),
    { x: 1, y: 1 }
  );
  assert.deepEqual(projectedRingCentroid([{ x: 4, y: 7 }]), { x: 4, y: 7 });
});
