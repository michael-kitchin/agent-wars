/**
 * Verification for ranged/melee phase resolution contracts.
 * Run with: node dist/main/combatResolution.test.js
 */

import * as assert from 'assert';
import { gridDisk, gridDistance, latLngToCell } from 'h3-js';
import {
  resolveOneMeleeEngagement,
  resolveOneRangedEngagement,
  runMeleePhase,
  runRangedPhase,
  type CombatUnit,
} from './combatResolution';

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
 * Defines the `testRangedMixedStackTargetsEnemiesOnlyAndEnemyReturnFireOnly` function shape (function testRangedMixedStackTargetsEnemiesOnlyAndEnemyReturnFireOnly(): void).

 * Purpose: Supports maintainability by documenting why `testRangedMixedStackTargetsEnemiesOnlyAndEnemyReturnFireOnly` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testMeleePhaseSkipHexLeavesThatHexUnresolved(): void {
  const hexA = '891f1d48b9fffff';
  const hexB = '891f1d48b8fffff';
  const units: CombatUnit[] = [
    makeUnit('h1', 'human', 'infantry', hexA),
    makeUnit('o1', 'opponent', 'infantry', hexA),
    makeUnit('h2', 'human', 'infantry', hexB),
    makeUnit('o2', 'opponent', 'infantry', hexB),
  ];
  const rollAlways1 = () => 0;
  const out = runMeleePhase(units, [hexA, hexB], rollAlways1, { skipMeleeHexes: new Set([hexA]) });
  assert.ok(!out.combatHexes.includes(hexA), 'skipped hex must not appear in melee combat hex list');
  assert.ok(out.combatHexes.includes(hexB), 'non-skipped contested hex should still resolve melee');
  assert.ok(!out.removedUnitIds.includes('h1') && !out.removedUnitIds.includes('o1'), 'units in skipped hex should not be removed by melee');
}

/**
 * Defines the `testMeleePhaseNoSkipResolvesMoreThanSkipOneHex` function shape (function testMeleePhaseNoSkipResolvesMoreThanSkipOneHex(): void).

 * Purpose: Phase E contract — Ignore runs stock melee everywhere; skipping one hex must strictly reduce resolved engagements vs full melee.
 * When to use: Regression guard paired with `testMeleePhaseSkipHexLeavesThatHexUnresolved`.
 * Expected outcome: Without skip, both contested hexes appear in `combatHexes` and strictly more (or equal rare edge) removals than skip-one-hex path for the same RNG.
 * Exceptions: None.
 */
function testMeleePhaseNoSkipResolvesMoreThanSkipOneHex(): void {
  const hexA = '891f1d48b9fffff';
  const hexB = '891f1d48b8fffff';
  const units: CombatUnit[] = [
    makeUnit('h1', 'human', 'infantry', hexA),
    makeUnit('o1', 'opponent', 'infantry', hexA),
    makeUnit('h2', 'human', 'infantry', hexB),
    makeUnit('o2', 'opponent', 'infantry', hexB),
  ];
  const rollAlways1 = () => 0;
  const full = runMeleePhase(units, [hexA, hexB], rollAlways1);
  const skipA = runMeleePhase(units, [hexA, hexB], rollAlways1, { skipMeleeHexes: new Set([hexA]) });
  assert.ok(full.combatHexes.includes(hexA) && full.combatHexes.includes(hexB), 'full melee lists every contested hex');
  assert.ok(
    full.removedUnitIds.length > skipA.removedUnitIds.length,
    'Ignore-equivalent full melee should remove strictly more units than skipping one hex alone'
  );
}

