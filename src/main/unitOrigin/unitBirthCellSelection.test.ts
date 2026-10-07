import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BirthCountry } from '../../shared/unitOriginTypes';
import { selectUnitBirthOrigin, type TacticalBirthCandidate, type UnitBirthOriginSelectionInput } from './unitBirthCellSelection';

const FRANCE: BirthCountry = { name: 'France', code: 'FR' };

/**
 * Builds a selection input around the given candidates.
 *
 * Purpose: Keeps each test focused on its candidates and seed.
 * When to use: In the tests below.
 * Expected outcome: Every cell's birth country is France.
 * Exceptions: None.
 */
function input(tacticalCandidates: ReadonlyArray<TacticalBirthCandidate>, seedKey = 'seed:unit-1'): UnitBirthOriginSelectionInput {
  return {
    birthH3Index: '81003ffffffffff',
    strategicTerrainKind: 'plains',
    tacticalCandidates,
    seedKey,
    birthCountryForTactical: () => FRANCE,
  };
}

/**
 * Builds a candidate cell.
 *
 * Purpose: Fixture helper.
 * When to use: In the tests below.
 * Expected outcome: A `TacticalBirthCandidate`.
 * Exceptions: None.
 */
function cell(h3Index: string, terrainKind: string, isIntactUrban = false): TacticalBirthCandidate {
  return { h3Index, terrainKind, isIntactUrban };
}

test('only intact urban cells are chosen when any exist', () => {
  const candidates = [cell('a', 'forest'), cell('b', 'coastal', true), cell('c', 'plains', false), cell('d', 'plains')];
  for (const seedKey of ['s:1', 's:2', 's:3', 's:4', 's:5']) {
    const origin = selectUnitBirthOrigin(input(candidates, seedKey));
    assert.equal(origin.birthTacticalH3Index, 'b');
    assert.equal(origin.birthTerrainKind, 'coastal');
    assert.equal(origin.birthCountryCode, 'FR');
    assert.equal(origin.birthCountryName, 'France');
    assert.equal(origin.birthIsUrban, true);
  }
});

test('without urban cells a land cell is chosen and water never is', () => {
  const candidates = [cell('a', 'water'), cell('b', 'forest'), cell('c', 'water')];
  for (const seedKey of ['s:1', 's:2', 's:3', 's:4', 's:5']) {
    const origin = selectUnitBirthOrigin(input(candidates, seedKey));
    assert.equal(origin.birthTacticalH3Index, 'b');
    assert.equal(origin.birthIsUrban, false);
  }
});

test('an all-water hex has no birth cell and falls back to the res1 terrain', () => {
  const origin = selectUnitBirthOrigin(input([cell('a', 'water'), cell('b', 'water')]));
  assert.deepEqual(origin, {
    birthH3Index: '81003ffffffffff',
    birthTacticalH3Index: null,
    birthTerrainKind: 'plains',
    birthIsUrban: false,
    birthCountryName: null,
    birthCountryCode: null,
  });
});

test('selection is deterministic, ignores input order, and varies across seed keys', () => {
  const candidates = Array.from({ length: 10 }, (_, i) => cell(`cell-${i}`, 'plains'));
  const first = selectUnitBirthOrigin(input(candidates, 'game:unit-7'));
  assert.deepEqual(selectUnitBirthOrigin(input([...candidates].reverse(), 'game:unit-7')), first);
  const chosen = new Set(
    Array.from({ length: 20 }, (_, i) => selectUnitBirthOrigin(input(candidates, `game:unit-${i}`)).birthTacticalH3Index)
  );
  assert.ok(chosen.size >= 2, `expected variation, got ${[...chosen].join(', ')}`);
});
