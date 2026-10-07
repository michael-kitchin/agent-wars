import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tacticalCell } from './testSupport/tacticalHexFixtures';
import { tacticalGridDistance } from './tacticalSpatialAdapter';

test('tacticalRes4GridDistance is zero for identical resolution-4 cells', () => {
  const c = tacticalCell(40.7, -74.0);
  assert.equal(tacticalGridDistance(c, c), 0);
});

test('tacticalRes4GridDistance is positive between separated resolution-4 cells', () => {
  const a = tacticalCell(40.7, -74.0);
  const b = tacticalCell(41.5, -74.0);
  assert.ok(tacticalGridDistance(a, b) > 0);
});
