/**
 * Campaign target, staging, phase, and unit-role contracts.
 * Run with: node dist/main/openRouter/campaignRules.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CampaignObjective } from '../../shared/campaignTypes';
import {
  buildCampaignPlan,
  campaignAssaultReady,
  campaignAssaultThreshold,
  campaignOrderFor,
  chooseHomeDefenders,
  nextCampaignPhase,
  resolveCampaignObjective,
} from './campaignRules';
import {
  chooseCampaignTarget,
  chooseStagingHex,
  knownCampaignCities,
  scoreCampaignCity,
  type CampaignCity,
} from './campaignTargetSelection';

/**
 * King-move distance on an `x:y` grid, standing in for H3 hops.
 *
 * Purpose: The campaign rules tests do not need a real H3 grid.
 * When to use: Campaign phase, contact, and mass checks in this file.
 * Expected outcome: The Chebyshev distance.
 * Exceptions: None.
 */
const hop = (a: string, b: string): number => {
  const [ax, ay] = a.split(':').map(Number);
  const [bx, by] = b.split(':').map(Number);
  return Math.max(Math.abs(ax! - bx!), Math.abs(ay! - by!));
};

/**
 * Six home hexes in a row, for the home-defense cases.
 *
 * Purpose: The cases need a home region that every unit below stands in.
 * When to use: Home-defense tests in this file.
 * Expected outcome: The hexes `0:0` through `5:0`.
 * Exceptions: None.
 */
const HOME_ROW = new Set(['0:0', '1:0', '2:0', '3:0', '4:0', '5:0']);

/**
 * One ground unit on each home hex.
 *
 * Purpose: A six-unit force gives a defender cap of three.
 * When to use: Home-defense tests in this file.
 * Expected outcome: Units `a1` through `a6`, on `0:0` through `5:0`.
 * Exceptions: None.
 */
const SIX_AT_HOME = [
  { id: 'a1', h3Index: '0:0' },
  { id: 'a2', h3Index: '1:0' },
  { id: 'a3', h3Index: '2:0' },
  { id: 'a4', h3Index: '3:0' },
  { id: 'a5', h3Index: '4:0' },
  { id: 'a6', h3Index: '5:0' },
];

/**
 * One city row for the rank tests.
 *
 * Purpose: The tests name urban count, home membership, and forts without repeating the owner fields.
 * When to use: Target-choice cases.
 * Expected outcome: A candidate city.
 * Exceptions: None.
 */
function city(h3Index: string, urbanHexCount: number, inEnemyHome: boolean, knownFortifiedCount = 0): CampaignCity {
  return { h3Index, urbanHexCount, ownerSeatId: 'a2', inEnemyHome, knownFortifiedCount };
}

test('known cities follow explored control and assume unexplored enemy homes are held', () => {
  const cities = knownCampaignCities({
    activeEnemySeatIds: new Set(['a2', 'a3']),
    infrastructure: [
      { h3Index: 'e1', urbanHexCount: 10, fortifiedCount: 8 },
      { h3Index: 'e2', urbanHexCount: 5 },
      { h3Index: 'e3', urbanHexCount: 5 },
      { h3Index: 'h1', urbanHexCount: 20, fortifiedCount: 12 },
      { h3Index: 'u1', urbanHexCount: 30 },
      { h3Index: 'r0', urbanHexCount: 0 },
    ],
    controllerByH3: new Map([
      ['e1', 'a2'],
      ['e2', 'a1'],
      ['e3', null],
      ['r0', 'a2'],
    ]),
    explored: new Set(['e1', 'e2', 'e3', 'r0']),
    homeSeatByH3: new Map([['h1', 'a3']]),
  });
  assert.deepEqual(cities, [
    { h3Index: 'e1', urbanHexCount: 10, ownerSeatId: 'a2', inEnemyHome: false, knownFortifiedCount: 8 },
    { h3Index: 'h1', urbanHexCount: 20, ownerSeatId: 'a3', inEnemyHome: true, knownFortifiedCount: 0 },
  ]);
});

