import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latLngToCell } from 'h3-js';
import {
  hexCenterSteps,
  shouldApplyAutomaticBattleFrame,
  shouldApplyAutomaticUnitFrame,
  unitFrameBox,
  type AutomaticBattleFrameGate,
  type AutomaticUnitFrameGate,
  type LatLngFrameBox,
} from './unitFrameBox';

const OPEN_LIMIT: LatLngFrameBox = { south: -80, west: -180, north: 80, east: 180 };

/**
 * A watching auto-advance turn that has not been framed.
 *
 * Purpose: Gate tests flip one field off this row.
 * When to use: `shouldApplyAutomaticUnitFrame` cases.
 * Expected outcome: The gate function returns true for this object.
 * Exceptions: None.
 */
function openStrategicGate(): AutomaticUnitFrameGate {
  return {
    observing: true,
    autoAdvance: true,
    inBattle: false,
    phase: 'planning',
    playbackRunning: false,
    turnNumber: 4,
    framedTurnNumber: null,
  };
}

/**
 * An automatic battle beat that has not been framed.
 *
 * Purpose: Battle-gate tests flip one field off this row.
 * When to use: `shouldApplyAutomaticBattleFrame` cases.
 * Expected outcome: The gate function returns true for this object.
 * Exceptions: None.
 */
function openBattleGate(): AutomaticBattleFrameGate {
  return {
    observing: true,
    autoAdvance: true,
    inBattle: true,
    playbackRunning: false,
    tacticalTurnNumber: 2,
    framedBeatNumber: null,
  };
}

test('a wide unit box gains three hexes of longitude and keeps its latitude', () => {
  const framed = unitFrameBox({
    unit: { south: 0, west: 0, north: 1, east: 10 },
    latStep: 1,
    lngStep: 1,
    panelWidthPx: 100,
    panelHeightPx: 100,
    limit: OPEN_LIMIT,
  });
  assert.deepEqual(framed, { south: 0, west: -1.5, north: 1, east: 11.5 });
});

test('a tall unit box gains three hexes of latitude and keeps its longitude', () => {
  const framed = unitFrameBox({
    unit: { south: 0, west: 0, north: 10, east: 1 },
    latStep: 1,
    lngStep: 1,
    panelWidthPx: 100,
    panelHeightPx: 100,
    limit: OPEN_LIMIT,
  });
  assert.deepEqual(framed, { south: -1.5, west: 0, north: 11.5, east: 1 });
});

test('a square degree box in a square panel pads the axis Mercator leaves tight', () => {
  const framed = unitFrameBox({
    unit: { south: 0, west: 0, north: 2, east: 2 },
    latStep: 1,
    lngStep: 1,
    panelWidthPx: 200,
    panelHeightPx: 200,
    limit: OPEN_LIMIT,
  });
  assert.ok(framed);
  assert.equal(framed.west, 0);
  assert.equal(framed.east, 2);
  assert.equal(framed.south, -1.5);
  assert.equal(framed.north, 3.5);
});

test('a unit box as wide as the panel pads longitude', () => {
  const framed = unitFrameBox({
    unit: { south: 0, west: 0, north: 2, east: 2.01 },
    latStep: 1,
    lngStep: 1,
    panelWidthPx: 200,
    panelHeightPx: 200,
    limit: OPEN_LIMIT,
  });
  assert.ok(framed);
  assert.equal(framed.south, 0);
  assert.equal(framed.north, 2);
  assert.equal(framed.west, -1.5);
  assert.equal(framed.east, 3.51);
});

test('a longitude pad is cut at the pan limit and the latitude stays put', () => {
  const framed = unitFrameBox({
    unit: { south: 0, west: 0, north: 1, east: 2 },
    latStep: 1,
    lngStep: 1,
    panelWidthPx: 100,
    panelHeightPx: 100,
    limit: { south: -10, west: 0, north: 10, east: 3 },
  });
  assert.deepEqual(framed, { south: 0, west: 0, north: 1, east: 3 });
});

test('a panel with no width does not return a frame', () => {
  const framed = unitFrameBox({
    unit: { south: 0, west: 0, north: 1, east: 2 },
    latStep: 1,
    lngStep: 1,
    panelWidthPx: 0,
    panelHeightPx: 100,
    limit: OPEN_LIMIT,
  });
  assert.equal(framed, null);
});

test('an index that is not a cell has no hex step', () => {
  assert.equal(hexCenterSteps('not-a-cell'), null);
});

test('hex center steps at the origin are finite and shorter than a hemisphere', () => {
  const steps = hexCenterSteps(latLngToCell(0, 0, 1));
  assert.ok(steps);
  assert.ok(steps.latStep > 0);
  assert.ok(steps.lngStep > 0);
  assert.ok(steps.lngStep < 180);
});

test('an automatic planning turn that has not been framed is framed', () => {
  assert.equal(shouldApplyAutomaticUnitFrame(openStrategicGate()), true);
});

test('a human match, a manual watch, playback, a battle, and a framed turn stay put', () => {
  assert.equal(shouldApplyAutomaticUnitFrame({ ...openStrategicGate(), observing: false }), false);
  assert.equal(shouldApplyAutomaticUnitFrame({ ...openStrategicGate(), autoAdvance: false }), false);
  assert.equal(shouldApplyAutomaticUnitFrame({ ...openStrategicGate(), playbackRunning: true }), false);
  assert.equal(shouldApplyAutomaticUnitFrame({ ...openStrategicGate(), inBattle: true }), false);
  assert.equal(shouldApplyAutomaticUnitFrame({ ...openStrategicGate(), framedTurnNumber: 4 }), false);
});

test('an automatic battle beat that has not been framed is framed', () => {
  assert.equal(shouldApplyAutomaticBattleFrame(openBattleGate()), true);
});

test('a manual battle, playback, and a beat already framed stay on the battle footprint', () => {
  assert.equal(shouldApplyAutomaticBattleFrame({ ...openBattleGate(), autoAdvance: false }), false);
  assert.equal(shouldApplyAutomaticBattleFrame({ ...openBattleGate(), playbackRunning: true }), false);
  assert.equal(shouldApplyAutomaticBattleFrame({ ...openBattleGate(), framedBeatNumber: 2 }), false);
});
