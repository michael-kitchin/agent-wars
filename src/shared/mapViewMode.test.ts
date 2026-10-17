import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_CONTROL_BORDERS_SHOWN,
  DEFAULT_PRODUCTION_DETAIL_CHOSEN,
  DEFAULT_TECH_VIEW_CHOSEN,
  DEFAULT_WEATHER_ICONS_SHOWN,
  isMapLayerShown,
} from './mapViewMode';

/**
 * The world map with the layer off and no key held.
 *
 * Purpose: Each test changes only the inputs it is about.
 * When to use: Spread into each test's input.
 * Expected outcome: An input for which the layer is off.
 * Exceptions: None.
 */
const WORLD_MAP: Parameters<typeof isMapLayerShown>[0] = {
  tKeyHeld: false,
  layerChosen: false,
  inBattle: false,
  newGameOverlayOpen: false,
};

test('a session starts with weather icons and control borders on, and tech icons and production detail off', () => {
  assert.equal(DEFAULT_WEATHER_ICONS_SHOWN, true);
  assert.equal(DEFAULT_TECH_VIEW_CHOSEN, false);
  assert.equal(DEFAULT_CONTROL_BORDERS_SHOWN, true);
  assert.equal(DEFAULT_PRODUCTION_DETAIL_CHOSEN, false);
});

test('with the layer off, it shows only while T is held', () => {
  assert.equal(isMapLayerShown(WORLD_MAP), false);
  assert.equal(isMapLayerShown({ ...WORLD_MAP, tKeyHeld: true }), true);
});

test('a chosen layer shows on the world map', () => {
  assert.equal(isMapLayerShown({ ...WORLD_MAP, layerChosen: true }), true);
});

test('a chosen layer does not apply in a battle or under the new-game overlay', () => {
  assert.equal(isMapLayerShown({ ...WORLD_MAP, layerChosen: true, inBattle: true }), false);
  assert.equal(isMapLayerShown({ ...WORLD_MAP, layerChosen: true, newGameOverlayOpen: true }), false);
});

test('holding T shows the layer in a battle and under the overlay, whether or not it is chosen', () => {
  assert.equal(isMapLayerShown({ ...WORLD_MAP, tKeyHeld: true, inBattle: true }), true);
  assert.equal(isMapLayerShown({ ...WORLD_MAP, tKeyHeld: true, layerChosen: true, newGameOverlayOpen: true }), true);
});
