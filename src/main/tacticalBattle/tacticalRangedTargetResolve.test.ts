/**
 * Tactical ranged target resolution for draft sanitization and DEFEND engagement helpers.
 * Run: node dist/main/tacticalBattle/tacticalRangedTargetResolve.test.js
 */

import assert from 'node:assert/strict';
import { cellToParent, gridDisk, gridDistance } from 'h3-js';
import { test } from 'node:test';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import {
  pickClosestEnemyTacticalRangedTargetForSubUnit,
  resolveTacticalRangedTargetForSubUnit,
  collectTacticalTempoAttacks,
  withTacticalTempoAttacks,
} from './tacticalRangedTargetResolve';
import {
  tacticalRes1Cell,
  tacticalRes4PentagonCrossingPair,
  tacticalRes4UnderRes1Corner,
} from './testSupport/tacticalRes4HexFixtures';

test('pickClosestEnemyTacticalRangedTargetForSubUnit prefers nearer human over farther', () => {
  const res1 = tacticalRes1Cell(12, 34);
  const res4Naval = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01, lngEpsilon: 0.01 });
  const sameParent = [...gridDisk(res4Naval, 8)].filter((h) => cellToParent(h, 1) === res1);
  const res4NearHuman = sameParent.find((h) => h !== res4Naval && gridDistance(res4Naval, h) === 1);
  const res4FarHuman = sameParent.find((h) => h !== res4Naval && gridDistance(res4Naval, h) === 2);
  assert.ok(res4NearHuman && res4FarHuman, 'expected near and far human cells under res1 parent');
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-ranged-pick',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: sameParent.slice(0, 40),
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'coastal',
    strategicHexTerrainKind: 'water',
    res4TerrainKindByH3: Object.fromEntries(sameParent.slice(0, 40).map((h, i) => [h, i === 0 ? 'water' : 'plains'])),
    subUnits: [
      {
        id: 'opp-naval:01',
        parentUnitId: 'opp-naval',
        player: 'opponent',
        unitType: 'naval',
        h3Index: res4Naval,
        displayName: 'Naval',
      },
      {
        id: 'hum-near:01',
        parentUnitId: 'hum-near',
        player: 'human',
        unitType: 'infantry',
        h3Index: res4NearHuman,
        displayName: 'Near',
      },
      {
        id: 'hum-far:01',
        parentUnitId: 'hum-far',
        player: 'human',
        unitType: 'infantry',
        h3Index: res4FarHuman,
        displayName: 'Far',
      },
    ],
  };
  const picked = pickClosestEnemyTacticalRangedTargetForSubUnit(battle, 'opp-naval:01');
  assert.strictEqual(picked, res4NearHuman);
});

test('resolveTacticalRangedTargetForSubUnit retargets away from anchor without enemies', () => {
  const res1 = tacticalRes1Cell(12, 34);
  const res4Naval = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01, lngEpsilon: 0.01 });
  const anchor = battleFootprintOrigin(res1, res4Naval);
  const sameParent = [...gridDisk(res4Naval, 8)].filter((h) => cellToParent(h, 1) === res1);
  const res4Human = sameParent.find((h) => h !== res4Naval && gridDistance(res4Naval, h) === 1);
  assert.ok(res4Human, 'expected adjacent human cell');
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-ranged-retarget',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: sameParent.slice(0, 40),
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'coastal',
    strategicHexTerrainKind: 'water',
    res4TerrainKindByH3: Object.fromEntries(sameParent.slice(0, 40).map((h) => [h, h === res4Naval ? 'water' : 'plains'])),
    subUnits: [
      {
        id: 'opp-naval:01',
        parentUnitId: 'opp-naval',
        player: 'opponent',
        unitType: 'naval',
        h3Index: res4Naval,
        displayName: 'Naval',
      },
      {
        id: 'hum:01',
        parentUnitId: 'hum',
        player: 'human',
        unitType: 'infantry',
        h3Index: res4Human,
        displayName: 'Human',
      },
    ],
  };
  const anchorHasEnemy = battle.subUnits.some((s) => s.h3Index === anchor && s.player === 'human');
  assert.ok(!anchorHasEnemy, 'anchor should not host enemy for this fixture');
  const resolved = resolveTacticalRangedTargetForSubUnit(battle, 'opp-naval:01', anchor);
  assert.strictEqual(resolved, res4Human);
});

