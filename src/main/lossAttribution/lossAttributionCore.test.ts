/**
 * The attribution step credits each loss to the sides whose units destroyed it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyPlayerLossSummary, type LostUnit, type LostUnitType, type TurnLossSummary } from '../../shared/lossSummary';
import {
  attributeTurnLosses,
  killerIdsByVictim,
  type LossAttributionContext,
  type LossUnitFact,
} from './lossAttributionCore';

/**
 * Builds one lost unit with an id.
 *
 * Purpose: Keeps each case to the fields it is about.
 * When to use: Every test below.
 * Expected outcome: A unit whose display name is its id.
 * Exceptions: None.
 */
function lost(id: string, unitType: LostUnitType = 'infantry'): LostUnit {
  return { unitType, displayName: id, unitId: id };
}

/**
 * Builds a context from a few entries, with every other map empty.
 *
 * Purpose: Each case sets only the maps it uses.
 * When to use: Every test below.
 * Expected outcome: A complete context.
 * Exceptions: None.
 */
function context(parts: {
  facts?: Record<string, LossUnitFact>;
  edges?: LossAttributionContext['killerIdsByCause'];
  hexes?: Record<string, string>;
  carriers?: Record<string, string>;
  fallbacks?: Record<string, { responsibleOwnerIds: string[] | null; killerIds: string[] }>;
}): LossAttributionContext {
  return {
    unitFacts: new Map(Object.entries(parts.facts ?? {})),
    killerIdsByCause: parts.edges ?? {},
    lossH3ByVictimId: new Map(Object.entries(parts.hexes ?? {})),
    carrierIdByCargoId: new Map(Object.entries(parts.carriers ?? {})),
    fallbackByVictimId: new Map(Object.entries(parts.fallbacks ?? {})),
  };
}

const armorOf = (ownerId: string): LossUnitFact => ({ ownerId, unitType: 'armor' });

test('kill edge killers set the side, the types, and the hex, and never include the victim side', () => {
  const summary: TurnLossSummary = { byOwner: { opponent: { ...emptyPlayerLossSummary(), ranged: [lost('a1-i1')] } } };
  const result = attributeTurnLosses(summary, context({
    facts: { 'h1-a1': armorOf('human'), 'a1-a9': armorOf('opponent'), 'a1-i1': { ownerId: 'opponent', unitType: 'infantry' } },
    edges: { ranged: new Map([['a1-i1', ['h1-a1', 'a1-a9']]]) },
    hexes: { 'a1-i1': 'hA' },
  }));
  assert.deepEqual(result.byOwner.opponent!.ranged[0]!.attribution, {
    ownerId: 'opponent',
    lossH3Index: 'hA',
    responsibleOwnerIds: ['human'],
    killerUnits: [{ unitId: 'h1-a1', unitType: 'armor' }],
  });
});

test('killers of two owners are both named', () => {
  const summary: TurnLossSummary = { byOwner: { opponent: { ...emptyPlayerLossSummary(), returnFire: [lost('a1-i1')] } } };
  const result = attributeTurnLosses(summary, context({
    facts: { 'h1-a1': armorOf('human'), 'a2-a1': armorOf('opponent2') },
    edges: { returnFire: new Map([['a1-i1', ['h1-a1', 'a2-a1']]]) },
  }));
  assert.deepEqual(result.byOwner.opponent!.returnFire[0]!.attribution!.responsibleOwnerIds, ['human', 'opponent2']);
});

test('cargo is credited like its carrier, and uses the carrier hex', () => {
  const summary: TurnLossSummary = {
    byOwner: { opponent: { ...emptyPlayerLossSummary(), ranged: [lost('a1-n1', 'naval')], other: [lost('a1-i2')] } },
  };
  const result = attributeTurnLosses(summary, context({
    facts: { 'h1-a1': armorOf('human') },
    edges: { ranged: new Map([['a1-n1', ['h1-a1']]]) },
    hexes: { 'a1-n1': 'hSea' },
    carriers: { 'a1-i2': 'a1-n1' },
  }));
  const cargo = result.byOwner.opponent!.other[0]!.attribution!;
  assert.deepEqual(cargo.responsibleOwnerIds, ['human']);
  assert.deepEqual(cargo.killerUnits, [{ unitId: 'h1-a1', unitType: 'armor' }]);
  assert.equal(cargo.lossH3Index, 'hSea');
});

