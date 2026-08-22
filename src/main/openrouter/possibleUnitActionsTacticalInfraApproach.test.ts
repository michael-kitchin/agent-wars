/**
 * Tactical Best Options contracts for empty-city vs approach when the enclosing res1 is uncontrolled.
 *
 * Purpose: Empty urban tiles in an uncontrolled battle must not crowd out closing with observed humans, and must not appear as blank ranged shots.
 * When to use: After edits to tactical this-turn interest, approach, or ranged Best Options filters.
 * Expected outcome: Far enemies yield approach (not empty-city move/ranged); city capture remains when no enemy is observed.
 * Exceptions: Throws when the fixture cannot place an adjacent urban neighbor and a human six steps away under the same parent.
 */

import * as assert from 'assert';
import { cellToLatLng, cellToParent, gridDisk, gridDistance } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { LATLNG_DECIMAL_PLACES } from '../mapData';
import { buildTacticalAiPlanState } from '../tacticalBattle/buildTacticalAiPlanState';
import { tacticalRes1Cell, tacticalRes4UnderRes1Corner } from '../tacticalBattle/testSupport/tacticalRes4HexFixtures';
import { formatLatLng } from './promptText';
import { collectAggregatedPossibleActionRows } from './possibleUnitActions';
import type { GameStateSnapshot } from '../gameDb';

/**
 * Builds a tactical Best Options snapshot with an empty adjacent urban tile on an uncontrolled enclosing hex.
 *
 * Purpose: Shared fixture so far-enemy vs no-enemy cases differ only in whether a human is present.
 * When to use: The two contract tests in this file.
 * Expected outcome: Armor at the corner cell; urban neighbor at grid distance 1; optional human at grid distance 6.
 * Exceptions: Throws when those neighbors cannot be placed under the same res1 parent.
 */
function uncontrolledEmptyUrbanBattle(args: { includeFarHuman: boolean }): {
  tactical: TacticalBattleSnapshot;
  plan: GameStateSnapshot;
  res4Opp: string;
  res4Urban: string;
  res4Human: string | null;
} {
  const res1 = tacticalRes1Cell(12, 34);
  const res4Opp = tacticalRes4UnderRes1Corner(12, 34);
  const sameParent = [...gridDisk(res4Opp, 8)].filter((h) => cellToParent(h, 1) === res1);
  const res4Urban = sameParent.find((h) => h !== res4Opp && gridDistance(res4Opp, h) === 1);
  const res4Human = sameParent.find((h) => h !== res4Opp && h !== res4Urban && gridDistance(res4Opp, h) === 6);
  if (!res4Urban || (args.includeFarHuman && !res4Human)) {
    throw new Error('expected an adjacent urban neighbor and a human six steps away under the same res1 parent');
  }
  const far = args.includeFarHuman ? res4Human! : res4Opp;
  const footprint = sameParent.filter((h) => {
    try {
      return gridDistance(res4Opp, h) <= 6 || gridDistance(far, h) <= 6;
    } catch {
      return false;
    }
  });
  const terrain: Record<string, string> = {};
  for (const h of footprint) terrain[h] = 'plains';
  const subUnits: TacticalBattleSnapshot['subUnits'] = [
    {
      id: 'opp-arm-shooter',
      parentUnitId: 'parent-arm-a',
      player: 'opponent',
      unitType: 'armor',
      h3Index: res4Opp,
      displayName: 'Armor A',
    },
  ];
  if (args.includeFarHuman) {
    subUnits.push({
      id: 'hum-far-city',
      parentUnitId: 'parent-inf',
      player: 'human',
      unitType: 'infantry',
      h3Index: res4Human!,
      displayName: 'Infantry',
    });
  }
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-best-options-uncontrolled-urban',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: footprint,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: terrain,
    res4IsUrbanByH3: { [res4Urban]: true },
    subUnits,
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
    res1Control: [],
  };
  return {
    tactical,
    plan: buildTacticalAiPlanState(strategic, tactical),
    res4Opp,
    res4Urban,
    res4Human: args.includeFarHuman ? res4Human! : null,
  };
}

/**
 * Collects Best Options This Turn rows for a tactical battle.
 *
 * Purpose: Avoid repeating lat/lng map construction.
 * When to use: After `uncontrolledEmptyUrbanBattle` in this file.
 * Expected outcome: `forThisTurnOptionsTable` rows using briefing lat/lng formatting.
 * Exceptions: None.
 */
