/**
 * Tests for tactical AI plan state projection. Run with: node dist/main/tacticalBattle/buildTacticalAiPlanState.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToParent } from 'h3-js';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { buildTacticalAiPlanState } from './buildTacticalAiPlanState';
import { firstRingCellDistinctFrom, tacticalParentCell, tacticalUnderCorner } from './testSupport/tacticalHexFixtures';

test('buildTacticalAiPlanState narrows hexes and units to tactical footprint', () => {
  const parentCell = tacticalParentCell(12, 34);
  const tacticala = tacticalUnderCorner(12, 34, { latEpsilon: 0.01 });
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: parentCell, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
  };
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-plan',
    enclosingStrategicH3Index: parentCell,
    tacticalChildH3Indexes: [tacticala],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'su-opp-1',
        parentUnitId: 'parent-1',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: tacticala,
        displayName: 'I Infantry (01)',
      },
    ],
  };
  const plan = buildTacticalAiPlanState(strategic, tactical);
  assert.equal(plan.hexes.length, 1);
  assert.equal(plan.units.length, 1);
  assert.equal(plan.hexes[0]!.h3Index, tacticala);
  assert.equal(cellToParent(plan.hexes[0]!.h3Index, 1), parentCell);
  assert.equal(plan.units[0]!.id, 'su-opp-1');
});

test('buildTacticalAiPlanState uses per-res4 terrain, not the enclosing water parent', () => {
  const parentCell = tacticalParentCell(12, 34);
  const tacticala = tacticalUnderCorner(12, 34, { latEpsilon: 0.01 });
  const tacticalb = firstRingCellDistinctFrom(tacticala);
  assert.notEqual(tacticala, tacticalb);
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: parentCell, terrain: 'water', terrainKind: 'ocean' }],
    units: [],
    pendingOrders: [],
  };
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-plan-mixed',
    enclosingStrategicH3Index: parentCell,
    tacticalChildH3Indexes: [tacticala, tacticalb],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'ocean',
    tacticalTerrainKindByH3: { [tacticala]: 'wetlands', [tacticalb]: 'water' },
    subUnits: [],
  };
  const plan = buildTacticalAiPlanState(strategic, tactical);
  const byH3 = new Map(plan.hexes.map((h) => [h.h3Index, h]));
  assert.equal(byH3.get(tacticala)?.terrainKind, 'wetlands');
  assert.notEqual(byH3.get(tacticala)?.terrain, 'water');
  assert.equal(byH3.get(tacticalb)?.terrain, 'water');
});
