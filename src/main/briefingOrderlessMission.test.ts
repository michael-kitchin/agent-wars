/**
 * Tests for Action needed and the mission attention bullet on orderless units.
 *
 * Purpose: A blind unit with a home-region march, a striking air unit, or a listed one-step move must read Action
 * needed yes. A unit that can merely step to a neighbor, or that already has a healthy order, must not.
 * When to use: After edits to `buildUnitStatusTable`, `buildAttentionFlags`, or `collectOrderlessMissionContext`.
 * Expected outcome: The cells and the single mission sentence match those cases, and a critical threat stays listed.
 * Exceptions: Throws if no geodesic land chain exists.
 */

import * as assert from 'assert';
import { gridDisk } from 'h3-js';
import type { UnitAssessmentResult } from './precomputation';
import { ORIGIN_BONUS_OFF } from '../shared/originBonusRules';
import { buildAttentionFlags, buildStrategicNarrative, buildUnitStatusTable } from './briefingFormatter';
import {
  buildLandChainState,
  findGeodesicLandMassChain,
} from './testSupport/strategicLandChainFixtures';
import {
  collectOrderlessMissionContext,
  type OrderlessActionNeededSets,
} from './tools/orderlessUnitSuggestions';

/**
 * Builds an assessment with no enemy and no shot.
 *
 * Purpose: The mission rule has to be visible on a unit `needsAction` would leave at no.
 * When to use: The cases in this file.
 * Expected outcome: An assessment whose only route to Action needed yes is the passed orderless sets.
 * Exceptions: None.
 */
function idleAssessment(unitId: string, unitType: string, standingOrder: unknown = null): UnitAssessmentResult {
  return {
    unitId,
    result: {
      status: 'ok',
        unit: { unitId, type: unitType, currentStandingOrder: standingOrder },
      nearbyEnemies: [],
      threats: [],
      canAttackThisTurn: [],
    } as unknown as UnitAssessmentResult['result'],
  };
}

/**
 * Reads the Unit Status row for one unit.
 *
 * Purpose: The action cell is easier to check on one row than on the whole table.
 * When to use: After `buildUnitStatusTable`.
 * Expected outcome: The markdown row, or a failed assertion.
 * Exceptions: None.
 */
function statusRow(table: string, unitId: string): string {
  const row = table.split('\n').find((line) => line.includes(unitId));
  assert.ok(row, `expected a Unit Status row for ${unitId}`);
  return row!;
}

/**
 * Ensures a blind land unit with a home hex is Action needed, and one with nowhere to go is not.
 *
 * Purpose: The home-region march is the standing goal. Marking every unit that can step to a neighbor would flood
 * the column on the same turns this rule is meant to cover.
 * When to use: After changing which orderless units are marked.
 * Expected outcome: The home-region unit is yes and Attention Flags are the one mission sentence. The empty-home unit
 * is no. The narrative does not call the home-region unit a critical threat.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testBlindLandUnitWithAHomeHexNeedsAction(): void {
  const chain = findGeodesicLandMassChain(4);
  const unitId = 'opponent-inf-idle';
  const withHome = collectOrderlessMissionContext({
    playerId: 'opponent',
    state: {
      ...buildLandChainState({
        chain,
        units: [{ id: unitId, player: 'opponent', unitType: 'infantry', h3Index: chain[0]! }],
      }),
      humanHomeRegionHexes: [chain[2]!],
    },
    orderlessUnitIds: [unitId],
  });
  const assessment = idleAssessment(unitId, 'infantry');
  const table = buildUnitStatusTable([assessment], { mode: 'strategic' }, true, ORIGIN_BONUS_OFF, withHome);
  assert.ok(statusRow(table, unitId).includes('| yes |'), statusRow(table, unitId));
  const flags = buildAttentionFlags([assessment], 'strategic', true, withHome);
  assert.equal(flags.startsWith('- '), true);
  assert.match(flags, /1 unit\(s\) have no standing order and can take a mission this turn/);
  assert.match(flags, /Assign the Suggested Destination when that cell names one/);
  assert.doesNotMatch(flags, /None\./);
  const narrative = buildStrategicNarrative(
    buildLandChainState({
      chain,
      units: [{ id: unitId, player: 'opponent', unitType: 'infantry', h3Index: chain[0]! }],
    }),
    [assessment],
    true
  );
  assert.doesNotMatch(narrative, /critical threat/);

  const withoutHome = collectOrderlessMissionContext({
    playerId: 'opponent',
    state: buildLandChainState({
      chain,
      units: [{ id: unitId, player: 'opponent', unitType: 'infantry', h3Index: chain[0]! }],
    }),
    orderlessUnitIds: [unitId],
  });
  assert.equal(withoutHome.suggestedUnitIds.has(unitId), false);
  assert.equal(withoutHome.oneStepMoveUnitIds.has(unitId), false);
  const quiet = buildUnitStatusTable([assessment], { mode: 'strategic' }, true, ORIGIN_BONUS_OFF, withoutHome);
  assert.ok(statusRow(quiet, unitId).includes('| no |'), statusRow(quiet, unitId));
}

/**
 * Ensures a healthy standing order stays off Action needed even when a move row exists.
 *
 * Purpose: The extra flag is for units that have no order. A listed move must not reopen a march that is already healthy.
 * When to use: After changing the standing-order exclusion.
 * Expected outcome: Action needed no, and Attention Flags stay None.
 * Exceptions: None.
 */
