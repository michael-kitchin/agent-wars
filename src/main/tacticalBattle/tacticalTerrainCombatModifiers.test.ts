/**
 * Tests tactical terrain combat modifiers (ranged LOS / caps and march budgets). Run with:
 * `node dist/main/tacticalBattle/tacticalTerrainCombatModifiers.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, gridPathCells } from 'h3-js';
import { computeGridPathCellsPure } from '../../shared/h3GridRangePure';
import {
  effectiveTacticalMovementPointBudgetForMarchLeg,
  effectiveTacticalRangedMaxRangeForAttacker,
  tacticalMountainBlocksImplicitLosForAirArmorNavalRanged,
  tacticalMountainLosBlockedState,
  tacticalUrbanRubbleFlagRecordsForFootprint,
  tacticalCellIsUrbanOrRubble,
  tacticalRangedDirectFirePassesTerrainAndRange,
  tacticalBriefingLandWater,
} from '../../shared/tacticalTerrainCombatModifiers';
import { MOVEMENT_RANGE_BY_UNIT_TYPE, RANGED_RANGE_BY_UNIT_TYPE } from '../../shared/tacticalRanges';
import { tacticalGridDiskNeighborsOrdered } from '../../shared/tacticalTransportLink';
import {
  firstRingCellDistinctFrom,
  tacticalCell,
  tacticalPentagonCrossingPair,
} from './testSupport/tacticalHexFixtures';

/**
 * Builds a road or rail side mask with every neighbor slot set.
 *
 * Purpose: Puts a corridor on the attacker cell so a regression that caps range from a road or rail fails the baseline test.
 * When to use: Fixture setup for an attacker cell that has a road or a rail.
 * Expected outcome: A boolean array whose length matches the cell's ring and whose entries are all true.
 * Exceptions: None.
 */
function allSidesTrue(cell: string): boolean[] {
  return Array.from({ length: tacticalGridDiskNeighborsOrdered(cell).length }, () => true);
}

const baseBattle = {
  strategicHexTerrain: 'land',
  strategicHexTerrainKind: 'plains',
  tacticalTerrainKindByH3: {} as Record<string, string>,
};

test('tacticalRes4UrbanRubbleFlagRecordsForFootprint marks rubble even when terrain kind stays plains', () => {
  const cell = tacticalCell(46, 56);
  const flags = tacticalUrbanRubbleFlagRecordsForFootprint([cell], [
    { h3Index: cell, terrainKind: 'plains', isUrban: false, isRubble: true },
  ]);
  assert.equal(flags.tacticalIsRubbleByH3?.[cell], true);
  assert.equal(flags.tacticalIsUrbanByH3?.[cell], undefined);
  const battle = { ...baseBattle, tacticalTerrainKindByH3: { [cell]: 'plains' }, ...flags };
  assert.equal(tacticalCellIsUrbanOrRubble(battle, cell), true);
});

test('armor on plains keeps the baseline tactical march budget (not reduced like forest armor)', () => {
  const plains = tacticalCell(41, 51);
  const battlePlains = {
    ...baseBattle,
    tacticalTerrainKindByH3: { [plains]: 'plains' },
  };
  const armorOnPlains = {
    id: 'a-plains',
    unitType: 'armor',
    h3Index: plains,
    embarkedOnSubUnitId: null as string | null,
  };
  const budget = effectiveTacticalMovementPointBudgetForMarchLeg(
    battlePlains,
    armorOnPlains,
    [armorOnPlains],
    'armor'
  );
  assert.equal(budget, MOVEMENT_RANGE_BY_UNIT_TYPE.armor);
});

test('armor in forest uses infantry movement budget; infantry in urban uses 1 MP', () => {
  const forest = tacticalCell(42, 52);
  const urban = tacticalCell(42, 53);
  const battleForest = {
    ...baseBattle,
    tacticalTerrainKindByH3: { [forest]: 'forest' },
  };
  const armorOnForest = {
    id: 'a1',
    unitType: 'armor',
    h3Index: forest,
    embarkedOnSubUnitId: null as string | null,
  };
  const bArmor = effectiveTacticalMovementPointBudgetForMarchLeg(battleForest, armorOnForest, [armorOnForest], 'armor');
  assert.equal(bArmor, 2);

  const battleUrban = {
    ...baseBattle,
    tacticalIsUrbanByH3: { [urban]: true },
    tacticalTerrainKindByH3: { [urban]: 'plains' },
  };
  const infOnUrban = {
    id: 'i1',
    unitType: 'infantry',
    h3Index: urban,
    embarkedOnSubUnitId: null as string | null,
  };
  const bInf = effectiveTacticalMovementPointBudgetForMarchLeg(battleUrban, infOnUrban, [infOnUrban], 'infantry');
  assert.equal(bInf, 1);
});

