/**
 * Verification for combat estimation (`estimate_combat`) and combat single-engagement APIs.
 * Happy path and essential failure cases. Run with: node dist/main/tools/combatEstimation.test.js
 */

import * as assert from 'assert';
import {
  resolveOneRangedEngagement,
  resolveOneMeleeEngagement,
  type CombatUnit,
} from '../combatResolution';
import { getAssessmentCategory, executeEstimateCombat, poissonBinomialPMF } from './combatEstimation';
import type { GameStateSnapshot } from '../gameDb';
import type { UnitOrigin } from '../../shared/unitOriginTypes';
import { TECH_ADVANCED_MIN_URBAN_HEX_COUNT } from '../../shared/techBonusRules';
import { ensureTerrainClassificationCacheLoaded, getRes4FeatureRowsForSeeding } from '../terrainClassificationCache';

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
  const rollAlways8 = () => 8;
  const atk = [makeUnit('a1', 'p1', 'armor', 'hex')];
  const def = [makeUnit('d1', 'p2', 'infantry', 'hex')];
  const out = resolveOneMeleeEngagement(atk, def, rollAlways8);
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

  // 1 armor (attack 10, defense 7) melee vs 1 infantry (attack 3, defense 7). Melee roles are random, so the
  // prediction averages "armor rolls 10/20 vs infantry 7/20" and "armor rolls 7/20 vs infantry 3/20".
  type RoleCase = { probabilityDefenderEliminated: number; probabilityAttackerLosesUnit: number };
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
  }; meleeRoleOutcomes?: { attackersRollAttack: RoleCase; attackersRollDefense: RoleCase } };
  assert.strictEqual(result.status, 'ok');
  assert.ok(Math.abs(result.prediction!.probabilityDefenderEliminated - 17 / 40) < eps);
  assert.ok(Math.abs(result.prediction!.probabilityAttackerLosesUnit - 1 / 4) < eps);
  assert.ok(Math.abs(result.prediction!.defenderLossesExpected - 17 / 40) < eps);
  assert.ok(Math.abs(result.prediction!.attackerLossesExpected - 1 / 4) < eps);
  assert.strictEqual(result.prediction!.assessment, 'even');
  const roles = result.meleeRoleOutcomes!;
  assert.ok(Math.abs(roles.attackersRollAttack.probabilityDefenderEliminated - 1 / 2) < eps);
  assert.ok(Math.abs(roles.attackersRollAttack.probabilityAttackerLosesUnit - 7 / 20) < eps);
  assert.ok(Math.abs(roles.attackersRollDefense.probabilityDefenderEliminated - 7 / 20) < eps);
  assert.ok(Math.abs(roles.attackersRollDefense.probabilityAttackerLosesUnit - 3 / 20) < eps);
}

/**
 * Verifies strategic estimates leave land units embarked at sea out of combat, like strategic resolution.
 *
 * Purpose: Pins the embarked-at-sea filter for automatic defenders and for attacker ids.
 * When to use: After changing strategic estimate unit filters.
 * Expected outcome: Only the carrier defends; naming the cargo as an attacker is an error.
 * Exceptions: None.
 */
function testStrategicEmbarkedAtSeaExcluded(): void {
  const h3 = '891f1d48b9fffff';
  const state: GameStateSnapshot = {
    hexes: [{ h3Index: h3, terrain: 'water', terrainKind: 'water' }],
    units: [
      { id: 'human-naval-1', player: 'human', unitType: 'naval', h3Index: h3 },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: h3, embarkedOnNavalUnitId: 'human-naval-1' },
    ],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const latLngByH3 = new Map<string, [number, number]>([[h3, [0.5, 0.5]]]);
  const resolveToH3 = () => h3;
  const ranged = executeEstimateCombat(
    { engagementType: 'ranged', attackers: { assumed: [{ type: 'naval', count: 1 }] }, targetHex: [0.5, 0.5] },
    state,
    latLngByH3,
    resolveToH3
  ) as { status: string; defenderSummary?: { totalUnits: number } };
  assert.strictEqual(ranged.status, 'ok');
  assert.strictEqual(ranged.defenderSummary?.totalUnits, 1);
  const asAttacker = executeEstimateCombat(
    { engagementType: 'melee', attackers: { units: ['human-infantry-1'] }, targetHex: [0.5, 0.5] },
    state,
    latLngByH3,
    resolveToH3
  );
  assert.strictEqual(asAttacker.status, 'error');
  assert.ok((asAttacker.error as string).includes('embarked'));
}

