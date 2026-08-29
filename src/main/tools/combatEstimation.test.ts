/**
 * Verification for Tool 3 (estimate_combat) and combat single-engagement APIs.
 * Happy path and essential failure cases per execution plan Phase 4. Run with: node dist/tools/tool3CombatEstimation.test.js
 */

import * as assert from 'assert';
import {
  resolveOneRangedEngagement,
  resolveOneMeleeEngagement,
  type CombatUnit,
} from '../combatResolution';
import { getAssessmentCategory, executeEstimateCombat, poissonBinomialPMF } from './tool3CombatEstimation';
import type { GameStateSnapshot } from '../gameDb';

/**
 * Defines the `makeUnit` function shape (function makeUnit(id: string, player: string, unitType: string, h3Index: string): CombatUnit).

 * Purpose: Supports maintainability by documenting why `makeUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function makeUnit(id: string, player: string, unitType: string, h3Index: string): CombatUnit {
  return { id, player, unitType, h3Index };
}

/**
 * Defines the `testGetAssessmentCategory` function shape (function testGetAssessmentCategory(): void).

 * Purpose: Supports maintainability by documenting why `testGetAssessmentCategory` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testGetAssessmentCategory(): void {
  assert.strictEqual(getAssessmentCategory(0.8, 0.2), 'strongly_favorable');
  assert.strictEqual(getAssessmentCategory(0.2, 0.8), 'strongly_unfavorable');
  assert.strictEqual(getAssessmentCategory(0.5, 0.5), 'even');
  assert.strictEqual(getAssessmentCategory(0.6, 0.35), 'favorable');
  assert.strictEqual(getAssessmentCategory(0.35, 0.6), 'unfavorable');
}

/**
 * Defines the `testResolveOneMeleeDeterministic` function shape (function testResolveOneMeleeDeterministic(): void).

 * Purpose: Supports maintainability by documenting why `testResolveOneMeleeDeterministic` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testResolveOneMeleeDeterministic(): void {
  const rollAlways3 = () => 3;
  const atk = [makeUnit('a1', 'p1', 'armor', 'hex')];
  const def = [makeUnit('d1', 'p2', 'infantry', 'hex')];
  const out = resolveOneMeleeEngagement(atk, def, rollAlways3);
  assert.ok(atk[0]!.unitType === 'armor' && def[0]!.unitType === 'infantry');
  assert.strictEqual(out.defenderRemovedIds.length, 1);
  assert.strictEqual(out.defenderRemovedIds[0], 'd1');
  assert.strictEqual(out.attackerRemovedIds.length, 0);
}

/**
 * Defines the `testResolveOneRangedNoReturnFire` function shape (function testResolveOneRangedNoReturnFire(): void).

 * Purpose: Supports maintainability by documenting why `testResolveOneRangedNoReturnFire` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testResolveOneRangedNoReturnFire(): void {
  const rollAlways1 = () => 1;
  const atk = [makeUnit('a1', 'p1', 'armor', 'hexA')];
  const def = [makeUnit('d1', 'p2', 'infantry', 'hexD')];
  const out = resolveOneRangedEngagement(atk, def, 'hexD', rollAlways1, { skipReturnFire: true });
  assert.strictEqual(out.defenderRemovedIds.length, 1);
  assert.strictEqual(out.attackerRemovedIds.length, 0);
}

/**
 * Verifies air without airport cannot return fire under strategic planning-parity context.
 *
 * Purpose: Keeps Tool 3 / resolution eligibility aligned for air strike-base gate.
 * When to use: After changing return-fire eligibility wiring.
 * Expected outcome: Attacker not removed by return fire when rolls always hit.
 * Exceptions: None.
 */
function testResolveOneRangedAirWithoutAirportNoReturnFire(): void {
  const rollAlways1 = () => 1;
  const atk = [makeUnit('a1', 'p1', 'armor', 'hexA')];
  const def = [makeUnit('d1', 'p2', 'air', 'hexD')];
  const out = resolveOneRangedEngagement(atk, def, 'hexD', rollAlways1, {
    returnFireContext: {
      theater: 'strategic',
      hasIntactAirportAtAirBase: () => false,
    },
  });
  assert.strictEqual(out.attackerRemovedIds.length, 0);
}

