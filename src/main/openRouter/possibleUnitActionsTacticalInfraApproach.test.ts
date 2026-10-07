/**
 * Tactical Best Options contracts for empty-city vs approach when the enclosing strategic is uncontrolled,
 * and for this-turn air strikes / ferry (footprint-wide human targets, no ferry rows).
 *
 * Purpose: Empty urban tiles in an uncontrolled battle must not crowd out closing with observed humans, and must not appear as blank ranged shots. Tactical air Best Options must match Air Operations (strike anywhere in the battle at human-occupied cells) and list airport ferry dests when the air unit has no this-turn strike.
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
import { tacticalParentCell, tacticalUnderCorner } from '../tacticalBattle/testSupport/tacticalHexFixtures';
import { formatLatLng } from './promptText';
import { collectAggregatedPossibleActionRows } from './possibleUnitActions';
import type { GameStateSnapshot } from '../gameDb';

/**
 * Builds a tactical Best Options snapshot with an empty adjacent urban tile on an uncontrolled enclosing hex.
 *
 * Purpose: Shared fixture so far-enemy vs no-enemy cases differ only in whether a human is present.
 * When to use: The two contract tests in this file.
 * Expected outcome: Armor at the corner cell; urban neighbor at grid distance 1; optional human at grid distance 6.
 * Exceptions: Throws when those neighbors cannot be placed under the same strategic parent.
 */
