import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BONUS_LEVELS } from './bonusLevel';
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
  tacticalWeatherMovementBudget,
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
  assert.equal(strategicMovementHexesFor({ unitType: 'armor', weather: 'snow', tags: [], level: 'off' }), 2);
  assert.equal(strategicMovementHexesFor({ unitType: 'armor', weather: 'snow', tags: [], level: 'low' }), 1);
  assert.equal(strategicMovementHexesFor({ unitType: 'armor', weather: 'snow', tags: ['snow'], level: 'low' }), 2);
  assert.equal(strategicMovementHexesFor({ unitType: 'naval', weather: 'snow', tags: [], level: 'low' }), 1);
  assert.equal(strategicMovementHexesFor({ unitType: 'infantry', weather: 'snow', tags: [], level: 'low' }), 1);
  assert.equal(strategicMovementHexesFor({ unitType: 'armor', weather: null, tags: [], level: 'low' }), 2);
  assert.equal(strategicMovementHexesFor({ unitType: 'armor', weather: 'rain', tags: [], level: 'low' }), 1);
  assert.equal(strategicMovementHexesFor({ unitType: 'armor', weather: 'heat', tags: [], level: 'low' }), 2);
  assert.equal(strategicMovementHexesFor({ unitType: 'naval', weather: 'rain', tags: [], level: 'low' }), 2);
});

test('the tactical budget lowers armor in snow and naval only in snow', () => {
  assert.equal(
    tacticalWeatherMovementBudget({ unitType: 'armor', printedBudget: 4, weather: 'snow', tags: [], level: 'low' }),
    2
  );
  assert.equal(
    tacticalWeatherMovementBudget({ unitType: 'naval', printedBudget: 3, weather: 'snow', tags: [], level: 'low' }),
    2
  );
  assert.equal(
    tacticalWeatherMovementBudget({ unitType: 'naval', printedBudget: 3, weather: 'rain', tags: [], level: 'low' }),
    3
  );
});

test('ranged armor loses three points in snow and in heat', () => {
  for (const weatherAtUnit of ['snow', 'heat'] as const) {
    assert.equal(
      weatherAttackPenalty({ unitType: 'armor', kind: 'ranged', weatherAtUnit, tags: [], level: 'low' }),
      3
    );
  }
});

test('High slows armor in heat and naval in rain, and a tag still cancels it', () => {
  assert.equal(strategicMovementHexesFor({ unitType: 'armor', weather: 'heat', tags: [], level: 'high' }), 1);
  assert.equal(strategicMovementHexesFor({ unitType: 'naval', weather: 'rain', tags: [], level: 'high' }), 1);
  assert.equal(strategicMovementHexesFor({ unitType: 'armor', weather: 'heat', tags: ['heat'], level: 'high' }), 2);
  assert.equal(
    tacticalWeatherMovementBudget({ unitType: 'armor', printedBudget: 4, weather: 'heat', tags: [], level: 'high' }),
    1
  );
  assert.equal(
    tacticalWeatherMovementBudget({ unitType: 'naval', printedBudget: 3, weather: 'rain', tags: [], level: 'high' }),
    1
  );
  assert.equal(
    tacticalWeatherMovementBudget({ unitType: 'armor', printedBudget: 1, weather: 'snow', tags: [], level: 'high' }),
    1
  );
});

test('High raises the attack penalty to 5 and still applies it once per air strike', () => {
  assert.equal(weatherAttackPenalty({ unitType: 'armor', kind: 'ranged', weatherAtUnit: 'snow', tags: [], level: 'high' }), 5);
  assert.equal(
    weatherAttackPenalty({
      unitType: 'air',
      kind: 'airStrike',
      weatherAtUnit: 'mild',
      weatherAtTarget: 'rain',
      tags: [],
      level: 'high',
    }),
    5
  );
  assert.equal(
    weatherAttackPenalty({
      unitType: 'air',
      kind: 'airStrike',
      weatherAtUnit: 'rain',
      weatherAtTarget: 'heat',
      tags: [],
      level: 'high',
    }),
    5
  );
});

test('every level leaves every untagged unit at least one hex and one battle point', () => {
  for (const level of BONUS_LEVELS) {
    for (const unitType of ['infantry', 'armor', 'naval'] as const) {
      for (const weather of ['mild', 'rain', 'snow', 'heat'] as const) {
        assert.ok(strategicMovementHexesFor({ unitType, weather, tags: [], level }) >= 1, `${level} ${unitType} ${weather}`);
        for (const printedBudget of [1, 2, 3, 4]) {
          assert.ok(
            tacticalWeatherMovementBudget({ unitType, printedBudget, weather, tags: [], level }) >= 1,
            `${level} ${unitType} ${weather} ${printedBudget}`
          );
        }
      }
    }
  }
});

test('air strikes into snow are penalized once, and ranged armor is not penalized in rain', () => {
  assert.equal(
    weatherAttackPenalty({
      unitType: 'air',
      kind: 'airStrike',
      weatherAtUnit: 'mild',
      weatherAtTarget: 'snow',
      tags: [],
      level: 'low',
    }),
    3
  );
  assert.equal(
    weatherAttackPenalty({
      unitType: 'air',
      kind: 'airStrike',
      weatherAtUnit: 'rain',
      weatherAtTarget: 'heat',
      tags: [],
      level: 'low',
    }),
    3
  );
  assert.equal(
    weatherAttackPenalty({
      unitType: 'armor',
      kind: 'ranged',
      weatherAtUnit: 'rain',
      tags: [],
      level: 'low',
    }),
    0
  );
  assert.equal(
    weatherAttackPenalty({
      unitType: 'armor',
      kind: 'ranged',
      weatherAtUnit: 'heat',
      tags: ['heat'],
      level: 'low',
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
