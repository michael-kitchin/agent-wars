import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiSeatIdForIndex, HUMAN_SEAT_ID } from './seatIds';
import { PRODUCTION_CAPACITY_SYMBOL } from './economySymbols';
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
  seats: [
    { seatId: HUMAN_SEAT_ID, seatOrder: 1, homeRegion: 'Home', outTurn: null },
    { seatId: 'opponent', seatOrder: 2, homeRegion: 'Enemy', outTurn: null },
  ],
  homeRegionHexesBySeat: {
    [HUMAN_SEAT_ID]: ['a', 'b', 'e', 'a'],
    opponent: ['c', 'd'],
  },
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
  assert.equal(stats.unitCap, 36);
  assert.deepEqual(stats.fieldedByType, { infantry: 2, armor: 1, naval: 0, air: 1, missile: 0 });
});

test('computeTopBarStats counts human-held hexes of both home regions once each', () => {
  const stats = computeTopBarStats(input, notNeutral);
  assert.deepEqual(stats.yourHome, { held: 2, total: 3 });
  assert.deepEqual(stats.enemyHomes, { held: 1, total: 2 });
});

test('computeTopBarStats treats missing lists as empty', () => {
  const stats = computeTopBarStats({ units: [] }, notNeutral);
  assert.equal(stats.productionPerTurn, 0);
  assert.deepEqual(stats.yourHome, { held: 0, total: 0 });
  assert.equal(stats.unitCap, 36);
});

test('formatTopBarStatParts and formatForcesBreakdown format the readouts', () => {
  const stats = computeTopBarStats({ ...input, strategicInfrastructure: [{ h3Index: 'a', urbanHexCount: 1530 }] }, notNeutral);
  assert.deepEqual(formatTopBarStatParts(stats), {
    production: `+${PRODUCTION_CAPACITY_SYMBOL}1,530`,
    forces: '4',
    forcesCap: '/36',
    humanHome: '2',
    humanHomeTotal: '/3',
    enemyHome: '1',
    enemyHomeTotal: '/2',
    cities: '',
    citiesTooltip: '',
    credits: '',
    creditsSuffix: '',
  });
  assert.equal(formatForcesBreakdown(stats), 'infantry 2 of 12, armor 1 of 8, naval 0 of 8, air 1 of 6, missile 0 of 2');
});

const secondAi = aiSeatIdForIndex(2);

const severalSides: TopBarStatsInput = {
  units: [],
  seats: [
    { seatId: HUMAN_SEAT_ID, seatOrder: 1, homeRegion: 'Western Turkey', outTurn: null },
    { seatId: 'opponent', seatOrder: 2, homeRegion: 'Eastern Turkey', outTurn: null },
    { seatId: secondAi, seatOrder: 3, homeRegion: 'Levant', outTurn: null },
  ],
  homeRegionHexesBySeat: {
    [HUMAN_SEAT_ID]: ['a', 'b'],
    opponent: ['c'],
    [secondAi]: ['d', 'f'],
  },
  strategicControl: [
    { h3Index: 'a', controllerPlayerId: HUMAN_SEAT_ID },
    { h3Index: 'b', controllerPlayerId: HUMAN_SEAT_ID },
    { h3Index: 'c', controllerPlayerId: HUMAN_SEAT_ID },
    { h3Index: 'd', controllerPlayerId: HUMAN_SEAT_ID },
    { h3Index: 'g', controllerPlayerId: secondAi },
    { h3Index: 'h', controllerPlayerId: secondAi },
  ],
  strategicInfrastructure: [
    { h3Index: 'a', urbanHexCount: 2 },
    { h3Index: 'b', urbanHexCount: 1 },
    { h3Index: 'c', urbanHexCount: 4 },
    { h3Index: 'g', urbanHexCount: 3 },
    { h3Index: 'h', urbanHexCount: 1 },
  ],
};

test('computeTopBarStats counts every active enemy home together', () => {
  const stats = computeTopBarStats(severalSides, notNeutral);
  assert.deepEqual(stats.enemyHomes, { held: 2, total: 3 });
});

test('computeTopBarStats leaves a knocked-out enemy home out of the total', () => {
  const seats = severalSides.seats?.map((seat) => (seat.seatId === secondAi ? { ...seat, outTurn: 4 } : seat));
  const stats = computeTopBarStats({ ...severalSides, seats }, notNeutral);
  assert.deepEqual(stats.enemyHomes, { held: 1, total: 1 });
});

test('computeTopBarStats ranks city hexes and shares a place on a tie', () => {
  const stats = computeTopBarStats(
    {
      ...severalSides,
      victory: { rule: 'most_city_hexes_at_turn_limit', turnLimit: 30 },
      strategicControl: [
        { h3Index: 'a', controllerPlayerId: HUMAN_SEAT_ID },
        { h3Index: 'b', controllerPlayerId: HUMAN_SEAT_ID },
        { h3Index: 'c', controllerPlayerId: 'opponent' },
        { h3Index: 'g', controllerPlayerId: secondAi },
        { h3Index: 'h', controllerPlayerId: secondAi },
      ],
    },
    notNeutral
  );
  assert.equal(stats.enemyHomes, null);
  assert.equal(stats.cities?.summary, '2 · 1 of 3');
  assert.equal(
    stats.cities?.tooltip,
    'City hexes held. Most at the end of turn 30 wins. A tie leaves no single winner. Western Turkey (you) 2; Levant 2; Eastern Turkey 1'
  );
});

test('computeTopBarStats omits both home readouts for a null viewer and still lists cities', () => {
  const stats = computeTopBarStats(
    { ...severalSides, viewerSeatId: null, victory: { rule: 'most_city_hexes_at_turn_limit', turnLimit: 30 } },
    notNeutral
  );
  assert.equal(stats.yourHome, null);
  assert.equal(stats.enemyHomes, null);
  assert.equal(stats.cities?.summary, null);
  assert.equal(stats.cities?.tooltip.includes('(you)'), false);
  assert.equal(stats.productionPerTurn, 0);
  assert.equal(stats.credits, null);
});

test('credits are short when they cannot cover upkeep', () => {
  const covered = computeTopBarStats({
    units: [],
    mercenaryEconomy: { credits: 5, upkeepPerTurn: 3, pendingHireFees: 4, mercenaryCount: 1 },
  }, notNeutral);
  assert.equal(covered.credits?.short, false);
  assert.equal(covered.credits?.credits, 5);
  const short = computeTopBarStats({
    units: [],
    mercenaryEconomy: { credits: 2, upkeepPerTurn: 3, pendingHireFees: 0, mercenaryCount: 1 },
  }, notNeutral);
  assert.equal(short.credits?.short, true);
});
