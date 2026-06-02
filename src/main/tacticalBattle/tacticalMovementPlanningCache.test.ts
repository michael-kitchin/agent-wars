/**
 * Tests tactical march planning session cache invalidation and terrain-key correctness.
 * Run with: node dist/main/tacticalBattle/tacticalMovementPlanningCache.test.js
 */

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { firstRingCellDistinctFrom, tacticalRes4Cell } from './testSupport/tacticalRes4HexFixtures';
import { res4GridDiskNeighborsOrdered } from '../../shared/tacticalRes4TransportLink';
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

/**
 * Verifies plan output and memo reuse when only sub-unit positions change under stable terrain layer refs.
 *
 * Purpose: Regression guard for Phase 3 cache identity (terrain-only, not placement-driven).
 * When to use: After changes to `planTacticalRes4MarchWithSessionCache` env key logic.
 * Expected outcome: Identical plans before/after unrelated unit move; third call matches cached second.
 * Exceptions: None.
 */
test('plan memo and results survive sub-unit placement change within unchanged terrain', () => {
  const center = tacticalRes4Cell(36, 47);
  const ring = res4GridDiskNeighborsOrdered(center);
  const neighbor = ring[0]!;
  const goal = ring[1] ?? neighbor;
  const footprint = new Set([center, ...ring]);
  const sub = infantryAt(center);
  const base = {
    battleId: 'b-placement',
    tacticalTurnNumber: 1,
    subUnits: [sub],
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [goal]: 'plains' },
  };
  const planArgs = {
    fromH3: center,
    toH3: goal,
    res4Set: footprint,
    unitTypeForMovement: 'infantry',
    movementPointBudget: 3,
  };
  const first = planTacticalRes4MarchWithSessionCache(base, planArgs);
  const movedOnly = {
    ...base,
    subUnits: [{ ...sub, h3Index: neighbor }],
  };
  assert.equal(movedOnly.res4TerrainKindByH3, base.res4TerrainKindByH3);
  const second = planTacticalRes4MarchWithSessionCache(movedOnly, planArgs);
  assert.deepStrictEqual(second, first);
  const third = planTacticalRes4MarchWithSessionCache(movedOnly, planArgs);
  assert.deepStrictEqual(third, first);
});

/**
 * Verifies naval march plans do not depend on unrelated land sub-unit positions.
 *
 * Purpose: Placement-invariance gate for naval unit type before dropping placement from cache key.
 * When to use: After changes to session cache or naval branch of `planTacticalRes4March`.
 * Expected outcome: Same plan when an infantry sub-unit moves to a different hex.
 * Exceptions: None.
 */
test('naval plan is invariant to unrelated sub-unit placement when terrain is unchanged', () => {
  const water = tacticalRes4Cell(37, 48);
  const coastal = firstRingCellDistinctFrom(water);
  const footprint = new Set([water, coastal]);
  const navalSub: TacticalSubUnitSnapshot = {
    id: 'naval-1',
    parentUnitId: 'parent-naval',
    player: 'opponent',
    unitType: 'naval',
    h3Index: water,
    displayName: 'Naval',
  };
  const landSub = infantryAt(coastal);
  const terrainBase = {
    battleId: 'b-naval-placement',
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'water',
    strategicHexTerrainKind: 'water',
    res4TerrainKindByH3: {
      [water]: 'water',
      [coastal]: 'coastal',
    },
    res4IsSeaportByH3: { [coastal]: true },
  };
  const planArgs = {
    fromH3: water,
    toH3: coastal,
    res4Set: footprint,
    unitTypeForMovement: 'naval',
    movementPointBudget: 2,
  };
  const withLandUnit = planTacticalRes4MarchWithSessionCache({ ...terrainBase, subUnits: [navalSub, landSub] }, planArgs);
  const landMoved = planTacticalRes4MarchWithSessionCache(
    { ...terrainBase, subUnits: [navalSub, { ...landSub, h3Index: water }] },
    planArgs
  );
  assert.deepStrictEqual(landMoved, withLandUnit);
});