test('the target favors large enemy-home cities near the force and discounts known fortifications', () => {
  const chosen = chooseCampaignTarget(
    [
      city('A', 40, true, 0),
      city('B', 60, false, 0),
      city('C', 40, true, 8),
      city('D', 100, true, 0),
    ],
    new Map([
      ['A', 4],
      ['B', 4],
      ['C', 4],
      ['D', 13],
    ])
  );
  assert.equal(chosen, 'A');
  assert.equal(scoreCampaignCity(city('A', 40, true, 0), 4), (40 * 2) / (6 * 1));
  const tie = chooseCampaignTarget(
    [city('X', 20, false, 0), city('Y', 30, false, 0)],
    new Map([
      ['X', 2],
      ['Y', 4],
    ])
  );
  assert.equal(tie, 'X');
  assert.equal(chooseCampaignTarget([city('far', 100, true, 0)], new Map([['far', 13]])), null);
});

test('the staging hex is the nearest controlled hex at least two steps from the target', () => {
  const chosen = chooseStagingHex({
    ownControlledLandHexes: ['s1', 's2', 's3', 's4'],
    landStepsFromTarget: new Map([
      ['s1', 1],
      ['s2', 2],
      ['s3', 2],
      ['s4', 5],
    ]),
    landStepsFromForce: new Map([
      ['s1', 0],
      ['s2', 3],
      ['s3', 1],
      ['s4', 2],
    ]),
  });
  assert.equal(chosen, 's3');
  assert.equal(
    chooseStagingHex({
      ownControlledLandHexes: ['s1'],
      landStepsFromTarget: new Map([['s1', 1]]),
      landStepsFromForce: new Map([['s1', 0]]),
    }),
    null
  );
});

test('the phase flips at the threshold and falls back below half of it', () => {
  assert.equal(nextCampaignPhase({ phase: 'assemble', stagingH3: 's', massedCount: 6, threshold: 6 }), 'assault');
  assert.equal(nextCampaignPhase({ phase: 'assemble', stagingH3: 's', massedCount: 5, threshold: 6 }), 'assemble');
  assert.equal(nextCampaignPhase({ phase: 'assault', stagingH3: 's', massedCount: 3, threshold: 6 }), 'assault');
  assert.equal(nextCampaignPhase({ phase: 'assault', stagingH3: 's', massedCount: 2, threshold: 6 }), 'assemble');
  assert.equal(nextCampaignPhase({ phase: 'assemble', stagingH3: null, massedCount: 0, threshold: 6 }), 'assault');
  assert.equal(campaignAssaultThreshold(10), 6);
  assert.equal(campaignAssaultThreshold(3), 3);
  assert.equal(campaignAssaultThreshold(0), 1);
});

test('resolve keeps a valid target, retargets a lost one, and keeps a null staging hex', () => {
  const groundUnitHexes = ['3:0', '4:0', '5:0', '6:0', '7:0', '5:1'];
  const stored: CampaignObjective = {
    targetH3: '9:9',
    stagingH3: '5:0',
    phase: 'assemble',
    source: 'commander',
    chosenTurn: 3,
  };
  const kept = resolveCampaignObjective({
    stored,
    turnNumber: 12,
    cities: [city('9:9', 10, false)],
    landStepsFromForce: new Map([
      ['9:9', 6],
      ['5:0', 0],
      ['8:8', 3],
    ]),
    ownControlledLandHexes: ['5:0'],
    landStepsFromTarget: () => new Map([['5:0', 3]]),
    groundUnitHexes,
    hopDistance: hop,
  });
  assert.deepEqual(kept, { ...stored, phase: 'assault' });

  const retargeted = resolveCampaignObjective({
    stored,
    turnNumber: 12,
    cities: [city('8:8', 10, false)],
    landStepsFromForce: new Map([
      ['9:9', 6],
      ['5:0', 0],
      ['8:8', 3],
    ]),
    ownControlledLandHexes: ['5:0'],
    landStepsFromTarget: () => new Map([['5:0', 3]]),
    groundUnitHexes,
    hopDistance: hop,
  });
  assert.deepEqual(retargeted, {
    targetH3: '8:8',
    stagingH3: '5:0',
    phase: 'assemble',
    source: 'engine',
    chosenTurn: 12,
  });

  assert.equal(
    resolveCampaignObjective({
      stored,
      turnNumber: 12,
      cities: [city('9:9', 10, false)],
      landStepsFromForce: new Map([['9:9', 6]]),
      ownControlledLandHexes: ['5:0'],
      landStepsFromTarget: () => new Map([['5:0', 3]]),
      groundUnitHexes: [],
      hopDistance: hop,
    }),
    null
  );

  const nullStaging: CampaignObjective = { ...stored, stagingH3: null, phase: 'assault' };
  assert.deepEqual(
    resolveCampaignObjective({
      stored: nullStaging,
      turnNumber: 12,
      cities: [city('9:9', 10, false)],
      landStepsFromForce: new Map([['9:9', 6]]),
      ownControlledLandHexes: ['5:0'],
      landStepsFromTarget: () => new Map([['5:0', 3]]),
      groundUnitHexes,
      hopDistance: hop,
    }),
    nullStaging
  );

  const keptFar = resolveCampaignObjective({
    stored,
    turnNumber: 12,
    cities: [city('9:9', 10, false), city('8:8', 10, false)],
    landStepsFromForce: new Map([
      ['9:9', 20],
      ['5:0', 0],
      ['8:8', 3],
    ]),
    ownControlledLandHexes: ['5:0'],
    landStepsFromTarget: () => new Map([['5:0', 3]]),
    groundUnitHexes,
    hopDistance: hop,
  });
  assert.equal(keptFar?.targetH3, '9:9');
  assert.equal(keptFar?.source, 'commander');

  const replaced = resolveCampaignObjective({
    stored,
    turnNumber: 12,
    cities: [city('9:9', 10, false), city('8:8', 10, false)],
    landStepsFromForce: new Map([
      ['9:9', 31],
      ['5:0', 0],
      ['8:8', 3],
    ]),
    ownControlledLandHexes: ['5:0'],
    landStepsFromTarget: () => new Map([['5:0', 3]]),
    groundUnitHexes,
    hopDistance: hop,
  });
  assert.equal(replaced?.targetH3, '8:8');
  assert.equal(replaced?.source, 'engine');
});

