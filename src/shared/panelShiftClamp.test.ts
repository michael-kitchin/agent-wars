import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampPanelShift } from './panelShiftClamp';

test('a shift that keeps the box inside is unchanged', () => {
  assert.equal(clampPanelShift(30, 100, 50, 0, 400), 30);
});

test('a shift past the near edge stops at the near edge', () => {
  assert.equal(clampPanelShift(-500, 100, 50, 0, 400), -100);
});

test('a shift past the far edge stops at the far edge', () => {
  assert.equal(clampPanelShift(500, 100, 50, 0, 400), 250);
});

test('a box larger than the area keeps its near edge on the area', () => {
  assert.equal(clampPanelShift(40, 100, 600, 0, 400), -100);
  assert.equal(clampPanelShift(-300, 100, 600, 0, 400), -100);
});

test('an area that starts away from zero is respected', () => {
  assert.equal(clampPanelShift(-999, 300, 50, 200, 500), -100);
});
