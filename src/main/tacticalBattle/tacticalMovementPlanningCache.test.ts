/**
 * Tests tactical march planning session cache invalidation and terrain-key correctness.
 * Run with: node dist/main/tacticalBattle/tacticalMovementPlanningCache.test.js
 */

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { firstRingCellDistinctFrom, tacticalCell } from './testSupport/tacticalHexFixtures';
import { tacticalGridDiskNeighborsOrdered } from '../../shared/tacticalTransportLink';
import {
  planTacticalMarchWithSessionCache,
  resetTacticalMovementPlanningCacheForTests,
} from './tacticalMovementPlanningCache';

beforeEach(() => {
  resetTacticalMovementPlanningCacheForTests();
});

/**
 * Builds a minimal human infantry tactical sub-unit fixture rooted at `center`.
 *
 * Purpose: Keeps cache tests readable while satisfying `TacticalSubUnitSnapshot` shape.
 * When to use: Any test case in this file that needs a single mover on a known tactical cell.
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
  const center = tacticalCell(33, 44);
  const neighbor = firstRingCellDistinctFrom(center);
  const footprint = new Set([center, neighbor]);
  const sub = infantryAt(center);
  const base = {
    battleId: 'b-same',
    tacticalTurnNumber: 1,
    subUnits: [sub],
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalChildH3Indexes: [...footprint],
    tacticalTerrainKindByH3: { [neighbor]: 'mountain' },
  };
  const p1 = planTacticalMarchWithSessionCache(base, {
    fromH3: center,
    toH3: neighbor,
    tacticalSet: footprint,
    unitTypeForMovement: 'infantry',
    movementPointBudget: 2,
  });
  assert.equal(p1.reachable, true);
  assert.equal(p1.totalCostToDestination, 2);
  const p2 = planTacticalMarchWithSessionCache(
    {
      ...base,
      tacticalTerrainKindByH3: { [neighbor]: 'plains' },
    },
    {
      fromH3: center,
      toH3: neighbor,
      tacticalSet: footprint,
      unitTypeForMovement: 'infantry',
      movementPointBudget: 2,
    }
  );
  assert.equal(p2.reachable, true);
  assert.equal(p2.totalCostToDestination, 1);
});

test('tactical turn advance resets session so planner sees updated terrain', () => {
  const center = tacticalCell(35, 46);
  const neighbor = firstRingCellDistinctFrom(center);
  const footprint = new Set([center, neighbor]);
  const sub = infantryAt(center);
  const b1 = {
    battleId: 'b-turn',
    tacticalTurnNumber: 1,
    subUnits: [sub],
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalChildH3Indexes: [...footprint],
    tacticalTerrainKindByH3: { [neighbor]: 'mountain' },
  };
  const first = planTacticalMarchWithSessionCache(b1, {
    fromH3: center,
    toH3: neighbor,
    tacticalSet: footprint,
    unitTypeForMovement: 'infantry',
    movementPointBudget: 2,
  });
  assert.equal(first.totalCostToDestination, 2);
  const second = planTacticalMarchWithSessionCache(
    { ...b1, tacticalTurnNumber: 2, tacticalTerrainKindByH3: { [neighbor]: 'plains' } },
    {
      fromH3: center,
      toH3: neighbor,
      tacticalSet: footprint,
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
 * When to use: After changes to `planTacticalMarchWithSessionCache` env key logic.
 * Expected outcome: Identical plans before/after unrelated unit move; third call matches cached second.
 * Exceptions: None.
 */
test('plan memo and results survive sub-unit placement change within unchanged terrain', () => {
  const center = tacticalCell(36, 47);
  const ring = tacticalGridDiskNeighborsOrdered(center);
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
    tacticalChildH3Indexes: [...footprint],
    tacticalTerrainKindByH3: { [goal]: 'plains' },
  };
  const planArgs = {
    fromH3: center,
    toH3: goal,
    tacticalSet: footprint,
    unitTypeForMovement: 'infantry',
    movementPointBudget: 3,
  };
  const first = planTacticalMarchWithSessionCache(base, planArgs);
  const movedOnly = {
    ...base,
    subUnits: [{ ...sub, h3Index: neighbor }],
  };
  assert.equal(movedOnly.tacticalTerrainKindByH3, base.tacticalTerrainKindByH3);
  const second = planTacticalMarchWithSessionCache(movedOnly, planArgs);
  assert.deepStrictEqual(second, first);
  const third = planTacticalMarchWithSessionCache(movedOnly, planArgs);
  assert.deepStrictEqual(third, first);
});

