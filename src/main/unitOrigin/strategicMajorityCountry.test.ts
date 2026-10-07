import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BirthCountry } from '../../shared/unitOriginTypes';
import { buildStrategicMajorityCountryNameByH3 } from './strategicMajorityCountry';

/**
 * Builds a birth country with no code.
 *
 * Purpose: Codes never take part in the majority pick, so fixtures only need a name.
 * When to use: In the tests below.
 * Expected outcome: A complete `BirthCountry`.
 * Exceptions: None.
 */
function country(name: string): BirthCountry {
  return { name, code: null };
}

/**
 * Maps fixture cell ids of the form `<parent>/<n>` to their parent.
 *
 * Purpose: Lets tests choose parents without real H3 indexes.
 * When to use: As the `parentStrategicOf` argument below.
 * Expected outcome: The text before the slash.
 * Exceptions: None.
 */
function parentOf(cell: string): string {
  return cell.split('/')[0]!;
}

test('the country with the most cells wins its parent hex', () => {
  const names = buildStrategicMajorityCountryNameByH3(
    new Map([
      ['a/1', country('France')],
      ['a/2', country('Spain')],
      ['a/3', country('Spain')],
    ]),
    parentOf
  );
  assert.equal(names.get('a'), 'Spain');
});

test('a tie goes to the name that sorts first', () => {
  const names = buildStrategicMajorityCountryNameByH3(
    new Map([
      ['a/1', country('Spain')],
      ['a/2', country('France')],
    ]),
    parentOf
  );
  assert.equal(names.get('a'), 'France');
});

test('a parent with no counted cells has no entry', () => {
  const names = buildStrategicMajorityCountryNameByH3(new Map([['a/1', country('France')]]), parentOf);
  assert.equal(names.has('b'), false);
});
