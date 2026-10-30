import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latLngToCell } from 'h3-js';
import { CREDITS_SYMBOL } from './economySymbols';
import { formatStrategicUnitId, formatTacticalSubUnitId } from './unitIds';
import { formationTurnForUnit, formatUnitOriginTooltipHtml, unitOriginsPresentTheSame } from './unitOriginTooltipText';
import type { UnitOriginTooltipBonuses } from './unitOriginTooltipText';
import type { UnitOrigin } from './unitOriginTypes';

const PARIS_STRATEGIC = latLngToCell(48.85, 2.35, 1);

/**
 * Bonus flags with every option off.
 *
 * Purpose: The collapsed Bonuses block is the default the other cases override.
 * When to use: Tooltip tests.
 * Expected outcome: No category lines. The unit's birth record is ignored while every option is off.
 * Exceptions: None.
 */
const NONE: UnitOriginTooltipBonuses = {
  originEnabled: false,
  terrainEnabled: false,
  weatherEnabled: false,
  techEnabled: false,
};

const origin: UnitOrigin = {
  birthH3Index: PARIS_STRATEGIC,
  birthTacticalH3Index: null,
  birthTerrainKind: 'plains',
  birthCountryName: 'France',
  birthCountryCode: 'FR',
  birthIsUrban: false,
};

