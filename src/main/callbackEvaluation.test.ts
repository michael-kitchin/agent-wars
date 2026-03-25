/**
 * Callback mandatory override evaluation (Phase 2) — happy path and essential cases.
 * Run with: node dist/callbackEvaluation.test.js
 */

import * as assert from 'assert';
import { evaluateMandatoryOverrides } from './callbackEvaluation';
import type { GameStateSnapshot } from './gameDb';

const baseState: GameStateSnapshot = {
  turnNumber: 10,
  phase: 'planning',
  hexes: [{ h3Index: 'a', terrain: 'land', terrainKind: 'land' }],
  units: [
    { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: 'a' },
    { id: 'opponent-inf-1', player: 'opponent', unitType: 'infantry', h3Index: 'a' },
  ],
  pendingOrders: [],
};

function testFirstConsultationFires(): void {
  const results = evaluateMandatoryOverrides(baseState, 0, [], [], []);
  assert.ok(results.some((r) => r.type === 'first_consultation'));
}

function testFirstCombatFires(): void {
  const results = evaluateMandatoryOverrides(
    baseState,
    5,
    [], // none in combat since consultation
    ['opponent-armor-1'], // this resolution armor-1 was in combat
    []
  );
  assert.ok(results.some((r) => r.type === 'first_combat' && r.unitId === 'opponent-armor-1'));
}

function testUnitDestroyedFires(): void {
  const results = evaluateMandatoryOverrides(
    baseState,
    5,
    [],
    [],
    ['opponent-inf-1']
  );
  assert.ok(results.some((r) => r.type === 'unit_destroyed' && r.unitId === 'opponent-inf-1'));
}

function testDeadmanFires(): void {
  const results = evaluateMandatoryOverrides(
    { ...baseState, turnNumber: 16 },
    10, // last consultation turn 10, now 16 -> 6 turns
    [],
    [],
    []
  );
  assert.ok(results.some((r) => r.type === 'deadman' && r.turnsSince >= 5));
}

function testNoFirstCombatWhenAlreadyInSet(): void {
  const results = evaluateMandatoryOverrides(
    baseState,
    5,
    ['opponent-armor-1'], // already in set
    ['opponent-armor-1'],
    []
  );
  assert.ok(!results.some((r) => r.type === 'first_combat'));
}

function testAttackMixChangedFires(): void {
  const turn1: GameStateSnapshot = {
    ...baseState,
    turnNumber: 1,
    hexes: [
      { h3Index: '822a17fffffffff', terrain: 'land', terrainKind: 'land' },
      { h3Index: '822a1ffffffffff', terrain: 'land', terrainKind: 'land' },
      { h3Index: '822a07fffffffff', terrain: 'land', terrainKind: 'land' },
    ],
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: '822a17fffffffff' },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: '822a1ffffffffff' },
    ],
  };
  const turn2: GameStateSnapshot = {
    ...turn1,
    turnNumber: 2,
    // Move human to an invalid/non-computable position so no target is hittable.
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: '822a17fffffffff' },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: 'not-a-cell' },
    ],
  };
  evaluateMandatoryOverrides(turn1, 1, [], [], []);
  const results = evaluateMandatoryOverrides(turn2, 1, [], [], []);
  assert.ok(results.some((r) => r.type === 'attack_mix_changed'));
}

function run(): void {
  testFirstConsultationFires();
  testFirstCombatFires();
  testUnitDestroyedFires();
  testDeadmanFires();
  testNoFirstCombatWhenAlreadyInSet();
  testAttackMixChangedFires();
  console.log('callbackEvaluation.test.ts passed');
}

run();
