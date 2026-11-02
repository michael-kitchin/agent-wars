import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alignLongitudeToReference, WEB_MERCATOR_MAX_ABS_LAT } from './webMercator';

test('a longitude shifts by whole turns until it is within 180 degrees of the reference', () => {
  assert.equal(alignLongitudeToReference(190, 0), -170);
  assert.equal(alignLongitudeToReference(-190, 0), 170);
  assert.equal(alignLongitudeToReference(180, 0), 180);
  assert.equal(alignLongitudeToReference(-180, 0), -180);
  assert.equal(alignLongitudeToReference(730, 0), 10);
  assert.equal(alignLongitudeToReference(-175, 170), 185);
});

test('the Web Mercator latitude limit is the value the maps already clamp to', () => {
  assert.equal(WEB_MERCATOR_MAX_ABS_LAT, 85.05112877980659);
});