test('tactical march budget is never zero for non-air; air stays at zero (no res4 march leg)', () => {
  const cell = tacticalCell(48, 58);
  const battle = {
    ...baseBattle,
    tacticalTerrainKindByH3: { [cell]: 'plains' },
  };
  const air = {
    id: 't-air',
    unitType: 'air' as const,
    h3Index: cell,
    embarkedOnSubUnitId: null as string | null,
  };
  assert.equal(
    effectiveTacticalMovementPointBudgetForMarchLeg(battle, air, [air], 'air'),
    MOVEMENT_RANGE_BY_UNIT_TYPE.air
  );
  const inf = {
    id: 't-inf',
    unitType: 'infantry' as const,
    h3Index: cell,
    embarkedOnSubUnitId: null as string | null,
  };
  assert.ok(effectiveTacticalMovementPointBudgetForMarchLeg(battle, inf, [inf], 'infantry') >= 1);
});

test('armor in forest caps tactical ranged range to 1', () => {
  const cell = tacticalCell(43, 53);
  const battle = {
    ...baseBattle,
    tacticalTerrainKindByH3: { [cell]: 'forest' },
  };
  assert.equal(effectiveTacticalRangedMaxRangeForAttacker(battle, 'armor', cell), 1);
  assert.equal(effectiveTacticalRangedMaxRangeForAttacker(battle, 'naval', cell), 10);
});

test('armor and infantry on a road or rail keep tactical ranged baselines', () => {
  const roadCell = tacticalCell(60, 70);
  const railCell = tacticalCell(60, 71);
  const roadBattle = {
    ...baseBattle,
    tacticalTerrainKindByH3: { [roadCell]: 'desert', [railCell]: 'desert' },
    tacticalRoadSidesByH3: { [roadCell]: allSidesTrue(roadCell) },
    tacticalRailSidesByH3: { [railCell]: allSidesTrue(railCell) },
  };
  assert.equal(effectiveTacticalRangedMaxRangeForAttacker(roadBattle, 'armor', roadCell), RANGED_RANGE_BY_UNIT_TYPE.armor);
  assert.equal(effectiveTacticalRangedMaxRangeForAttacker(roadBattle, 'naval', roadCell), RANGED_RANGE_BY_UNIT_TYPE.naval);
  assert.equal(effectiveTacticalRangedMaxRangeForAttacker(roadBattle, 'infantry', railCell), RANGED_RANGE_BY_UNIT_TYPE.infantry);
});

test('forest urban and rubble still cap infantry and armor ranged range', () => {
  const forestCell = tacticalCell(62, 70);
  const urbanCell = tacticalCell(62, 71);
  const rubbleCell = tacticalCell(63, 70);
  const battle = {
    ...baseBattle,
    tacticalTerrainKindByH3: { [forestCell]: 'forest', [urbanCell]: 'plains', [rubbleCell]: 'plains' },
    tacticalIsUrbanByH3: { [urbanCell]: true },
    tacticalIsRubbleByH3: { [rubbleCell]: true },
    tacticalRoadSidesByH3: {
      [forestCell]: allSidesTrue(forestCell),
      [rubbleCell]: allSidesTrue(rubbleCell),
    },
  };
  assert.equal(effectiveTacticalRangedMaxRangeForAttacker(battle, 'armor', forestCell), 1);
  assert.equal(effectiveTacticalRangedMaxRangeForAttacker(battle, 'armor', urbanCell), 1);
  assert.equal(effectiveTacticalRangedMaxRangeForAttacker(battle, 'infantry', rubbleCell), 1);
});

test('an adjacent mountain target does not block armor or naval; infantry stays exempt', () => {
  const a = tacticalCell(44, 54);
  const b = firstRingCellDistinctFrom(a);
  const battle = {
    ...baseBattle,
    tacticalTerrainKindByH3: {
      [a]: 'plains',
      [b]: 'mountain',
    },
  };
  const path = gridPathCells(a, b);
  assert.equal(path.length, 2);
  assert.equal(tacticalMountainBlocksImplicitLosForAirArmorNavalRanged(battle, a, b, 'naval'), false);
  assert.equal(tacticalMountainBlocksImplicitLosForAirArmorNavalRanged(battle, a, b, 'armor'), false);
  assert.equal(tacticalMountainBlocksImplicitLosForAirArmorNavalRanged(battle, a, b, 'infantry'), false);
  const los = tacticalMountainLosBlockedState(battle, a, b, 'armor');
  assert.equal(los.traceFailed, false);
  assert.equal(los.blocked, false);
});

test('armor standing on a mountain can fire at an adjacent plains target', () => {
  const a = tacticalCell(46, 56);
  const b = firstRingCellDistinctFrom(a);
  const battle = {
    ...baseBattle,
    tacticalTerrainKindByH3: {
      [a]: 'mountain',
      [b]: 'plains',
    },
  };
  const los = tacticalMountainLosBlockedState(battle, a, b, 'armor');
  assert.equal(los.traceFailed, false);
  assert.equal(los.blocked, false);
});

