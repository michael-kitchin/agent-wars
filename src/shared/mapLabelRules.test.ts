/**
 * Contracts for which view place names and borders follow.
 * Run: `node dist/shared/mapLabelRules.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { annotationViewIsDetail, mapLabelStyleForView } from './mapLabelRules';

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
