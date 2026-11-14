/**
 * Callback mandatory override evaluation — happy path and essential cases.
 * Run with: node dist/callbackEvaluation.test.js
 */

import * as assert from 'assert';
import { latLngToCell } from 'h3-js';
import { AI_SEAT_IDS } from '../shared/seatIds';
import { dbGetOne, dbRun, type GameStateSnapshot } from './gameDb';
import { withTempGameDb } from './testSupport/withTempGameDb';
import { writeCampaignObjectiveForSeat } from './gameDb/campaignObjectiveMemory';
import { writeOperationEventTurn } from './gameDb/operationMemory';
import { campaignReadyOverride, operationUpdateOverride } from './openRouter/afterResolution';
import {
  evaluateMandatoryOverrides,
  evaluateSubscriptionEvents,
  evaluateTacticalMandatoryOverrides,
} from './callbackEvaluation';
import type { CallbackSubscription } from './callbackSubscriptions';

/**
 * Documents the module-scope binding `baseState` (baseState: GameStateSnapshot).

 * Purpose: Supports maintainability by documenting why `baseState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const baseState: GameStateSnapshot = {
    /**
   * Documents the object literal property `turnNumber` (turnNumber: 10).

   * Purpose: Supports maintainability by documenting why `turnNumber` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnNumber: 10,
    /**
   * Documents the object literal property `phase` (phase: 'planning').

   * Purpose: Supports maintainability by documenting why `phase` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
phase: 'planning',
    /**
   * Documents the object literal property `hexes` (hexes: [{ h3Index: 'a', terrain: 'land', terrainKind: 'plains' }]).

   * Purpose: Supports maintainability by documenting why `hexes` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexes: [{ h3Index: 'a', terrain: 'land', terrainKind: 'plains' }],
    /**
   * Documents the object literal property `units` (units: [ { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: 'a' }, { id: 'opponent-inf-1', player: 'opponent', unitType: 'infan).

   * Purpose: Supports maintainability by documenting why `units` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
units: [
    { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: 'a' },
    { id: 'opponent-inf-1', player: 'opponent', unitType: 'infantry', h3Index: 'a' },
  ],
    /**
   * Documents the object literal property `pendingOrders` (pendingOrders: []).

   * Purpose: Supports maintainability by documenting why `pendingOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
pendingOrders: [],
};

/**
 * Defines the `testFirstConsultationFires` function shape (function testFirstConsultationFires(): void).

 * Purpose: Supports maintainability by documenting why `testFirstConsultationFires` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testFirstConsultationFires(): void {
  const results = evaluateMandatoryOverrides('opponent', baseState, 0, [], [], [], []);
  assert.ok(results.some((r) => r.type === 'first_consultation'));
}

/**
 * Defines the `testFirstCombatFires` function shape (function testFirstCombatFires(): void).

 * Purpose: Supports maintainability by documenting why `testFirstCombatFires` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testFirstCombatFires(): void {
  const results = evaluateMandatoryOverrides('opponent', 
    baseState,
    5,
    [], // none in combat since consultation
    ['opponent-armor-1'], // this resolution armor-1 was in combat
    [],
    []
  );
  assert.ok(results.some((r) => r.type === 'first_combat' && r.unitId === 'opponent-armor-1'));
}

/**
 * Defines the `testUnitDestroyedFires` function shape (function testUnitDestroyedFires(): void).

 * Purpose: Supports maintainability by documenting why `testUnitDestroyedFires` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testUnitDestroyedFires(): void {
  const results = evaluateMandatoryOverrides('opponent', 
    baseState,
    5,
    [],
    [],
    ['opponent-inf-1'],
    []
  );
  assert.ok(results.some((r) => r.type === 'unit_destroyed' && r.unitId === 'opponent-inf-1'));
}

/**
 * A spent missile is not a destroyed unit.
 *
 * Purpose: Launch resolution omits the missile from the removed-id list, so the callback must not see it.
 * When to use: After changing which ids `unit_destroyed` is raised for.
 * Expected outcome: The removed air id is reported. The spent missile id is not.
 * Exceptions: None.
 */
