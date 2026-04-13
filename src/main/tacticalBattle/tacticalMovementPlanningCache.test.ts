/**
 * Tests tactical march planning session cache invalidation and terrain-key correctness.
 * Run with: node dist/main/tacticalBattle/tacticalMovementPlanningCache.test.js
 */

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { firstRingCellDistinctFrom, tacticalRes4Cell } from './testSupport/tacticalRes4HexFixtures';
import {
  planTacticalRes4MarchWithSessionCache,
  resetTacticalMovementPlanningCacheForTests,
} from './tacticalMovementPlanningCache';

beforeEach(() => {
  resetTacticalMovementPlanningCacheForTests();
});

/**
 * Builds a minimal human infantry tactical sub-unit fixture rooted at `center`.
 *
 * Purpose: Keeps cache tests readable while satisfying `TacticalSubUnitSnapshot` shape.
 * When to use: Any test case in this file that needs a single mover on a known res4 cell.
 * Expected outcome: Valid snapshot row with `h3Index === center` and no embark state.
 * Exceptions: None.
 */
function infantryAt(center: string): TacticalSubUnitSnapshot {
  return {
    id: 'sub-1',
    parentUnitId: 'parent-1',
    player: 'human',
    unitType: 'infantry',
    h3Index: center,
    displayName: 'Inf',
  };
}

test('terrain override edits invalidate cached resolver when key count is unchanged', () => {
  const center = tacticalRes4Cell(33, 44);
  const neighbor = firstRingCellDistinctFrom(center);
  const footprint = new Set([center, neighbor]);
  const sub = infantryAt(center);
  const base = {
    battleId: 'b-same',
    tacticalTurnNumber: 1,
    subUnits: [sub],
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [neighbor]: 'mountain' },
  };
  const p1 = planTacticalRes4MarchWithSessionCache(base, {
    fromH3: center,
    toH3: neighbor,
    res4Set: footprint,
    unitTypeForMovement: 'infantry',
    movementPointBudget: 2,
  });
  assert.equal(p1.reachable, true);
  assert.equal(p1.totalCostToDestination, 2);
  const p2 = planTacticalRes4MarchWithSessionCache(
    {
      ...base,
      res4TerrainKindByH3: { [neighbor]: 'plains' },
    },
    {
      fromH3: center,
      toH3: neighbor,
      res4Set: footprint,
      unitTypeForMovement: 'infantry',
      movementPointBudget: 2,
    }
  );
  assert.equal(p2.reachable, true);
  assert.equal(p2.totalCostToDestination, 1);
});

test('tactical turn advance resets session so planner sees updated terrain', () => {
  const center = tacticalRes4Cell(35, 46);
  const neighbor = firstRingCellDistinctFrom(center);
  const footprint = new Set([center, neighbor]);
  const sub = infantryAt(center);
  const b1 = {
    battleId: 'b-turn',
    tacticalTurnNumber: 1,
    subUnits: [sub],
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [neighbor]: 'mountain' },
  };
  const first = planTacticalRes4MarchWithSessionCache(b1, {
    fromH3: center,
    toH3: neighbor,
    res4Set: footprint,
    unitTypeForMovement: 'infantry',
    movementPointBudget: 2,
  });
  assert.equal(first.totalCostToDestination, 2);
  const second = planTacticalRes4MarchWithSessionCache(
    { ...b1, tacticalTurnNumber: 2, res4TerrainKindByH3: { [neighbor]: 'plains' } },
    {
      fromH3: center,
      toH3: neighbor,
      res4Set: footprint,
      unitTypeForMovement: 'infantry',
      movementPointBudget: 2,
    }
  );
  assert.equal(second.totalCostToDestination, 1);
});