function testHealthyOrderStaysOffEvenWithAMoveRow(): void {
  const unitId = 'opponent-inf-marching';
  const sets: OrderlessActionNeededSets = {
    suggestedUnitIds: new Set(),
    oneStepMoveUnitIds: new Set([unitId]),
  };
  const assessment = idleAssessment(unitId, 'infantry', { type: 'march', status: 'en_route' });
  const table = buildUnitStatusTable([assessment], { mode: 'strategic' }, true, ORIGIN_BONUS_OFF, sets);
  const row = statusRow(table, unitId);
  assert.ok(row.includes('| no'), row);
  assert.ok(!row.includes('| yes'), row);
  assert.equal(buildAttentionFlags([assessment], 'strategic', true, sets), 'None.');
}

/**
 * Ensures a striking air unit with no order is Action needed, and a tactical row is not.
 *
 * Purpose: Defend-on-current-hex is the air mission. The same set must not change a tactical briefing.
 * When to use: After changing the air suggestion or the tactical exclusion.
 * Expected outcome: Strategic air reads yes and the mission sentence does not name the unit as a legal attack.
 * The tactical row reads no.
 * Exceptions: Throws if the air base has no neighbor.
 */
function testStrikingAirNeedsActionAndTacticalDoesNot(): void {
  const base = findGeodesicLandMassChain(2)[0]!;
  const strikeHex = gridDisk(base, 1).find((h3) => h3 !== base);
  assert.ok(strikeHex);
  const unitId = 'opponent-air-idle';
  const mission = collectOrderlessMissionContext({
    playerId: 'opponent',
    state: {
      ...buildLandChainState({
        chain: [base, strikeHex!],
        units: [{ id: unitId, player: 'opponent', unitType: 'air', h3Index: base }],
      }),
      strategicControl: [{ h3Index: strikeHex!, controllerPlayerId: 'human' }],
      strategicInfrastructure: [
        { h3Index: base, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
        { h3Index: strikeHex!, urbanHexCount: 2, airportCount: 0, seaportCount: 0 },
      ],
    },
    orderlessUnitIds: [unitId],
  });
  assert.equal(mission.suggestedUnitIds.has(unitId), true);
  const assessment = idleAssessment(unitId, 'air');
  const table = buildUnitStatusTable([assessment], { mode: 'strategic' }, true, ORIGIN_BONUS_OFF, mission);
  assert.ok(statusRow(table, unitId).includes('| yes |'), statusRow(table, unitId));
  const flags = buildAttentionFlags([assessment], 'strategic', true, mission);
  assert.match(flags, /can take a mission this turn/);
  assert.doesNotMatch(flags, /legal attack/);
  assert.doesNotMatch(flags, new RegExp(unitId));

  const tactical = buildUnitStatusTable([assessment], { mode: 'tactical', battleId: 'b1' }, true, ORIGIN_BONUS_OFF, mission);
  assert.ok(statusRow(tactical, unitId).includes('| no |'), statusRow(tactical, unitId));
}

/**
 * Ensures a critical threat stays on Attention Flags when a mission bullet is also present.
 *
 * Purpose: The mission sentence is reserved the same way as the attack sentence. It must not be the only line when
 * a unit is in critical contact.
 * When to use: After changing the five-line selector.
 * Expected outcome: The critical sentence and the mission sentence are both present.
 * Exceptions: None.
 */
function testCriticalThreatStaysWhenAMissionBulletIsPresent(): void {
  const critical: UnitAssessmentResult = {
    unitId: 'opponent-arm-contact',
    result: {
      status: 'ok',
      unit: {
        unitId: 'opponent-arm-contact',
        type: 'armor',
        currentStandingOrder: null,
      },
      nearbyEnemies: [
        { unitId: 'human-inf-1', hexDistance: 4, inRangedRange: false, inMeleeRange: false },
      ] as UnitAssessmentResult['result']['nearbyEnemies'],
      threats: [{ description: 'close', severity: 'critical', sourceUnit: 'human-inf-1' }],
      canAttackThisTurn: [],
    } as unknown as UnitAssessmentResult['result'],
  };
  const missionUnit = idleAssessment('opponent-inf-idle', 'infantry');
  const sets: OrderlessActionNeededSets = {
    suggestedUnitIds: new Set(['opponent-inf-idle']),
    oneStepMoveUnitIds: new Set(),
  };
  const flags = buildAttentionFlags([critical, missionUnit], 'strategic', true, sets);
  assert.match(flags, /critical/);
  assert.match(flags, /can take a mission this turn/);
}

const tests: ReadonlyArray<{ name: string; fn: () => void }> = [
  {
    name: 'blind land unit with a home hex is Action needed and one without a mission is not',
    fn: testBlindLandUnitWithAHomeHexNeedsAction,
  },
  {
    name: 'healthy standing order stays off Action needed when a move row exists',
    fn: testHealthyOrderStaysOffEvenWithAMoveRow,
  },
  {
    name: 'striking air is Action needed and a tactical row is not',
    fn: testStrikingAirNeedsActionAndTacticalDoesNot,
  },
  {
    name: 'critical threat stays listed beside the mission bullet',
    fn: testCriticalThreatStaysWhenAMissionBulletIsPresent,
  },
];

/**
 * Runs the orderless Action needed contracts and exits non-zero on the first failure.
 *
 * Purpose: Same harness style as the other main-process node tests.
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
