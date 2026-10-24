/**
 * Contract tests for melee intercept candidate detection and unit summary strings.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CombatUnit } from '../combatUnitTypes';
import { aiSeatIdForIndex, HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from '../../shared/seatIds';
import {
  buildMeleeInterceptCandidateRows,
  filterMeleeCandidateHexesWithTacticalEntry,
  formatMeleeUnitCategorySummary,
  listMeleeCandidateHexes,
} from './meleeInterceptCandidates';
import { hexA, hexB } from './testSupport/meleeInterceptTestHexes';

const seats = [
  { seatId: HUMAN_SEAT_ID, seatOrder: 1 },
  { seatId: 'opponent', seatOrder: 2 },
  { seatId: aiSeatIdForIndex(2), seatOrder: 3 },
];

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
  const rows = buildMeleeInterceptCandidateRows([hexA], units, seats);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0]?.h3Index, hexA);
  assert.equal(rows[0]?.parties.find((party) => party.ownerId === HUMAN_SEAT_ID)?.unitSummary, '1 naval');
  assert.equal(rows[0]?.parties.find((party) => party.ownerId === 'opponent')?.unitSummary, '2 armor');
  assert.equal(rows[0]?.tacticalEligible, true);
});

test('buildMeleeInterceptCandidateRows counts units per hex only', () => {
  const units: CombatUnit[] = [
    { id: 'h1', player: 'human', unitType: 'infantry', h3Index: hexA, displayOrder: 0 },
    { id: 'o1', player: 'opponent', unitType: 'armor', h3Index: hexA, displayOrder: 0 },
    { id: 'h2', player: 'human', unitType: 'armor', h3Index: hexB, displayOrder: 0 },
    { id: 'o2', player: 'opponent', unitType: 'infantry', h3Index: hexB, displayOrder: 0 },
    { id: 'o3', player: 'opponent', unitType: 'infantry', h3Index: hexB, displayOrder: 0 },
  ];
  const rows = buildMeleeInterceptCandidateRows([hexA, hexB], units, seats);
  assert.strictEqual(rows.length, 2);
  assert.equal(rows[0]?.parties.find((party) => party.ownerId === HUMAN_SEAT_ID)?.unitSummary, '1 infantry');
  assert.equal(rows[0]?.parties.find((party) => party.ownerId === 'opponent')?.unitSummary, '1 armor');
  assert.equal(rows[1]?.parties.find((party) => party.ownerId === HUMAN_SEAT_ID)?.unitSummary, '1 armor');
  assert.equal(rows[1]?.parties.find((party) => party.ownerId === 'opponent')?.unitSummary, '2 infantry');
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

test('buildMeleeInterceptCandidateRows lists a three-party hex and an unseen fight as not eligible', () => {
  const second = aiSeatIdForIndex(2);
  const hexC = 'hex-c';
  const units: CombatUnit[] = [
    { id: 'h1', player: HUMAN_SEAT_ID, unitType: 'infantry', h3Index: hexA, displayOrder: 0 },
    { id: 'o1', player: 'opponent', unitType: 'armor', h3Index: hexA, displayOrder: 0 },
    { id: 'o2', player: second, unitType: 'infantry', h3Index: hexA, displayOrder: 0 },
    { id: 'h2', player: HUMAN_SEAT_ID, unitType: 'infantry', h3Index: hexB, displayOrder: 0 },
    { id: 'n1', player: NEUTRAL_OWNER_ID, unitType: 'infantry', h3Index: hexB, displayOrder: 0 },
    { id: 'o3', player: 'opponent', unitType: 'armor', h3Index: hexC, displayOrder: 0 },
    { id: 'o4', player: second, unitType: 'armor', h3Index: hexC, displayOrder: 0 },
  ];
  const rows = buildMeleeInterceptCandidateRows([hexA, hexB, hexC], units, seats);
  const three = rows.find((row) => row.h3Index === hexA);
  const neutral = rows.find((row) => row.h3Index === hexB);
  const aiFight = rows.find((row) => row.h3Index === hexC);
  assert.equal(three?.tacticalEligible, false);
  assert.deepEqual(three?.parties.map((party) => party.ownerId), [HUMAN_SEAT_ID, 'opponent', second]);
  assert.equal(neutral?.tacticalEligible, true);
  assert.deepEqual(neutral?.parties.map((party) => party.ownerId), [HUMAN_SEAT_ID, NEUTRAL_OWNER_ID]);
  assert.equal(aiFight?.tacticalEligible, false);
  assert.deepEqual(aiFight?.parties.map((party) => party.ownerId), ['opponent', second]);
});
