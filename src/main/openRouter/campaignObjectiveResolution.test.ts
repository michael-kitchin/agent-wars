/**
 * Keeping, replacing, expiring, and skipping a campaign objective, including a sea target.
 * Run with: node dist/main/openRouter/campaignObjectiveResolution.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CampaignObjective } from '../../shared/campaignTypes';
import { resolveCampaignObjective } from './campaignObjectiveResolution';
import { campaignSkipFor } from './campaignSeaRules';
import type { CampaignCity } from './campaignTargetSelection';

/**
 * King-move distance on an `x:y` grid, standing in for H3 hops.
 *
 * Purpose: These cases do not need a real H3 grid.
 * When to use: The phase check inside a kept objective.
 * Expected outcome: The Chebyshev distance.
 * Exceptions: None.
 */
const hop = (a: string, b: string): number => {
  const [ax, ay] = a.split(':').map(Number);
  const [bx, by] = b.split(':').map(Number);
  return Math.max(Math.abs(ax! - bx!), Math.abs(ay! - by!));
};

/**
 * Six ground units standing together.
 *
 * Purpose: The resolution returns null without ground units.
 * When to use: Every case below.
 * Expected outcome: Six hexes.
 * Exceptions: None.
 */
const GROUND_UNIT_HEXES = ['3:0', '4:0', '5:0', '6:0', '7:0', '5:1'];

/**
 * One enemy city row.
 *
 * Purpose: The cases name only the hex and the urban count.
 * When to use: Every case below.
 * Expected outcome: A candidate city with no weight and no forts.
 * Exceptions: None.
 */
function city(h3Index: string, urbanHexCount = 10): CampaignCity {
  return { h3Index, urbanHexCount, ownerSeatId: 'a2', inEnemyHome: false, heldByHomeSide: false, ownerNearKnockout: false, knownFortifiedCount: 0 };
}

/**
 * A stored sea objective chosen on turn 3.
 *
 * Purpose: The cases vary only what they test.
 * When to use: Every case below.
 * Expected outcome: An engine objective in assault with no staging hex.
 * Exceptions: None.
 */
function seaObjective(extra: Partial<CampaignObjective> = {}): CampaignObjective {
  return { targetH3: 'S', stagingH3: null, phase: 'assault', source: 'engine', chosenTurn: 3, approach: 'sea', ...extra };
}

/**
 * Resolves with the sea inputs given and the rest fixed.
 *
 * Purpose: The cases pass the cities, the steps, the turn, and the sea state.
 * When to use: Every case below.
 * Expected outcome: The result of `resolveCampaignObjective`.
 * Exceptions: None.
 */
function resolve(args: {
  readonly stored: CampaignObjective | null;
  readonly turnNumber: number;
  readonly cities: readonly CampaignCity[];
  readonly landSteps?: ReadonlyMap<string, number>;
  readonly seaSteps?: ReadonlyMap<string, number>;
  readonly campaignLiftRunning?: boolean;
}): CampaignObjective | null {
  const landStepsFromForce = args.landSteps ?? new Map<string, number>();
  const campaignLiftRunning = args.campaignLiftRunning ?? false;
  const storedSteps = args.stored === null ? undefined : landStepsFromForce.get(args.stored.targetH3);
  return resolveCampaignObjective({
    stored: args.stored,
    turnNumber: args.turnNumber,
    cities: args.cities,
    landStepsFromForce,
    ownControlledLandHexes: [],
    landStepsFromTarget: () => new Map(),
    groundUnitHexes: GROUND_UNIT_HEXES,
    hopDistance: hop,
    seaStepsByH3: args.seaSteps ?? new Map(),
    campaignLiftRunning,
    skip: campaignSkipFor({
      stored: args.stored,
      turnNumber: args.turnNumber,
      storedLandReachable: storedSteps !== undefined && storedSteps <= 30,
      campaignLiftRunning,
    }),
  });
}

test('a new sea target stores the sea approach and starts in assault', () => {
  const chosen = resolve({ stored: null, turnNumber: 12, cities: [city('S')], seaSteps: new Map([['S', 12]]) });
  assert.deepEqual(chosen, { targetH3: 'S', stagingH3: null, phase: 'assault', source: 'engine', chosenTurn: 12, approach: 'sea' });
});

test('a stored sea target is kept while its route exists and replaced when the route is gone', () => {
  const stored = seaObjective();
  const kept = resolve({ stored, turnNumber: 8, cities: [city('S')], seaSteps: new Map([['S', 12]]) });
  assert.deepEqual(kept, stored);
  const replaced = resolve({
    stored,
    turnNumber: 8,
    cities: [city('S'), city('L')],
    landSteps: new Map([['L', 3]]),
  });
  assert.equal(replaced?.targetH3, 'L');
  assert.equal(replaced?.approach, undefined);
});

test('a sea target with no lift for more than ten turns expires and the next objective carries the skip', () => {
  const next = resolve({
    stored: seaObjective(),
    turnNumber: 14,
    cities: [city('S'), city('T')],
    seaSteps: new Map([
      ['S', 12],
      ['T', 14],
    ]),
  });
  assert.equal(next?.targetH3, 'T');
  assert.equal(next?.skippedTargetH3, 'S');
  assert.equal(next?.skippedTurn, 14);
});

