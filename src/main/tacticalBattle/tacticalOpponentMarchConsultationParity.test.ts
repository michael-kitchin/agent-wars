/**
 * Locks opponent tactical march validation used in AI consultation (`requestOrdersFlow`) to the same
 * `tacticalComputeMovementOrderOutcome` checks as Ready commit. Run with:
 * `node dist/main/tacticalBattle/tacticalOpponentMarchConsultationParity.test.js`
 */

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { gridDisk } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { resetTacticalMovementPlanningCacheForTests } from './tacticalMovementPlanningCache';
import { tacticalComputeMovementOrderOutcome } from './tacticalSnapshotGuards';
import {
  firstRingCellDistinctFrom,
  tacticalParentCell,
  tacticalCell,
} from './testSupport/tacticalHexFixtures';

beforeEach(() => {
  resetTacticalMovementPlanningCacheForTests();
});

test('opponent march outside res4 footprint fails (same gate as consultation mergedMovement loop)', () => {
  const center = tacticalCell(39, 49);
  const outside = firstRingCellDistinctFrom(center);
  const subUnits = [
    {
      id: 'opp:01',
      parentUnitId: 'opp-parent',
      player: 'opponent' as const,
      unitType: 'infantry',
      h3Index: center,
      displayName: 'Opp',
    },
  ];
  const battle: TacticalBattleSnapshot = {
    battleId: 'footprint-gate',
    enclosingStrategicH3Index: tacticalParentCell(39, 49),
    tacticalChildH3Indexes: [center],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    subUnits,
  };
  const tacticalSet = new Set(battle.tacticalChildH3Indexes);
  const sub = [...battle.subUnits];
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  const outcome = tacticalComputeMovementOrderOutcome({
    byId,
    sub,
    order: { unitId: 'opp:01', toH3Index: outside },
    tacticalSet,
    battle,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'outside_footprint');
});

test('opponent armor march blocked by mountain neighbor fails with planner context (terrain-weighted parity)', () => {
  const center = tacticalCell(40, 50);
  const neighbor = firstRingCellDistinctFrom(center);
  const subUnits = [
    {
      id: 'opp:01',
      parentUnitId: 'opp-parent',
      player: 'opponent' as const,
      unitType: 'armor',
      h3Index: center,
      displayName: 'Opp armor',
    },
  ];
  const battle: TacticalBattleSnapshot = {
    battleId: 'terrain-gate',
    enclosingStrategicH3Index: tacticalParentCell(40, 50),
    tacticalChildH3Indexes: [center, neighbor],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [neighbor]: 'mountain' },
    subUnits,
  };
  const tacticalSet = new Set(battle.tacticalChildH3Indexes);
  const sub = [...battle.subUnits];
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  const outcome = tacticalComputeMovementOrderOutcome({
    byId,
    sub,
    order: { unitId: 'opp:01', toH3Index: neighbor },
    tacticalSet,
    battle,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'out_of_range');
  assert.ok(typeof outcome.context['plannerReason'] === 'string');
});

test('opponent infantry on urban (budget 1): distant explicit_move clamps to first leg, not dropped', () => {
  const center = tacticalCell(5, 6);
  const ring1 = new Set(gridDisk(center, 1));
  const disk2 = [...gridDisk(center, 2)];
  const footprint = new Set(disk2);
  const far = disk2.find((h) => h !== center && !ring1.has(h));
  assert.ok(far);
  const subUnits = [
    {
      id: 'opp:01',
      parentUnitId: 'opp-parent',
      player: 'opponent' as const,
      unitType: 'infantry',
      h3Index: center,
      displayName: 'Opp inf',
    },
  ];
  const battle: TacticalBattleSnapshot = {
    battleId: 'clamp-urban',
    enclosingStrategicH3Index: tacticalParentCell(5, 6),
    tacticalChildH3Indexes: [...footprint],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalIsUrbanByH3: { [center]: true },
    subUnits,
  };
  const tacticalSet = new Set(battle.tacticalChildH3Indexes);
  const sub = [...battle.subUnits];
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  const outcome = tacticalComputeMovementOrderOutcome({
    byId,
    sub,
    order: { unitId: 'opp:01', toH3Index: far },
    tacticalSet,
    battle,
  });
  assert.ok(outcome.ok);
  assert.notEqual(outcome.appliedToH3Index, center);
  assert.notEqual(outcome.appliedToH3Index, far);
  assert.ok(tacticalSet.has(outcome.appliedToH3Index));
});

test('armor on urban: unreachable full goal still moves one step toward ordered hex (best-effort neighbor)', () => {
  const fromH3 = '84969b5ffffffff';
  const orderedToH3 = '84969bbffffffff';
  const foot = [...new Set([...gridDisk(fromH3, 3)])];
  const tacticalSet = new Set(foot);
  const subUnits = [
    {
      id: 'opp:armor-urban',
      parentUnitId: 'opp-parent',
      player: 'opponent' as const,
      unitType: 'armor',
      h3Index: fromH3,
      displayName: 'Opp armor',
    },
  ];
  const battle: TacticalBattleSnapshot = {
    battleId: 'best-effort-realhex',
    enclosingStrategicH3Index: '8196bffffffffff',
    tacticalChildH3Indexes: foot,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 13,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalIsUrbanByH3: { [fromH3]: true },
    subUnits,
  };
  const sub = [...battle.subUnits];
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  const outcome = tacticalComputeMovementOrderOutcome({
    byId,
    sub,
    order: { unitId: 'opp:armor-urban', toH3Index: orderedToH3 },
    tacticalSet,
    battle,
  });
  assert.ok(outcome.ok);
  assert.equal(outcome.appliedToH3Index, '84969b1ffffffff');
  assert.notEqual(outcome.appliedToH3Index, orderedToH3);
});

test('best-effort neighbor may stack onto a friendly-occupied cell', () => {
  const fromH3 = '84969b5ffffffff';
  const orderedToH3 = '84969bbffffffff';
  const friendH3 = '84969b1ffffffff';
  const foot = [...new Set([...gridDisk(fromH3, 3)])];
  const tacticalSet = new Set(foot);
  const subUnits = [
    {
      id: 'opp:armor-urban',
      parentUnitId: 'opp-parent',
      player: 'opponent' as const,
      unitType: 'armor',
      h3Index: fromH3,
      displayName: 'Opp armor',
    },
    {
      id: 'opp:armor-friend',
      parentUnitId: 'opp-parent',
      player: 'opponent' as const,
      unitType: 'armor',
      h3Index: friendH3,
      displayName: 'Opp friend',
    },
  ];
  const battle: TacticalBattleSnapshot = {
    battleId: 'best-effort-friendly',
    enclosingStrategicH3Index: '8196bffffffffff',
    tacticalChildH3Indexes: foot,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 13,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalIsUrbanByH3: { [fromH3]: true },
    subUnits,
  };
  const sub = [...battle.subUnits];
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  const outcome = tacticalComputeMovementOrderOutcome({
    byId,
    sub,
    order: { unitId: 'opp:armor-urban', toH3Index: orderedToH3 },
    tacticalSet,
    battle,
  });
  assert.equal(outcome.ok, true);
  if (outcome.ok) assert.equal(outcome.appliedToH3Index, friendH3);
});

