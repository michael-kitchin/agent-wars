import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acclimationTags,
  calendarMonthName,
  classifyWeatherMonth,
  formatBriefingWeatherCell,
  formatWeatherLabel,
  parseStartMonth,
  strategicFerryRangeHexes,
  strategicMovementHexes,
  strategicMovementHexesFor,
  tacticalWeatherOpenGroundCost,
  weatherAttackPenalty,
} from './weatherBonusRules';
import type { WeatherMonthRecord } from './weatherBonusTypes';

/**
 * Repeats one classified month across a year.
 *
 * Purpose: Builds the canned climates the tag cases need.
 * When to use: Only from this file.
 * Expected outcome: Twelve copies of `month`.
 * Exceptions: None.
 */
function yearOf(month: WeatherMonthRecord): WeatherMonthRecord[] {
  return Array.from({ length: 12 }, () => month);
}

test('start month names and unknown values resolve to January through December', () => {
  assert.equal(parseStartMonth('January'), 1);
  assert.equal(parseStartMonth('december'), 12);
  assert.equal(parseStartMonth(6), 6);
  assert.equal(parseStartMonth('6'), 6);
  assert.equal(parseStartMonth('12'), 12);
  assert.equal(parseStartMonth('13'), 1);
  assert.equal(parseStartMonth('Foo'), 1);
  assert.equal(parseStartMonth(0), 1);
  assert.equal(calendarMonthName(1, 1), 'January');
  assert.equal(calendarMonthName(2, 'December'), 'January');
});

test('classification matches the reference climates and a hot wet month stays rain', () => {
  const berlin = yearOf(classifyWeatherMonth(1, 40));
  const moscowWinter = Array.from({ length: 12 }, (_, index) => classifyWeatherMonth(index < 5 ? -5 : 19, 50));
  const cairo = Array.from({ length: 12 }, (_, index) => classifyWeatherMonth(index >= 4 && index <= 9 ? 27 : 15, 1));
  const mumbaiJune = classifyWeatherMonth(29, 400);
  assert.deepEqual(acclimationTags(berlin), []);
  assert.deepEqual(acclimationTags(moscowWinter), ['snow']);
  assert.deepEqual(acclimationTags(cairo), ['heat']);
  assert.equal(mumbaiJune.display, 'rain');
  assert.equal(mumbaiJune.countsAsHeat, true);
  assert.equal(classifyWeatherMonth(Number.NaN, 10).display, 'mild');
});

test('three qualifying conditions keep the two with more months, ties preferring snow then heat', () => {
  const months: WeatherMonthRecord[] = [
    ...Array.from({ length: 4 }, () => classifyWeatherMonth(-5, 10)),
    ...Array.from({ length: 4 }, () => classifyWeatherMonth(30, 10)),
    ...Array.from({ length: 4 }, () => classifyWeatherMonth(30, 200)),
  ];
  assert.deepEqual(acclimationTags(months), ['snow', 'heat']);
});

test('strategic movement stays printed unless an unacclimated armor or naval unit is in bad weather', () => {
  assert.equal(strategicMovementHexes('armor'), 2);
  assert.equal(strategicMovementHexes('infantry'), 1);
  assert.equal(strategicMovementHexesFor({ unitType: 'armor', weather: 'snow', tags: [], enabled: false }), 2);
  assert.equal(strategicMovementHexesFor({ unitType: 'armor', weather: 'snow', tags: [], enabled: true }), 1);
  assert.equal(strategicMovementHexesFor({ unitType: 'armor', weather: 'snow', tags: ['snow'], enabled: true }), 2);
  assert.equal(strategicMovementHexesFor({ unitType: 'naval', weather: 'snow', tags: [], enabled: true }), 1);
  assert.equal(strategicMovementHexesFor({ unitType: 'infantry', weather: 'snow', tags: [], enabled: true }), 1);
  assert.equal(strategicMovementHexesFor({ unitType: 'armor', weather: null, tags: [], enabled: true }), 2);
});

test('air strikes into snow are penalized once, and ranged armor is not penalized in rain', () => {
  assert.equal(
    weatherAttackPenalty({
      unitType: 'air',
      kind: 'airStrike',
      weatherAtUnit: 'mild',
      weatherAtTarget: 'snow',
      tags: [],
      enabled: true,
    }),
    1
  );
  assert.equal(
    weatherAttackPenalty({
      unitType: 'air',
      kind: 'airStrike',
      weatherAtUnit: 'rain',
      weatherAtTarget: 'heat',
      tags: [],
      enabled: true,
    }),
    1
  );
  assert.equal(
    weatherAttackPenalty({
      unitType: 'armor',
      kind: 'ranged',
      weatherAtUnit: 'rain',
      tags: [],
      enabled: true,
    }),
    0
  );
  assert.equal(
    weatherAttackPenalty({
      unitType: 'armor',
      kind: 'ranged',
      weatherAtUnit: 'heat',
      tags: ['heat'],
      enabled: true,
    }),
    0
  );
  assert.equal(strategicFerryRangeHexes({ weatherAtDestination: 'snow', tags: [], enabled: true }), 2);
  assert.equal(strategicFerryRangeHexes({ weatherAtDestination: 'snow', tags: ['snow'], enabled: true }), 4);
  assert.equal(
    tacticalWeatherOpenGroundCost({
      unitType: 'infantry',
      category: 'plains',
      baseCost: 1,
      weather: 'snow',
      tags: [],
      enabled: true,
    }),
    2
  );
  assert.equal(
    tacticalWeatherOpenGroundCost({
      unitType: 'infantry',
      category: 'forests',
      baseCost: 2,
      weather: 'snow',
      tags: [],
      enabled: true,
    }),
    2
  );
  assert.equal(formatWeatherLabel('heat'), 'Heat');
  assert.equal(formatWeatherLabel(undefined), 'Mild');
});

test('the briefing weather cell names the hex weather and puts tags in parentheses', () => {
  assert.equal(formatBriefingWeatherCell({ weatherHere: 'mild', tags: ['heat'] }), 'Mild (Heat)');
  assert.equal(formatBriefingWeatherCell({ weatherHere: 'mild', tags: [] }), 'Mild');
  assert.equal(formatBriefingWeatherCell({ weatherHere: 'rain', tags: ['heat', 'rain'] }), 'Rain (Rain, Heat)');
  assert.equal(formatBriefingWeatherCell({ weatherHere: null, tags: ['heat'] }), 'Heat');
  assert.equal(formatBriefingWeatherCell({ weatherHere: null, tags: [] }), 'None');
});
