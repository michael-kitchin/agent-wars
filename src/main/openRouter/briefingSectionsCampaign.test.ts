/**
 * Campaign Objective wording, including fog and a hex in two enemy homes.
 * Run with: node dist/main/openRouter/briefingSectionsCampaign.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from '../gameDb';
import type { CampaignPlan } from './campaignRules';
import { buildCampaignObjectiveSection } from './briefingSectionsCampaign';
import { formatCampaignAttentionBullet } from './requestOrdersInjection';

/**
 * A snapshot whose only city is t1.
 *
 * Purpose: The section tests differ by exploration, staging, and which homes contain the city.
 * When to use: Each case below.
 * Expected outcome: a1 and a3 are both active, and neither is the fallback commander seat.
 * Exceptions: None.
 */
function cityState(explored: boolean, bothHomes: boolean): GameStateSnapshot {
  return {
    hexes: [{ h3Index: 't1', terrain: 'land', terrainKind: 'plains' }],
    units: [],
    phase: 'planning',
    turnNumber: 12,
    pendingOrders: [],
    exploredHexes: explored ? ['t1'] : [],
    seats: [
      { seatId: 'a1', seatOrder: 1, homeRegion: 'Northern America', nickname: null, kind: 'ai', outTurn: null },
      { seatId: 'a3', seatOrder: 2, homeRegion: 'Western Europe', nickname: null, kind: 'ai', outTurn: null },
    ],
    homeRegionHexesBySeat: bothHomes ? { a1: ['t1'], a3: ['t1'] } : { a3: ['t1'] },
    strategicInfrastructure: [{ h3Index: 't1', urbanHexCount: 54, airportCount: 0, seaportCount: 0, fortifiedCount: 3 }],
    strategicControl: [{ h3Index: 't1', controllerPlayerId: 'a3' }],
  } as unknown as GameStateSnapshot;
}

/**
 * A hand-built plan for t1.
 *
 * Purpose: The cases vary phase, staging, source, and defenders.
 * When to use: Each case below.
 * Expected outcome: The waypoint matches the staging hex, or the target when staging is null.
 * Exceptions: None.
 */
function planFor(args: {
  stagingH3: string | null;
  phase: 'assemble' | 'assault';
  source: 'engine' | 'commander';
  massedCount: number;
  defenders?: readonly string[];
  homeThreatCount?: number;
  homeDefenseCapped?: boolean;
}): CampaignPlan {
  return {
    objective: {
      targetH3: 't1',
      stagingH3: args.stagingH3,
      phase: args.phase,
      source: args.source,
      chosenTurn: 12,
    },
    waypointH3: args.stagingH3 ?? 't1',
    campaignUnitIds: new Set(),
    holdUnitIds: new Set(),
    defenderUnitIds: args.defenders ?? [],
    homeThreatCount: args.homeThreatCount ?? 0,
    homeDefenseCapped: args.homeDefenseCapped ?? false,
    massedCount: args.massedCount,
    threshold: 6,
  };
}

const format = (h3: string): string => h3.toUpperCase();

test('an unexplored assemble target names the one enemy home and no fortifications', () => {
  const text = buildCampaignObjectiveSection({
    state: cityState(false, false),
    plan: planFor({ stagingH3: 's1', phase: 'assemble', source: 'engine', massedCount: 4 }),
    format,
  });
  assert.equal(
    text,
    [
      '# Campaign Objective',
      '',
      '- Target: T1, a Western Europe city with 54 city cells and no known fortifications. The engine chose it on turn 12.',
      '- Staging hex: S1.',
      '- Phase: assemble. 4 of 6 ground units are within 2 hexes of S1. The assault starts when 6 are.',
    ].join('\n')
  );
});

test('an explored assault names known forts, the commander, and the defenders', () => {
  const text = buildCampaignObjectiveSection({
    state: cityState(true, false),
    plan: planFor({
      stagingH3: 's1',
      phase: 'assault',
      source: 'commander',
      massedCount: 1,
      defenders: ['a1-i3', 'a1-t2'],
      homeThreatCount: 4,
      homeDefenseCapped: true,
    }),
    format,
  });
  assert.ok(text.includes('- Target: T1, a Western Europe city with 54 city cells and 3 known fortified cells. You chose it on turn 12.'));
  assert.ok(text.includes('- Phase: assault. 1 ground unit is within 2 hexes of S1 or T1. The campaign falls back to assemble below 3.'));
  assert.ok(text.includes('- Home defenders: a1-i3, a1-t2. 4 enemy ground units are within 3 hexes of your units at home, so these units stay home. At most half your ground units stay home.'));
  const uncapped = buildCampaignObjectiveSection({
    state: cityState(true, false),
    plan: planFor({
      stagingH3: 's1',
      phase: 'assault',
      source: 'commander',
      massedCount: 1,
      defenders: ['a1-i3', 'a1-t2'],
      homeThreatCount: 4,
      homeDefenseCapped: false,
    }),
    format,
  });
  assert.ok(uncapped.includes('4 enemy ground units are within 3 hexes'));
  assert.equal(uncapped.includes('At most half'), false);
});

test('a missing staging hex starts the assault on the target', () => {
  const text = buildCampaignObjectiveSection({
    state: cityState(false, false),
    plan: planFor({ stagingH3: null, phase: 'assault', source: 'engine', massedCount: 0 }),
    format,
  });
  assert.ok(text.includes('- Staging hex: none. No hex you control is far enough from T1, so campaign units march on it directly.'));
  assert.ok(text.includes('- Phase: assault. There is no staging hex, so the assault continues until T1 is taken.'));
});

test('a hex in two enemy homes is an enemy city', () => {
  const text = buildCampaignObjectiveSection({
    state: cityState(false, true),
    plan: planFor({ stagingH3: 's1', phase: 'assemble', source: 'engine', massedCount: 4 }),
    format,
  });
  assert.ok(text.includes('- Target: T1, an enemy city with 54 city cells and no known fortifications.'));
  assert.equal(text.includes('Western Europe'), false);
  assert.equal(text.includes('Northern America'), false);
});

test('the campaign attention bullet counts units that need a new order', () => {
  assert.equal(formatCampaignAttentionBullet(0), null);
  assert.equal(
    formatCampaignAttentionBullet(1),
    'Campaign: 1 unit needs a new standing order. Copy each Campaign Orders row into an assign_order entry.'
  );
  assert.equal(
    formatCampaignAttentionBullet(3),
    'Campaign: 3 units need a new standing order. Copy each Campaign Orders row into an assign_order entry.'
  );
});