/**
 * Verifies naval march plans do not depend on unrelated land sub-unit positions.
 *
 * Purpose: Placement-invariance gate for naval unit type before dropping placement from cache key.
 * When to use: After changes to session cache or naval branch of `planTacticalMarch`.
 * Expected outcome: Same plan when an infantry sub-unit moves to a different hex.
 * Exceptions: None.
 */
test('naval plan is invariant to unrelated sub-unit placement when terrain is unchanged', () => {
  const water = tacticalCell(37, 48);
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
    tacticalChildH3Indexes: [...footprint],
    tacticalTerrainKindByH3: {
      [water]: 'water',
      [coastal]: 'coastal',
    },
    tacticalIsSeaportByH3: { [coastal]: true },
  };
  const planArgs = {
    fromH3: water,
    toH3: coastal,
    tacticalSet: footprint,
    unitTypeForMovement: 'naval',
    movementPointBudget: 2,
  };
  const withLandUnit = planTacticalMarchWithSessionCache({ ...terrainBase, subUnits: [navalSub, landSub] }, planArgs);
  const landMoved = planTacticalMarchWithSessionCache(
    { ...terrainBase, subUnits: [navalSub, { ...landSub, h3Index: water }] },
    planArgs
  );
  assert.deepStrictEqual(landMoved, withLandUnit);
});

/**
 * Regression: AI avoid-enemies Tool1 must not poison session adjacency so human cells become unreachable.
 *
 * Purpose: Locks the fix where the first `planTacticalMarchWithSessionCache` call after a terrain reset used a
 * filtered tacticalSet (enemy hexes removed) to build the process-global adjacency map, leaving human-occupied cells with
 * empty neighbor lists and instant `no_path` on every human march.
 * When to use: After changes to session footprint caching or Tool1 avoid-enemies set construction.
 * Expected outcome: After planning with a subset that omits the human cell, a full-footprint plan from that cell still reaches its neighbor.
 * Exceptions: None.
 */
test('avoid-enemies subset plan does not leave human origin cells with empty adjacency', () => {
  const center = tacticalCell(40, 50);
  const ring = tacticalGridDiskNeighborsOrdered(center);
  const humanCell = ring[0]!;
  const aiFrom = ring[1]!;
  const aiTo = ring[2] ?? ring[1]!;
  const humanNeighbor = ring.find((h) => h !== humanCell && tacticalGridDiskNeighborsOrdered(humanCell).includes(h)) ?? ring[3] ?? aiFrom;
  const footprintList = [center, ...ring];
  const footprint = new Set(footprintList);
  const kinds: Record<string, string> = {};
  for (const h of footprintList) kinds[h] = 'plains';
  const battle = {
    battleId: 'b-avoid-poison',
    tacticalTurnNumber: 3,
    subUnits: [
      infantryAt(humanCell),
      {
        id: 'ai-1',
        parentUnitId: 'ai-parent',
        player: 'opponent' as const,
        unitType: 'infantry' as const,
        h3Index: aiFrom,
        displayName: 'AI',
      },
    ],
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalChildH3Indexes: footprintList,
    tacticalTerrainKindByH3: kinds,
  };
  const avoidSet = new Set(footprintList.filter((h) => h !== humanCell));
  avoidSet.add(aiFrom);
  avoidSet.add(aiTo);
  const aiPlan = planTacticalMarchWithSessionCache(battle, {
    fromH3: aiFrom,
    toH3: aiTo,
    tacticalSet: avoidSet,
    unitTypeForMovement: 'infantry',
    movementPointBudget: 3,
  });
  assert.equal(aiPlan.reachable, true, 'AI subset plan should succeed');
  const humanPlan = planTacticalMarchWithSessionCache(battle, {
    fromH3: humanCell,
    toH3: humanNeighbor,
    tacticalSet: footprint,
    unitTypeForMovement: 'infantry',
    movementPointBudget: 3,
  });
  assert.equal(humanPlan.reachable, true, 'human march must remain pathable after avoid-enemies session cache seed');
  assert.ok(
    (humanPlan.pathToDestination?.length ?? 0) >= 2,
    'human plan should include a real path'
  );
});