test('defenders and units in contact stay out of the campaign, and massed units hold', () => {
  const objective: CampaignObjective = {
    targetH3: '9:0',
    stagingH3: '5:0',
    phase: 'assemble',
    source: 'engine',
    chosenTurn: 1,
  };
  const plan = buildCampaignPlan({
    objective,
    groundUnits: [
      { id: 'd1', h3Index: '0:0' },
      { id: 'c1', h3Index: '3:5' },
      { id: 'h1', h3Index: '4:0' },
      { id: 'm1', h3Index: '8:8' },
      { id: 'g1', h3Index: '2:2' },
    ],
    ownHomeHexes: new Set(['0:0', '1:0']),
    enemyUnitHexes: ['0:2', '3:6'],
    enemyGroundUnitHexes: ['0:2', '3:6'],
    landStepsFromWaypoint: new Map([
      ['0:0', 1],
      ['3:5', 1],
      ['4:0', 1],
      ['2:2', 1],
    ]),
    hopDistance: hop,
  });
  assert.deepEqual(plan.defenderUnitIds, ['d1']);
  assert.equal(plan.homeThreatCount, 1);
  assert.equal(plan.homeDefenseCapped, false);
  assert.deepEqual([...plan.campaignUnitIds], ['h1', 'g1']);
  assert.deepEqual([...plan.holdUnitIds], ['h1']);
  assert.equal(plan.waypointH3, '5:0');
  assert.deepEqual(campaignOrderFor(plan, { id: 'h1', h3Index: '4:0' }), { orderType: 'defend', destinationH3: '4:0' });
  assert.deepEqual(campaignOrderFor(plan, { id: 'g1', h3Index: '2:2' }), { orderType: 'march', destinationH3: '5:0' });
  assert.equal(campaignOrderFor(plan, { id: 'd1', h3Index: '0:0' }), null);
  assert.equal(plan.massedCount, 1);
  assert.equal(plan.threshold, 5);
});

