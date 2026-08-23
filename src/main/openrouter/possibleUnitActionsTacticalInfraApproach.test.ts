/**
 * Tactical Best Options contracts for empty-city vs approach when the enclosing res1 is uncontrolled,
 * and for this-turn air strikes / ferry (footprint-wide human targets, no ferry rows).
 *
 * Purpose: Empty urban tiles in an uncontrolled battle must not crowd out closing with observed humans, and must not appear as blank ranged shots. Tactical air Best Options must match Air Operations (strike anywhere in the battle at human-occupied cells) and omit ferry dests.
 * When to use: After edits to tactical this-turn interest, approach, ranged, or air Best Options filters.
 * Expected outcome: Far enemies yield approach (not empty-city move/ranged); city capture remains when no enemy is observed; air strikes list far humans and omit empty urban and ferry.
 * Exceptions: Throws when the fixture cannot place an adjacent urban neighbor and a human six steps away under the same parent.
 */

import * as assert from 'assert';
import { cellToLatLng, cellToParent, gridDisk, gridDistance } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
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
 * Builds a tactical air Best Options fixture on a real enclosing-res1 airport snapshot (plan-state shape).
 *
 * Purpose: Production plan state keeps `res1Infrastructure` keyed by the enclosing res1 hex, not the air unit's res4 cell. Airport eligibility follows the parent of the air unit's cell (same as strike validation).
 * When to use: This-turn air-strike range, airport-gate, empty-urban omit, and ferry-omit contracts in this file.
 * Expected outcome: Opponent air at the corner cell; optional far human beyond strategic strike range; optional empty urban neighbor; parent-res1 airport intact unless `airportCount` is 0.
 * Exceptions: Throws when the requested neighbors cannot be placed under the same parent.
 */
function tacticalAirBestOptionsBattle(args: {
  includeFarHuman: boolean;
  includeEmptyUrban: boolean;
  airportCount: number;
}): {
  tactical: TacticalBattleSnapshot;
  plan: GameStateSnapshot;
  res4Air: string;
  res4FarHuman: string | null;
  res4EmptyUrban: string | null;
} {
  const res1 = tacticalRes1Cell(12, 34);
  const res4Air = tacticalRes4UnderRes1Corner(12, 34);
  const sameParent = [...gridDisk(res4Air, 8)].filter((h) => cellToParent(h, 1) === res1);
  const res4EmptyUrban = sameParent.find((h) => h !== res4Air && gridDistance(res4Air, h) === 1);
  const farDist = AIR_STRIKE_RANGE_HEXES + 3;
  const res4FarHuman = sameParent.find(
    (h) => h !== res4Air && h !== res4EmptyUrban && gridDistance(res4Air, h) === farDist
  );
  if (args.includeEmptyUrban && !res4EmptyUrban) {
    throw new Error('expected an adjacent urban neighbor under the same res1 parent');
  }
  if (args.includeFarHuman && !res4FarHuman) {
    throw new Error(`expected a human ${farDist} steps away under the same res1 parent`);
  }
  const far = args.includeFarHuman ? res4FarHuman! : res4Air;
  const footprint = sameParent.filter((h) => {
    try {
      return gridDistance(res4Air, h) <= farDist || gridDistance(far, h) <= farDist;
    } catch {
      return false;
    }
  });
  const terrain: Record<string, string> = {};
  for (const h of footprint) terrain[h] = 'plains';
  const subUnits: TacticalBattleSnapshot['subUnits'] = [
    {
      id: 'opp-air-strike',
      parentUnitId: 'parent-air',
      player: 'opponent',
      unitType: 'air',
      h3Index: res4Air,
      displayName: 'Air',
    },
  ];
  if (args.includeFarHuman) {
    subUnits.push({
      id: 'hum-far-air',
      parentUnitId: 'parent-inf',
      player: 'human',
      unitType: 'infantry',
      h3Index: res4FarHuman!,
      displayName: 'Infantry',
    });
  }
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-best-options-air-footprint',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: footprint,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: terrain,
    res4IsUrbanByH3: args.includeEmptyUrban && res4EmptyUrban ? { [res4EmptyUrban]: true } : {},
    subUnits,
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
    res1Infrastructure: [
      { h3Index: res1, urbanHexCount: 1, airportCount: args.airportCount, seaportCount: 0 },
    ],
    res1Control: [{ h3Index: res1, controllerPlayerId: 'opponent' }],
  };
  return {
    tactical,
    plan: buildTacticalAiPlanState(strategic, tactical),
    res4Air,
    res4FarHuman: args.includeFarHuman ? res4FarHuman! : null,
    res4EmptyUrban: args.includeEmptyUrban ? res4EmptyUrban! : null,
  };
}

