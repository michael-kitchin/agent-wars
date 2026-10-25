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
    segments.every((segment) => segment.unitDisplayName === null && segment.group === undefined),
    true
  );
  assert.equal(segments.map((segment) => segment.text).join(''), '\u2022 Ranged attack: 3 Infantry, 2 Armored');
});

test('a collapsed group is marked, and a known name with that shape stays a unit', () => {
  const line = '\u2022 Ranged attack: 1st Armor, 4x Infantry';
  const segments = splitLossCauseLineForUnitFlags(line, new Set(['1st Armor']));
  assert.equal(segments.map((segment) => segment.text).join(''), line);
  assert.equal(segments[1]?.unitDisplayName, '1st Armor');
  assert.equal(segments[1]?.group, undefined);
  assert.deepEqual(segments[3]?.group, { unitType: 'infantry', count: 4 });
  assert.equal(segments[3]?.unitDisplayName, null);
  const knownGroup = splitLossCauseLineForUnitFlags(line, new Set(['1st Armor', '4x Infantry']));
  assert.equal(knownGroup[3]?.unitDisplayName, '4x Infantry');
  assert.equal(knownGroup[3]?.group, undefined);
});

test('a line that is not a loss cause line stays one plain segment', () => {
  const line = '\u2022 1st Infantry captured a hex';
  assert.deepEqual(splitLossCauseLineForUnitFlags(line, KNOWN), [{ text: line, unitDisplayName: null }]);
});
