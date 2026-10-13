import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeTopBarStats, formatForcesBreakdown, formatTopBarStatParts, type TopBarStatsInput } from './topBarStats';

const notNeutral = (): boolean => false;

const input: TopBarStatsInput = {
  units: [
    { player: 'human', unitType: 'infantry' },
    { player: 'human', unitType: 'infantry' },
    { player: 'human', unitType: 'armor' },
    { player: 'human', unitType: 'air' },
    { player: 'opponent', unitType: 'infantry' },
  ],
  gameSize: 'small',
  strategicControl: [
    { h3Index: 'a', controllerPlayerId: 'human' },
    { h3Index: 'b', controllerPlayerId: 'human' },
    { h3Index: 'c', controllerPlayerId: 'opponent' },
    { h3Index: 'd', controllerPlayerId: 'human' },
    { h3Index: 'e', controllerPlayerId: null },
  ],
  strategicInfrastructure: [
    { h3Index: 'a', urbanHexCount: 94 },
    { h3Index: 'b', urbanHexCount: 8 },
    { h3Index: 'c', urbanHexCount: 50 },
    { h3Index: 'e', urbanHexCount: 7 },
  ],
  humanHomeRegionHexes: ['a', 'b', 'e', 'a'],
  aiHomeRegionHexes: ['c', 'd'],
};

test('computeTopBarStats sums current urban counts on human hexes for production', () => {
  assert.equal(computeTopBarStats(input, notNeutral).productionPerTurn, 102);
});

test('computeTopBarStats skips neutral-border hexes for production', () => {
  assert.equal(computeTopBarStats(input, (h3) => h3 === 'a').productionPerTurn, 8);
});

test('computeTopBarStats counts human units against the game-size cap', () => {
  const stats = computeTopBarStats(input, notNeutral);
  assert.equal(stats.unitsFielded, 4);
  assert.equal(stats.unitCap, 34);
  assert.deepEqual(stats.fieldedByType, { infantry: 2, armor: 1, naval: 0, air: 1 });
});

test('computeTopBarStats counts human-held hexes of both home regions once each', () => {
  const stats = computeTopBarStats(input, notNeutral);
  assert.deepEqual(stats.humanHome, { held: 2, total: 3 });
  assert.deepEqual(stats.opponentHome, { held: 1, total: 2 });
});

test('computeTopBarStats treats missing lists as empty', () => {
  const stats = computeTopBarStats({ units: [] }, notNeutral);
  assert.equal(stats.productionPerTurn, 0);
  assert.deepEqual(stats.humanHome, { held: 0, total: 0 });
  assert.equal(stats.unitCap, 34);
});

test('formatTopBarStatParts and formatForcesBreakdown format the readouts', () => {
  const stats = computeTopBarStats({ ...input, strategicInfrastructure: [{ h3Index: 'a', urbanHexCount: 1530 }] }, notNeutral);
  assert.deepEqual(formatTopBarStatParts(stats), {
    production: '+1,530',
    forces: '4',
    forcesCap: '/34',
    humanHome: '2',
    humanHomeTotal: '/3',
    opponentHome: '1',
    opponentHomeTotal: '/2',
  });
  assert.equal(formatForcesBreakdown(stats), 'infantry 2 of 12, armor 1 of 8, naval 0 of 8, air 1 of 6');
});
