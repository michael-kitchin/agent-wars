import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitLossCauseLineForUnitFlags } from './lossToastUnitSegments';

const KNOWN = new Set(['1st Infantry', 'I Armor']);

test('a loss line with two known victims marks both names and keeps the rest plain', () => {
  const segments = splitLossCauseLineForUnitFlags('\u2022 Melee attack: 1st Infantry, I Armor', KNOWN);
  assert.deepEqual(segments, [
    { text: '\u2022 Melee attack: ', unitDisplayName: null },
    { text: '1st Infantry', unitDisplayName: '1st Infantry' },
    { text: ', ', unitDisplayName: null },
    { text: 'I Armor', unitDisplayName: 'I Armor' },
  ]);
});

test('grouped totals on a loss line are not marked as names', () => {
  const segments = splitLossCauseLineForUnitFlags('\u2022 Ranged attack: 3 Infantry, 2 Armored', KNOWN);
  assert.equal(
    segments.every((segment) => segment.unitDisplayName === null),
    true
  );
  assert.equal(segments.map((segment) => segment.text).join(''), '\u2022 Ranged attack: 3 Infantry, 2 Armored');
});

test('a line that is not a loss cause line stays one plain segment', () => {
  const line = '\u2022 1st Infantry captured a hex';
  assert.deepEqual(splitLossCauseLineForUnitFlags(line, KNOWN), [{ text: line, unitDisplayName: null }]);
});
