import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_TECH_VIEW_CHOSEN, DEFAULT_WEATHER_ICONS_SHOWN, isTerrainInspectionShown } from './mapViewMode';

/**
 * The world map with Tech off and no key held.
 *
 * Purpose: Each test changes only the inputs it is about.
 * When to use: Spread into each test's input.
 * Expected outcome: An input for which the inspection view is off.
 * Exceptions: None.
 */
const WORLD_MAP: Parameters<typeof isTerrainInspectionShown>[0] = {
  tKeyHeld: false,
  techViewChosen: false,
  inBattle: false,
  newGameOverlayOpen: false,
};

test('a session starts with weather icons shown and the Tech view off', () => {
  assert.equal(DEFAULT_WEATHER_ICONS_SHOWN, true);
  assert.equal(DEFAULT_TECH_VIEW_CHOSEN, false);
});

test('with Tech off, the inspection view shows only while T is held', () => {
  assert.equal(isTerrainInspectionShown(WORLD_MAP), false);
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, tKeyHeld: true }), true);
});

test('the Tech view shows the inspection view on the world map', () => {
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, techViewChosen: true }), true);
});

test('the Tech view does not apply in a battle or under the new-game overlay', () => {
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, techViewChosen: true, inBattle: true }), false);
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, techViewChosen: true, newGameOverlayOpen: true }), false);
});

test('holding T shows the inspection view in a battle and under the overlay, whatever Tech is', () => {
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, tKeyHeld: true, inBattle: true }), true);
  assert.equal(isTerrainInspectionShown({ ...WORLD_MAP, tKeyHeld: true, techViewChosen: true, newGameOverlayOpen: true }), true);
});
