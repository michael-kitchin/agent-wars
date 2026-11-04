import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DestroyedBattleParent } from './destroyedBattleParent';
import { formatDestroyedInBattleLine, visibleDestroyedParents } from './destroyedInBattleLine';
import { HUMAN_SEAT_ID } from './seatIds';

const OPPONENT = 'opponent';

/**
 * One destroyed parent for a line test.
 *
 * Purpose: The cases share the fields the formatter does not read.
 * When to use: Each parent in this file.
 * Expected outcome: A row with the given owner, type, name, and hex.
 * Exceptions: None.
 */
function parent(
  id: string,
  ownerId: string,
  unitType: string,
  displayName: string,
  h3Index: string
): DestroyedBattleParent {
  return { id, ownerId, unitType, displayName, h3Index };
}

test('one named infantry and six armor collapse only the armor', () => {
  const units = [
    parent('inf', HUMAN_SEAT_ID, 'infantry', 'III Infantry', 'a'),
    ...['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id, index) =>
      parent(id, HUMAN_SEAT_ID, 'armor', `${index} Armored`, 'a')
    ),
  ];
  assert.equal(formatDestroyedInBattleLine(units), 'III Infantry, 6x Armored destroyed in battle.');
});

test('two collapsed types keep naval before infantry and both use the x', () => {
  const naval = ['I Fleet', 'II Fleet', 'III Fleet', 'IV Fleet'].map((name, index) =>
    parent(`n${index}`, HUMAN_SEAT_ID, 'naval', name, 'a')
  );
  const infantry = ['I Infantry', 'II Infantry', 'III Infantry', 'IV Infantry'].map((name, index) =>
    parent(`i${index}`, HUMAN_SEAT_ID, 'infantry', name, 'a')
  );
  assert.equal(
    formatDestroyedInBattleLine([...infantry, ...naval]),
    '4x Naval, 4x Infantry destroyed in battle.'
  );
});

test('four infantry collapse, and three infantry stay named', () => {
  const four = ['I Infantry', 'II Infantry', 'III Infantry', 'IV Infantry'].map((name, index) =>
    parent(`i${index}`, HUMAN_SEAT_ID, 'infantry', name, 'a')
  );
  assert.equal(formatDestroyedInBattleLine(four), '4x Infantry destroyed in battle.');
  const three = four.slice(0, 3);
  assert.equal(
    formatDestroyedInBattleLine(three),
    'I Infantry, II Infantry, III Infantry destroyed in battle.'
  );
});

test('an empty list formats as an empty string', () => {
  assert.equal(formatDestroyedInBattleLine([]), '');
});

test('all sides keeps every parent, and a seat keeps its own and enemies on visible hexes', () => {
  const own = parent('own', HUMAN_SEAT_ID, 'infantry', 'I Infantry', 'hidden');
  const seen = parent('seen', OPPONENT, 'armor', 'I Armored', 'visible');
  const unseen = parent('unseen', OPPONENT, 'naval', 'I Naval', 'hidden');
  const all = visibleDestroyedParents([own, seen, unseen], null, new Set());
  assert.deepEqual(all.map((unit) => unit.id), ['own', 'seen', 'unseen']);
  const seat = visibleDestroyedParents([own, seen, unseen], HUMAN_SEAT_ID, new Set(['visible']));
  assert.deepEqual(seat.map((unit) => unit.id), ['own', 'seen']);
});
