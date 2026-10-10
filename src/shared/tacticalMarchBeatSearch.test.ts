/**
 * Contract tests for terrain-bonus movement through the battle march planner.
 * Run: `npm run build:main` then `node dist/shared/tacticalMarchBeatSearch.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planTacticalMarch, type TacticalMarchPlanArgs } from './tacticalMovementPlanner';
import { terrainBonusMarchCategoryFor } from './terrainBonusMarch';
import { buildTacticalTerrainKindResolverFromSnapshot, type TacticalMovementCategory } from './tacticalTerrainMovement';
import { detourAroundMiddle, roadOnCells, tacticalLine } from './testSupport/tacticalLineFixtures';

/**
 * Plans a march from the first to the last cell over exactly `cells`, with the given terrain kinds.
 *
 * Purpose: Keeps each test to its geometry, budget, and category.
 * When to use: Every planner test in this file.
 * Expected outcome: The `planTacticalMarch` result for that march.
 * Exceptions: None.
 */
function planOver(args: {
  readonly cells: readonly string[];
  readonly kinds: Record<string, string>;
  readonly unitType: string;
  readonly budget: number;
  readonly category: TacticalMovementCategory | null;
  readonly toH3?: string;
  readonly roads?: ReturnType<typeof roadOnCells>;
}): ReturnType<typeof planTacticalMarch> {
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: args.kinds,
    ...args.roads,
  });
  const planArgs: TacticalMarchPlanArgs = {
    fromH3: args.cells[0]!,
    toH3: args.toH3 ?? args.cells[args.cells.length - 1]!,
    tacticalSet: new Set(args.cells),
    unitTypeForMovement: args.unitType,
    movementPointBudget: args.budget,
    terrain,
    terrainBonusCategory: args.category,
  };
  return planTacticalMarch(planArgs);
}

/**
 * Maps cells to terrain kinds by position.
 *
 * Purpose: Short terrain setup for a line.
 * When to use: With `tacticalLine`.
 * Expected outcome: A record from each cell to the kind at the same index.
 * Exceptions: None.
 */
function kindsFor(cells: readonly string[], kinds: readonly string[]): Record<string, string> {
  return Object.fromEntries(cells.map((h, i) => [h, kinds[i]!]));
}

test('mountain-born armor enters an adjacent mountain this beat and stops there', () => {
  const cells = tacticalLine(2);
  const kinds = kindsFor(cells, ['plains', 'mountain']);
  const plan = planOver({ cells, kinds, unitType: 'armor', budget: 4, category: 'mountains' });
  assert.equal(plan.reachableThisTurn, true);
  assert.deepEqual(plan.pathToDestination, cells);
  assert.deepEqual(plan.firstStopWithinBudget, { stopH3: cells[1], consumedFullPath: true });
  assert.equal(plan.totalCostToDestination, 4);
  assert.equal(plan.usesTerrainBonus, true);

  const off = planOver({ cells, kinds, unitType: 'armor', budget: 4, category: null });
  assert.equal(off.reachable, false);
});

test('each mountain stop ends a beat', () => {
  const three = tacticalLine(3);
  const across = planOver({
    cells: three,
    kinds: kindsFor(three, ['plains', 'mountain', 'plains']),
    unitType: 'armor',
    budget: 4,
    category: 'mountains',
  });
  assert.equal(across.reachableThisTurn, false);
  assert.equal(across.firstStopWithinBudget.stopH3, three[1]);
  assert.equal(Math.ceil(across.totalCostToDestination / 4), 2);

  const four = tacticalLine(4);
  const twoMountains = planOver({
    cells: four,
    kinds: kindsFor(four, ['plains', 'mountain', 'mountain', 'plains']),
    unitType: 'armor',
    budget: 4,
    category: 'mountains',
  });
  assert.equal(twoMountains.firstStopWithinBudget.stopH3, four[1]);
  assert.equal(Math.ceil(twoMountains.totalCostToDestination / 4), 3);
});

test('a road through mountains keeps its normal route', () => {
  const cells = tacticalLine(5);
  const args = {
    cells,
    kinds: kindsFor(cells, ['plains', 'mountain', 'mountain', 'mountain', 'plains']),
    unitType: 'armor',
    budget: 4,
    roads: roadOnCells(cells),
  };
  const withBonus = planOver({ ...args, category: 'mountains' });
  assert.equal(withBonus.reachable, true);
  assert.equal(withBonus.usesTerrainBonus, undefined);
  assert.deepEqual(withBonus, planOver({ ...args, category: null }));
});

