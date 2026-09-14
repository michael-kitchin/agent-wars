/**
 * Contracts for shared hillshade remount skip and Wargame tile-pane filter strings.
 * Run: `node dist/shared/basemapStyleLogic.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ATLAS_BASEMAP_CSS_FILTER,
  SCIENTIFIC_BASEMAP_CSS_FILTER,
  WARGAME_BASEMAP_CSS_FILTER,
  basemapCssFilterForStyle,
  basemapNeedsRemount,
  basemapNeedsRemountForMaps,
} from './basemapStyleLogic';

describe('basemapNeedsRemount', () => {
  it('remounts when nothing is mounted yet', () => {
    assert.equal(basemapNeedsRemount(null, 'esri_world_shaded_relief'), true);
  });

  it('skips remount when the requested provider is already mounted', () => {
    assert.equal(basemapNeedsRemount('esri_world_shaded_relief', 'esri_world_shaded_relief'), false);
  });

  it('remounts when the mounted provider differs from the request', () => {
    assert.equal(basemapNeedsRemount('osm_mapnik', 'esri_world_shaded_relief'), true);
  });

  it('remounts a map pair when either map is on a different provider', () => {
    assert.equal(
      basemapNeedsRemountForMaps('esri_world_shaded_relief', 'esri_world_shaded_relief', 'esri_world_shaded_relief'),
      false
    );
    assert.equal(
      basemapNeedsRemountForMaps('esri_world_shaded_relief', 'osm_mapnik', 'esri_world_shaded_relief'),
      true
    );
    assert.equal(basemapNeedsRemountForMaps(null, 'esri_world_shaded_relief', 'esri_world_shaded_relief'), true);
  });
});

describe('basemapCssFilterForStyle', () => {
  it('uses a distinct locked tile-pane filter per named style', () => {
    assert.equal(WARGAME_BASEMAP_CSS_FILTER, 'invert(1) hue-rotate(180deg)');
    assert.equal(ATLAS_BASEMAP_CSS_FILTER, 'saturate(0.78) contrast(1.2) brightness(1.03)');
    assert.equal(SCIENTIFIC_BASEMAP_CSS_FILTER, 'grayscale(1) contrast(1.18) brightness(1.08)');
    assert.equal(basemapCssFilterForStyle('wargame'), WARGAME_BASEMAP_CSS_FILTER);
    assert.equal(basemapCssFilterForStyle('atlas'), ATLAS_BASEMAP_CSS_FILTER);
    assert.equal(basemapCssFilterForStyle('scientific'), SCIENTIFIC_BASEMAP_CSS_FILTER);
  });

  it('returns an empty filter for default and unknown style ids', () => {
    assert.equal(basemapCssFilterForStyle('default'), '');
    assert.equal(basemapCssFilterForStyle(''), '');
    assert.equal(basemapCssFilterForStyle('unknown'), '');
  });
});