function testRangedMixedStackTargetsEnemiesOnlyAndEnemyReturnFireOnly(): void {
  const hex = '891f1d48b9fffff';
  const units: CombatUnit[] = [
    makeUnit('opponent-armor-1', 'opponent', 'armor', hex),
    makeUnit('opponent-armor-2', 'opponent', 'armor', hex),
    makeUnit('opponent-armor-3', 'opponent', 'armor', hex),
    makeUnit('human-armor-1', 'human', 'armor', hex),
  ];
  const rangedOrders = [
    { unitId: 'opponent-armor-1', targetH3Index: hex },
    { unitId: 'opponent-armor-2', targetH3Index: hex },
  ];
  const rollAlways1 = () => 0; // d6 => 1, every eligible shot hits.

  const out = runRangedPhase(units, [hex], rangedOrders, rollAlways1);

  assert.deepStrictEqual(out.removedUnitIds.sort(), ['human-armor-1', 'opponent-armor-1'].sort());
  assert.strictEqual(out.killsByDirectFire?.length, 1, 'only one enemy defender exists in the stack');
  assert.strictEqual(out.killsByDirectFire?.[0]?.victimId, 'human-armor-1');
  assert.deepStrictEqual(
    out.killsByDirectFire?.[0]?.killerIds.sort(),
    ['opponent-armor-1', 'opponent-armor-2'].sort(),
    'direct fire should attribute kills only to attacking side units'
  );
  assert.strictEqual(out.killsByReturnFire?.length, 1, 'only one enemy defender can return fire here');
  assert.strictEqual(out.killsByReturnFire?.[0]?.victimId, 'opponent-armor-1');
  assert.deepStrictEqual(
    out.killsByReturnFire?.[0]?.killerIds,
    ['human-armor-1'],
    'return fire should attribute kills only to enemy-side defenders'
  );
  assert.ok(
    (out.rangedResolutionShotLines?.length ?? 0) >= 1,
    'submitted orders must produce direct-fire shot lines'
  );
  assert.ok(
    out.rangedResolutionShotLines?.some((l) => l.fromH3Index === hex && l.toH3Index === hex),
    'direct-fire lines use attacker hex → target even for same-hex stacks'
  );
}

/**
 * Verifies adjacent-hex return fire emits defender→attacker shot lines (including when rolls miss).
 *
 * Purpose: Regression for resolution connectors when attacker and defender are not stacked.
 * When to use: After changing `runRangedPhase` shot-line emit or return-fire eligibility.
 * Expected outcome: Direct line attacker→defender plus return-fire line defender→attacker; combat hexes non-empty.
 * Exceptions: None.
 */
function testRangedAdjacentReturnFireEmitsShotLinesIncludingMisses(): void {
  // Valid res-9 cell (same fixture family as rangedResolutionShotLines tests).
  const defenderHex = '89283082807ffff';
  const attackerHex = gridDisk(defenderHex, 1).find((h) => h !== defenderHex);
  assert.ok(attackerHex, 'need a neighbor hex');
  const units: CombatUnit[] = [
    makeUnit('atk', 'human', 'armor', attackerHex!),
    makeUnit('def', 'opponent', 'armor', defenderHex),
  ];
  // High rolls → every shot misses, but return-fire eligibility edges must still emit.
  const rollAlwaysMiss = () => 0.999;
  const out = runRangedPhase(
    units,
    [defenderHex, attackerHex!],
    [{ unitId: 'atk', targetH3Index: defenderHex }],
    rollAlwaysMiss
  );
  assert.ok((out.combatHexes?.length ?? 0) > 0, 'engagement must arm lightning hexes');
  assert.ok(
    out.rangedResolutionShotLines?.some(
      (l) => l.fromH3Index === attackerHex && l.toH3Index === defenderHex
    ),
    'direct-fire connector required'
  );
  assert.ok(
    out.rangedResolutionShotLines?.some(
      (l) => l.fromH3Index === defenderHex && l.toH3Index === attackerHex
    ),
    'return-fire connector required even on miss'
  );
  assert.deepStrictEqual(out.removedUnitIds, []);
}

/**
 * Verifies empty-target orders do not attach shot lines when no combat hexes (no lightning window).
 *
 * Purpose: Keeps IPC payload aligned with lightning-gated draw policy.
 * When to use: After changing `runRangedPhase` shot-line gating.
 * Expected outcome: `rangedResolutionShotLines` omitted; `combatHexes` empty.
 * Exceptions: None.
 */
