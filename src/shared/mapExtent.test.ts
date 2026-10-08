import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadedMapExtentKey, longitudeIntervalFromCenters, shouldApplyLoadedMapExtent } from './mapExtent';

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
