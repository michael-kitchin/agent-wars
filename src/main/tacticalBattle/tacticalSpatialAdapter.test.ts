import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tacticalRes4Cell } from './testSupport/tacticalRes4HexFixtures';
import { tacticalRes4GridDistance } from './tacticalSpatialAdapter';

test('tacticalRes4GridDistance is zero for identical resolution-4 cells', () => {
  const c = tacticalRes4Cell(40.7, -74.0);
  assert.equal(tacticalRes4GridDistance(c, c), 0);
});

test('tacticalRes4GridDistance is positive between separated resolution-4 cells', () => {
  const a = tacticalRes4Cell(40.7, -74.0);
  const b = tacticalRes4Cell(41.5, -74.0);
  assert.ok(tacticalRes4GridDistance(a, b) > 0);
});
