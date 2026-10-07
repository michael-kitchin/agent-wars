import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { longitudeIntervalFromCenters } from './mapExtent';

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
