/**
 * Tactical ranged target resolution for draft sanitization and DEFEND engagement helpers.
 * Run: node dist/main/tacticalBattle/tacticalRangedTargetResolve.test.js
 */

import assert from 'node:assert/strict';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
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
  tacticalParentCell,
  tacticalPentagonCrossingPair,
  tacticalUnderCorner,
} from './testSupport/tacticalHexFixtures';

test('pickClosestEnemyTacticalRangedTargetForSubUnit prefers nearer human over farther', () => {
  const strategic = tacticalParentCell(12, 34);
  const tacticalNaval = tacticalUnderCorner(12, 34, { latEpsilon: 0.01, lngEpsilon: 0.01 });
  const sameParent = [...gridDisk(tacticalNaval, 8)].filter((h) => cellToParent(h, 1) === strategic);
  const tacticalNearHuman = sameParent.find((h) => h !== tacticalNaval && gridDistance(tacticalNaval, h) === 1);
  const tacticalFarHuman = sameParent.find((h) => h !== tacticalNaval && gridDistance(tacticalNaval, h) === 2);
  assert.ok(tacticalNearHuman && tacticalFarHuman, 'expected near and far human cells under res1 parent');
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-ranged-pick',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: sameParent.slice(0, 40),
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'coastal',
    strategicHexTerrainKind: 'water',
    tacticalTerrainKindByH3: Object.fromEntries(sameParent.slice(0, 40).map((h, i) => [h, i === 0 ? 'water' : 'plains'])),
    subUnits: [
      {
        id: 'opp-naval:01',
        parentUnitId: 'opp-naval',
        player: 'opponent',
        unitType: 'naval',
        h3Index: tacticalNaval,
        displayName: 'Naval',
      },
      {
        id: 'hum-near:01',
        parentUnitId: 'hum-near',
        player: 'human',
        unitType: 'infantry',
        h3Index: tacticalNearHuman,
        displayName: 'Near',
      },
      {
        id: 'hum-far:01',
        parentUnitId: 'hum-far',
        player: 'human',
        unitType: 'infantry',
        h3Index: tacticalFarHuman,
        displayName: 'Far',
      },
    ],
  };
  const picked = pickClosestEnemyTacticalRangedTargetForSubUnit(battle, 'opp-naval:01');
  assert.strictEqual(picked, tacticalNearHuman);
});

test('resolveTacticalRangedTargetForSubUnit retargets away from anchor without enemies', () => {
  const strategic = tacticalParentCell(12, 34);
  const tacticalNaval = tacticalUnderCorner(12, 34, { latEpsilon: 0.01, lngEpsilon: 0.01 });
  const anchor = battleFootprintOrigin(strategic, tacticalNaval);
  const sameParent = [...gridDisk(tacticalNaval, 8)].filter((h) => cellToParent(h, 1) === strategic);
  const tacticalHuman = sameParent.find((h) => h !== tacticalNaval && gridDistance(tacticalNaval, h) === 1);
  assert.ok(tacticalHuman, 'expected adjacent human cell');
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-ranged-retarget',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: sameParent.slice(0, 40),
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'coastal',
    strategicHexTerrainKind: 'water',
    tacticalTerrainKindByH3: Object.fromEntries(sameParent.slice(0, 40).map((h) => [h, h === tacticalNaval ? 'water' : 'plains'])),
    subUnits: [
      {
        id: 'opp-naval:01',
        parentUnitId: 'opp-naval',
        player: 'opponent',
        unitType: 'naval',
        h3Index: tacticalNaval,
        displayName: 'Naval',
      },
      {
        id: 'hum:01',
        parentUnitId: 'hum',
        player: 'human',
        unitType: 'infantry',
        h3Index: tacticalHuman,
        displayName: 'Human',
      },
    ],
  };
  const anchorHasEnemy = battle.subUnits.some((s) => s.h3Index === anchor && s.player === 'human');
  assert.ok(!anchorHasEnemy, 'anchor should not host enemy for this fixture');
  const resolved = resolveTacticalRangedTargetForSubUnit(battle, 'opp-naval:01', anchor);
  assert.strictEqual(resolved, tacticalHuman);
});

