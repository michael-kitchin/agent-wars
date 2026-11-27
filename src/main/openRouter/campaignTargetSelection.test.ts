/**
 * Campaign city candidates and the finishing weight.
 * Run with: node dist/main/openRouter/campaignTargetSelection.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  campaignCityWeight,
  chooseCampaignTarget,
  knownCampaignCities,
  type CampaignCity,
} from './campaignTargetSelection';

/**
 * Builds a campaign city for the weight and ranking cases.
 *
 * Purpose: Each case sets only the fields that decide the weight.
 * When to use: The weight and ranking cases below.
 * Expected outcome: An a2-held city with no known forts.
 * Exceptions: None.
 */
function city(h3Index: string, urbanHexCount: number, heldByHomeSide: boolean, ownerNearKnockout: boolean): CampaignCity {
  return { h3Index, urbanHexCount, ownerSeatId: 'a2', inEnemyHome: heldByHomeSide, heldByHomeSide, ownerNearKnockout, knownFortifiedCount: 0 };
}

/**
 * Builds the candidate list for explored hexes with the given controllers and homes.
 *
 * Purpose: The ownership cases vary controllers, homes, and exempt seats.
 * When to use: The ownership cases below.
 * Expected outcome: The result of `knownCampaignCities` with enemies a2 and a3.
 * Exceptions: None.
 */
function candidates(
  controllers: Readonly<Record<string, string>>,
  homes: Readonly<Record<string, string>> = {},
  exempt: readonly string[] = []
): CampaignCity[] {
  return knownCampaignCities({
    activeEnemySeatIds: new Set(['a2', 'a3']),
    infrastructure: Object.keys(controllers).map((h3Index) => ({ h3Index, urbanHexCount: 5 })),
    controllerByH3: new Map(Object.entries(controllers)),
    explored: new Set(Object.keys(controllers)),
    homeSeatByH3: new Map(Object.entries(homes)),
    pactPartnerSeatIds: new Set(exempt),
  });
}

test('a city held by the enemy whose home contains it is held by its home side', () => {
  const [held] = candidates({ h1: 'a2' }, { h1: 'a2' });
  assert.equal(held?.inEnemyHome, true);
  assert.equal(held?.heldByHomeSide, true);
  const [taken] = candidates({ h1: 'a3' }, { h1: 'a2' });
  assert.equal(taken?.inEnemyHome, true);
  assert.equal(taken?.heldByHomeSide, false);
  const [outside] = candidates({ h1: 'a2' });
  assert.equal(outside?.inEnemyHome, false);
  assert.equal(outside?.heldByHomeSide, false);
});

test('a holder with five or fewer cities is near knockout unless it is exempt', () => {
  const five = candidates(Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((h) => [h, 'a2'])));
  assert.equal(five.every((c) => c.ownerNearKnockout), true);
  const six = candidates(Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map((h) => [h, 'a2'])));
  assert.equal(six.some((c) => c.ownerNearKnockout), false);
  const exempt = candidates({ a: 'a2', b: 'a2' }, {}, ['a2']);
  assert.equal(exempt.some((c) => c.ownerNearKnockout), false);
});

test('the weight multiplies the home weight and the finishing weight', () => {
  assert.equal(campaignCityWeight(city('x', 1, false, false)), 1);
  assert.equal(campaignCityWeight(city('x', 1, true, false)), 2);
  assert.equal(campaignCityWeight(city('x', 1, false, true)), 3);
  assert.equal(campaignCityWeight(city('x', 1, true, true)), 6);
});

test('a near straggler city beats a larger home city that is farther away', () => {
  const steps = new Map([
    ['straggler', 1],
    ['home', 5],
  ]);
  const winning = chooseCampaignTarget([city('straggler', 17, false, true), city('home', 40, true, false)], steps);
  assert.equal(winning, 'straggler');
  const withoutFinishing = chooseCampaignTarget([city('straggler', 17, false, false), city('home', 40, true, false)], steps);
  assert.equal(withoutFinishing, 'home');
});

test('a home city held by another side loses to an equal city held by its home side', () => {
  const steps = new Map([
    ['taken', 3],
    ['held', 3],
  ]);
  const taken: CampaignCity = { ...city('taken', 20, false, false), ownerSeatId: 'a3', inEnemyHome: true };
  const chosen = chooseCampaignTarget([taken, city('held', 20, true, false)], steps);
  assert.equal(chosen, 'held');
});

test('a sea-only city competes with land cities under the same score', () => {
  const land = new Map([['land', 5]]);
  const sea = new Map([['sea', 12]]);
  const seaHome = city('sea', 30, true, false);
  assert.equal(chooseCampaignTarget([seaHome, city('land', 10, false, false)], land, sea), 'sea');
  const minorHome = city('minor', 10, true, true);
  const minorSteps = new Map([
    ['land', 5],
    ['minor', 8],
  ]);
  assert.equal(chooseCampaignTarget([seaHome, city('land', 10, false, false), minorHome], minorSteps, sea), 'minor');
});

test('a sea city beyond the sea step limit is not chosen, and no sea steps match the land-only rule', () => {
  assert.equal(chooseCampaignTarget([city('far', 30, true, false)], new Map(), new Map([['far', 17]])), null);
  assert.equal(chooseCampaignTarget([city('far', 30, true, false)], new Map(), new Map([['far', 16]])), 'far');
  assert.equal(chooseCampaignTarget([city('far', 30, true, false)], new Map()), null);
  assert.equal(chooseCampaignTarget([city('near', 5, false, false)], new Map([['near', 3]])), 'near');
});

test('a city held by a pact partner is marked, and another city is not', () => {
  const [partner, other] = candidates({ a: 'a2', b: 'a3' }, {}, ['a2']);
  assert.equal(partner?.heldByPactPartner, true);
  assert.equal(other?.heldByPactPartner, false);
});