test('the tooltip lists the bonuses the unit was born with', () => {
  const html = formatUnitOriginTooltipHtml({
    origin,
    bonuses: {
      originEnabled: true,
      terrainEnabled: true,
      weatherEnabled: true,
      techEnabled: false,
      weatherTags: ['snow', 'rain'],
    },
  });
  assert.match(html, /^<strong>Bonuses:<\/strong>\n<strong>Origin:<\/strong> /);
  assert.ok(!html.includes('\n\n'));
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

test('an identity adds the name and formation date above a blank line', () => {
  const html = formatUnitOriginTooltipHtml({
    origin,
    bonuses: NONE,
    identity: { displayName: '22nd Armored', formedLabel: 'November, Year 3' },
  });
  assert.match(html, /^<strong>Unit:<\/strong> .*22nd Armored\n<strong>DOB:<\/strong> November, Year 3\n\n<strong>Bonuses:<\/strong>/);
  assert.ok(html.includes('flags/fr.svg'));
});

test('a tactical unit reports the formation turn stored for its parent', () => {
  const parentUnitId = formatStrategicUnitId({ player: 'human', unitType: 'armor', ordinal: 22 });
  const subUnitId = formatTacticalSubUnitId(parentUnitId, 2);
  const formedTurnById = new Map<string, number>([[parentUnitId, 4]]);
  assert.equal(formationTurnForUnit(subUnitId, formedTurnById), 4);
  assert.equal(formationTurnForUnit(parentUnitId, formedTurnById), 4);
  assert.equal(formationTurnForUnit('missing', formedTurnById), null);
});

test('a turned-off option is omitted, and weather tags render snow, then rain, then heat', () => {
  const html = formatUnitOriginTooltipHtml({
    origin,
    bonuses: {
      originEnabled: false,
      terrainEnabled: true,
      weatherEnabled: true,
      techEnabled: false,
      weatherTags: ['heat', 'snow'],
    },
  });
  assert.ok(html.includes('<strong>Terrain:</strong> <span class="terrain-swatch" data-terrain-kind="plains" aria-hidden="true"></span>Plains'));
  assert.ok(!html.includes('<strong>Origin:</strong>'));
  assert.ok(html.indexOf('weather/snow.svg') < html.indexOf('weather/heat.svg'));
  assert.ok(!html.includes('<strong>Bonuses:</strong>\nNone'));
});

test('no selected bonus, or a unit with none of them, collapses the Bonuses block to None', () => {
  const collapsed = formatUnitOriginTooltipHtml({ origin, bonuses: NONE });
  assert.ok(collapsed.includes('<strong>Bonuses:</strong>\nNone'));
  assert.ok(!collapsed.includes('<strong>Tech:</strong>'));
  assert.ok(!collapsed.includes('<strong>Origin:</strong>'));
  assert.ok(!collapsed.includes('<strong>Terrain:</strong>'));
  assert.ok(!collapsed.includes('<strong>Weather:</strong>'));

  const allEmpty = formatUnitOriginTooltipHtml({
    origin: { ...origin, birthCountryName: null, birthTerrainKind: null },
    bonuses: {
      originEnabled: true,
      terrainEnabled: true,
      weatherEnabled: true,
      techEnabled: false,
      weatherTags: [],
    },
  });
  assert.ok(allEmpty.includes('<strong>Bonuses:</strong>\nNone'));
  assert.ok(!allEmpty.includes('<strong>Weather:</strong> None'));
});

test('a unit with no birth place omits Origin, and a country name is escaped', () => {
  const enabled = { ...NONE, originEnabled: true };
  const unknown = formatUnitOriginTooltipHtml({
    origin: { ...origin, birthCountryName: null, birthCountryCode: null },
    bonuses: enabled,
  });
  assert.ok(unknown.includes('<strong>Bonuses:</strong>\nNone'));
  assert.ok(!unknown.includes('<strong>Origin:</strong>'));

  const escaped = formatUnitOriginTooltipHtml({
    origin: { ...origin, birthCountryName: 'A<B' },
    bonuses: enabled,
  });
  assert.ok(escaped.includes('A&lt;B'));
  assert.ok(!escaped.includes('<strong>A<B</strong>'));
});

test('a subdivision origin shows the brief name and the looked-up country', () => {
  const enabled = { ...NONE, originEnabled: true };
  const labeled = formatUnitOriginTooltipHtml({
    origin: {
      ...origin,
      birthAreaName: 'Colorado',
      birthCountryName: 'France',
      birthCountryCode: 'US',
      birthSubdivisionCode: 'US-CO',
      birthOriginCountryName: 'United States of America',
    },
    bonuses: enabled,
  });
  assert.ok(labeled.includes('Colorado, United States of America'));
  assert.ok(!labeled.includes('France'));

  const missingCountry = formatUnitOriginTooltipHtml({
    origin: {
      ...origin,
      birthAreaName: 'Colorado',
      birthCountryName: 'France',
      birthCountryCode: 'US',
      birthSubdivisionCode: 'US-CO',
    },
    bonuses: enabled,
  });
  assert.ok(missingCountry.includes('Colorado'));
  assert.ok(!missingCountry.includes('Colorado,'));
  assert.ok(!missingCountry.includes('France'));
  assert.ok(!missingCountry.includes('United States'));
});

/**
 * Checks the Tech row against the match flag and the recorded tier.
 *
 * Purpose: A remembered Advanced tier must stay hidden when the match tech bonus is off.
 * When to use: From this file's runner.
 * Expected outcome: Basic and Advanced render when the flag is on. A missing tier, and an Advanced tier with the flag off, collapse to None.
 * Exceptions: AssertionError when the markup drifts.
 */
test('the Tech row names Basic or Advanced, and a missing tier stays None', () => {
  const advanced = formatUnitOriginTooltipHtml({ origin, bonuses: { ...NONE, techEnabled: true, techLevel: 'advanced' } });
  assert.ok(advanced.includes('<strong>Tech:</strong>'));
  assert.ok(advanced.includes('tech/tech_advanced.svg'));
  assert.ok(advanced.includes('Advanced'));
  assert.ok(!advanced.includes('tech/tech_basic.svg'));
  assert.ok(!advanced.includes('<strong>Bonuses:</strong>\nNone'));
  const basic = formatUnitOriginTooltipHtml({ origin, bonuses: { ...NONE, techEnabled: true, techLevel: 'basic' } });
  assert.ok(basic.includes('<strong>Tech:</strong>'));
  assert.ok(basic.includes('tech/tech_basic.svg'));
  assert.ok(basic.includes('Basic'));
  assert.ok(!basic.includes('tech/tech_advanced.svg'));
  assert.ok(!basic.includes('<strong>Bonuses:</strong>\nNone'));
  const missing = formatUnitOriginTooltipHtml({ origin, bonuses: NONE });
  assert.ok(missing.includes('<strong>Bonuses:</strong>\nNone'));
  assert.ok(!missing.includes('<strong>Tech:</strong>'));
  const off = formatUnitOriginTooltipHtml({ origin, bonuses: { ...NONE, techEnabled: false, techLevel: 'advanced' } });
  assert.ok(off.includes('<strong>Bonuses:</strong>\nNone'));
  assert.ok(!off.includes('<strong>Tech:</strong>'));
});

/**
 * Checks that a mercenary's upkeep follows the date of birth.
 *
 * Purpose: The flag tooltip is how a player sees what a mercenary costs.
 * When to use: After changing the identity lines.
 * Expected outcome: The Mercenary line is after DOB.
 * Exceptions: AssertionError when the line is missing or out of order.
 */
test('a mercenary identity adds the Mercenary line after the date of birth', () => {
  const html = formatUnitOriginTooltipHtml({
    origin,
    bonuses: NONE,
    identity: { displayName: '4th Infantry', formedLabel: 'November, Year 1', mercenaryUpkeep: 3 },
  });
  const dob = html.indexOf('<strong>DOB:</strong>');
  const mercenary = html.indexOf(`<strong>Mercenary:</strong> upkeep ${CREDITS_SYMBOL}3 per turn`);
  assert.ok(dob >= 0 && mercenary > dob);
});

/**
 * Checks that equal birth fields count as the same origin and one differing field does not.
 *
 * Purpose: Loss toasts share one flag per display name, so two units from the same place must still get that flag.
 * When to use: From this file's runner.
 * Expected outcome: Matching copies return true. A missing looked-up country matches an explicit null. A different birth hex returns false.
 * Exceptions: AssertionError when the comparison drifts.
 */
test('origins that present the same flag and tooltip match, and a different birth hex does not', () => {
  const copy: UnitOrigin = { ...origin };
  assert.equal(unitOriginsPresentTheSame(origin, copy), true);
  assert.equal(unitOriginsPresentTheSame(origin, { ...origin, birthOriginCountryName: null }), true);
  assert.equal(unitOriginsPresentTheSame(origin, { ...origin, birthH3Index: 'not-a-hex' }), false);
});
