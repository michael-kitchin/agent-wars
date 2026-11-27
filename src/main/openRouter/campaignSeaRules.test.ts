/**
 * Required force, sea routes, approach, expiry, and skips for a campaign by sea.
 * Run with: node dist/main/openRouter/campaignSeaRules.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CampaignObjective } from '../../shared/campaignTypes';
import {
  campaignApproachFor,
  campaignLiftRequiredUnits,
  campaignSeaTargetExpired,
  campaignSkipFor,
  chooseCampaignSeaRoutes,
  type CampaignSeaRouteArgs,
} from './campaignSeaRules';
import type { CampaignCity } from './campaignTargetSelection';

/**
 * One city row for the route cases.
 *
 * Purpose: The cases name the hex and the urban count only.
 * When to use: The route cases below.
 * Expected outcome: A candidate city with no weight and no forts.
 * Exceptions: None.
 */
function city(h3Index: string, urbanHexCount = 10): CampaignCity {
  return { h3Index, urbanHexCount, ownerSeatId: 'a2', inEnemyHome: false, heldByHomeSide: false, ownerNearKnockout: false, knownFortifiedCount: 0 };
}

/**
 * A stored objective for the expiry and skip cases.
 *
 * Purpose: The cases vary the approach, the choice turn, and the stored skip.
 * When to use: The expiry and skip cases below.
 * Expected outcome: An engine objective in assault.
 * Exceptions: None.
 */
function objective(extra: Partial<CampaignObjective> = {}): CampaignObjective {
  return { targetH3: 'T', stagingH3: null, phase: 'assault', source: 'engine', chosenTurn: 10, approach: 'sea', ...extra };
}

/**
 * Route arguments with one port, one landing per city, and a capacity of 4.
 *
 * Purpose: The route cases override only what they test.
 * When to use: The route cases below.
 * Expected outcome: Arguments for `chooseCampaignSeaRoutes`. Every city lands on `<city>-L` and sails 6 turns from the port.
 * Exceptions: None.
 */
function routeArgs(cities: readonly CampaignCity[], extra: Partial<CampaignSeaRouteArgs> = {}): CampaignSeaRouteArgs {
  return {
    cities,
    landStepsFromForce: new Map(),
    ports: [{ h3Index: 'P', landSteps: 2 }],
    sailTurns: () => 6,
    landingHexes: (cityH3) => [`${cityH3}-L`],
    hopDistance: () => 3,
    defendersNear: () => 0,
    reinforcersFor: () => 0,
    liftCapacity: 4,
    mustTestH3: null,
    skipH3: null,
    ...extra,
  };
}

test('the required force follows the ratio, the minimum, and the friendly units near', () => {
  assert.equal(campaignLiftRequiredUnits({ defenders: 5, reinforcers: 0, friendlyNearby: 0 }), 8);
  assert.equal(campaignLiftRequiredUnits({ defenders: 12, reinforcers: 0, friendlyNearby: 0 }), 18);
  assert.equal(campaignLiftRequiredUnits({ defenders: 0, reinforcers: 0, friendlyNearby: 0 }), 2);
  assert.equal(campaignLiftRequiredUnits({ defenders: 5, reinforcers: 0, friendlyNearby: 20 }), 2);
});

test('a sea target expires only when nothing is moving toward it', () => {
  const base = { turnNumber: 21, landReachable: false, campaignLiftRunning: false };
  assert.equal(campaignSeaTargetExpired({ ...base, objective: objective() }), true);
  assert.equal(campaignSeaTargetExpired({ ...base, turnNumber: 20, objective: objective() }), false);
  assert.equal(campaignSeaTargetExpired({ ...base, campaignLiftRunning: true, objective: objective() }), false);
  assert.equal(campaignSeaTargetExpired({ ...base, landReachable: true, objective: objective() }), false);
  assert.equal(campaignSeaTargetExpired({ ...base, objective: objective({ approach: undefined }) }), false);
  assert.equal(campaignSeaTargetExpired({ ...base, objective: objective({ liftLaunchedTurn: 15 }) }), false);
});