/**
 * Verifies malformed side arguments from the model fall back to the valid part instead of misreading it.
 *
 * Purpose: Model JSON is untrusted; a non-array `units` must not be iterated, and counts must be whole numbers.
 * When to use: After changing `estimate_combat` argument parsing.
 * Expected outcome: A string `units` is ignored in favor of `assumed`, and a count of 2.7 places two attackers.
 * Exceptions: None.
 */
function testExecuteEstimateCombatMalformedSideArgs(): void {
  const h3 = '891f1d48b9fffff';
  const state: GameStateSnapshot = {
    hexes: [{ h3Index: h3, terrain: 'land', terrainKind: 'plains' }],
    units: [{ id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: h3 }],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const latLngByH3 = new Map<string, [number, number]>([[h3, [0.5, 0.5]]]);
  const result = executeEstimateCombat(
    {
      engagementType: 'melee',
      attackers: { units: 'opponent-armor-1', assumed: [{ type: 'armor', count: 2.7 }] },
      targetHex: [0.5, 0.5],
    },
    state,
    latLngByH3,
    () => h3
  ) as { status: string; attackerSummary?: { totalUnits: number } };
  assert.strictEqual(result.status, 'ok');
  assert.strictEqual(result.attackerSummary?.totalUnits, 2);
}

/**
 * Builds a French-born origin for origin bonus estimates.
 *
 * Purpose: Only the birth country matters on the strategic map.
 * When to use: Origin bonus cases below.
 * Expected outcome: A complete `UnitOrigin`.
 * Exceptions: None.
 */
function frenchOrigin(birthH3Index: string): UnitOrigin {
  return {
    birthH3Index,
    birthRes4H3Index: null,
    birthTerrainKind: 'plains',
    birthIsUrban: false,
    birthCountryName: 'France',
    birthCountryCode: 'FR',
  };
}

/**
 * Verifies ranged estimates report the country bonus of an attacker standing in its birth country.
 *
 * Purpose: Estimates must use the same effective values as live dice.
 * When to use: After changing estimate thresholds or the strategic theater lookup.
 * Expected outcome: With the flag on, armor shows attack 12 and `originBonus: 2`; at High, attack 14 and `originBonus: 4`;
 * with it off, attack 10 and no key.
 * Exceptions: None.
 */
function testRangedEstimateReportsCountryBonus(): void {
  const h3 = '891f1d48b9fffff';
  const state = (countryBonusEnabled: boolean, countryBonusLevel?: 'high'): GameStateSnapshot => ({
    hexes: [{ h3Index: h3, terrain: 'land', terrainKind: 'plains', countryName: 'France' }],
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: h3, origin: frenchOrigin(h3) },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: h3 },
    ],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    countryBonusEnabled,
    ...(countryBonusLevel ? { countryBonusLevel } : {}),
  });
  const latLngByH3 = new Map<string, [number, number]>([[h3, [0.5, 0.5]]]);
  const args = { engagementType: 'ranged', attackers: { units: ['opponent-armor-1'] }, targetHex: [0.5, 0.5] };
  type Summary = { attackerSummary?: { units: { attackValue: number; originBonus?: number }[] } };
  const on = executeEstimateCombat(args, state(true), latLngByH3, () => h3) as Summary;
  assert.strictEqual(on.attackerSummary?.units[0]?.attackValue, 12);
  assert.strictEqual(on.attackerSummary?.units[0]?.originBonus, 2);
  const high = executeEstimateCombat(args, state(true, 'high'), latLngByH3, () => h3) as Summary;
  assert.strictEqual(high.attackerSummary?.units[0]?.attackValue, 14);
  assert.strictEqual(high.attackerSummary?.units[0]?.originBonus, 4);
  const off = executeEstimateCombat(args, state(false), latLngByH3, () => h3) as Summary;
  assert.strictEqual(off.attackerSummary?.units[0]?.attackValue, 10);
  assert.ok(!('originBonus' in off.attackerSummary!.units[0]!));
  assert.ok(!('techBonus' in off.attackerSummary!.units[0]!));
}

