/**
 * Contracts for the four map themes and the land-color math the tile filter must match.
 * Run: `node dist/shared/mapThemes.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FLAT_LAND_GRAY,
  MAP_THEMES,
  landTransferFunctions,
  mapThemeById,
  themedLandRgb,
} from './mapThemes';

describe('map themes', () => {
  it('lists the four themes in display order', () => {
    assert.deepEqual(
      MAP_THEMES.map((theme) => theme.id),
      ['standard', 'topographic', 'nautical', 'night'],
    );
    assert.deepEqual(
      MAP_THEMES.map((theme) => theme.label),
      ['Standard', 'Topographic', 'Nautical', 'Night'],
    );
  });

  it('falls back to standard for an unknown id', () => {
    assert.equal(mapThemeById('nope').id, 'standard');
    assert.equal(mapThemeById('').id, 'standard');
  });

  it('keeps flat land near white on standard and dark on night', () => {
    for (const channel of themedLandRgb(mapThemeById('standard'), FLAT_LAND_GRAY)) {
      assert.ok(channel >= 235, `standard flat land channel ${channel} is below 235`);
    }
    for (const channel of themedLandRgb(mapThemeById('night'), FLAT_LAND_GRAY)) {
      assert.ok(channel <= 100, `night flat land channel ${channel} is above 100`);
    }
  });

  it('maps stored gray 0 to the theme shadow because contrast clamps it', () => {
    for (const theme of MAP_THEMES) {
      assert.deepEqual(themedLandRgb(theme, 0), [...theme.landShadowRgb]);
    }
  });

  it('uses the standard red transfer slope and intercept', () => {
    const red = landTransferFunctions(mapThemeById('standard')).r;
    assert.ok(Math.abs(red.slope - 159 / 255) < 1e-9);
    assert.ok(Math.abs(red.intercept - 92 / 255) < 1e-9);
  });

  it('gives the wargame hex palette to night only', () => {
    for (const theme of MAP_THEMES) {
      assert.equal(theme.hexPaletteId, theme.id === 'night' ? 'wargame' : 'default');
    }
  });

  it('keeps coastline, country border, and state border colors distinct', () => {
    for (const theme of MAP_THEMES) {
      const colors = new Set([theme.coastlineColor, theme.countryBorderColor, theme.stateBorderColor]);
      assert.equal(colors.size, 3, theme.id);
    }
  });
});
