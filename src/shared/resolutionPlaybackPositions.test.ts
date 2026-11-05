/**
 * Pre-movement icon positions for resolution playback.
 *
 * Hex indexes and unit ids in this file are test data, not live match values.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unitsAtPlaybackOrigins } from './resolutionPlaybackPositions';

test('unitsAtPlaybackOrigins places a mover on the hex it left', () => {
  const units = [
    { id: 'mover', h3Index: 'hex-dest', label: 'kept' },
    { id: 'later', h3Index: 'hex-later' },
  ];
  const placed = unitsAtPlaybackOrigins(
    units,
    [{ unitId: 'mover', fromH3Index: 'hex-origin' }],
    new Set()
  );
  assert.equal(placed[0]?.h3Index, 'hex-origin');
  assert.equal(placed[0]?.label, 'kept');
  assert.equal(placed[1]?.id, 'later');
  assert.equal(units[0]?.h3Index, 'hex-dest');
});

test('unitsAtPlaybackOrigins leaves a unit with no move where it is', () => {
  const staying = { id: 'stay', h3Index: 'hex-stay' };
  const placed = unitsAtPlaybackOrigins([staying], [], new Set());
  assert.equal(placed[0], staying);
});

test('unitsAtPlaybackOrigins leaves a flying unit on its snapshot hex', () => {
  const flyer = { id: 'flyer', h3Index: 'hex-target' };
  const placed = unitsAtPlaybackOrigins(
    [flyer],
    [{ unitId: 'flyer', fromH3Index: 'hex-origin' }],
    new Set(['flyer'])
  );
  assert.equal(placed[0], flyer);
});

test('unitsAtPlaybackOrigins uses the first move when one unit has two', () => {
  const placed = unitsAtPlaybackOrigins(
    [{ id: 'mover', h3Index: 'hex-dest' }],
    [
      { unitId: 'mover', fromH3Index: 'hex-first' },
      { unitId: 'mover', fromH3Index: 'hex-second' },
    ],
    new Set()
  );
  assert.equal(placed[0]?.h3Index, 'hex-first');
});
