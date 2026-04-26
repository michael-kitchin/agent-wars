/**
 * Tests tactical terrain combat modifiers (ranged LOS / caps and march budgets). Run with:
 * `node dist/main/tacticalBattle/tacticalTerrainCombatModifiers.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridPathCells } from 'h3-js';
import {
  effectiveTacticalMovementPointBudgetForMarchLeg,
  effectiveTacticalRangedMaxRangeForAttacker,
  tacticalMountainBlocksImplicitLosForAirArmorNavalRanged,
  tacticalMountainLosBlockedState,
  tacticalRes4UrbanRubbleFlagRecordsForFootprint,
  tacticalRes4CellIsUrbanOrRubble,
  tacticalRangedDirectFirePassesTerrainAndRange,
} from '../../shared/tacticalTerrainCombatModifiers';
import { MOVEMENT_RANGE_BY_UNIT_TYPE } from '../../shared/tacticalRanges';
import { firstRingCellDistinctFrom, tacticalRes4Cell } from './testSupport/tacticalRes4HexFixtures';

const baseBattle = {
  strategicHexTerrain: 'land',
  strategicHexTerrainKind: 'plains',
  res4TerrainKindByH3: {} as Record<string, string>,
};

test('tacticalRes4UrbanRubbleFlagRecordsForFootprint marks rubble even when terrain kind stays plains', () => {
  const cell = tacticalRes4Cell(46, 56);
  const flags = tacticalRes4UrbanRubbleFlagRecordsForFootprint([cell], [
    { h3Index: cell, terrainKind: 'plains', isUrban: false, isRubble: true },
  ]);
  assert.equal(flags.res4IsRubbleByH3?.[cell], true);
  assert.equal(flags.res4IsUrbanByH3?.[cell], undefined);
  const battle = { ...baseBattle, res4TerrainKindByH3: { [cell]: 'plains' }, ...flags };
  assert.equal(tacticalRes4CellIsUrbanOrRubble(battle, cell), true);
});

test('armor on plains keeps the baseline tactical march budget (not reduced like forest armor)', () => {
  const plains = tacticalRes4Cell(41, 51);
  const battlePlains = {
    ...baseBattle,
    res4TerrainKindByH3: { [plains]: 'plains' },
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
  const forest = tacticalRes4Cell(42, 52);
  const urban = tacticalRes4Cell(42, 53);
  const battleForest = {
    ...baseBattle,
    res4TerrainKindByH3: { [forest]: 'forest' },
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
    res4IsUrbanByH3: { [urban]: true },
    res4TerrainKindByH3: { [urban]: 'plains' },
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
  const cell = tacticalRes4Cell(48, 58);
  const battle = {
    ...baseBattle,
    res4TerrainKindByH3: { [cell]: 'plains' },
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
  const cell = tacticalRes4Cell(43, 53);
  const battle = {
    ...baseBattle,
    res4TerrainKindByH3: { [cell]: 'forest' },
  };
  assert.equal(effectiveTacticalRangedMaxRangeForAttacker(battle, 'armor', cell), 1);
  assert.equal(effectiveTacticalRangedMaxRangeForAttacker(battle, 'naval', cell), 10);
});

test('naval ranged blocked when implicit LOS crosses mountain; infantry not subject to mountain LOS', () => {
  const a = tacticalRes4Cell(44, 54);
  const b = firstRingCellDistinctFrom(a);
  const battle = {
    ...baseBattle,
    res4TerrainKindByH3: {
      [a]: 'plains',
      [b]: 'mountain',
    },
  };
  const path = gridPathCells(a, b);
  assert.ok(path.length >= 1);
  assert.equal(tacticalMountainBlocksImplicitLosForAirArmorNavalRanged(battle, a, b, 'naval'), true);
  assert.equal(tacticalMountainBlocksImplicitLosForAirArmorNavalRanged(battle, a, b, 'infantry'), false);
  const los = tacticalMountainLosBlockedState(battle, a, b, 'armor');
  assert.equal(los.traceFailed, false);
  assert.equal(los.blocked, true);
});

test('tacticalRangedDirectFirePassesTerrainAndRange rejects naval shot through mountain footprint', () => {
  const a = tacticalRes4Cell(45, 55);
  const b = firstRingCellDistinctFrom(a);
  const ring = new Set([a, b]);
  const battle = {
    ...baseBattle,
    res4TerrainKindByH3: { [a]: 'plains', [b]: 'mountain' },
  };
  assert.equal(tacticalRangedDirectFirePassesTerrainAndRange(battle, ring, 'naval', a, b), false);
});
