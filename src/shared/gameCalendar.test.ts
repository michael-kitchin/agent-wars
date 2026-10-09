import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatGameDateForTurn,
  gameCalendarKindForMap,
  gameDateForTurn,
  isLeapGameYear,
  parseStartMonth,
} from './gameCalendar';

test('unknown start months resolve to January and names resolve to their numbers', () => {
  assert.equal(parseStartMonth('13'), 1);
  assert.equal(parseStartMonth('Foo'), 1);
  assert.equal(parseStartMonth(0), 1);
  assert.equal(parseStartMonth('december'), 12);
});

test('a global map counts months and any other map counts weeks', () => {
  assert.equal(gameCalendarKindForMap('global'), 'monthly');
  assert.equal(gameCalendarKindForMap('northern_america'), 'weekly');
});

test('Years 1 and 5 are leap years and Years 2 and 4 are not', () => {
  assert.equal(isLeapGameYear(1), true);
  assert.equal(isLeapGameYear(2), false);
  assert.equal(isLeapGameYear(4), false);
  assert.equal(isLeapGameYear(5), true);
});

test('a monthly November start names January in Year 1 and returns to November in later years', () => {
  assert.equal(formatGameDateForTurn(3, 11, 'monthly'), 'January, Year 1');
  assert.equal(formatGameDateForTurn(13, 'November', 'monthly'), 'November, Year 2');
  assert.equal(formatGameDateForTurn(25, 11, 'monthly'), 'November, Year 3');
  assert.equal(gameDateForTurn(1, 1, 'monthly').monthIndex, 0);
  assert.equal(gameDateForTurn(2, 'December', 'monthly').monthIndex, 0);
});

test('a weekly November start crosses into December and into the next year on the anniversary', () => {
  assert.equal(formatGameDateForTurn(6, 11, 'weekly'), 'December 6th, Year 1');
  assert.equal(formatGameDateForTurn(53, 11, 'weekly'), 'October 30th, Year 1');
  assert.equal(formatGameDateForTurn(54, 11, 'weekly'), 'November 6th, Year 2');
});

test('a weekly February start uses 29 days in Year 1 and 28 days in Year 2', () => {
  assert.equal(formatGameDateForTurn(5, 2, 'weekly'), 'February 29th, Year 1');
  assert.equal(formatGameDateForTurn(6, 2, 'weekly'), 'March 7th, Year 1');
  assert.equal(formatGameDateForTurn(57, 2, 'weekly'), 'February 27th, Year 2');
  assert.equal(formatGameDateForTurn(58, 2, 'weekly'), 'March 6th, Year 2');
});
