/**
 * Tests for tactical AI plan state projection. Run with: node dist/main/tacticalBattle/buildTacticalAiPlanState.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToParent } from 'h3-js';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { buildTacticalAiPlanState } from './buildTacticalAiPlanState';
import { firstRingCellDistinctFrom, tacticalRes1Cell, tacticalRes4UnderRes1Corner } from './testSupport/tacticalRes4HexFixtures';

test('buildTacticalAiPlanState narrows hexes and units to tactical footprint', () => {
  const res1 = tacticalRes1Cell(12, 34);
  const res4a = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01 });
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
  };
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-plan',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [res4a],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'su-opp-1',
        parentUnitId: 'parent-1',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: res4a,
        displayName: 'I Infantry (01)',
      },
    ],
  };
  const plan = buildTacticalAiPlanState(strategic, tactical);
  assert.equal(plan.hexes.length, 1);
  assert.equal(plan.units.length, 1);
  assert.equal(plan.hexes[0]!.h3Index, res4a);
  assert.equal(cellToParent(plan.hexes[0]!.h3Index, 1), res1);
  assert.equal(plan.units[0]!.id, 'su-opp-1');
});

test('buildTacticalAiPlanState uses per-res4 terrain, not the enclosing water parent', () => {
  const res1 = tacticalRes1Cell(12, 34);
  const res4a = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01 });
  const res4b = firstRingCellDistinctFrom(res4a);
  assert.notEqual(res4a, res4b);
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: res1, terrain: 'water', terrainKind: 'ocean' }],
    units: [],
    pendingOrders: [],
  };
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-plan-mixed',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [res4a, res4b],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'ocean',
    res4TerrainKindByH3: { [res4a]: 'wetlands', [res4b]: 'water' },
    subUnits: [],
  };
  const plan = buildTacticalAiPlanState(strategic, tactical);
  const byH3 = new Map(plan.hexes.map((h) => [h.h3Index, h]));
  assert.equal(byH3.get(res4a)?.terrainKind, 'wetlands');
  assert.notEqual(byH3.get(res4a)?.terrain, 'water');
  assert.equal(byH3.get(res4b)?.terrain, 'water');
});
