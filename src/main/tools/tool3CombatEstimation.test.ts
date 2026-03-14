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
import { getAssessmentCategory, executeEstimateCombat } from './tool3CombatEstimation';
import type { GameStateSnapshot } from '../gameDb';

function makeUnit(id: string, player: string, unitType: string, h3Index: string): CombatUnit {
  return { id, player, unitType, h3Index };
}

function testGetAssessmentCategory(): void {
  assert.strictEqual(getAssessmentCategory(0.8, 0.2), 'strongly_favorable');
  assert.strictEqual(getAssessmentCategory(0.2, 0.8), 'strongly_unfavorable');
  assert.strictEqual(getAssessmentCategory(0.5, 0.5), 'even');
  assert.strictEqual(getAssessmentCategory(0.6, 0.35), 'favorable');
  assert.strictEqual(getAssessmentCategory(0.35, 0.6), 'unfavorable');
}

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

function testResolveOneRangedNoReturnFire(): void {
  const rollAlways1 = () => 1;
  const atk = [makeUnit('a1', 'p1', 'armor', 'hexA')];
  const def = [makeUnit('d1', 'p2', 'infantry', 'hexD')];
  const out = resolveOneRangedEngagement(atk, def, 'hexD', rollAlways1, {});
  assert.strictEqual(out.defenderRemovedIds.length, 1);
  assert.strictEqual(out.attackerRemovedIds.length, 0);
}

function testExecuteEstimateCombatUncontested(): void {
  const state: GameStateSnapshot = {
    hexes: [{ h3Index: '891f1d48b9fffff', terrain: 'land' }],
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

function testExecuteEstimateCombatUnitNotFound(): void {
  const state: GameStateSnapshot = {
    hexes: [{ h3Index: '891f1d48b9fffff', terrain: 'land' }],
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

export function runTool3Verification(): void {
  testGetAssessmentCategory();
  testResolveOneMeleeDeterministic();
  testResolveOneRangedNoReturnFire();
  testExecuteEstimateCombatUncontested();
  testExecuteEstimateCombatUnitNotFound();
  testExecuteEstimateCombatInvalidHex();
  console.log('Tool 3 verification: all checks passed.');
}

if (typeof require !== 'undefined' && require.main === module) {
  runTool3Verification();
}
