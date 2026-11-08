/**
 * Contracts for hiding a state name that matches a city on screen.
 * Run: `node dist/shared/mapLabelCityNames.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  cityCenterIsInView,
  cityNamesInOverlayLabel,
  normalizedPlaceName,
  withoutStatesNamedForCities,
} from './mapLabelCityNames';

test('names match across accents and case only', () => {
  assert.equal(normalizedPlaceName('Québec'), normalizedPlaceName('Quebec'));
  assert.equal(normalizedPlaceName('Bogotá'), normalizedPlaceName('Bogota'));
  assert.equal(normalizedPlaceName("M'Sila"), normalizedPlaceName("M'sila"));
  assert.notEqual(normalizedPlaceName('Aichi Prefecture'), normalizedPlaceName('Aichi'));
});

test('a tied label counts each city and a slash inside a name does not split', () => {
  assert.deepEqual(cityNamesInOverlayLabel('Alpha / Beta'), ['Alpha', 'Beta']);
  assert.deepEqual(cityNamesInOverlayLabel('Londonderry/Derry'), ['Londonderry/Derry']);
});

test('a center outside the view does not count', () => {
  const view = { width: 100, height: 50 };
  assert.equal(cityCenterIsInView({ x: 0, y: 50 }, view), true);
  assert.equal(cityCenterIsInView({ x: -1, y: 25 }, view), false);
  assert.equal(cityCenterIsInView({ x: 50, y: 51 }, view), false);
});

test('only a state name is removed', () => {
  const features = [
    { kind: 'state', name: 'Oaxaca' },
    { kind: 'state', name: 'Jalisco' },
    { kind: 'country', name: 'Oaxaca' },
    { kind: 'continent', name: 'Oaxaca' },
  ] as const;
  const kept = withoutStatesNamedForCities(features, new Set([normalizedPlaceName('OAXACA')]));
  assert.deepEqual(kept, [features[1], features[2], features[3]]);
});

test('an empty city set keeps every feature', () => {
  const features = [{ kind: 'state', name: 'Oaxaca' }] as const;
  assert.deepEqual(withoutStatesNamedForCities(features, new Set()), [features[0]]);
});

/**
 * Reads one renderer source file.
 *
 * Purpose: The wiring test checks that each frame clears the city set and the label pass reads it.
 * When to use: The source contract below.
 * Expected outcome: The file's text. Throws when the file is missing.
 * Exceptions: The platform's file-read errors.
 */
function rendererSource(...segments: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', 'renderer', ...segments), 'utf8');
}

test('each frame starts with no cities and the label pass reads the set', () => {
  const scene = rendererSource('rendering', 'gameScene.ts');
  const paintBody = scene.slice(scene.indexOf('function paintMapFrame'));
  assert.ok(paintBody.indexOf('clearVisibleCityNames()') >= 0);
  assert.ok(paintBody.indexOf('clearVisibleCityNames()') < paintBody.indexOf('if (overlayOpen)'));
  assert.match(rendererSource('map', 'mapLabelLayer.ts'), /withoutStatesNamedForCities\(/);
  const cityPass = rendererSource('rendering', 'tacticalCityOverlays.ts');
  const battleLoop = cityPass.slice(cityPass.indexOf('if (tactical)'), cityPass.indexOf('for (const parent of'));
  assert.match(battleLoop, /noteCityWhenCenterIsInView\(/);
  assert.doesNotMatch(battleLoop, /exploredHexes/);
  assert.match(cityPass, /if \(exploredHexes\.has\(parent\.h3Index\)\) noteCityWhenCenterIsInView\(/);
});
