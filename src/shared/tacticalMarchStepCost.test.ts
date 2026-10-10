/**
 * Contract tests for classifying one battle march step under the terrain bonus.
 * Run: `npm run build:main` then `node dist/shared/tacticalMarchStepCost.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyTacticalMarchStep } from './tacticalMarchStepCost';
import type { TacticalBattleSnapshot } from './tacticalBattleTypes';
import { buildTacticalTerrainKindResolverFromSnapshot, type TacticalMovementCategory } from './tacticalTerrainMovement';
import { TACTICAL_TRANSPORT_ROAD_BUDGET_MULTIPLIER } from './tacticalTransportLink';
import { roadOnCells, tacticalLine } from './testSupport/tacticalLineFixtures';

const [fromH3, toH3] = tacticalLine(2) as [string, string];

/**
 * Classifies the step from `fromH3` into `toH3` with the given destination setup.
 *
 * Purpose: Each test states only the destination terrain and flags it cares about.
 * When to use: Every test in this file.
 * Expected outcome: The `classifyTacticalMarchStep` result; the start cell is plains, or water for naval.
 * Exceptions: None.
 */
function classifyInto(args: {
  readonly kind: string;
  readonly moveType: string;
  readonly category: TacticalMovementCategory | null;
  readonly flags?: Pick<
    TacticalBattleSnapshot,
    'tacticalIsUrbanByH3' | 'tacticalIsRubbleByH3' | 'tacticalIsSeaportByH3' | 'tacticalRoadSidesByH3' | 'tacticalRailSidesByH3'
  >;
}): ReturnType<typeof classifyTacticalMarchStep> {
  const terrain = buildTacticalTerrainKindResolverFromSnapshot({
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [fromH3]: args.moveType === 'naval' ? 'water' : 'plains', [toH3]: args.kind },
    ...args.flags,
  });
  return classifyTacticalMarchStep(
    {
      terrain,
      moveType: args.moveType,
      tacticalSet: new Set([fromH3, toH3]),
      marchStartH3: fromH3,
      marchGoalH3: toH3,
      terrainBonusCategory: args.category,
    },
    { fromH3, prevH3: null, toH3 }
  );
}

test('an off-road mountain step is a stop with the bonus and blocked without it', () => {
  assert.deepEqual(classifyInto({ kind: 'mountain', moveType: 'armor', category: 'mountains' }), {
    kind: 'terrainBonusStop',
  });
  assert.deepEqual(classifyInto({ kind: 'mountain', moveType: 'armor', category: null }), { kind: 'blocked' });
});

test('road and urban steps keep their price, and rubble stays blocked', () => {
  const armor = { kind: 'mountain', moveType: 'armor', category: 'mountains' as const };
  assert.deepEqual(classifyInto({ ...armor, flags: roadOnCells([fromH3, toH3]) }), {
    kind: 'normal',
    cost: 1 / TACTICAL_TRANSPORT_ROAD_BUDGET_MULTIPLIER,
  });
  assert.equal(classifyInto({ ...armor, flags: { tacticalIsUrbanByH3: { [toH3]: true } } }).kind, 'normal');
  assert.equal(classifyInto({ ...armor, flags: { tacticalIsRubbleByH3: { [toH3]: true } } }).kind, 'blocked');
});

test('naval stops only on plain wetlands cells', () => {
  const naval = { kind: 'wetlands', moveType: 'naval', category: 'wetlands' as const };
  assert.deepEqual(classifyInto(naval), { kind: 'terrainBonusStop' });
  assert.deepEqual(classifyInto({ ...naval, flags: { tacticalIsSeaportByH3: { [toH3]: true } } }), {
    kind: 'normal',
    cost: 1,
  });
  assert.equal(classifyInto({ ...naval, flags: { tacticalIsUrbanByH3: { [toH3]: true } } }).kind, 'blocked');
});
