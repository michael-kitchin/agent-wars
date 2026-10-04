import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latLngToCell } from 'h3-js';
import { getStrategicRes1HexCode } from './hexLlmCodeAssignment';
import { formatUnitOriginTooltipHtml, unitOriginsPresentTheSame } from './unitOriginTooltipText';
import type { UnitOriginTooltipBonuses } from './unitOriginTooltipText';
import type { UnitOrigin } from './unitOriginTypes';

const PARIS_RES1 = latLngToCell(48.85, 2.35, 1);

/**
 * Bonus flags with every option off and nothing applying.
 *
 * Purpose: The collapsed Bonus block is the default the other cases override.
 * When to use: Tooltip tests.
 * Expected outcome: No category lines.
 * Exceptions: None.
 */
const NONE: UnitOriginTooltipBonuses = {
  countryEnabled: false,
  terrainEnabled: false,
  weatherEnabled: false,
  countryApplies: false,
  terrainApplies: false,
};

const origin: UnitOrigin = {
  birthH3Index: PARIS_RES1,
  birthRes4H3Index: null,
  birthTerrainKind: 'plains',
  birthCountryName: 'France',
  birthCountryCode: 'FR',
  birthIsUrban: false,
};

test('the tooltip names the unit, its birth country, and only the bonuses that are selected', () => {
  const hexCode = getStrategicRes1HexCode(PARIS_RES1);
  assert.equal(hexCode?.length, 2);
  const html = formatUnitOriginTooltipHtml({
    unitName: 'Infantry 1',
    origin,
    bonuses: {
      countryEnabled: true,
      terrainEnabled: true,
      weatherEnabled: true,
      countryApplies: true,
      terrainApplies: false,
      weatherTags: ['snow', 'rain'],
    },
  });
  assert.match(html, /^<strong>Infantry 1<\/strong>\n<strong>Origin:<\/strong> /);
  assert.ok(html.includes(`France (${hexCode})`));
  assert.ok(html.includes('flags/fr.svg'));
  assert.ok(html.includes('<strong>Bonus:</strong>\n<strong>Country:</strong> '));
  assert.ok(!html.includes('<strong>Terrain:</strong>'));
  assert.ok(html.includes('weather/snow.svg'));
  assert.ok(html.includes('Snow'));
  assert.ok(html.includes('weather/rain.svg'));
  assert.ok(html.includes('Rain'));
  assert.ok(!html.includes('<strong>Weather:</strong> None'));
  assert.ok(!html.includes('Bonus: +1'));
});

test('terrain that applies is named, and weather tags render snow, then rain, then heat', () => {
  const html = formatUnitOriginTooltipHtml({
    unitName: 'Infantry 1',
    origin,
    bonuses: {
      countryEnabled: false,
      terrainEnabled: true,
      weatherEnabled: true,
      countryApplies: false,
      terrainApplies: true,
      weatherTags: ['heat', 'snow'],
    },
  });
  assert.ok(html.includes('<strong>Terrain:</strong> <span class="terrain-swatch" data-terrain-kind="plains" aria-hidden="true"></span>Plains'));
  assert.ok(!html.includes('<strong>Country:</strong>'));
  assert.ok(html.indexOf('weather/snow.svg') < html.indexOf('weather/thermometer-warmer.svg'));
  assert.ok(!html.includes('<strong>Bonus:</strong>\nNone'));
});

test('no selected bonus, or none that apply, collapses the Bonus block to None', () => {
  const collapsed = formatUnitOriginTooltipHtml({ unitName: 'Infantry 1', origin, bonuses: NONE });
  assert.ok(collapsed.includes('<strong>Bonus:</strong>\nNone'));
  assert.ok(!collapsed.includes('<strong>Country:</strong>'));
  assert.ok(!collapsed.includes('<strong>Terrain:</strong>'));
  assert.ok(!collapsed.includes('<strong>Weather:</strong>'));

  const allEmpty = formatUnitOriginTooltipHtml({
    unitName: 'Infantry 1',
    origin,
    bonuses: {
      countryEnabled: true,
      terrainEnabled: true,
      weatherEnabled: true,
      countryApplies: false,
      terrainApplies: false,
      weatherTags: [],
    },
  });
  assert.ok(allEmpty.includes('<strong>Bonus:</strong>\nNone'));
  assert.ok(!allEmpty.includes('<strong>Weather:</strong> None'));
});

test('an unknown country and a hex without a code omit the parenthetical and escape the unit name', () => {
  const unknownHere: UnitOrigin = {
    birthH3Index: PARIS_RES1,
    birthRes4H3Index: null,
    birthTerrainKind: null,
    birthCountryName: null,
    birthCountryCode: null,
    birthIsUrban: false,
  };
  const html = formatUnitOriginTooltipHtml({
    unitName: 'A<B',
    origin: { ...unknownHere, birthH3Index: 'not-a-hex' },
    bonuses: NONE,
  });
  assert.ok(html.includes('<strong>A&lt;B</strong>'));
  assert.ok(html.includes('<strong>Origin:</strong> '));
  assert.ok(html.includes('Unknown'));
  assert.ok(!html.includes('('));
});

/**
 * Checks that equal birth fields count as the same origin and one differing field does not.
 *
 * Purpose: Loss toasts share one flag per display name, so two units from the same place must still get that flag.
 * When to use: From this file's runner.
 * Expected outcome: Matching copies return true; a different birth hex returns false.
 * Exceptions: AssertionError when the comparison drifts.
 */
test('origins that present the same flag and tooltip match, and a different birth hex does not', () => {
  const copy: UnitOrigin = { ...origin };
  assert.equal(unitOriginsPresentTheSame(origin, copy), true);
  assert.equal(unitOriginsPresentTheSame(origin, { ...origin, birthH3Index: 'not-a-hex' }), false);
});
