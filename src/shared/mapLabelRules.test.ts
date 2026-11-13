/**
 * Contracts for which view place names and borders follow.
 * Run: `node dist/shared/mapLabelRules.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { annotationViewIsDetail, labelKindOpacity, mapLabelStyleForView, visibleWaterLabelKinds, WATER_LABEL_OPACITY } from './mapLabelRules';

/**
 * Reads one renderer source file.
 *
 * Purpose: The wiring test checks that names and borders share one reader.
 * When to use: The source contract below.
 * Expected outcome: The file's text. Throws when the file is missing.
 * Exceptions: The platform's file-read errors.
 */
function rendererSource(...segments: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', 'renderer', ...segments), 'utf8');
}

test('an open overlay uses the preview zoom and never reads the match', () => {
  const readMatchDetailView = (): boolean => {
    throw new Error('the match flag must not be read while the overlay is open');
  };
  assert.equal(annotationViewIsDetail({ overlayOpen: true, previewAtDetailZoom: false, readMatchDetailView }), false);
  assert.equal(annotationViewIsDetail({ overlayOpen: true, previewAtDetailZoom: true, readMatchDetailView }), true);
});

test('a closed overlay follows the match', () => {
  assert.equal(annotationViewIsDetail({ overlayOpen: false, previewAtDetailZoom: true, readMatchDetailView: () => false }), false);
  assert.equal(annotationViewIsDetail({ overlayOpen: false, previewAtDetailZoom: false, readMatchDetailView: () => true }), true);
});

test('names and borders read the single annotation view', () => {
  const labels = rendererSource('map', 'mapLabelLayer.ts');
  assert.match(labels, /mapAnnotationsUseDetailView\(\)/);
  assert.doesNotMatch(labels, /shouldRenderTacticalHexes/);
  assert.match(rendererSource('map', 'initCore.ts'), /setAdminBorderTacticalReader\(mapAnnotationsUseDetailView\)/);
});

/**
 * Confirms a broad name is half again as large only beside the smaller names.
 *
 * Purpose: A continent grows when countries are drawn with it, and a country grows when states are drawn with it.
 * When to use: As the contract test for `mapLabelStyleForView`.
 * Expected outcome: A continent is 18 below the country zoom and in a tactical view, and 27 from zoom 4 on the main map.
 *   A country is 13 on the main map and 19.5 in a tactical view. A state is 11. Weight, spacing, halo, and capitals stay put.
 * Exceptions: Assertion failures name the kind whose size or style moved.
 */
test('a broad name is drawn half again as large beside the smaller names', () => {
  assert.equal(mapLabelStyleForView('continent', 3, false).sizePx, 18);
  assert.equal(mapLabelStyleForView('continent', 4, false).sizePx, 27);
  assert.equal(mapLabelStyleForView('continent', 7, true).sizePx, 18);
  assert.equal(mapLabelStyleForView('country', 5.25, false).sizePx, 13);
  assert.equal(mapLabelStyleForView('country', 7, false).sizePx, 13);
  assert.equal(mapLabelStyleForView('country', 7, true).sizePx, 19.5);
  assert.equal(mapLabelStyleForView('state', 7, true).sizePx, 11);
  const plainCountry = mapLabelStyleForView('country', 5.25, false);
  const largeCountry = mapLabelStyleForView('country', 7, true);
  assert.equal(largeCountry.weight, plainCountry.weight);
  assert.equal(largeCountry.letterSpacingEm, plainCountry.letterSpacingEm);
  assert.equal(largeCountry.haloWidthPx, plainCountry.haloWidthPx);
  assert.equal(largeCountry.uppercase, plainCountry.uppercase);
  const plainContinent = mapLabelStyleForView('continent', 3, false);
  const largeContinent = mapLabelStyleForView('continent', 4, false);
  assert.equal(largeContinent.weight, plainContinent.weight);
  assert.equal(largeContinent.letterSpacingEm, plainContinent.letterSpacingEm);
  assert.equal(largeContinent.haloWidthPx, plainContinent.haloWidthPx);
  assert.equal(largeContinent.uppercase, plainContinent.uppercase);
});

/**
 * Confirms which water kinds a view draws.
 *
 * Purpose: Water names follow the same zoom tiers as land names.
 * When to use: As the contract test for `visibleWaterLabelKinds`.
 * Expected outcome: Zoom 3 is oceans. Zoom 5 is oceans and major water. A tactical view is major and minor water.
 * Exceptions: Assertion failures name the band that moved.
 */
test('water kinds follow zoom and the tactical view', () => {
  assert.deepEqual(visibleWaterLabelKinds(3, false), ['ocean']);
  assert.deepEqual(visibleWaterLabelKinds(5, false), ['ocean', 'major_water']);
  assert.deepEqual(visibleWaterLabelKinds(3, true), ['major_water', 'minor_water']);
});

/**
 * Confirms water names are italic and use the water type sizes.
 *
 * Purpose: Water rows stay smaller than the land rows they sit beside, and an ocean stays in capitals.
 * When to use: As the contract test for the water rows of `mapLabelStyleForView`.
 * Expected outcome: An ocean is italic, 12 px, and upper case in every view. Major water is 9.75 px. Minor water is 8.25 px.
 * Exceptions: Assertion failures name the field that moved.
 */
test('water names use the water type sizes', () => {
  const ocean = mapLabelStyleForView('ocean', 3, false);
  assert.equal(ocean.fontStyle, 'italic');
  assert.equal(ocean.sizePx, 12);
  assert.equal(ocean.uppercase, true);
  assert.equal(mapLabelStyleForView('ocean', 5, false).sizePx, 12);
  assert.equal(mapLabelStyleForView('ocean', 7, true).sizePx, 12);
  assert.equal(mapLabelStyleForView('major_water', 5, false).sizePx, 9.75);
  assert.equal(mapLabelStyleForView('minor_water', 7, true).sizePx, 8.25);
  assert.equal(mapLabelStyleForView('major_water', 5, false).fontStyle, 'italic');
  assert.equal(mapLabelStyleForView('minor_water', 7, true).fontStyle, 'italic');
});

/**
 * Confirms water names stay at full strength.
 *
 * Purpose: The ink color does the quieting, so opacity does not.
 * When to use: As the contract test for a water kind in `labelKindOpacity`.
 * Expected outcome: `WATER_LABEL_OPACITY` for minor water in a tactical view.
 * Exceptions: Assertion failures when the opacity is faded.
 */
test('a water name is painted at full strength', () => {
  assert.equal(labelKindOpacity('minor_water', 7, true), WATER_LABEL_OPACITY);
});
