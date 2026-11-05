import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  alignLatLngRun,
  alignLongitudeToReference,
  alignRingToReference,
  WEB_MERCATOR_MAX_ABS_LAT,
} from './webMercator';

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

test('a ring that straddles 180 degrees stays contiguous next to the reference', () => {
  const ring: [number, number][] = [
    [66, 179],
    [67, -179],
    [68, 179.5],
  ];
  assert.deepEqual(alignRingToReference(ring, -179.8, 183), [
    [66, 179],
    [67, 181],
    [68, 179.5],
  ]);
});

test('a ring near the reference antipode moves as a whole instead of spanning the world', () => {
  const ring: [number, number][] = [
    [45, 2],
    [46, 4],
    [47, 3],
  ];
  const aligned = alignRingToReference(ring, 3.1, 183);
  const longitudes = aligned.map(([, lng]) => lng);
  assert.ok(Math.max(...longitudes) - Math.min(...longitudes) < 3);
  assert.deepEqual(alignRingToReference(ring, 3.1, null), ring);
});

test('a run crossing 180 degrees stays connected and starts near the anchor', () => {
  assert.deepEqual(alignLatLngRun([[66, 179], [66, -179], [66, -178]], null), [
    [66, 179],
    [66, 181],
    [66, 182],
  ]);
  assert.deepEqual(alignLatLngRun([[66, -179], [66, 179]], 183), [
    [66, 181],
    [66, 179],
  ]);
});