/**
 * Ensures tactical Best Options air strikes use the battle footprint and enclosing-res1 airport, not the strategic 3-hex disk.
 *
 * Purpose: Air Operations says strike anywhere in the battle; the this-turn table used a 3-hex collector and an airport check on the air unit's res4 cell, so far humans and real plan-state airports were dropped.
 * When to use: After edits to tactical this-turn air-strike collection in `collectAggregatedPossibleActionRows`.
 * Expected outcome: Strike on a human beyond strategic strike range; no strike on empty urban; no ferry rows.
 * Exceptions: Throws when the fixture cannot place those neighbors.
 */
function testTacticalBestOptionsAirStrikesUseFootprintAndOmitFerry(): void {
  const { tactical, plan, res4FarHuman, res4EmptyUrban } = tacticalAirBestOptionsBattle({
    includeFarHuman: true,
    includeEmptyUrban: true,
    airportCount: 1,
  });
  const rows = collectTacticalThisTurnRows(plan, tactical).filter((r) => r.unitId === 'opp-air-strike');
  const strikes = rows.filter((r) => r.actionTypes.includes('air strike'));
  assert.ok(
    strikes.some((r) => r.targetH3 === res4FarHuman),
    'tactical Best Options must list an air strike on a human beyond strategic strike range'
  );
  assert.ok(
    !strikes.some((r) => r.targetH3 === res4EmptyUrban),
    'tactical Best Options must not list an air strike on empty urban'
  );
  assert.ok(
    !rows.some((r) => r.actionTypes.includes('ferry') || r.actionTypes.includes('move/melee')),
    'tactical Best Options must not list ferry dests for air'
  );
}

/**
 * Ensures tactical Best Options omit air strikes when the air unit's parent res1 has no airport.
 *
 * Purpose: Order validation requires an intact parent-res1 airport; the table must not tempo-rule a strike the engine will reject.
 * When to use: Together with `testTacticalBestOptionsAirStrikesUseFootprintAndOmitFerry`.
 * Expected outcome: No air-strike rows when `airportCount` is 0 even if humans are in the footprint.
 * Exceptions: None.
 */
function testTacticalBestOptionsAirStrikesRequireEnclosingAirport(): void {
  const { tactical, plan } = tacticalAirBestOptionsBattle({
    includeFarHuman: true,
    includeEmptyUrban: false,
    airportCount: 0,
  });
  const strikes = collectTacticalThisTurnRows(plan, tactical).filter(
    (r) => r.unitId === 'opp-air-strike' && r.actionTypes.includes('air strike')
  );
  assert.strictEqual(strikes.length, 0, 'no this-turn air strikes without an enclosing airport');
}

/**
 * Documents the module-scope binding `tests` (tests).
 *
 * Purpose: Runs the tactical empty-urban vs approach contracts and tactical air Best Options contracts.
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
  {
    name: 'collectAggregatedPossibleActionRows tactical Best Options air strikes use footprint and omit ferry',
    fn: testTacticalBestOptionsAirStrikesUseFootprintAndOmitFerry,
  },
  {
    name: 'collectAggregatedPossibleActionRows tactical Best Options air strikes require parent airport',
    fn: testTacticalBestOptionsAirStrikesRequireEnclosingAirport,
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