/**
 * Verifies melee attackers are judged at the target hex, where melee happens.
 *
 * Purpose: A melee attacker moves into the target before rolling.
 * When to use: After changing how estimates place melee attackers.
 * Expected outcome: An attacker standing outside its birth country still gets the bonus at a target inside it.
 * Exceptions: None.
 */
function testMeleeEstimateJudgesAttackerAtTarget(): void {
  const from = '891f1d48b8fffff';
  const target = '891f1d48b9fffff';
  const state: GameStateSnapshot = {
    hexes: [
      { h3Index: from, terrain: 'land', terrainKind: 'plains', countryName: 'Spain' },
      { h3Index: target, terrain: 'land', terrainKind: 'plains', countryName: 'France' },
    ],
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: from, origin: frenchOrigin(target) },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: target },
    ],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    countryBonusEnabled: true,
  };
  const latLngByH3 = new Map<string, [number, number]>([
    [from, [0.4, 0.4]],
    [target, [0.5, 0.5]],
  ]);
  const result = executeEstimateCombat(
    { engagementType: 'melee', attackers: { units: ['opponent-armor-1'] }, targetHex: [0.5, 0.5] },
    state,
    latLngByH3,
    () => target
  ) as { attackerSummary?: { units: { attackValue: number; originBonus?: number }[] } };
  assert.strictEqual(result.attackerSummary?.units[0]?.attackValue, 12);
  assert.strictEqual(result.attackerSummary?.units[0]?.originBonus, 2);
}

/**
 * Verifies strategic ranged estimates lower the attack value by the target hex's cover.
 *
 * Purpose: Estimates must use the same effective values as live dice.
 * When to use: After changing the strategic theater cover lookup or the attacker stamp.
 * Expected outcome: Armor shows attack 8 at a forest hex and 10 at a plains hex.
 * Exceptions: None.
 */
/**
 * Finds one res1 hex whose generated urban count is high enough to be Advanced.
 *
 * Purpose: Estimates classify tech from the terrain cache, so the fixture has to be a real birth hex.
 * When to use: The tech-bonus estimate case.
 * Expected outcome: A parent hex with at least `TECH_ADVANCED_MIN_URBAN_HEX_COUNT` urban cells.
 * Exceptions: Throws when the loaded cache has no such hex.
 */
function advancedBirthHex(): string {
  ensureTerrainClassificationCacheLoaded();
  const counts = new Map<string, number>();
  for (const row of getRes4FeatureRowsForSeeding()) {
    if (!row.isUrban) continue;
    const next = (counts.get(row.parentH3Index) ?? 0) + 1;
    if (next >= TECH_ADVANCED_MIN_URBAN_HEX_COUNT) return row.parentH3Index;
    counts.set(row.parentH3Index, next);
  }
  throw new Error(`terrain cache has no res1 hex with ${TECH_ADVANCED_MIN_URBAN_HEX_COUNT} urban cells`);
}

/**
 * Verifies a Low estimate raises Advanced armor's attack and leaves its defense printed.
 *
 * Purpose: The summary the model reads must match the dice, including a defense of 0 at Low.
 * When to use: After changing estimate tech stamping or the hit thresholds.
 * Expected outcome: Low armor attack is 12 and defense is 7, with `techBonus.defense` 0. High defense is 9.
 *   A unit with no birth hex stays at its printed values and has no `techBonus`.
 * Exceptions: None.
 */