function testRangedEmptyTargetOmitsShotLinesWithoutCombatHexes(): void {
  const attackerHex = '89283082807ffff';
  const emptyTarget = gridDisk(attackerHex, 1).find((h) => h !== attackerHex);
  assert.ok(emptyTarget, 'need an empty neighbor target');
  const units: CombatUnit[] = [makeUnit('atk', 'human', 'armor', attackerHex)];
  const out = runRangedPhase(
    units,
    [attackerHex, emptyTarget!],
    [{ unitId: 'atk', targetH3Index: emptyTarget! }],
    () => 0
  );
  assert.deepStrictEqual(out.combatHexes, []);
  assert.equal(out.rangedResolutionShotLines, undefined);
}

/**
 * Verifies strategic infantry does not return fire or emit return-fire shot lines.
 *
 * Purpose: Infantry is melee-only on the res1 map; adjacent bombardment must not draw reverse connectors or kills.
 * When to use: After changing `RANGE.infantry` or return-fire eligibility.
 * Expected outcome: Direct-fire connector may exist; no return-fire kill or connector.
 * Exceptions: None.
 */
function testStrategicInfantryDoesNotReturnFire(): void {
  const defenderHex = '89283082807ffff';
  const attackerHex = gridDisk(defenderHex, 1).find((h) => h !== defenderHex);
  assert.ok(attackerHex, 'need a neighbor hex');
  const units: CombatUnit[] = [
    makeUnit('atk', 'human', 'armor', attackerHex!),
    makeUnit('def', 'opponent', 'infantry', defenderHex),
  ];
  const out = runRangedPhase(
    units,
    [defenderHex, attackerHex!],
    [{ unitId: 'atk', targetH3Index: defenderHex }],
    () => 0,
    { theater: 'strategic' }
  );
  assert.ok(
    !out.rangedResolutionShotLines?.some(
      (l) => l.fromH3Index === defenderHex && l.toH3Index === attackerHex
    ),
    'strategic infantry must not emit return-fire connectors'
  );
  assert.equal(out.killsByReturnFire?.length ?? 0, 0, 'strategic infantry must not score return-fire kills');
}

/**
 * Verifies out-of-range naval does not return fire or emit return-fire shot lines.
 *
 * Purpose: Planning-parity strategic reach gate for return fire.
 * When to use: After changing `resolveOneRangedEngagement` eligibility.
 * Expected outcome: Direct-fire kill possible; no return-fire kill or connector.
 * Exceptions: None.
 */
function testStrategicNavalOutOfRangeDoesNotReturnFire(): void {
  const defenderHex = '89283082807ffff';
  const far = gridDisk(defenderHex, 3).find((h) => {
    try {
      return gridDistance(defenderHex, h) === 3;
    } catch {
      return false;
    }
  });
  assert.ok(far, 'need a distance-3 attacker hex');
  const units: CombatUnit[] = [
    makeUnit('atk', 'human', 'armor', far!),
    makeUnit('def', 'opponent', 'naval', defenderHex),
  ];
  const out = runRangedPhase(
    units,
    [defenderHex, far!],
    [{ unitId: 'atk', targetH3Index: defenderHex }],
    () => 0,
    { theater: 'strategic' }
  );
  assert.ok(
    !out.rangedResolutionShotLines?.some(
      (l) => l.fromH3Index === defenderHex && l.toH3Index === far
    ),
    'out-of-range naval must not emit return-fire connectors'
  );
  assert.equal(out.killsByReturnFire?.length ?? 0, 0, 'out-of-range naval must not score return-fire kills');
}

/**
 * Verifies air without airport cannot return fire.
 *
 * Purpose: Strike-planning airport gate on ranged-phase return fire.
 * When to use: After changing air return-fire eligibility.
 * Expected outcome: No return-fire kills or connectors.
 * Exceptions: None.
 */
