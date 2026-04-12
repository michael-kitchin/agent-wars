/**
 * Tests for tactical rules adapter helpers. Run with: node dist/main/tacticalBattle/tacticalRulesAdapter.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import { tacticalMarchWithinRes4GridSteps } from './tacticalRulesAdapter';

test('tacticalMarchWithinRes4GridSteps allows same cell within limit zero', () => {
  const cell = latLngToCell(10, 20, 4);
  assert.equal(tacticalMarchWithinRes4GridSteps(cell, cell, 0), true);
});

test('tacticalMarchWithinRes4GridSteps matches grid distance for a res4 neighbor', () => {
  const center = latLngToCell(10, 20, 4);
  const ring = gridDisk(center, 1);
  const neighbor = [...ring].find((h) => h !== center);
  assert.ok(neighbor, 'expected a distinct res4 neighbor');
  assert.equal(tacticalMarchWithinRes4GridSteps(center, neighbor, 0), false);
  assert.equal(tacticalMarchWithinRes4GridSteps(center, neighbor, 1), true);
});
