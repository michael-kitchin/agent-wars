/**
 * Guards the offline hillshade catalog and the terrain-style basemap ids.
 * Run with: node dist/main/basemapRasterCatalog.test.js
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import { getFunctionSource } from './testSupport/rendererSourceAssertions';

/**
 * Reads a renderer or shared TypeScript source file from the repo root.
 *
 * Purpose: Catalog contracts are string literals in renderer modules that Node tests cannot import.
 * When to use: Each assertion in this file that scans basemap URLs, style presets, or Leaflet init.
 * Expected outcome: UTF-8 file contents.
 * Exceptions: Throws if the path is missing.
 */
function readSrc(...parts: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', ...parts), 'utf8');
}

test('raster catalog is the offline hillshade and has no remote tile hosts', () => {
  const providerSource = readSrc('renderer', 'map', 'basemapProvider.ts');
  assert.ok(!providerSource.includes('cartocdn.com'), 'basemap catalog must not request CARTO CDN tiles');
  assert.ok(!providerSource.includes('arcgisonline.com'));
  assert.ok(!providerSource.includes('openstreetmap.org'));
  const catalogIds = [...providerSource.matchAll(/^\s*id:\s*'([^']+)'/gm)].map((m) => m[1]);
  assert.deepEqual(catalogIds, ['offline_hillshade']);
  assert.ok(providerSource.includes('agentwars-basemap://tiles/'), 'offline tiles use the app scheme');
});

test('Leaflet init default provider id is the offline hillshade', () => {
  const mapSource = readSrc('renderer', 'map', 'worldLeafletMap.ts');
  const initFn = getFunctionSource(mapSource, 'initWorldLeafletMaps');
  assert.ok(
    initFn.includes("initialBasemapProviderId ?? 'offline_hillshade'"),
    'init must default to the offline hillshade'
  );
  assert.ok(!initFn.includes('carto_'));
  assert.ok(initFn.includes('agentwars-basemap:') || readSrc('renderer', 'map', 'basemapLayer.ts').includes('agentwars-basemap:'));
});

test('transparent ocean shows the water pane and tiles are not added to the background', () => {
  const layerSource = readSrc('renderer', 'map', 'basemapLayer.ts');
  const chrome = fs.readFileSync(path.resolve(process.cwd(), 'static', 'shellChrome.css'), 'utf8');
  assert.ok(layerSource.includes('container.insertBefore(pane, container.firstChild)'), 'the water pane is placed on the map container');
  assert.ok(layerSource.includes('theme.waterColor'));
  assert.ok(chrome.includes('mix-blend-mode: normal'), 'hillshade tiles must not use plus-lighter');
  assert.match(
    chrome,
    /img\.leaflet-tile,\s*#minimap\.leaflet-container img\.leaflet-tile \{[^}]*filter: contrast\(1\.4\)/,
    'land tile images use contrast(1.4)'
  );
});

test('elevation tile edges are drawn over the hillshade', () => {
  const layerSource = readSrc('renderer', 'map', 'basemapLayer.ts');
  assert.ok(layerSource.includes('const SOURCE_MERIDIANS = [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180]'));
  assert.ok(layerSource.includes('const SOURCE_PARALLELS = [-70, -50, -30, -10, 0, 10, 30, 50, 70]'));
  assert.ok(layerSource.includes('Math.abs(longitude) === 180'), 'the antimeridian stays solid');
  assert.ok(layerSource.includes("dashArray = GRID_DASH"), 'the other edges are dashed');
  assert.ok(layerSource.includes('basemapGrid'));
  const themeFn = getFunctionSource(layerSource, 'applyBasemapTheme');
  assert.ok(themeFn.includes('gridLineColor'), 'the theme recolors the elevation-tile lines');
  const bindFn = getFunctionSource(layerSource, 'bindOfflineBasemap');
  assert.ok(bindFn.includes('ensureSourceGrid(leaflet, main)'));
  assert.ok(!bindFn.includes('ensureSourceGrid(leaflet, mini)'), 'the minimap does not draw elevation-tile lines');
});

test('init applies the active map theme', () => {
  const initCoreSource = readSrc('renderer', 'map', 'initCore.ts');
  const mapSource = readSrc('renderer', 'map', 'worldLeafletMap.ts');
  const stylesSource = readSrc('renderer', 'rendering', 'terrainVisualStyles.ts');
  assert.ok(initCoreSource.includes('applyActiveMapTheme()'));
  assert.ok(!mapSource.includes('style.filter ='));
  const strokeFn = getFunctionSource(stylesSource, 'getActiveHexStrokeStyle');
  assert.ok(strokeFn.includes('hexStrokeStyleFor'));
});