test('collectTacticalTempoAttacks emits ranged for non-air and air strike for air', () => {
  const strategic = tacticalParentCell(12, 34);
  const tacticalArmor = tacticalUnderCorner(12, 34, { latEpsilon: 0.01, lngEpsilon: 0.01 });
  const sameParent = [...gridDisk(tacticalArmor, 8)].filter((h) => cellToParent(h, 1) === strategic);
  const tacticalAirUnit = sameParent.find((h) => h !== tacticalArmor && gridDistance(tacticalArmor, h) === 1);
  const tacticalHumanEnemy = sameParent.find((h) => h !== tacticalArmor && h !== tacticalAirUnit && gridDistance(tacticalArmor, h) === 1);
  assert.ok(tacticalAirUnit && tacticalHumanEnemy, 'expected air and enemy cells adjacent to armor');
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-defend-engage',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: sameParent.slice(0, 40),
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'coastal',
    strategicHexTerrainKind: 'land',
    tacticalTerrainKindByH3: Object.fromEntries(sameParent.slice(0, 40).map((h) => [h, 'plains'])),
    subUnits: [
      {
        id: 'opp-armor:01',
        parentUnitId: 'opp-armor',
        player: 'opponent',
        unitType: 'armor',
        h3Index: tacticalArmor,
        displayName: 'Armor',
      },
      {
        id: 'opp-air:01',
        parentUnitId: 'opp-air',
        player: 'opponent',
        unitType: 'air',
        h3Index: tacticalAirUnit,
        displayName: 'Air',
      },
      {
        id: 'hum:01',
        parentUnitId: 'hum',
        player: 'human',
        unitType: 'infantry',
        h3Index: tacticalHumanEnemy,
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
  assert.strictEqual(rangedAttacks[0]!.targetH3Index, tacticalHumanEnemy);
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
  const modelTarget = tacticalArmor;
  const backfilled = withTacticalTempoAttacks(
    battle,
    {
      movementOrders: [],
      rangedAttacks: [{ unitId: 'opp-armor:01', targetH3Index: modelTarget }],
      airStrikes: [],
      ferryOrders: [],
      embarkOrders: [],
    },
    new Set<string>(),
    AI_SEAT_IDS[0]
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
    withTacticalTempoAttacks(battle, undefined, new Set<string>(), AI_SEAT_IDS[0])?.rangedAttacks.length,
    1,
    'an unconsulted beat with no draft at all must still produce the legal shots'
  );
});

test('pickClosestEnemyTacticalRangedTargetForSubUnit keeps a legal shot gridDistance cannot measure', () => {
  const pair = tacticalPentagonCrossingPair();
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-ranged-crossing',
    enclosingStrategicH3Index: pair.strategicH3Index,
    tacticalChildH3Indexes: pair.tacticalChildH3Indexes,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: Object.fromEntries(pair.tacticalChildH3Indexes.map((h) => [h, 'plains'])),
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
 * Returns the sorted-first tactical cell under a strategic parent for fixtures that mimic tactical footprint origin projection.
 *
 * Purpose: Test-only helper to assert retargeting avoids the ASCII-map origin when enemies live on other tactical cells.
 * When to use: `resolveTacticalRangedTargetForSubUnit` regression only.
 * Expected outcome: A tactical index under `strategic`, preferring ring cells near `preferredChild`.
 * Exceptions: None.
 */
test('a missile sub-unit has no legal ranged target', () => {
  const strategic = tacticalParentCell(12, 34);
  const tacticalMissile = tacticalUnderCorner(12, 34, { latEpsilon: 0.01, lngEpsilon: 0.01 });
  const sameParent = [...gridDisk(tacticalMissile, 8)].filter((h) => cellToParent(h, 1) === strategic);
  const tacticalEnemy = sameParent.find((h) => h !== tacticalMissile && gridDistance(tacticalMissile, h) === 1);
  assert.ok(tacticalEnemy, 'expected an adjacent enemy cell');
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-missile-ranged',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: sameParent.slice(0, 40),
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'coastal',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: Object.fromEntries(sameParent.slice(0, 40).map((h) => [h, 'plains'])),
    subUnits: [
      {
        id: 'missile:01',
        parentUnitId: 'parent-missile',
        player: AI_SEAT_IDS[0],
        unitType: 'missile',
        h3Index: tacticalMissile,
        displayName: 'Missile',
      },
      {
        id: 'hum:01',
        parentUnitId: 'hum',
        player: HUMAN_SEAT_ID,
        unitType: 'infantry',
        h3Index: tacticalEnemy,
        displayName: 'Human',
      },
    ],
  };
  assert.equal(pickClosestEnemyTacticalRangedTargetForSubUnit(battle, 'missile:01'), undefined);
});

function battleFootprintOrigin(strategic: string, preferredChild: string): string {
  const ring = [...gridDisk(preferredChild, 6)].filter((h) => cellToParent(h, 1) === strategic);
  return ring.sort()[0] ?? preferredChild;
}