test('home defenders match the enemy ground units near home and never exceed half the force', () => {
  assert.deepEqual(
    chooseHomeDefenders({ groundUnits: SIX_AT_HOME, ownHomeHexes: HOME_ROW, enemyGroundUnitHexes: ['0:2'], hopDistance: hop }),
    { defenderUnitIds: ['a1'], threatCount: 1, homeDefenseCapped: false }
  );
  assert.deepEqual(
    chooseHomeDefenders({
      groundUnits: SIX_AT_HOME,
      ownHomeHexes: HOME_ROW,
      enemyGroundUnitHexes: ['5:1', '5:1', '4:2', '5:3', '3:3'],
      hopDistance: hop,
    }),
    { defenderUnitIds: ['a3', 'a5', 'a6'], threatCount: 5, homeDefenseCapped: true }
  );
  assert.deepEqual(
    chooseHomeDefenders({
      groundUnits: [{ id: 'a1', h3Index: '0:0' }],
      ownHomeHexes: HOME_ROW,
      enemyGroundUnitHexes: ['0:1'],
      hopDistance: hop,
    }),
    { defenderUnitIds: [], threatCount: 1, homeDefenseCapped: true }
  );
  assert.deepEqual(
    chooseHomeDefenders({
      groundUnits: [
        { id: 'a1', h3Index: '0:0' },
        { id: 'a2', h3Index: '1:0' },
        { id: 'b1', h3Index: '9:9' },
        { id: 'b2', h3Index: '9:8' },
        { id: 'b3', h3Index: '9:7' },
        { id: 'b4', h3Index: '9:6' },
      ],
      ownHomeHexes: new Set(['0:0', '1:0']),
      enemyGroundUnitHexes: ['0:1', '0:1', '0:1', '0:1', '0:1'],
      hopDistance: hop,
    }),
    { defenderUnitIds: ['a1', 'a2'], threatCount: 5, homeDefenseCapped: false }
  );
  const fiveAtHome = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id, index) => ({ id, h3Index: `${index}:0` }));
  assert.deepEqual(
    chooseHomeDefenders({
      groundUnits: fiveAtHome,
      ownHomeHexes: new Set(fiveAtHome.map((unit) => unit.h3Index)),
      enemyGroundUnitHexes: ['4:1', '4:1', '4:1', '4:1', '4:1'],
      hopDistance: hop,
    }),
    { defenderUnitIds: ['a4', 'a5'], threatCount: 5, homeDefenseCapped: true }
  );
});

test('home units the defense does not keep join the campaign, and enemy air is not a threat', () => {
  const plan = buildCampaignPlan({
    objective: { targetH3: '9:0', stagingH3: null, phase: 'assault', source: 'engine', chosenTurn: 1 },
    groundUnits: SIX_AT_HOME,
    ownHomeHexes: HOME_ROW,
    enemyUnitHexes: ['5:1', '5:1', '4:2', '5:3', '3:3', '0:3'],
    enemyGroundUnitHexes: ['5:1', '5:1', '4:2', '5:3', '3:3'],
    landStepsFromWaypoint: new Map<string, number>([...HOME_ROW].map((h3) => [h3, 1])),
    hopDistance: hop,
  });
  assert.deepEqual(plan.defenderUnitIds, ['a3', 'a5', 'a6']);
  assert.equal(plan.homeThreatCount, 5);
  assert.equal(plan.homeDefenseCapped, true);
  assert.deepEqual([...plan.campaignUnitIds], ['a1', 'a2', 'a4']);
});

test('a home unit left out of the defense still stays in a contact fight', () => {
  const plan = buildCampaignPlan({
    objective: { targetH3: '9:0', stagingH3: null, phase: 'assault', source: 'engine', chosenTurn: 1 },
    groundUnits: SIX_AT_HOME,
    ownHomeHexes: HOME_ROW,
    enemyUnitHexes: ['0:1'],
    enemyGroundUnitHexes: ['0:1'],
    landStepsFromWaypoint: new Map<string, number>([...HOME_ROW].map((h3) => [h3, 1])),
    hopDistance: hop,
  });
  assert.deepEqual(plan.defenderUnitIds, ['a1']);
  assert.equal(plan.campaignUnitIds.has('a2'), false);
  assert.equal(plan.campaignUnitIds.has('a3'), true);
});

test('an assembly is ready once the threshold stands near the staging hex', () => {
  const objective: CampaignObjective = {
    targetH3: '9:0',
    stagingH3: '5:0',
    phase: 'assemble',
    source: 'engine',
    chosenTurn: 1,
  };
  assert.equal(
    campaignAssaultReady({ objective, groundUnitHexes: ['5:0', '4:0', '6:1'], hopDistance: hop }),
    true
  );
  assert.equal(
    campaignAssaultReady({
      objective: { ...objective, phase: 'assault' },
      groundUnitHexes: ['5:0', '4:0', '6:1'],
      hopDistance: hop,
    }),
    false
  );
});