function testRangedEstimateReportsTechBonus(): void {
  const h3 = '891f1d48b9fffff';
  const birth = advancedBirthHex();
  const origin = frenchOrigin(birth);
  const state = (techBonusLevel: 'low' | 'high'): GameStateSnapshot => ({
    hexes: [{ h3Index: h3, terrain: 'land', terrainKind: 'plains' }],
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: h3, origin },
      { id: 'human-armor-1', player: 'human', unitType: 'armor', h3Index: h3, origin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: h3 },
    ],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    techBonusEnabled: true,
    techBonusLevel,
  });
  const latLngByH3 = new Map<string, [number, number]>([[h3, [0.5, 0.5]]]);
  const args = { engagementType: 'ranged', attackers: { units: ['opponent-armor-1'] }, targetHex: [0.5, 0.5] };
  type TechRow = { unitId: string; attackValue?: number; defenseValue?: number; techBonus?: { attack: number; defense: number } };
  type Summary = { attackerSummary?: { units: TechRow[] }; defenderSummary?: { units: TechRow[] } };
  const low = executeEstimateCombat(args, state('low'), latLngByH3, () => h3) as Summary;
  const lowAttacker = low.attackerSummary?.units[0];
  assert.equal(lowAttacker?.attackValue, 12);
  assert.deepEqual(lowAttacker?.techBonus, { attack: 2, defense: 0 });
  const lowArmor = low.defenderSummary?.units.find((unit) => unit.unitId === 'human-armor-1');
  assert.equal(lowArmor?.defenseValue, 7);
  assert.deepEqual(lowArmor?.techBonus, { attack: 2, defense: 0 });
  const lowInfantry = low.defenderSummary?.units.find((unit) => unit.unitId === 'human-infantry-1');
  assert.equal(lowInfantry?.defenseValue, 7);
  assert.ok(lowInfantry && !('techBonus' in lowInfantry));
  const high = executeEstimateCombat(args, state('high'), latLngByH3, () => h3) as Summary;
  assert.equal(high.attackerSummary?.units[0]?.attackValue, 12);
  assert.equal(high.defenderSummary?.units.find((unit) => unit.unitId === 'human-armor-1')?.defenseValue, 9);
  assert.deepEqual(high.attackerSummary?.units[0]?.techBonus, { attack: 2, defense: 2 });
}

function testRangedEstimateAppliesTargetCover(): void {
  const h3 = '891f1d48b9fffff';
  const state = (terrainKind: string): GameStateSnapshot => ({
    hexes: [{ h3Index: h3, terrain: 'land', terrainKind }],
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: h3 },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: h3 },
    ],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  });
  const latLngByH3 = new Map<string, [number, number]>([[h3, [0.5, 0.5]]]);
  const args = { engagementType: 'ranged', attackers: { units: ['opponent-armor-1'] }, targetHex: [0.5, 0.5] };
  type Summary = { attackerSummary?: { units: { attackValue: number }[] } };
  const forest = executeEstimateCombat(args, state('forest'), latLngByH3, () => h3) as Summary;
  assert.strictEqual(forest.attackerSummary?.units[0]?.attackValue, 8);
  const plains = executeEstimateCombat(args, state('plains'), latLngByH3, () => h3) as Summary;
  assert.strictEqual(plains.attackerSummary?.units[0]?.attackValue, 10);
}

/**
 * Defines the `runCombatEstimationVerification` function shape (export function runCombatEstimationVerification(): void).

 * Purpose: Supports maintainability by documenting why `runCombatEstimationVerification` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function runCombatEstimationVerification(): void {
  testGetAssessmentCategory();
  testResolveOneMeleeDeterministic();
  testResolveOneRangedNoReturnFire();
  testResolveOneRangedAirWithoutAirportNoReturnFire();
  testPoissonBinomialPMF();
  testExactCombatProbabilities();
  testStrategicEmbarkedAtSeaExcluded();
  testExecuteEstimateCombatMalformedSideArgs();
  testExecuteEstimateCombatUncontested();
  testExecuteEstimateCombatUnitNotFound();
  testExecuteEstimateCombatInvalidHex();
  testRangedEstimateReportsCountryBonus();
  testMeleeEstimateJudgesAttackerAtTarget();
  testRangedEstimateReportsTechBonus();
  testRangedEstimateAppliesTargetCover();
  console.log('Tool 3 verification: all checks passed.');
}

if (typeof require !== 'undefined' && require.main === module) {
  runCombatEstimationVerification();
}
