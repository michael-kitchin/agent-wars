/**
 * Guards the keyless Esri hillshade raster catalog and terrain-style basemap ids.
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

test('raster catalog is keyless Esri hillshade then OSM, with no CARTO hosts', () => {
  const providerSource = readSrc('renderer', 'map', 'basemapProvider.ts');
  assert.ok(
    !providerSource.includes('cartocdn.com'),
    'basemap catalog must not request CARTO CDN tiles (HTTP 200 watermarks)'
  );
  const catalogIds = [...providerSource.matchAll(/^\s*id:\s*'([^']+)'/gm)].map((m) => m[1]);
  assert.deepEqual(catalogIds, ['esri_world_shaded_relief', 'osm_mapnik']);
  assert.ok(
    providerSource.includes('World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}'),
    'Esri hillshade must keep {z}/{y}/{x} tile order'
  );
});

test('every terrain style preset assigns Esri hillshade and no CARTO provider ids', () => {
  const stylesSource = readSrc('renderer', 'rendering', 'terrainVisualStyles.ts');
  const assignedIds = [...stylesSource.matchAll(/^\s*basemapId:\s*'([^']+)'/gm)].map((m) => m[1]);
  assert.equal(assignedIds.length, 4);
  for (const id of assignedIds) {
    assert.equal(id, 'esri_world_shaded_relief');
  }
  assert.equal(stylesSource.includes("basemapId: 'carto_"), false);
});

test('Leaflet init default provider id is Esri hillshade', () => {
  const mapSource = readSrc('renderer', 'map', 'worldLeafletMap.ts');
  const initFn = getFunctionSource(mapSource, 'initWorldLeafletMaps');
  assert.ok(
    initFn.includes("initialBasemapProviderId ?? 'esri_world_shaded_relief'"),
    'init must not default to a CARTO provider id'
  );
  assert.ok(!initFn.includes('carto_'));
});

test('style switches skip remount when the provider is unchanged and filter both tile panes', () => {
  const mapSource = readSrc('renderer', 'map', 'worldLeafletMap.ts');
  const setProviderFn = getFunctionSource(mapSource, 'setMainBasemapByProviderId');
  const setFilterFn = getFunctionSource(mapSource, 'setMainBasemapFilter');
  const initCoreSource = readSrc('renderer', 'map', 'initCore.ts');
  assert.ok(
    setProviderFn.includes('basemapNeedsRemountForMaps'),
    'provider changes must remount when either main or mini is on a different host'
  );
  assert.ok(setFilterFn.includes('miniMap'), 'Wargame invert must apply to the minimap tile pane');
  assert.ok(
    !setFilterFn.includes('mapEl.style.filter = filter'),
    'must not invert the map container (hex overlays and units)'
  );
  assert.ok(
    initCoreSource.includes('basemapCssFilterForStyle(getActiveTerrainStyleId())'),
    'init and style changes must apply the style filter from shared logic'
  );
});