/**
 * Defines the `testExecuteEstimateCombatUncontested` function shape (function testExecuteEstimateCombatUncontested(): void).

 * Purpose: Supports maintainability by documenting why `testExecuteEstimateCombatUncontested` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testExecuteEstimateCombatUncontested(): void {
  const state: GameStateSnapshot = {
    hexes: [{ h3Index: '891f1d48b9fffff', terrain: 'land', terrainKind: 'plains' }],
    units: [{ id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: '891f1d48b9fffff' }],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const latLngByH3 = new Map<string, [number, number]>();
  latLngByH3.set('891f1d48b9fffff', [0.5, 0.5]);
  const resolveToH3 = () => '891f1d48b9fffff';
  const result = executeEstimateCombat(
    {
      engagementType: 'ranged',
      attackers: { units: ['opponent-armor-1'] },
      targetHex: [0.5, 0.5],
    },
    state,
    latLngByH3,
    resolveToH3
  );
  assert.strictEqual(result.status, 'ok');
  assert.strictEqual((result as { defenderSummary?: { totalUnits: number } }).defenderSummary?.totalUnits, 0);
  assert.strictEqual((result as { prediction?: { assessment: string } }).prediction?.assessment, 'uncontested');
}

/**
 * Defines the `testExecuteEstimateCombatUnitNotFound` function shape (function testExecuteEstimateCombatUnitNotFound(): void).

 * Purpose: Supports maintainability by documenting why `testExecuteEstimateCombatUnitNotFound` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testExecuteEstimateCombatUnitNotFound(): void {
  const state: GameStateSnapshot = {
    hexes: [{ h3Index: '891f1d48b9fffff', terrain: 'land', terrainKind: 'plains' }],
    units: [],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const latLngByH3 = new Map<string, [number, number]>();
  latLngByH3.set('891f1d48b9fffff', [0.5, 0.5]);
  const resolveToH3 = () => '891f1d48b9fffff';
  const result = executeEstimateCombat(
    {
      engagementType: 'ranged',
      attackers: { units: ['nonexistent'] },
      targetHex: [0.5, 0.5],
    },
    state,
    latLngByH3,
    resolveToH3
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result.error as string).includes('Unit not found'));
}

/**
 * Defines the `testExecuteEstimateCombatInvalidHex` function shape (function testExecuteEstimateCombatInvalidHex(): void).

 * Purpose: Supports maintainability by documenting why `testExecuteEstimateCombatInvalidHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testExecuteEstimateCombatInvalidHex(): void {
  const state: GameStateSnapshot = {
    hexes: [],
    units: [],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const latLngByH3 = new Map<string, [number, number]>();
  const resolveToH3 = () => undefined;
  const result = executeEstimateCombat(
    {
      engagementType: 'melee',
      attackers: { assumed: [{ type: 'armor', count: 1 }] },
      targetHex: [99, 99],
    },
    state,
    latLngByH3,
    resolveToH3
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result.error as string).toLowerCase().includes('hex'));
}

/**
 * Defines the `testPoissonBinomialPMF` function shape (function testPoissonBinomialPMF(): void).

 * Purpose: Supports maintainability by documenting why `testPoissonBinomialPMF` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPoissonBinomialPMF(): void {
  const eps = 1e-12;
  const pmf0 = poissonBinomialPMF([]);
  assert.strictEqual(pmf0.length, 1);
  assert.ok(Math.abs(pmf0[0]! - 1.0) < eps);

  const pmf1 = poissonBinomialPMF([0.5]);
  assert.strictEqual(pmf1.length, 2);
  assert.ok(Math.abs(pmf1[0]! - 0.5) < eps);
  assert.ok(Math.abs(pmf1[1]! - 0.5) < eps);

  // Two coins with different probabilities: p1=1/6, p2=3/6
  const pmf2 = poissonBinomialPMF([1 / 6, 3 / 6]);
  assert.strictEqual(pmf2.length, 3);
  const p0 = (5 / 6) * (3 / 6);
  const p2 = (1 / 6) * (3 / 6);
  const p1 = 1 - p0 - p2;
  assert.ok(Math.abs(pmf2[0]! - p0) < eps);
  assert.ok(Math.abs(pmf2[1]! - p1) < eps);
  assert.ok(Math.abs(pmf2[2]! - p2) < eps);
}

/**
 * Defines the `testExactCombatProbabilities` function shape (function testExactCombatProbabilities(): void).

 * Purpose: Supports maintainability by documenting why `testExactCombatProbabilities` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testExactCombatProbabilities(): void {
  const eps = 1e-12;
  const h3 = '891f1d48b9fffff';
  const state: GameStateSnapshot = {
    hexes: [{ h3Index: h3, terrain: 'land', terrainKind: 'plains' }],
    units: [
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: h3 },
    ],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const latLngByH3 = new Map<string, [number, number]>();
  latLngByH3.set(h3, [0.5, 0.5]);
  const resolveToH3 = () => h3;

  // 1 armor (attack 3, p=3/6=0.5) melee vs 1 infantry (defense 2, p=2/6=1/3)
  const result = executeEstimateCombat(
    {
      engagementType: 'melee',
      attackers: { assumed: [{ type: 'armor', count: 1 }] },
      targetHex: [0.5, 0.5],
    },
    state,
    latLngByH3,
    resolveToH3
  ) as { status: string; prediction?: {
    probabilityDefenderEliminated: number;
    probabilityAttackerLosesUnit: number;
    defenderLossesExpected: number;
    attackerLossesExpected: number;
    assessment: string;
  }};
  assert.strictEqual(result.status, 'ok');
  assert.ok(Math.abs(result.prediction!.probabilityDefenderEliminated - 0.5) < eps);
  assert.ok(Math.abs(result.prediction!.probabilityAttackerLosesUnit - 1 / 3) < eps);
  assert.ok(Math.abs(result.prediction!.defenderLossesExpected - 0.5) < eps);
  assert.ok(Math.abs(result.prediction!.attackerLossesExpected - 1 / 3) < eps);
  assert.strictEqual(result.prediction!.assessment, 'even');
}

/**
 * Defines the `runTool3Verification` function shape (export function runTool3Verification(): void).

 * Purpose: Supports maintainability by documenting why `runTool3Verification` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function runTool3Verification(): void {
  testGetAssessmentCategory();
  testResolveOneMeleeDeterministic();
  testResolveOneRangedNoReturnFire();
  testResolveOneRangedAirWithoutAirportNoReturnFire();
  testPoissonBinomialPMF();
  testExactCombatProbabilities();
  testExecuteEstimateCombatUncontested();
  testExecuteEstimateCombatUnitNotFound();
  testExecuteEstimateCombatInvalidHex();
  console.log('Tool 3 verification: all checks passed.');
}

if (typeof require !== 'undefined' && require.main === module) {
  runTool3Verification();
}
