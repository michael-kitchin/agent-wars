import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderArrowGeometry, orderEndsCoincide } from './orderArrowGeometry';

test('orderArrowGeometry stops the tip short of a unit marker and the line at the arrow base', () => {
  assert.deepEqual(orderArrowGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, { arrowSize: 10, tipInset: 18 }), {
    tip: { x: 82, y: 0 },
    lineEnd: { x: 72, y: 0 },
    left: { x: 72, y: -6 },
    right: { x: 72, y: 6 },
  });
});

test('orderArrowGeometry puts the tip on the target when the inset is 0', () => {
  const arrow = orderArrowGeometry({ x: 10, y: 10 }, { x: 10, y: 60 }, { arrowSize: 10, tipInset: 0 });
  assert.deepEqual(arrow.tip, { x: 10, y: 60 });
  assert.deepEqual(arrow.lineEnd, { x: 10, y: 50 });
  assert.deepEqual(arrow.left, { x: 16, y: 50 });
  assert.deepEqual(arrow.right, { x: 4, y: 50 });
});

test('orderArrowGeometry points along +x when both ends are the same point', () => {
  const arrow = orderArrowGeometry({ x: 5, y: 5 }, { x: 5, y: 5 }, { arrowSize: 10, tipInset: 0 });
  assert.deepEqual(arrow.tip, { x: 5, y: 5 });
  assert.deepEqual(arrow.lineEnd, { x: -5, y: 5 });
});

test('orderEndsCoincide is true only for the same spot', () => {
  assert.equal(orderEndsCoincide({ x: 5, y: 5 }, { x: 5, y: 5 }), true);
  assert.equal(orderEndsCoincide({ x: 5, y: 5 }, { x: 5.2, y: 5 }), true);
  assert.equal(orderEndsCoincide({ x: 5, y: 5 }, { x: 40, y: 5 }), false);
});