test('collectTacticalTempoAttacks emits ranged for non-air and air strike for air', () => {
  const res1 = tacticalRes1Cell(12, 34);
  const res4Armor = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01, lngEpsilon: 0.01 });
  const sameParent = [...gridDisk(res4Armor, 8)].filter((h) => cellToParent(h, 1) === res1);
  const res4AirUnit = sameParent.find((h) => h !== res4Armor && gridDistance(res4Armor, h) === 1);
  const res4HumanEnemy = sameParent.find((h) => h !== res4Armor && h !== res4AirUnit && gridDistance(res4Armor, h) === 1);
  assert.ok(res4AirUnit && res4HumanEnemy, 'expected air and enemy cells adjacent to armor');
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-defend-engage',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: sameParent.slice(0, 40),
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'coastal',
    strategicHexTerrainKind: 'land',
    res4TerrainKindByH3: Object.fromEntries(sameParent.slice(0, 40).map((h) => [h, 'plains'])),
    subUnits: [
      {
        id: 'opp-armor:01',
        parentUnitId: 'opp-armor',
        player: 'opponent',
        unitType: 'armor',
        h3Index: res4Armor,
        displayName: 'Armor',
      },
      {
        id: 'opp-air:01',
        parentUnitId: 'opp-air',
        player: 'opponent',
        unitType: 'air',
        h3Index: res4AirUnit,
        displayName: 'Air',
      },
      {
        id: 'hum:01',
        parentUnitId: 'hum',
        player: 'human',
        unitType: 'infantry',
        h3Index: res4HumanEnemy,
        displayName: 'Enemy',
      },
    ],
  };
  const { rangedAttacks, airStrikes } = collectTacticalTempoAttacks({
    battle,
    playerId: 'opponent',
    alreadyAttackingSubUnitIds: new Set<string>(),
    holdFireParentUnitIds: new Set<string>(),
  });
  assert.strictEqual(rangedAttacks.length, 1, 'armor should generate ranged');
  assert.strictEqual(rangedAttacks[0]!.unitId, 'opp-armor:01');
  assert.strictEqual(rangedAttacks[0]!.targetH3Index, res4HumanEnemy);
  assert.strictEqual(airStrikes.length, 1, 'air should generate air strike');
  assert.strictEqual(airStrikes[0]!.unitId, 'opp-air:01');
  assert.strictEqual(airStrikes[0]!.targetType, 'units');

  const withExclusions = collectTacticalTempoAttacks({
    battle,
    playerId: 'opponent',
    alreadyAttackingSubUnitIds: new Set(['opp-armor:01']),
    holdFireParentUnitIds: new Set(['opp-air']),
  });
  assert.strictEqual(
    withExclusions.rangedAttacks.length,
    0,
    'a sub-unit that already has an attack must not be given a second one'
  );
  assert.strictEqual(
    withExclusions.airStrikes.length,
    0,
    "a parent under hold_fire must keep its sub-units silent"
  );

  // The model keeps its agency in tactical too: a target it chose survives the backfill untouched, and the
  // sub-unit it named gains no second attack.
  const modelTarget = res4Armor;
  const backfilled = withTacticalTempoAttacks(
    battle,
    {
      movementOrders: [],
      rangedAttacks: [{ unitId: 'opp-armor:01', targetH3Index: modelTarget }],
      airStrikes: [],
      ferryOrders: [],
      embarkOrders: [],
    },
    new Set<string>()
  );
  const armorRows = (backfilled?.rangedAttacks ?? []).filter((r) => r.unitId === 'opp-armor:01');
  assert.strictEqual(armorRows.length, 1, 'the model-named sub-unit must keep exactly one attack');
  assert.strictEqual(armorRows[0]!.targetH3Index, modelTarget, 'the model target must survive the backfill');
  assert.strictEqual(
    (backfilled?.airStrikes ?? []).length,
    1,
    'the air sub-unit the model ignored must still be given its shot'
  );

  assert.strictEqual(
    withTacticalTempoAttacks(battle, undefined, new Set<string>())?.rangedAttacks.length,
    1,
    'an unconsulted beat with no draft at all must still produce the legal shots'
  );
});

test('pickClosestEnemyTacticalRangedTargetForSubUnit keeps a legal shot gridDistance cannot measure', () => {
  const pair = tacticalRes4PentagonCrossingPair();
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-ranged-crossing',
    enclosingRes1H3Index: pair.res1H3Index,
    res4ChildH3Indexes: pair.res4ChildH3Indexes,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: Object.fromEntries(pair.res4ChildH3Indexes.map((h) => [h, 'plains'])),
    subUnits: [
      {
        id: 'opp-infantry:01',
        parentUnitId: 'opp-infantry',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: pair.originH3Index,
        displayName: 'Infantry',
      },
      {
        id: 'hum-infantry:01',
        parentUnitId: 'hum-infantry',
        player: 'human',
        unitType: 'infantry',
        h3Index: pair.crossingH3Index,
        displayName: 'Human Infantry',
      },
    ],
  };

  const picked = pickClosestEnemyTacticalRangedTargetForSubUnit(battle, 'opp-infantry:01');

  assert.strictEqual(picked, pair.crossingH3Index);
});

/**
 * Returns the sorted-first res4 cell under a res1 parent for fixtures that mimic tactical footprint origin projection.
 *
 * Purpose: Test-only helper to assert retargeting avoids the ASCII-map origin when enemies live on other res4 cells.
 * When to use: `resolveTacticalRangedTargetForSubUnit` regression only.
 * Expected outcome: A res4 index under `res1`, preferring ring cells near `preferredChild`.
 * Exceptions: None.
 */
function battleFootprintOrigin(res1: string, preferredChild: string): string {
  const ring = [...gridDisk(preferredChild, 6)].filter((h) => cellToParent(h, 1) === res1);
  return ring.sort()[0] ?? preferredChild;
}