test('the approach is sea only with a route and no land route within the reach limit', () => {
  assert.equal(campaignApproachFor({ landSteps: 12, seaSteps: 8 }), 'land');
  assert.equal(campaignApproachFor({ landSteps: 13, seaSteps: 8 }), 'land');
  assert.equal(campaignApproachFor({ landSteps: 30, seaSteps: 8 }), 'land');
  assert.equal(campaignApproachFor({ landSteps: 31, seaSteps: 8 }), 'sea');
  assert.equal(campaignApproachFor({ landSteps: 13, seaSteps: undefined }), 'land');
  assert.equal(campaignApproachFor({ landSteps: undefined, seaSteps: undefined }), 'land');
  assert.equal(campaignApproachFor({ landSteps: undefined, seaSteps: 8 }), 'sea');
});

test('an expired target is skipped, an active skip carries, and an old skip is gone', () => {
  const idle = { storedLandReachable: false, campaignLiftRunning: false };
  assert.deepEqual(campaignSkipFor({ ...idle, stored: objective(), turnNumber: 30 }), { targetH3: 'T', sinceTurn: 30 });
  const carried = objective({ chosenTurn: 28, skippedTargetH3: 'S', skippedTurn: 20 });
  assert.deepEqual(campaignSkipFor({ ...idle, stored: carried, turnNumber: 30 }), { targetH3: 'S', sinceTurn: 20 });
  assert.equal(campaignSkipFor({ ...idle, storedLandReachable: true, stored: carried, turnNumber: 40 }), null);
  assert.equal(campaignSkipFor({ ...idle, stored: null, turnNumber: 40 }), null);
});

test('a sea-only city gets a route of port steps plus sailing plus the penalty', () => {
  const routes = chooseCampaignSeaRoutes(routeArgs([city('far')]));
  assert.deepEqual(routes.get('far'), { cityH3: 'far', portH3: 'P', landingH3: 'far-L', seaSteps: 12 });
});

test('a city the force can walk to gets no sea route', () => {
  const routes = chooseCampaignSeaRoutes(routeArgs([city('near')], { landStepsFromForce: new Map([['near', 5]]) }));
  assert.equal(routes.size, 0);
});

test('a route beyond the reach limit or beyond the lift capacity is dropped', () => {
  assert.equal(chooseCampaignSeaRoutes(routeArgs([city('far')], { sailTurns: () => 25 })).size, 0);
  assert.equal(chooseCampaignSeaRoutes(routeArgs([city('far')], { defendersNear: () => 5 })).size, 0);
  assert.equal(chooseCampaignSeaRoutes(routeArgs([city('far')], { defendersNear: () => 2 })).size, 1);
});

test('the skipped city gets no route', () => {
  const routes = chooseCampaignSeaRoutes(routeArgs([city('a'), city('b')], { skipH3: 'a' }));
  assert.deepEqual([...routes.keys()], ['b']);
});

test('the city that must be tested is measured even when better cities fill the limit', () => {
  const strong = Array.from({ length: 9 }, (_, index) => city(`s${index}`, 50));
  const cities = [...strong, city('weak', 1)];
  assert.equal(chooseCampaignSeaRoutes(routeArgs(cities)).has('weak'), false);
  assert.equal(chooseCampaignSeaRoutes(routeArgs(cities, { mustTestH3: 'weak' })).has('weak'), true);
});

test('no port, or a capacity below the minimum, gives no routes', () => {
  assert.equal(chooseCampaignSeaRoutes(routeArgs([city('far')], { ports: [] })).size, 0);
  assert.equal(chooseCampaignSeaRoutes(routeArgs([city('far')], { liftCapacity: 1 })).size, 0);
});

test('a pact partner city takes no test slot, and is still measured when it must be', () => {
  const partner = Array.from({ length: 8 }, (_, index) => ({ ...city(`p${index}`, 50), heldByPactPartner: true }));
  const cities = [...partner, city('weak', 1)];
  assert.deepEqual([...chooseCampaignSeaRoutes(routeArgs(cities)).keys()], ['weak']);
  assert.equal(chooseCampaignSeaRoutes(routeArgs(cities, { mustTestH3: 'p3' })).has('p3'), true);
});
