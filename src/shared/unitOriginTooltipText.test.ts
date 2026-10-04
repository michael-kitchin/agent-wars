import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latLngToCell } from 'h3-js';
import { formatUnitOriginTooltipHtml, unitOriginsPresentTheSame } from './unitOriginTooltipText';
import type { UnitOriginTooltipBonuses } from './unitOriginTooltipText';
import type { UnitOrigin } from './unitOriginTypes';

const PARIS_RES1 = latLngToCell(48.85, 2.35, 1);

/**
 * Bonus flags with every option off.
 *
 * Purpose: The collapsed Bonuses block is the default the other cases override.
 * When to use: Tooltip tests.
 * Expected outcome: No category lines. The unit's birth record is ignored while every option is off.
 * Exceptions: None.
 */
const NONE: UnitOriginTooltipBonuses = {
  countryEnabled: false,
  terrainEnabled: false,
  weatherEnabled: false,
};

const origin: UnitOrigin = {
  birthH3Index: PARIS_RES1,
  birthRes4H3Index: null,
  birthTerrainKind: 'plains',
  birthCountryName: 'France',
  birthCountryCode: 'FR',
  birthIsUrban: false,
};

test('the tooltip lists the bonuses the unit was born with', () => {
  const html = formatUnitOriginTooltipHtml({
    origin,
    bonuses: {
      countryEnabled: true,
      terrainEnabled: true,
      weatherEnabled: true,
      weatherTags: ['snow', 'rain'],
    },
  });
  assert.match(html, /^<strong>Bonuses:<\/strong>\n<strong>Country:<\/strong> /);
  assert.ok(!html.includes('\n\n'));
  assert.ok(!html.includes('<strong>Origin:</strong>'));
  assert.ok(html.includes('France'));
  assert.ok(html.includes('flags/fr.svg'));
  assert.ok(html.includes('<strong>Terrain:</strong> <span class="terrain-swatch" data-terrain-kind="plains" aria-hidden="true"></span>Plains'));
  assert.ok(html.includes('weather/snow.svg'));
  assert.ok(html.includes('Snow'));
  assert.ok(html.includes('weather/rain.svg'));
  assert.ok(html.includes('Rain'));
  assert.ok(!html.includes('<strong>Weather:</strong> None'));
  assert.ok(!html.includes('Bonus: +1'));
});

test('a turned-off option is omitted, and weather tags render snow, then rain, then heat', () => {
  const html = formatUnitOriginTooltipHtml({
    origin,
    bonuses: {
      countryEnabled: false,
      terrainEnabled: true,
      weatherEnabled: true,
      weatherTags: ['heat', 'snow'],
    },
  });
  assert.ok(html.includes('<strong>Terrain:</strong> <span class="terrain-swatch" data-terrain-kind="plains" aria-hidden="true"></span>Plains'));
  assert.ok(!html.includes('<strong>Country:</strong>'));
  assert.ok(html.indexOf('weather/snow.svg') < html.indexOf('weather/heat.svg'));
  assert.ok(!html.includes('<strong>Bonuses:</strong>\nNone'));
});

test('no selected bonus, or a unit with none of them, collapses the Bonuses block to None', () => {
  const collapsed = formatUnitOriginTooltipHtml({ origin, bonuses: NONE });
  assert.ok(collapsed.includes('<strong>Bonuses:</strong>\nNone'));
  assert.ok(!collapsed.includes('<strong>Country:</strong>'));
  assert.ok(!collapsed.includes('<strong>Terrain:</strong>'));
  assert.ok(!collapsed.includes('<strong>Weather:</strong>'));

  const allEmpty = formatUnitOriginTooltipHtml({
    origin: { ...origin, birthCountryName: null, birthTerrainKind: null },
    bonuses: {
      countryEnabled: true,
      terrainEnabled: true,
      weatherEnabled: true,
      weatherTags: [],
    },
  });
  assert.ok(allEmpty.includes('<strong>Bonuses:</strong>\nNone'));
  assert.ok(!allEmpty.includes('<strong>Weather:</strong> None'));
});

test('a unit with no birth country omits Country, and a country name is escaped', () => {
  const enabled = { ...NONE, countryEnabled: true };
  const unknown = formatUnitOriginTooltipHtml({
    origin: { ...origin, birthCountryName: null, birthCountryCode: null },
    bonuses: enabled,
  });
  assert.ok(unknown.includes('<strong>Bonuses:</strong>\nNone'));
  assert.ok(!unknown.includes('<strong>Country:</strong>'));

  const escaped = formatUnitOriginTooltipHtml({
    origin: { ...origin, birthCountryName: 'A<B' },
    bonuses: enabled,
  });
  assert.ok(escaped.includes('A&lt;B'));
  assert.ok(!escaped.includes('<strong>A<B</strong>'));
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
