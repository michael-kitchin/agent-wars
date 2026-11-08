/**
 * Contracts for which view place names and borders follow.
 * Run: `node dist/shared/mapLabelRules.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { annotationViewIsDetail } from './mapLabelRules';

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
