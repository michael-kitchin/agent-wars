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
  generateTacticalDefendEngagementForPlayer,
} from './tacticalRangedTargetResolve';
import { tacticalRes1Cell, tacticalRes4UnderRes1Corner } from './testSupport/tacticalRes4HexFixtures';

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

test('generateTacticalDefendEngagementForPlayer emits ranged for non-air and air strike for air', () => {
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
  const { rangedAttacks, airStrikes } = generateTacticalDefendEngagementForPlayer(
    battle,
    'opponent',
    ['opp-armor', 'opp-air']
  );
  assert.strictEqual(rangedAttacks.length, 1, 'armor should generate ranged');
  assert.strictEqual(rangedAttacks[0]!.unitId, 'opp-armor:01');
  assert.strictEqual(rangedAttacks[0]!.targetH3Index, res4HumanEnemy);
  assert.strictEqual(airStrikes.length, 1, 'air should generate air strike');
  assert.strictEqual(airStrikes[0]!.unitId, 'opp-air:01');
  assert.strictEqual(airStrikes[0]!.targetType, 'units');
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