test('a fallback names its sides, drops the victim side, and may be unknown', () => {
  const summary: TurnLossSummary = {
    byOwner: { opponent: { ...emptyPlayerLossSummary(), missileStrike: [lost('a1-r1', 'air')], airStrike: [lost('a1-r2', 'air')] } },
  };
  const result = attributeTurnLosses(summary, context({
    facts: { 'h1-m1': { ownerId: 'human', unitType: 'missile' } },
    fallbacks: {
      'a1-r1': { responsibleOwnerIds: ['opponent', 'human'], killerIds: ['h1-m1'] },
      'a1-r2': { responsibleOwnerIds: null, killerIds: [] },
    },
  }));
  const missile = result.byOwner.opponent!.missileStrike[0]!.attribution!;
  assert.deepEqual(missile.responsibleOwnerIds, ['human']);
  assert.deepEqual(missile.killerUnits, [{ unitId: 'h1-m1', unitType: 'missile' }]);
  assert.equal(result.byOwner.opponent!.airStrike[0]!.attribution!.responsibleOwnerIds, null);
});

test('with no data, an other loss has no side responsible and any other cause is unknown', () => {
  const summary: TurnLossSummary = {
    byOwner: { opponent: { ...emptyPlayerLossSummary(), other: [lost('a1-t1')], melee: [lost('a1-i3')] } },
  };
  const result = attributeTurnLosses(summary, context({}));
  assert.deepEqual(result.byOwner.opponent!.other[0]!.attribution!.responsibleOwnerIds, []);
  assert.equal(result.byOwner.opponent!.melee[0]!.attribution!.responsibleOwnerIds, null);
});

test('a killer with no known fact falls through to the fallback', () => {
  const summary: TurnLossSummary = { byOwner: { opponent: { ...emptyPlayerLossSummary(), melee: [lost('a1-i1')] } } };
  const result = attributeTurnLosses(summary, context({
    edges: { melee: new Map([['a1-i1', ['ghost-1']]]) },
    fallbacks: { 'a1-i1': { responsibleOwnerIds: ['human'], killerIds: [] } },
  }));
  assert.deepEqual(result.byOwner.opponent!.melee[0]!.attribution!.responsibleOwnerIds, ['human']);
});

test('the input summary is not changed, and a unit with no id gets no attribution', () => {
  const summary: TurnLossSummary = {
    byOwner: { opponent: { ...emptyPlayerLossSummary(), ranged: [lost('a1-i1')], melee: [{ unitType: 'infantry', displayName: 'Old' }] } },
  };
  const before = JSON.stringify(summary);
  const result = attributeTurnLosses(summary, context({}));
  assert.equal(JSON.stringify(summary), before);
  assert.equal(result.byOwner.opponent!.melee[0]!.attribution, undefined);
});

test('killerIdsByVictim keeps the first edge for a victim', () => {
  const map = killerIdsByVictim([{ victimId: 'v1', killerIds: ['k1'] }, { victimId: 'v1', killerIds: ['k2'] }, { victimId: 'v2' }]);
  assert.deepEqual(map.get('v1'), ['k1']);
  assert.deepEqual(map.get('v2'), []);
});

test('a victim filed under one cause finds its edge in another list', () => {
  const summary: TurnLossSummary = { byOwner: { opponent: { ...emptyPlayerLossSummary(), returnFire: [lost('a1-r1', 'air')] } } };
  const result = attributeTurnLosses(summary, context({
    facts: { 'h1-r9': { ownerId: 'human', unitType: 'air' } },
    edges: { airStrike: new Map([['a1-r1', ['h1-r9']]]) },
  }));
  assert.deepEqual(result.byOwner.opponent!.returnFire[0]!.attribution!.responsibleOwnerIds, ['human']);
});