function testSpentMissileDoesNotRaiseUnitDestroyed(): void {
  const seatId = AI_SEAT_IDS[0];
  const results = evaluateMandatoryOverrides(
    seatId,
    baseState,
    5,
    [],
    [],
    ['a2-a1'],
    []
  );
  assert.equal(results.some((result) => result.type === 'unit_destroyed' && result.unitId === 'h1-m1'), false);
  assert.ok(results.some((result) => result.type === 'unit_destroyed' && result.unitId === 'a2-a1'));
}

/**
 * Defines the `testDeadmanFires` function shape (function testDeadmanFires(): void).

 * Purpose: Supports maintainability by documenting why `testDeadmanFires` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testDeadmanFires(): void {
  const results = evaluateMandatoryOverrides('opponent', 
    { ...baseState, turnNumber: 16 },
    10, // last consultation turn 10, now 16 -> 6 turns
    [],
    [],
    [],
    []
  );
  assert.ok(results.some((r) => r.type === 'deadman' && r.turnsSince >= 5));
}

/**
 * Defines the `testNoFirstCombatWhenAlreadyInSet` function shape (function testNoFirstCombatWhenAlreadyInSet(): void).

 * Purpose: Supports maintainability by documenting why `testNoFirstCombatWhenAlreadyInSet` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNoFirstCombatWhenAlreadyInSet(): void {
  const results = evaluateMandatoryOverrides('opponent', 
    baseState,
    5,
    ['opponent-armor-1'], // already in set
    ['opponent-armor-1'],
    [],
    []
  );
  assert.ok(!results.some((r) => r.type === 'first_combat'));
}

/**
 * Defines the `testAttackMixChangedFires` function shape (function testAttackMixChangedFires(): void).

 * Purpose: Supports maintainability by documenting why `testAttackMixChangedFires` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAttackMixChangedFires(): void {
  const turn1: GameStateSnapshot = {
    ...baseState,
    turnNumber: 1,
    hexes: [
      { h3Index: '822a17fffffffff', terrain: 'land', terrainKind: 'plains' },
      { h3Index: '822a1ffffffffff', terrain: 'land', terrainKind: 'plains' },
      { h3Index: '822a07fffffffff', terrain: 'land', terrainKind: 'plains' },
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
  evaluateMandatoryOverrides('opponent', turn1, 1, [], [], [], []);
  const results = evaluateMandatoryOverrides('opponent', turn2, 1, [], [], [], []);
  assert.ok(results.some((r) => r.type === 'attack_mix_changed'));
}

/**
 * Defines the `testInfrastructureDestroyedSubscriptionEventFires` function shape (function testInfrastructureDestroyedSubscriptionEventFires(): void).

 * Purpose: Supports maintainability by documenting why `testInfrastructureDestroyedSubscriptionEventFires` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/**
 * Defines the `testTacticalMandatoryEmitsUnitDestroyedPerOpponentLoss` function shape.
 *
 * Purpose: Ensures tactical post-beat mandatory evaluation stays scoped to sub-unit removals.
 * When to use: Regression when editing `evaluateTacticalMandatoryOverrides`.
 * Expected outcome: One `unit_destroyed` entry per removed opponent id.
 * Exceptions: Assertion failure on contract drift.
 */
function testTacticalMandatoryEmitsUnitDestroyedPerOpponentLoss(): void {
  const results = evaluateTacticalMandatoryOverrides({
    opponentCombatParticipantUnitIds: ['o-sub-1'],
    removedUnitIds: ['o-sub-1', 'h-sub-1'],
    removedOpponentUnitIds: ['o-sub-1'],
  });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0]!.type, 'unit_destroyed');
  assert.strictEqual((results[0] as { unitId: string }).unitId, 'o-sub-1');
}