function collectTacticalThisTurnRows(plan: GameStateSnapshot, tactical: TacticalBattleSnapshot) {
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h of plan.hexes.map((x) => x.h3Index)) {
    latLngByH3.set(h, cellToLatLng(h) as [number, number]);
  }
  return collectAggregatedPossibleActionRows({
    state: plan,
    latLngByH3,
    formatLatLng: (ll) => formatLatLng(ll, LATLNG_DECIMAL_PLACES),
    tacticalBattle: tactical,
    forThisTurnOptionsTable: true,
  });
}

/**
 * Ensures empty uncontrolled urban tiles do not replace approach toward a far observed human.
 *
 * Purpose: Production battle on an uncontrolled enclosing hex listed empty-city ranged shots (blank Target Infrastructure) and suppressed approach.
 * When to use: After changing tactical this-turn interest or ranged Best Options filters.
 * Expected outcome: Approach toward the human; no move/melee or ranged onto the empty urban neighbor.
 * Exceptions: Throws if the geodesic neighbors cannot be placed.
 */
function testTacticalBestOptionsPrefersApproachOverEmptyUncontrolledUrban(): void {
  const { tactical, plan, res4Urban, res4Human } = uncontrolledEmptyUrbanBattle({ includeFarHuman: true });
  const rows = collectTacticalThisTurnRows(plan, tactical).filter((r) => r.unitId === 'opp-arm-shooter');
  assert.ok(
    !rows.some((r) => r.targetH3 === res4Urban && r.actionTypes.includes('move/melee')),
    'empty uncontrolled urban must not suppress approach as move/melee'
  );
  assert.ok(
    !rows.some((r) => r.targetH3 === res4Urban && r.actionTypes.includes('ranged')),
    'empty uncontrolled urban must not appear as a ranged Best Option when humans are out of range'
  );
  const approaches = rows.filter((r) => r.actionTypes.includes('approach'));
  assert.ok(approaches.length >= 1, 'expected approach rows toward the distant human');
  assert.ok(
    approaches.every((r) => gridDistance(r.targetH3, res4Human!) < 6),
    'approach targets must reduce distance to the distant human'
  );
  assert.ok(
    approaches.every((r) => typeof r.enemySummary === 'string' && r.enemySummary.includes('hum-far-city')),
    'approach Target Units lists nearest enemy unit id'
  );
}

/**
 * Ensures empty uncontrolled urban remains a capture option when no enemy is observed.
 *
 * Purpose: Approach-over-infra must not drop city capture when there is nobody to close on.
 * When to use: Together with `testTacticalBestOptionsPrefersApproachOverEmptyUncontrolledUrban`.
 * Expected outcome: A move/melee row onto the empty urban hex whose features name urban.
 * Exceptions: Throws if the adjacent urban neighbor cannot be placed.
 */
function testTacticalBestOptionsKeepsEmptyUncontrolledUrbanWhenNoEnemy(): void {
  const { tactical, plan, res4Urban } = uncontrolledEmptyUrbanBattle({ includeFarHuman: false });
  const rows = collectTacticalThisTurnRows(plan, tactical).filter((r) => r.unitId === 'opp-arm-shooter');
  const urbanMoves = rows.filter((r) => r.targetH3 === res4Urban && r.actionTypes.includes('move/melee'));
  assert.ok(urbanMoves.length >= 1, 'empty uncontrolled urban must remain move/melee when no enemy is observed');
  assert.ok(
    urbanMoves.every((r) => typeof r.featuresSummary === 'string' && r.featuresSummary.includes('urban')),
    'tactical Target Infrastructure must describe the urban tile from res4 flags'
  );
}

/**
 * Documents the module-scope binding `tests` (tests).
 *
 * Purpose: Runs the tactical empty-urban vs approach contracts.
 * When to use: `node dist/main/openrouter/possibleUnitActionsTacticalInfraApproach.test.js` after `build:main`.
 * Expected outcome: Each entry runs to completion or fails the process.
 * Exceptions: None.
 */
const tests = [
  {
    name: 'collectAggregatedPossibleActionRows tactical Best Options prefers approach over empty uncontrolled urban',
    fn: testTacticalBestOptionsPrefersApproachOverEmptyUncontrolledUrban,
  },
  {
    name: 'collectAggregatedPossibleActionRows tactical Best Options keeps empty urban when no enemy',
    fn: testTacticalBestOptionsKeepsEmptyUncontrolledUrbanWhenNoEnemy,
  },
];

/**
 * Runs the tactical empty-urban contracts and exits non-zero on the first failure.
 *
 * Purpose: Same harness style as `possibleUnitActions.test.ts`.
 * When to use: Direct node invocation of this file.
 * Expected outcome: `OK` lines for passing tests; process exit 1 on failure.
 * Exceptions: None.
 */
function run(): void {
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exit(1);
    }
  }
}

run();