function uncontrolledEmptyUrbanBattle(args: { includeFarHuman: boolean }): {
  tactical: TacticalBattleSnapshot;
  plan: GameStateSnapshot;
  tacticalOpp: string;
  tacticalUrban: string;
  tacticalHuman: string | null;
} {
  const parentCell = tacticalParentCell(12, 34);
  const tacticalOpp = tacticalUnderCorner(12, 34);
  const sameParent = [...gridDisk(tacticalOpp, 8)].filter((h) => cellToParent(h, 1) === parentCell);
  const tacticalUrban = sameParent.find((h) => h !== tacticalOpp && gridDistance(tacticalOpp, h) === 1);
  const tacticalHuman = sameParent.find((h) => h !== tacticalOpp && h !== tacticalUrban && gridDistance(tacticalOpp, h) === 6);
  if (!tacticalUrban || (args.includeFarHuman && !tacticalHuman)) {
    throw new Error('expected an adjacent urban neighbor and a human six steps away under the same res1 parent');
  }
  const far = args.includeFarHuman ? tacticalHuman! : tacticalOpp;
  const footprint = sameParent.filter((h) => {
    try {
      return gridDistance(tacticalOpp, h) <= 6 || gridDistance(far, h) <= 6;
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
      h3Index: tacticalOpp,
      displayName: 'Armor A',
    },
  ];
  if (args.includeFarHuman) {
    subUnits.push({
      id: 'hum-far-city',
      parentUnitId: 'parent-inf',
      player: 'human',
      unitType: 'infantry',
      h3Index: tacticalHuman!,
      displayName: 'Infantry',
    });
  }
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-best-options-uncontrolled-urban',
    enclosingStrategicH3Index: parentCell,
    tacticalChildH3Indexes: footprint,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: terrain,
    tacticalIsUrbanByH3: { [tacticalUrban]: true },
    subUnits,
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: parentCell, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
    strategicControl: [],
  };
  return {
    tactical,
    plan: buildTacticalAiPlanState(strategic, tactical),
    tacticalOpp,
    tacticalUrban,
    tacticalHuman: args.includeFarHuman ? tacticalHuman! : null,
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
  const { tactical, plan, tacticalUrban, tacticalHuman } = uncontrolledEmptyUrbanBattle({ includeFarHuman: true });
  const rows = collectTacticalThisTurnRows(plan, tactical).filter((r) => r.unitId === 'opp-arm-shooter');
  assert.ok(
    !rows.some((r) => r.targetH3 === tacticalUrban && r.actionTypes.includes('move/melee')),
    'empty uncontrolled urban must not suppress approach as move/melee'
  );
  assert.ok(
    !rows.some((r) => r.targetH3 === tacticalUrban && r.actionTypes.includes('ranged')),
    'empty uncontrolled urban must not appear as a ranged Best Option when humans are out of range'
  );
  const approaches = rows.filter((r) => r.actionTypes.includes('approach'));
  assert.ok(approaches.length >= 1, 'expected approach rows toward the distant human');
  assert.ok(
    approaches.every((r) => gridDistance(r.targetH3, tacticalHuman!) < 6),
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
  const { tactical, plan, tacticalUrban } = uncontrolledEmptyUrbanBattle({ includeFarHuman: false });
  const rows = collectTacticalThisTurnRows(plan, tactical).filter((r) => r.unitId === 'opp-arm-shooter');
  const urbanMoves = rows.filter((r) => r.targetH3 === tacticalUrban && r.actionTypes.includes('move/melee'));
  assert.ok(urbanMoves.length >= 1, 'empty uncontrolled urban must remain move/melee when no enemy is observed');
  assert.ok(
    urbanMoves.every((r) => typeof r.featuresSummary === 'string' && r.featuresSummary.includes('urban')),
    'tactical Target Infrastructure must describe the urban tile from res4 flags'
  );
}

/**
 * Builds a tactical air Best Options fixture on a real enclosing-strategic airport snapshot (plan-state shape).
 *
 * Purpose: Production plan state keeps `strategicInfrastructure` keyed by the enclosing strategic hex, not the air unit's tactical cell. Airport eligibility follows the parent of the air unit's cell (same as strike validation).
 * When to use: This-turn air-strike range, airport-gate, empty-urban omit, and ferry-omit contracts in this file.
 * Expected outcome: Opponent air at the corner cell; optional far human beyond strategic strike range; optional empty urban neighbor; parent-strategic airport intact unless `airportCount` is 0.
 * Exceptions: Throws when the requested neighbors cannot be placed under the same parent.
 */
function tacticalAirBestOptionsBattle(args: {
  includeFarHuman: boolean;
  includeEmptyUrban: boolean;
  airportCount: number;
}): {
  tactical: TacticalBattleSnapshot;
  plan: GameStateSnapshot;
  tacticalAir: string;
  tacticalFarHuman: string | null;
  tacticalEmptyUrban: string | null;
} {
  const parentCell = tacticalParentCell(12, 34);
  const tacticalAir = tacticalUnderCorner(12, 34);
  const sameParent = [...gridDisk(tacticalAir, 8)].filter((h) => cellToParent(h, 1) === parentCell);
  const tacticalEmptyUrban = sameParent.find((h) => h !== tacticalAir && gridDistance(tacticalAir, h) === 1);
  const farDist = AIR_STRIKE_RANGE_HEXES + 3;
  const tacticalFarHuman = sameParent.find(
    (h) => h !== tacticalAir && h !== tacticalEmptyUrban && gridDistance(tacticalAir, h) === farDist
  );
  if (args.includeEmptyUrban && !tacticalEmptyUrban) {
    throw new Error('expected an adjacent urban neighbor under the same res1 parent');
  }
  if (args.includeFarHuman && !tacticalFarHuman) {
    throw new Error(`expected a human ${farDist} steps away under the same res1 parent`);
  }
  const far = args.includeFarHuman ? tacticalFarHuman! : tacticalAir;
  const footprint = sameParent.filter((h) => {
    try {
      return gridDistance(tacticalAir, h) <= farDist || gridDistance(far, h) <= farDist;
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
      h3Index: tacticalAir,
      displayName: 'Air',
    },
  ];
  if (args.includeFarHuman) {
    subUnits.push({
      id: 'hum-far-air',
      parentUnitId: 'parent-inf',
      player: 'human',
      unitType: 'infantry',
      h3Index: tacticalFarHuman!,
      displayName: 'Infantry',
    });
  }
  const tactical: TacticalBattleSnapshot = {
    battleId: 't-best-options-air-footprint',
    enclosingStrategicH3Index: parentCell,
    tacticalChildH3Indexes: footprint,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: terrain,
    tacticalIsUrbanByH3: args.includeEmptyUrban && tacticalEmptyUrban ? { [tacticalEmptyUrban]: true } : {},
    tacticalIsAirportByH3: {
      [tacticalAir]: true,
      ...(args.includeEmptyUrban && tacticalEmptyUrban ? { [tacticalEmptyUrban]: true } : {}),
    },
    subUnits,
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: parentCell, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
    strategicInfrastructure: [
      { h3Index: parentCell, urbanHexCount: 1, airportCount: args.airportCount, seaportCount: 0 },
    ],
    strategicControl: [{ h3Index: parentCell, controllerPlayerId: 'opponent' }],
  };
  return {
    tactical,
    plan: buildTacticalAiPlanState(strategic, tactical),
    tacticalAir,
    tacticalFarHuman: args.includeFarHuman ? tacticalFarHuman! : null,
    tacticalEmptyUrban: args.includeEmptyUrban ? tacticalEmptyUrban! : null,
  };
}

/**
 * Ensures tactical Best Options air strikes use the battle footprint and enclosing-strategic airport, not the strategic 3-hex disk.
 *
 * Purpose: Air Operations says strike anywhere in the battle; the this-turn table used a 3-hex collector and an airport check on the air unit's tactical cell, so far humans and real plan-state airports were dropped.
 * When to use: After edits to tactical this-turn air-strike collection in `collectAggregatedPossibleActionRows`.
 * Expected outcome: Strike on a human beyond strategic strike range; no strike on empty urban; no ferry rows because this-turn strike-or-ferry exclusivity drops ferry when a strike is listed.
 * Exceptions: Throws when the fixture cannot place those neighbors.
 */
function testTacticalBestOptionsAirStrikesUseFootprintAndOmitFerry(): void {
  const { tactical, plan, tacticalFarHuman, tacticalEmptyUrban } = tacticalAirBestOptionsBattle({
    includeFarHuman: true,
    includeEmptyUrban: true,
    airportCount: 1,
  });
  const rows = collectTacticalThisTurnRows(plan, tactical).filter((r) => r.unitId === 'opp-air-strike');
  const strikes = rows.filter((r) => r.actionTypes.includes('air strike'));
  assert.ok(
    strikes.some((r) => r.targetH3 === tacticalFarHuman),
    'tactical Best Options must list an air strike on a human beyond strategic strike range'
  );
  assert.ok(
    !strikes.some((r) => r.targetH3 === tacticalEmptyUrban),
    'tactical Best Options must not list an air strike on empty urban'
  );
  assert.ok(
    !rows.some((r) => r.actionTypes.includes('ferry') || r.actionTypes.includes('move/melee')),
    'tactical Best Options must not list ferry dests for air that already has a this-turn strike'
  );
}

/**
 * Ensures tactical Best Options list intact airport ferry dests when the air unit has no this-turn strike.
 *
 * Purpose: Tactical ferry is airport-to-airport inside the footprint; the table used to omit every ferry row.
 * When to use: After edits to tactical air dest collection in `collectAggregatedPossibleActionRows`.
 * Expected outcome: A `ferry` row to the other intact airport cell; no air-strike rows when no human is present.
 * Exceptions: Throws when the fixture cannot place an adjacent dest airport.
 */
function testTacticalBestOptionsListsAirportFerryDests(): void {
  const { tactical, plan, tacticalEmptyUrban } = tacticalAirBestOptionsBattle({
    includeFarHuman: false,
    includeEmptyUrban: true,
    airportCount: 1,
  });
  assert.ok(tacticalEmptyUrban, 'expected a dest airport cell');
  const rows = collectTacticalThisTurnRows(plan, tactical).filter((r) => r.unitId === 'opp-air-strike');
  assert.ok(
    rows.some((r) => r.targetH3 === tacticalEmptyUrban && r.actionTypes.includes('ferry')),
    'tactical Best Options must list a ferry dest at the other intact airport'
  );
  assert.ok(
    !rows.some((r) => r.actionTypes.includes('air strike')),
    'no this-turn air strikes when no human is in the footprint'
  );
}

/**
 * Ensures tactical Best Options omit air strikes when the air unit's parent strategic has no airport.
 *
 * Purpose: Order validation requires an intact parent-strategic airport; the table must not tempo-rule a strike the engine will reject.
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
 * When to use: `node dist/main/openRouter/possibleUnitActionsTacticalInfraApproach.test.js` after `build:main`.
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
    name: 'collectAggregatedPossibleActionRows tactical Best Options lists airport ferry dests',
    fn: testTacticalBestOptionsListsAirportFerryDests,
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