function testStrategicAirWithoutAirportDoesNotReturnFire(): void {
  const defenderHex = '89283082807ffff';
  const attackerHex = gridDisk(defenderHex, 1).find((h) => h !== defenderHex);
  assert.ok(attackerHex, 'need a neighbor hex');
  const units: CombatUnit[] = [
    makeUnit('atk', 'human', 'armor', attackerHex!),
    makeUnit('def', 'opponent', 'air', defenderHex),
  ];
  const out = runRangedPhase(
    units,
    [defenderHex, attackerHex!],
    [{ unitId: 'atk', targetH3Index: defenderHex }],
    () => 0,
    { theater: 'strategic', hasIntactAirportAtAirBase: () => false }
  );
  assert.equal(out.killsByReturnFire?.length ?? 0, 0);
  assert.ok(
    !out.rangedResolutionShotLines?.some(
      (l) => l.fromH3Index === defenderHex && l.toH3Index === attackerHex
    )
  );
}

/**
 * Verifies tactical armor at distance 2 can return fire on clear plains (reach expansion).
 *
 * Purpose: Documents intentional expansion beyond strategic getRange(armor)=1.
 * When to use: After changing tactical return-fire context plumbing.
 * Expected outcome: Return fire removes the attacker when rolls always hit.
 * Exceptions: None.
 */
function testTacticalArmorDistance2ReturnFireOnPlains(): void {
  const defenderHex = latLngToCell(46.2, 56.2, 4);
  const at2 = gridDisk(defenderHex, 2).find((h) => {
    try {
      return gridDistance(defenderHex, h) === 2;
    } catch {
      return false;
    }
  });
  assert.ok(at2);
  const footprint = new Set(gridDisk(defenderHex, 2));
  const battle = {
    strategicHexTerrain: 'land' as const,
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [defenderHex]: 'plains', [at2!]: 'plains' },
  };
  const attackers = [makeUnit('atk', 'human', 'armor', at2!)];
  const defenders = [makeUnit('def', 'opponent', 'armor', defenderHex)];
  const out = resolveOneRangedEngagement(attackers, defenders, defenderHex, () => 1, {
    returnFireContext: {
      theater: 'tactical',
      tacticalBattle: battle,
      tacticalFootprint: footprint,
    },
  });
  assert.ok(out.attackerRemovedIds.includes('atk'), 'tactical armor at dist 2 must return fire');
}

/**
 * Verifies tactical mountain LOS blocks armor return fire.
 *
 * Purpose: Terrain planning parity for return fire.
 * When to use: After changing tactical return-fire eligibility wiring.
 * Expected outcome: No attacker removals from return fire when rolls would otherwise hit.
 * Exceptions: None.
 */
function testTacticalMountainBlocksArmorReturnFire(): void {
  const defenderHex = latLngToCell(48.2, 58.2, 4);
  const neighbor = gridDisk(defenderHex, 1).find((h) => h !== defenderHex);
  assert.ok(neighbor);
  const footprint = new Set([defenderHex, neighbor!]);
  const battle = {
    strategicHexTerrain: 'land' as const,
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [defenderHex]: 'plains', [neighbor!]: 'mountain' },
  };
  const attackers = [makeUnit('atk', 'human', 'armor', neighbor!)];
  const defenders = [makeUnit('def', 'opponent', 'armor', defenderHex)];
  const out = resolveOneRangedEngagement(attackers, defenders, defenderHex, () => 1, {
    returnFireContext: {
      theater: 'tactical',
      tacticalBattle: battle,
      tacticalFootprint: footprint,
    },
  });
  assert.deepStrictEqual(out.attackerRemovedIds, [], 'mountain LOS must block armor return fire');
}

/**
 * Builds a unit-interval RNG whose d6 conversion always gives `roll`.
 *
 * Purpose: Rigs phase-level dice (`Math.floor(next() * 6) + 1`) to one exact face.
 * When to use: With `runRangedPhase` / `runMeleePhase`; engagement-level functions take a d6 function directly.
 * Expected outcome: Every roll equals `roll`.
 * Exceptions: None.
 */
function rollExactly(roll: number): () => number {
  return () => (roll - 0.5) / 6;
}

