/**
 * Contracts for which names and borders a view draws.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { adminBorderGroupsForView } from './adminBorderRules';
import { visibleLabelKinds } from './mapLabelRules';

/**
 * Confirms the three visibility bands.
 *
 * Purpose: A world view, a country view, and a tactical view each have a fixed set of names.
 * When to use: As the contract test for `visibleLabelKinds`.
 * Expected outcome: Zoom 3 is continents. Zoom 4 adds countries and keeps continents. A tactical view is countries and states.
 * Exceptions: Assertion failures name the band that moved.
 */
test('label kinds follow zoom and the tactical view', () => {
  assert.deepEqual(visibleLabelKinds(3, false), ['continent']);
  assert.deepEqual(visibleLabelKinds(4, false), ['continent', 'country']);
  assert.deepEqual(visibleLabelKinds(2, true), ['country', 'state']);
});

/**
 * Confirms borders follow the name bands.
 *
 * Purpose: A border must appear exactly when its names do.
 * When to use: As the contract test for `adminBorderGroupsForView`.
 * Expected outcome: No borders below the country zoom. Country groups from that zoom, including while continent names are also drawn. All four groups in a tactical view.
 * Exceptions: Assertion failures name the band that moved.
 */
test('borders follow the label kinds', () => {
  assert.deepEqual(adminBorderGroupsForView(3, false), []);
  assert.deepEqual(adminBorderGroupsForView(5, false), ['country', 'country_disputed']);
  assert.deepEqual(adminBorderGroupsForView(3, true), [
    'country',
    'country_disputed',
    'state',
    'state_disputed',
  ]);
});

/**
 * Confirms the border layer asks the shared rule.
 *
 * Purpose: A second copy of the zoom cutoff would drift from the names.
 * When to use: After the border layer is edited.
 * Expected outcome: The layer names `adminBorderGroupsForView` and does not name the country zoom constant.
 * Exceptions: Assertion failures when the layer grows its own cutoff.
 */
test('border layers ask the shared group list', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'map', 'adminBorderLayers.ts'),
    'utf8',
  );
  assert.match(source, /adminBorderGroupsForView/);
  assert.doesNotMatch(source, /COUNTRY_LABEL_MIN_ZOOM/);
});
