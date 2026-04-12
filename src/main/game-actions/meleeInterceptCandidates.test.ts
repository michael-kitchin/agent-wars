/**
 * Contract tests for melee intercept candidate detection and unit summary strings.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CombatUnit } from '../combatUnitTypes';
import {
  buildMeleeInterceptCandidateRows,
  filterMeleeCandidateHexesWithTacticalEntry,
  formatMeleeUnitCategorySummary,
  listMeleeCandidateHexes,
} from './meleeInterceptCandidates';

const hexA = '8a1f1d48b9fffff';
const hexB = '8a1f1d48b8fffff';

test('listMeleeCandidateHexes returns hexes with two or more players', () => {
  const units: CombatUnit[] = [
    { id: 'h1', player: 'human', unitType: 'infantry', h3Index: hexA, displayOrder: 0 },
    { id: 'o1', player: 'opponent', unitType: 'infantry', h3Index: hexA, displayOrder: 0 },
    { id: 'o2', player: 'opponent', unitType: 'armor', h3Index: hexB, displayOrder: 0 },
  ];
  const candidates = listMeleeCandidateHexes(units, [hexA, hexB]);
  assert.deepStrictEqual(candidates, [hexA]);
});

test('formatMeleeUnitCategorySummary omits zeros and uses stable order', () => {
  const units: CombatUnit[] = [
    { id: 'a1', player: 'human', unitType: 'air', h3Index: hexA, displayOrder: 0 },
    { id: 'i1', player: 'human', unitType: 'infantry', h3Index: hexA, displayOrder: 0 },
    { id: 'i2', player: 'human', unitType: 'infantry', h3Index: hexA, displayOrder: 0 },
    { id: 'ar1', player: 'human', unitType: 'armor', h3Index: hexA, displayOrder: 0 },
  ];
  const s = formatMeleeUnitCategorySummary(units, 'human');
  assert.strictEqual(s, '1 air, 1 armor, 2 infantry');
});

test('buildMeleeInterceptCandidateRows produces paired summaries', () => {
  const units: CombatUnit[] = [
    { id: 'h1', player: 'human', unitType: 'naval', h3Index: hexA, displayOrder: 0 },
    { id: 'o1', player: 'opponent', unitType: 'armor', h3Index: hexA, displayOrder: 0 },
    { id: 'o2', player: 'opponent', unitType: 'armor', h3Index: hexA, displayOrder: 0 },
  ];
  const rows = buildMeleeInterceptCandidateRows([hexA], units);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]?.h3Index, hexA);
  assert.strictEqual(rows[0]?.humanUnitSummary, '1 naval');
  assert.strictEqual(rows[0]?.aiUnitSummary, '2 armor');
});

test('Phase E: single-player hex yields no melee candidates so ready bypasses intercept modal', () => {
  const units: CombatUnit[] = [
    { id: 'h1', player: 'human', unitType: 'infantry', h3Index: hexA, displayOrder: 0 },
  ];
  assert.deepStrictEqual(listMeleeCandidateHexes(units, [hexA]), []);
});

test('Phase E: tactical-entry filter on empty raw list stays empty', () => {
  assert.deepStrictEqual(filterMeleeCandidateHexesWithTacticalEntry([], { allowDuringStrategicResolution: true }), []);
});