test('a detour that arrives in as many beats is kept', () => {
  const line = tacticalLine(3);
  const detour = detourAroundMiddle(line);
  const cells = [...line, ...detour];
  const kinds = kindsFor(cells, ['plains', 'mountain', 'plains', 'plains', 'plains']);
  const args = { cells, kinds, unitType: 'armor', budget: 2, toH3: line[2] };
  const withBonus = planOver({ ...args, category: 'mountains' });
  assert.equal(withBonus.usesTerrainBonus, undefined);
  assert.deepEqual(withBonus, planOver({ ...args, category: null }));
  assert.deepEqual(withBonus.pathToDestination, [line[0], ...detour, line[2]]);
});

test('a stop replaces a detour that takes more beats', () => {
  const line = tacticalLine(3);
  const detour = detourAroundMiddle(line);
  const cells = [...line, ...detour];
  const kinds = kindsFor(cells, ['plains', 'mountain', 'plains', 'forest', 'forest']);
  const plan = planOver({ cells, kinds, unitType: 'armor', budget: 2, category: 'mountains', toH3: line[2] });
  assert.equal(plan.usesTerrainBonus, true);
  assert.deepEqual(plan.pathToDestination, line);
  assert.equal(plan.firstStopWithinBudget.stopH3, line[1]);
  assert.equal(Math.ceil(plan.totalCostToDestination / 2), 2);
});

test('wetlands-born naval enters one wetlands cell per beat', () => {
  const cells = tacticalLine(3);
  const kinds = kindsFor(cells, ['water', 'wetlands', 'wetlands']);
  const args = { cells, kinds, unitType: 'naval', budget: 3 };
  const first = planOver({ ...args, category: 'wetlands', toH3: cells[1] });
  assert.equal(first.reachableThisTurn, true);
  assert.equal(first.usesTerrainBonus, true);

  const second = planOver({ ...args, category: 'wetlands' });
  assert.equal(second.reachableThisTurn, false);
  assert.equal(second.firstStopWithinBudget.stopH3, cells[1]);
  assert.equal(Math.ceil(second.totalCostToDestination / 3), 2);

  assert.equal(planOver({ ...args, category: null, toH3: cells[1] }).reachable, false);
});

test('infantry and plains-born naval gain no birth-terrain step', () => {
  const wetlands = tacticalLine(3);
  const infantry = {
    cells: wetlands,
    kinds: kindsFor(wetlands, ['plains', 'wetlands', 'plains']),
    unitType: 'infantry',
    budget: 2,
  };
  assert.deepEqual(planOver({ ...infantry, category: null }), planOver({ ...infantry, category: 'wetlands' }));

  const plains = tacticalLine(2);
  const navalBirth = terrainBonusMarchCategoryFor({ enabled: true, unitType: 'naval', birthTerrainKind: 'plains' });
  assert.equal(
    planOver({
      cells: plains,
      kinds: kindsFor(plains, ['water', 'plains']),
      unitType: 'naval',
      budget: 3,
      category: navalBirth,
    }).reachable,
    false
  );
});

test('leaving a road onto off-road birth terrain ends the beat, and the road cells before it do not', () => {
  const cells = tacticalLine(4);
  const kinds = kindsFor(cells, ['plains', 'mountain', 'mountain', 'plains']);
  const roads = roadOnCells(cells.slice(0, 2));
  const args = { cells, kinds, unitType: 'armor', budget: 4, roads };
  const ontoRoad = planOver({ ...args, category: 'mountains', toH3: cells[1] });
  assert.equal(ontoRoad.reachableThisTurn, true);
  assert.equal(ontoRoad.usesTerrainBonus, undefined);
  const offRoad = planOver({ ...args, category: 'mountains', toH3: cells[2] });
  assert.equal(offRoad.reachableThisTurn, true);
  assert.equal(offRoad.usesTerrainBonus, true);
  assert.equal(offRoad.firstStopWithinBudget.stopH3, cells[2]);
  assert.equal(planOver({ ...args, category: null, toH3: cells[2] }).reachable, false);
  const beyond = planOver({ ...args, category: 'mountains' });
  assert.equal(beyond.firstStopWithinBudget.stopH3, cells[2]);
  assert.equal(Math.ceil(beyond.totalCostToDestination / 4), 2);
});
