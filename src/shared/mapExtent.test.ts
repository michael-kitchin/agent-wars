import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cellToChildren, cellToLatLng, gridDisk } from 'h3-js';
import {
  battleDrawReferenceLng,
  drawReferenceLng,
  loadedMapExtentKey,
  longitudeIntervalFromCenters,
  setBattleDrawReferenceLng,
  setBattleDrawReferenceSuspended,
  setMapExtentReferenceLng,
  shouldApplyLoadedMapExtent,
} from './mapExtent';
import { alignLongitudeToReference } from './webMercator';

/** Test-only footprint: a Bering Strait hex's resolution-4 children plus three rings, which straddles 180°. */
const BERING_STRAIT_FOOTPRINT = (() => {
  const cells = new Set<string>();
  for (const child of cellToChildren('810dbffffffffff', 4)) {
    for (const near of gridDisk(child, 3)) cells.add(near);
  }
  return [...cells];
})();

describe('battleDrawReferenceLng', () => {
  it('keeps a footprint that straddles 180 degrees in one short span', () => {
    const reference = battleDrawReferenceLng(BERING_STRAIT_FOOTPRINT, null);
    assert.ok(reference != null);
    const aligned = BERING_STRAIT_FOOTPRINT.map((cell) => alignLongitudeToReference(cellToLatLng(cell)[1], reference));
    assert.ok(Math.max(...aligned) - Math.min(...aligned) < 60);
  });

  it('moves the reference into the loaded region frame', () => {
    const globalReference = battleDrawReferenceLng(BERING_STRAIT_FOOTPRINT, null);
    const regionalReference = battleDrawReferenceLng(BERING_STRAIT_FOOTPRINT, -100);
    assert.ok(globalReference != null && regionalReference != null);
    assert.ok(Math.abs(regionalReference - -100) <= 180);
    assert.ok(Math.abs(globalReference - 360 - regionalReference) < 1e-9);
  });

  it('returns null for an empty footprint', () => {
    assert.equal(battleDrawReferenceLng([], null), null);
  });
});

describe('drawReferenceLng', () => {
  afterEach(() => {
    setBattleDrawReferenceLng(null);
    setBattleDrawReferenceSuspended(false);
    setMapExtentReferenceLng(null);
  });

  it('prefers the battle reference over the regional reference', () => {
    setMapExtentReferenceLng(10);
    setBattleDrawReferenceLng(183);
    assert.equal(drawReferenceLng(), 183);
  });

  it('falls back to the regional reference while the battle reference is suspended or cleared', () => {
    setMapExtentReferenceLng(10);
    setBattleDrawReferenceLng(183);
    setBattleDrawReferenceSuspended(true);
    assert.equal(drawReferenceLng(), 10);
    setBattleDrawReferenceSuspended(false);
    setBattleDrawReferenceLng(null);
    assert.equal(drawReferenceLng(), 10);
  });
});

describe('longitudeIntervalFromCenters', () => {
  it('spans the short way across the antimeridian', () => {
    const interval = longitudeIntervalFromCenters([170, -170]);
    assert.ok(interval);
    assert.ok(Math.abs(interval.east - interval.west - 20) < 0.001);
    assert.equal(interval.crossesAntimeridian, true);
  });

  it('keeps a short eastern span on one side of the antimeridian', () => {
    const interval = longitudeIntervalFromCenters([10, 30]);
    assert.ok(interval);
    assert.ok(Math.abs(interval.west - 10) < 0.001);
    assert.ok(Math.abs(interval.east - 30) < 0.001);
    assert.equal(interval.crossesAntimeridian, false);
  });

  it('runs east from 30 past 180 when that is the occupied arc', () => {
    const interval = longitudeIntervalFromCenters([-175, 30, 170]);
    assert.ok(interval);
    assert.ok(Math.abs(interval.west - 30) < 0.001);
    assert.ok(interval.east > 180);
    assert.ok(Math.abs(interval.east - 185) < 0.001);
  });
});

describe('loadedMapExtentKey', () => {
  it('marks an empty hex list', () => {
    assert.equal(loadedMapExtentKey('western_europe', []), 'western_europe:empty');
  });

  it('uses map id, length, and the first and last index', () => {
    assert.equal(loadedMapExtentKey('western_europe', ['a', 'b', 'c']), 'western_europe:3:a:c');
  });
});

describe('shouldApplyLoadedMapExtent', () => {
  it('skips a matching footprint unless a new match asks to fit again', () => {
    assert.equal(shouldApplyLoadedMapExtent('western_europe:3:a:c', 'western_europe:3:a:c', false), false);
    assert.equal(shouldApplyLoadedMapExtent('western_europe:3:a:c', 'western_europe:3:a:c', true), true);
  });

  it('applies a different footprint without a forced refit', () => {
    assert.equal(shouldApplyLoadedMapExtent('global:empty', 'western_europe:3:a:c', false), true);
  });
});