function testInfrastructureDestroyedSubscriptionEventFires(): void {
  const subscriptions: CallbackSubscription[] = [
    { event: 'infrastructure_destroyed', params: { targetType: 'airport' }, subscribedTurn: 9 },
  ];
  const fired = evaluateSubscriptionEvents('opponent', baseState, subscriptions, {
    opponentCombatParticipantUnitIds: [],
    removedUnitIds: [],
    removedOpponentUnitIds: [],
    infrastructureDestroyedEvents: [
      {
        h3Index: '822a17fffffffff',
        targetType: 'airport',
        changedRubbleCount: 1,
        destroyedAirUnitsCount: 2,
      },
    ],
  });
  assert.ok(fired.some((r) => r.event === 'infrastructure_destroyed'));
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/**
 * An assembled campaign asks for a consult, and an assault or orders-off does not.
 *
 * Purpose: The assault must not wait for the next scheduled consult, and disabling orders must not consult forever.
 * When to use: Direct node invocation of this file.
 * Expected outcome: `campaign_ready` only for a massed assemble objective while orders are on.
 * Exceptions: Assertion failure on contract drift.
 */
function testCampaignReadyOverride(): void {
  withTempGameDb('aw-campaign-ready-', () => {
    const h3 = latLngToCell(10, 10, 1);
    const state = {
      hexes: [{ h3Index: h3, terrain: 'land', terrainKind: 'plains' }],
      units: [{ id: 'opponent-inf-1', player: 'opponent', unitType: 'infantry', h3Index: h3 }],
      phase: 'planning',
      turnNumber: 4,
      pendingOrders: [],
      scenarioId: 'region_vs_region',
      playerPerspective: 'opponent',
    } as unknown as GameStateSnapshot;
    const ops = { getOne: dbGetOne, run: dbRun };
    writeCampaignObjectiveForSeat(ops, 'opponent', {
      targetH3: h3,
      stagingH3: h3,
      phase: 'assemble',
      source: 'engine',
      chosenTurn: 1,
    });
    assert.equal(campaignReadyOverride(state, 'opponent', true)?.type, 'campaign_ready');
    assert.equal(campaignReadyOverride(state, 'opponent', false), null);
    writeCampaignObjectiveForSeat(ops, 'opponent', {
      targetH3: h3,
      stagingH3: h3,
      phase: 'assault',
      source: 'engine',
      chosenTurn: 1,
    });
    assert.equal(campaignReadyOverride(state, 'opponent', true), null);
  });
}

/**
 * A stored operation event on this turn asks for a consult.
 *
 * Purpose: An event-driven commander is asked when an operation changed or a menu was offered, and not on a later turn.
 * When to use: Direct node invocation of this file.
 * Expected outcome: `operation_update` only when the stored turn equals the state's turn and orders are on.
 * Exceptions: Assertion failure on contract drift.
 */
function testOperationUpdateOverride(): void {
  withTempGameDb('aw-operation-update-', () => {
    const state = { turnNumber: 4, units: [], hexes: [], phase: 'planning', pendingOrders: [] } as unknown as GameStateSnapshot;
    const ops = { getOne: dbGetOne, run: dbRun };
    writeOperationEventTurn(ops, 'opponent', 4);
    assert.equal(operationUpdateOverride(state, 'opponent', true)?.type, 'operation_update');
    assert.equal(operationUpdateOverride({ ...state, turnNumber: 5 }, 'opponent', true), null);
    assert.equal(operationUpdateOverride(state, 'opponent', false), null);
  });
}

function run(): void {
  testCampaignReadyOverride();
  testOperationUpdateOverride();
  testFirstConsultationFires();
  testFirstCombatFires();
  testUnitDestroyedFires();
  testSpentMissileDoesNotRaiseUnitDestroyed();
  testDeadmanFires();
  testNoFirstCombatWhenAlreadyInSet();
  testAttackMixChangedFires();
  testInfrastructureDestroyedSubscriptionEventFires();
  testTacticalMandatoryEmitsUnitDestroyedPerOpponentLoss();
  console.log('callbackEvaluation.test.ts passed');
}

run();
