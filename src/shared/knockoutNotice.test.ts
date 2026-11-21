import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatKnockoutNotice, type KnockoutNoticeInput } from './knockoutNotice';

const base: KnockoutNoticeInput = {
  victimName: 'E. Turkey',
  victimIsHuman: false,
  outByName: 'W. Turkey',
  reasons: ['home_control'],
  everyHexRule: false,
  controlShareLabel: '75%',
  remainingUnits: 3,
};

test('formatKnockoutNotice writes each reason, and both reasons in one notice', () => {
  assert.equal(
    formatKnockoutNotice(base),
    'E. Turkey is out of the match. Other sides and Neutral hold 75% of its home\'s cities, W. Turkey the most. Its land is now neutral and its cities stop building. Its last 3 units hold their hexes as neutral garrisons and fire on any unit in range.'
  );
  assert.equal(
    formatKnockoutNotice({ ...base, reasons: ['no_city_hexes'], remainingUnits: 0 }).includes('It holds no city hexes.'),
    true
  );
  assert.equal(
    formatKnockoutNotice({ ...base, reasons: ['home_cities_destroyed'], remainingUnits: 0 }).includes('Its home has no cities left.'),
    true
  );
  const both = formatKnockoutNotice({ ...base, reasons: ['no_city_hexes', 'home_control'], remainingUnits: 0 });
  assert.equal(both.indexOf('hold 75%') < both.indexOf('It holds no city hexes.'), true);
  assert.equal(both.includes('units hold'), false);
});

test('formatKnockoutNotice uses the global sentence and the human opening', () => {
  assert.equal(
    formatKnockoutNotice({ ...base, everyHexRule: true, remainingUnits: 0 }).includes('Other sides and Neutral hold all of its home, W. Turkey the most.'),
    true
  );
  assert.equal(formatKnockoutNotice({ ...base, victimIsHuman: true, remainingUnits: 0 }).startsWith('You are out of the match.'), true);
});

test('formatKnockoutNotice keeps a nickname character for character', () => {
  assert.equal(
    formatKnockoutNotice({ ...base, victimName: 'Grok' }).startsWith('Grok is out of the match. Other sides and Neutral hold 75%'),
    true
  );
});

test('formatKnockoutNotice omits the most-holding side when none is credited', () => {
  assert.equal(
    formatKnockoutNotice({ ...base, outByName: null, remainingUnits: 0 }).includes("Other sides and Neutral hold 75% of its home's cities."),
    true
  );
});