/**
 * Verifies that an origin bonus turns a ranged miss into a hit.
 *
 * Purpose: Ranged fire must read the effective threshold.
 * When to use: After changing ranged hit tests or `attackHitThreshold`.
 * Expected outcome: Armor (attack 3) hits a 4 only with the bonus; infantry return fire (attack 1) misses either way.
 * Exceptions: None.
 */
function testRangedOriginBonusTurnsMissIntoHit(): void {
  const hex = '891f1d48b9fffff';
  const armor = makeUnit('opponent-armor-1', 'opponent', 'armor', hex);
  const infantry = makeUnit('human-infantry-1', 'human', 'infantry', hex);
  const orders = [{ unitId: armor.id, targetH3Index: hex }];
  const withBonus = runRangedPhase([{ ...armor, originHitBonus: 1 }, infantry], [hex], orders, rollExactly(4));
  assert.deepStrictEqual(withBonus.removedUnitIds, [infantry.id]);
  const without = runRangedPhase([armor, infantry], [hex], orders, rollExactly(4));
  assert.deepStrictEqual(without.removedUnitIds, []);
}

/**
 * Verifies that an origin bonus raises the melee defense threshold.
 *
 * Purpose: Melee defense rolls must read the effective threshold.
 * When to use: After changing melee hit tests or `defenseHitThreshold`.
 * Expected outcome: Infantry (defense 2) scores on a 3 only with the bonus.
 * Exceptions: None.
 */
function testMeleeDefenderOriginBonusScoresOnThree(): void {
  const hex = '891f1d48b9fffff';
  const attacker = makeUnit('human-infantry-1', 'human', 'infantry', hex);
  const defender = makeUnit('opponent-infantry-1', 'opponent', 'infantry', hex);
  const withBonus = resolveOneMeleeEngagement([attacker], [{ ...defender, originHitBonus: 1 }], () => 3);
  assert.deepStrictEqual(withBonus.attackerRemovedIds, [attacker.id]);
  const without = resolveOneMeleeEngagement([attacker], [defender], () => 3);
  assert.deepStrictEqual(without.attackerRemovedIds, []);
}

/**
 * Verifies that casualty order ignores the origin bonus.
 *
 * Purpose: Casualties are picked by printed defense, so a bonus must not shield a unit.
 * When to use: After changing casualty sorts.
 * Expected outcome: With infantry (bonus) and armor both at printed defense 2, infantry is still lost first.
 * Exceptions: None.
 */
function testCasualtyOrderIgnoresOriginBonus(): void {
  const hex = '891f1d48b9fffff';
  const attacker = makeUnit('human-infantry-1', 'human', 'infantry', hex);
  const infantry = { ...makeUnit('opponent-infantry-1', 'opponent', 'infantry', hex), originHitBonus: 1 as const };
  const armor = makeUnit('opponent-armor-1', 'opponent', 'armor', hex);
  const out = resolveOneMeleeEngagement([attacker], [infantry, armor], () => 1);
  assert.deepStrictEqual(out.defenderRemovedIds, [infantry.id]);
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testMeleePhaseSkipHexLeavesThatHexUnresolved();
  testMeleePhaseNoSkipResolvesMoreThanSkipOneHex();
  testRangedMixedStackTargetsEnemiesOnlyAndEnemyReturnFireOnly();
  testRangedAdjacentReturnFireEmitsShotLinesIncludingMisses();
  testRangedEmptyTargetOmitsShotLinesWithoutCombatHexes();
  testStrategicInfantryDoesNotReturnFire();
  testStrategicNavalOutOfRangeDoesNotReturnFire();
  testStrategicAirWithoutAirportDoesNotReturnFire();
  testTacticalArmorDistance2ReturnFireOnPlains();
  testTacticalMountainBlocksArmorReturnFire();
  testRangedOriginBonusTurnsMissIntoHit();
  testMeleeDefenderOriginBonusScoresOnThree();
  testCasualtyOrderIgnoresOriginBonus();
  console.log('combatResolution tests passed');
}

run();
