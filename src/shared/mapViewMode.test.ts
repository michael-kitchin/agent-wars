import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_MAP_VIEW_MODE, isTerrainInspectionShown } from './mapViewMode';

/**
 * The world map with the normal view and no key held.
 *
 * Purpose: Each test changes only the inputs it is about.
 * When to use: Spread into each test's input.
 * Expected outcome: An input for which the inspection view is off.
 * Exceptions: None.
 */
const WORLD_MAP: Parameters<typeof isTerrainInspectionShown>[0] = {
  tKeyHeld: false,
  mapViewMode: 'weather',
  inBattle: false,
  newGameOverlayOpen: false,
};

test('a session starts on the Weather view', () => {
  assert.equal(DEFAULT_MAP_VIEW_MODE, 'weather');
});

test('the Weather view shows the inspection view only while T is held', () => {
  assert.equal(isTerrainInspectionShown(WORLD_MAP), false);
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, tKeyHeld: true }), true);
});

test('the Tech view shows the inspection view on the world map', () => {
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, mapViewMode: 'tech' }), true);
});

test('the Tech view does not apply in a battle or under the new-game overlay', () => {
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, mapViewMode: 'tech', inBattle: true }), false);
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, mapViewMode: 'tech', newGameOverlayOpen: true }), false);
});

test('holding T shows the inspection view in a battle and under the overlay, whatever the view', () => {
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, tKeyHeld: true, inBattle: true }), true);
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, tKeyHeld: true, mapViewMode: 'tech', newGameOverlayOpen: true }), true);
});
