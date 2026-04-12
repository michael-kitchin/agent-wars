import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latLngToCell } from 'h3-js';
import { tacticalRes4GridDistance } from './tacticalSpatialAdapter';

test('tacticalRes4GridDistance is zero for identical resolution-4 cells', () => {
  const c = latLngToCell(40.7, -74.0, 4);
  assert.equal(tacticalRes4GridDistance(c, c), 0);
});

test('tacticalRes4GridDistance is positive between separated resolution-4 cells', () => {
  const a = latLngToCell(40.7, -74.0, 4);
  const b = latLngToCell(41.5, -74.0, 4);
  assert.ok(tacticalRes4GridDistance(a, b) > 0);
});