test('a running campaign lift keeps the target, and a launch turn survives the resolution', () => {
  const running = resolve({
    stored: seaObjective(),
    turnNumber: 14,
    cities: [city('S')],
    seaSteps: new Map([['S', 12]]),
    campaignLiftRunning: true,
  });
  assert.equal(running?.targetH3, 'S');
  const launched = resolve({
    stored: seaObjective({ liftLaunchedTurn: 11 }),
    turnNumber: 14,
    cities: [city('S')],
    seaSteps: new Map([['S', 12]]),
  });
  assert.equal(launched?.targetH3, 'S');
  assert.equal(launched?.liftLaunchedTurn, 11);
});

test('a stored sea target with no route is kept by sea while its lift runs, and replaced without one', () => {
  const stored = seaObjective({ liftLaunchedTurn: 7 });
  const cities = [city('S'), city('L')];
  const landSteps = new Map([['L', 3]]);
  const kept = resolve({ stored, turnNumber: 8, cities, landSteps, campaignLiftRunning: true });
  assert.deepEqual(kept, stored);
  const replaced = resolve({ stored, turnNumber: 8, cities, landSteps });
  assert.equal(replaced?.targetH3, 'L');
  const gone = resolve({ stored, turnNumber: 8, cities: [city('L')], landSteps, campaignLiftRunning: true });
  assert.equal(gone?.targetH3, 'L');
});

test('a kept target that becomes land-reachable stores no approach', () => {
  const kept = resolve({
    stored: seaObjective(),
    turnNumber: 8,
    cities: [city('S')],
    landSteps: new Map([['S', 5]]),
  });
  assert.equal(kept?.targetH3, 'S');
  assert.equal('approach' in (kept ?? {}), false);
});

test('a target the force can still walk to within the reach limit is approached by land even with a sea route', () => {
  const chosen = resolve({
    stored: null,
    turnNumber: 12,
    cities: [city('S')],
    landSteps: new Map([['S', 20]]),
    seaSteps: new Map([['S', 12]]),
  });
  assert.equal(chosen?.targetH3, 'S');
  assert.equal('approach' in (chosen ?? {}), false);
  const far = resolve({
    stored: null,
    turnNumber: 12,
    cities: [city('S')],
    landSteps: new Map([['S', 31]]),
    seaSteps: new Map([['S', 12]]),
  });
  assert.equal(far?.approach, 'sea');
});

test('a lift cancel turn is kept with the target and dropped on a new one', () => {
  const kept = resolve({
    stored: seaObjective({ liftCancelledTurn: 6 }),
    turnNumber: 8,
    cities: [city('S')],
    seaSteps: new Map([['S', 12]]),
  });
  assert.equal(kept?.liftCancelledTurn, 6);
  const replaced = resolve({
    stored: seaObjective({ liftCancelledTurn: 6 }),
    turnNumber: 8,
    cities: [city('S'), city('L')],
    landSteps: new Map([['L', 3]]),
  });
  assert.equal(replaced?.targetH3, 'L');
  assert.equal('liftCancelledTurn' in (replaced ?? {}), false);
});

/**
 * One enemy city held by a pact partner.
 *
 * Purpose: The pact cases differ from the others only by this mark.
 * When to use: The pact cases below.
 * Expected outcome: A candidate city with `heldByPactPartner` true.
 * Exceptions: None.
 */
function pactCity(h3Index: string, urbanHexCount = 20): CampaignCity {
  return { ...city(h3Index, urbanHexCount), heldByPactPartner: true };
}

const BOTH_BY_LAND = new Map([
  ['P', 3],
  ['N', 3],
]);

test('the engine skips the best city when a pact partner holds it', () => {
  const chosen = resolve({ stored: null, turnNumber: 4, cities: [pactCity('P'), city('N')], landSteps: BOTH_BY_LAND });
  assert.equal(chosen?.targetH3, 'N');
});

test('an engine target whose city becomes a pact partner city is replaced', () => {
  const stored = seaObjective({ targetH3: 'P', approach: undefined });
  const next = resolve({ stored, turnNumber: 8, cities: [pactCity('P'), city('N')], landSteps: BOTH_BY_LAND });
  assert.equal(next?.targetH3, 'N');
  assert.equal(next?.chosenTurn, 8);
});

test('a commander target held by a pact partner is kept', () => {
  const stored: CampaignObjective = { targetH3: 'P', stagingH3: null, phase: 'assault', source: 'commander', chosenTurn: 3 };
  const kept = resolve({ stored, turnNumber: 8, cities: [pactCity('P'), city('N')], landSteps: BOTH_BY_LAND });
  assert.deepEqual(kept, stored);
});

test('no target is chosen when the only reachable city is a pact partner city', () => {
  assert.equal(resolve({ stored: null, turnNumber: 4, cities: [pactCity('P')], landSteps: BOTH_BY_LAND }), null);
});