/**
 * Finds a distance-2 cell whose shortest path has a cell strictly between the ends.
 *
 * Purpose: Intervening-mountain cases need a middle cell that is not the shooter or the target.
 * When to use: The mountain line-of-sight tests below.
 * Expected outcome: Origin, middle, and target indexes. Throws when no such path exists.
 * Exceptions: Throws when the disk has no path of length 3 or more.
 */
function pathWithMiddleCell(origin: string): { middle: string; target: string } {
  const target = [...gridDisk(origin, 2)].find((candidate) => {
    try {
      const path = gridPathCells(origin, candidate);
      return path.length >= 3 && path[0] === origin && path[path.length - 1] === candidate;
    } catch {
      return false;
    }
  });
  if (!target) throw new Error('expected a path with an intervening cell');
  return { middle: gridPathCells(origin, target)[1]!, target };
}

test('a mountain between the shooter and the target blocks armor and naval; infantry is exempt', () => {
  const origin = tacticalCell(47, 57);
  const { middle, target } = pathWithMiddleCell(origin);
  const battle = {
    ...baseBattle,
    tacticalTerrainKindByH3: {
      [origin]: 'plains',
      [middle]: 'mountain',
      [target]: 'plains',
    },
  };
  assert.equal(tacticalMountainBlocksImplicitLosForAirArmorNavalRanged(battle, origin, target, 'armor'), true);
  assert.equal(tacticalMountainBlocksImplicitLosForAirArmorNavalRanged(battle, origin, target, 'naval'), true);
  assert.equal(tacticalMountainBlocksImplicitLosForAirArmorNavalRanged(battle, origin, target, 'infantry'), false);
});

test('clear terrain stays shootable when the LOS trace crosses an icosahedron face boundary', () => {
  const pair = tacticalPentagonCrossingPair();
  const battle = {
    ...baseBattle,
    tacticalTerrainKindByH3: Object.fromEntries(pair.tacticalChildH3Indexes.map((h) => [h, 'plains'])),
  };

  for (const unitType of ['air', 'armor', 'naval'] as const) {
    const los = tacticalMountainLosBlockedState(battle, pair.originH3Index, pair.crossingH3Index, unitType);
    assert.equal(los.traceFailed, false, `${unitType} LOS trace must succeed across the face crossing`);
    assert.equal(los.blocked, false, `${unitType} must not be blocked by clear plains`);
  }
});

test('a mountain between the cells still blocks LOS across an icosahedron face boundary', () => {
  const pair = tacticalPentagonCrossingPair();
  const path = computeGridPathCellsPure(pair.originH3Index, pair.crossingH3Index);
  assert.ok(path);
  assert.ok(path.length >= 3, 'this face-crossing pair must have an intervening cell');
  const middle = path[1]!;
  const battle = {
    ...baseBattle,
    tacticalTerrainKindByH3: {
      ...Object.fromEntries(pair.tacticalChildH3Indexes.map((h) => [h, 'plains'])),
      [pair.originH3Index]: 'plains',
      [pair.crossingH3Index]: 'plains',
      [middle]: 'mountain',
    },
  };

  const los = tacticalMountainLosBlockedState(battle, pair.originH3Index, pair.crossingH3Index, 'naval');

  assert.equal(los.traceFailed, false);
  assert.equal(los.blocked, true);
});

test('tacticalRes4BriefingLandWater classifies wetlands as land even when the parent hex is water', () => {
  const wetlands = tacticalCell(12, 34);
  const ring = [...gridDisk(wetlands, 1)].filter((h) => h !== wetlands);
  const openWater = ring[0]!;
  const coastal = ring[1] ?? firstRingCellDistinctFrom(openWater);
  assert.notEqual(openWater, coastal);
  const battle = {
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'ocean',
    tacticalTerrainKindByH3: { [wetlands]: 'wetlands', [openWater]: 'water', [coastal]: 'coastal' },
  };
  assert.equal(tacticalBriefingLandWater(battle, wetlands), 'land');
  assert.equal(tacticalBriefingLandWater(battle, coastal), 'land');
  assert.equal(tacticalBriefingLandWater(battle, openWater), 'water');
});

test('tacticalRangedDirectFirePassesTerrainAndRange rejects naval shot through an intervening mountain', () => {
  const a = tacticalCell(45, 55);
  const { middle, target } = pathWithMiddleCell(a);
  const ring = new Set([a, middle, target]);
  const battle = {
    ...baseBattle,
    tacticalTerrainKindByH3: { [a]: 'plains', [middle]: 'mountain', [target]: 'plains' },
  };
  assert.equal(tacticalRangedDirectFirePassesTerrainAndRange(battle, ring, 'naval', a, target), false);
});
