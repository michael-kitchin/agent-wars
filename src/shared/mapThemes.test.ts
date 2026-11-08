/**
 * Contracts for the four map themes and the land-color math the tile filter must match.
 * Run: `node dist/shared/mapThemes.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  CONTINENT_BESIDE_COUNTRY_OPACITY,
  COUNTRY_BESIDE_STATE_OPACITY,
  COUNTRY_LABEL_OPACITY,
  STATE_LABEL_OPACITY,
} from './mapLabelRules';
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

  it('dims night roads, lightens night rails, and leaves the other themes alone', () => {
    assert.deepEqual(mapThemeById('night').transportLineColors, {
      roadCenter: '#8b95a3',
      roadOutline: '#0a0e14',
      railCenter: '#dfe6ee',
      railHalo: '#0a0e14',
    });
    for (const id of ['standard', 'topographic', 'nautical']) {
      assert.deepEqual(mapThemeById(id).transportLineColors, {
        roadCenter: '#ffffff',
        roadOutline: '#000000',
        railCenter: '#000000',
        railHalo: '#ffffff',
      });
    }
  });

  it('keeps the coastline distinct from the shared border ink', () => {
    for (const theme of MAP_THEMES) {
      assert.notEqual(theme.coastlineColor, theme.countryBorderColor, theme.id);
      assert.equal(theme.stateBorderColor, theme.countryBorderColor, theme.id);
      assert.match(theme.countryBorderColor, /^#[0-9a-f]{6}$/, theme.id);
    }
  });

  it('takes every road and rail color from the theme', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src', 'renderer', 'map', 'tacticalTransportVectorLayer.ts'),
      'utf8',
    );
    assert.doesNotMatch(source, /'#(?:ffffff|000000)'/);
    assert.match(source, /transportLineColors/);
  });

  it('paints the local name stronger than the broader name beside it', () => {
    for (const theme of MAP_THEMES) {
      assert.equal(theme.labelColors.continent, theme.labelColors.country, theme.id);
      assert.equal(theme.labelColors.state, theme.labelColors.country, theme.id);
      const land = themedLandRgb(theme, FLAT_LAND_GRAY);
      const bands = [
        [theme.labelColors.country, COUNTRY_LABEL_OPACITY, theme.labelColors.continent, CONTINENT_BESIDE_COUNTRY_OPACITY],
        [theme.labelColors.state, STATE_LABEL_OPACITY, theme.labelColors.country, COUNTRY_BESIDE_STATE_OPACITY],
      ] as const;
      for (const [localInk, localOpacity, broaderInk, broaderOpacity] of bands) {
        const local = relativeLuminance(paintedFill(localInk, localOpacity, land));
        const broader = relativeLuminance(paintedFill(broaderInk, broaderOpacity, land));
        if (theme.id === 'night') {
          assert.ok(local > broader, `${theme.id} local ${local} is not brighter than broader ${broader}`);
        } else {
          assert.ok(local < broader, `${theme.id} local ${local} is not darker than broader ${broader}`);
        }
      }
    }
  });
});

/**
 * Painted fill of one label ink at a view opacity, over a land color.
 *
 * Purpose: The label canvas multiplies the ink by the kind's opacity.
 * When to use: When comparing the local name with the broader name on flat land.
 * Expected outcome: The sRGB composite the canvas paints for an opaque `#rrggbb` ink.
 * Exceptions: Throws when `ink` is not `#rrggbb`.
 */
function paintedFill(
  ink: string,
  opacity: number,
  land: readonly [number, number, number],
): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(ink)) throw new Error(`label ink ${ink} is not #rrggbb`);
  const channel = (index: number): number => {
    const source = Number.parseInt(ink.slice(1 + index * 2, 3 + index * 2), 16);
    return source * opacity + land[index] * (1 - opacity);
  };
  return [channel(0), channel(1), channel(2)];
}

/**
 * Relative luminance of an sRGB color.
 *
 * Purpose: Compares which painted name reads darker.
 * When to use: After `paintedFill`.
 * Expected outcome: A value from 0 to 1. A lower value is darker.
 * Exceptions: None.
 */
function relativeLuminance(rgb: readonly [number, number, number]): number {
  const linear = (channel: number): number => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}
