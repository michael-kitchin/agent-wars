/**
 * Contract tests for the treasury forecast, its sentence, and the two attention bullets.
 * Run: `npm run build:main` then `node dist/main/openRouter/treasuryForecast.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { getMaxUnitsPerType } from '../../shared/gameSize';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import type { GameStateSnapshot } from '../gameDb';
import { SECTION_TITLE_MERCENARIES, SECTION_TITLE_RAISE_OPTIONS } from './promptSpec/sectionHeadings';
import {
  buildTreasuryForecast,
  creditsQueueRowsForSeat,
  projectCreditsQueues,
  type CreditsQueueRow,
  formatTreasuryForecastSentence,
  formatTreasuryHoardAttention,
  formatTreasuryRunOutAttention,
  isTreasuryDeep,
  treasuryAttention,
} from './treasuryForecast';

/** Origin reused so `gridDisk` can supply real cells. */
const ORIGIN = '810ebffffffffff';

/** Seat the forecast is written for. */
const OWN = AI_SEAT_IDS[0];

/** Seat that owns the enemy cell. */
const ENEMY = HUMAN_SEAT_ID;

/**
 * A planning snapshot with the fields the forecast reads.
 *
 * Purpose: The forecast reads economy, control, infrastructure, queues, units, and size.
 * When to use: Each case, after the fields are chosen.
 * Expected outcome: Missing lists stay empty. `gameSize` defaults to small.
 * Exceptions: None.
 */
function world(partial: Partial<GameStateSnapshot>): GameStateSnapshot {
  return {
    hexes: [],
    units: [],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    gameSize: 'small',
    ...partial,
  } as GameStateSnapshot;
}

/**
 * A mercenary economy block.
 *
 * Purpose: The forecast reads only credits and upkeep.
 * When to use: Each case that needs an economy.
 * Expected outcome: A block with no pending hire fees.
 * Exceptions: None.
 */
function economy(credits: number, upkeepPerTurn: number): GameStateSnapshot['mercenaryEconomy'] {
  return { credits, upkeepPerTurn, pendingHireFees: 0, mercenaryCount: upkeepPerTurn > 0 ? 1 : 0 } as GameStateSnapshot['mercenaryEconomy'];
}

/**
 * A snapshot with one controlled home city that has credits next.
 *
 * Purpose: Queue cases need a city the seat controls with a known number of urban cells and remaining items.
 * When to use: The run-out and sentence cases.
 * Expected outcome: One credits queue of `items` items, default 1.
 * Exceptions: None.
 */
function creditsWorld(args: { readonly urban: number; readonly credits: number; readonly upkeep: number; readonly items?: number }): GameStateSnapshot {
  const city = ORIGIN;
  return world({
    mercenaryEconomy: economy(args.credits, args.upkeep),
    strategicControl: [{ h3Index: city, controllerPlayerId: OWN }],
    strategicInfrastructure: [{ h3Index: city, urbanHexCount: args.urban, airportCount: 0, seaportCount: 0 }],
    homeRegionHexesBySeat: { [OWN]: [city] },
    strategicBuildQueueTotals: [{ h3Index: city, queuedUnits: 1, nextUnitType: 'credits', nextRemainingCount: args.items ?? 1, storedPoints: 0 }],
  } as Partial<GameStateSnapshot>);
}

/**
 * `count` units of one type for the seat, with optional mercenaries.
 *
 * Purpose: The hoard bullet counts fielded units.
 * When to use: The hoard cases.
 * Expected outcome: Unit rows with unique ids.
 * Exceptions: None.
 */
function ownUnits(count: number, isMercenary = false, unitType = 'infantry'): GameStateSnapshot['units'] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${unitType}-${isMercenary ? 'm' : 'b'}-${index}`,
    player: OWN,
    unitType,
    h3Index: ORIGIN,
    isMercenary,
  })) as unknown as GameStateSnapshot['units'];
}

/**
 * Projects with one queue and the shared item economics.
 *
 * Purpose: The projection cases vary only the queue and the treasury.
 * When to use: The projection cases.
 * Expected outcome: Item cost 20, 20 credits an item, horizon 100.
 * Exceptions: None.
 */
function project(args: { credits: number; upkeepPerTurn: number; rows: readonly CreditsQueueRow[] }) {
  return projectCreditsQueues({ ...args, itemCost: 20, creditsPerItem: 20, horizonTurns: 100 });
}

/**
 * A queue row for the projection cases.
 *
 * Purpose: Keeps each case to the numbers it is about.
 * When to use: The projection cases.
 * Expected outcome: A row on the origin hex.
 * Exceptions: None.
 */
function row(remainingItems: number, storedPoints: number, pointsPerTurn: number): CreditsQueueRow {
  return { h3Index: ORIGIN, remainingItems, storedPoints, pointsPerTurn };
}

test('one queued item pays once', () => {
  assert.deepEqual(project({ credits: 0, upkeepPerTurn: 15, rows: [row(1, 0, 20)] }), { coverTurns: 1, queuedCredits: 20 });
});

test('banked points buy items at once', () => {
  assert.deepEqual(project({ credits: 0, upkeepPerTurn: 50, rows: [row(3, 60, 0)] }), { coverTurns: 1, queuedCredits: 60 });
});

test('a queue still paying at the horizon gives null, and an emptied queue gives a number', () => {
  assert.equal(project({ credits: 2000, upkeepPerTurn: 10, rows: [row(99, 0, 1)] }).coverTurns, null);
  const emptied = project({ credits: 2000, upkeepPerTurn: 10, rows: [row(99, 0, 40)] }).coverTurns;
  assert.notEqual(emptied, null);
});

test('a queue that earns no points counts only what its banked points buy', () => {
  assert.deepEqual(project({ credits: 0, upkeepPerTurn: 15, rows: [row(5, 0, 0)] }), { coverTurns: 0, queuedCredits: 0 });
  assert.deepEqual(project({ credits: 0, upkeepPerTurn: 15, rows: [row(5, 45, 0)] }), { coverTurns: 2, queuedCredits: 40 });
});

test('upkeep 0 gives null and still counts queued credits', () => {
  assert.deepEqual(project({ credits: 0, upkeepPerTurn: 0, rows: [row(2, 0, 20)] }), { coverTurns: null, queuedCredits: 40 });
});

test("rows follow the seat's own unpaused credits cities with a remaining count", () => {
  const [a, b, c, d, e, f] = [...gridDisk(ORIGIN, 1)].slice(0, 6);
  const urban = 12;
  const cells = [a, b, c, d, e, f];
  const queue = (h3Index: string, nextUnitType: string, buildPaused?: boolean, count: number | null = 3) => ({
    h3Index,
    queuedUnits: 1,
    nextUnitType,
    nextRemainingCount: count,
    storedPoints: 5,
    ...(buildPaused === undefined ? {} : { buildPaused }),
  });
  const state = world({
    strategicControl: cells.map((h3Index, index) => ({ h3Index, controllerPlayerId: index === 4 ? ENEMY : OWN })),
    strategicInfrastructure: cells.map((h3Index) => ({ h3Index, urbanHexCount: urban, airportCount: 0, seaportCount: 0 })),
    homeRegionHexesBySeat: { [OWN]: [a, b, d, f] },
    strategicBuildQueueTotals: [
      queue(a, 'credits'),
      queue(b, 'infantry'),
      queue(c, 'credits'),
      queue(d, 'credits', true),
      queue(e, 'credits'),
      queue(f, 'credits', undefined, null),
    ],
  } as Partial<GameStateSnapshot>);
  const rows = creditsQueueRowsForSeat(state, OWN);
  assert.deepEqual(rows.map((entry) => entry.h3Index), [a]);
  assert.equal(rows[0]?.remainingItems, 3);
  assert.equal(rows[0]?.storedPoints, 5);
  assert.equal(creditsQueueRowsForSeat({ ...state, strategicBuildQueueTotals: undefined }, OWN).length, 0);
});

test('the forecast is null without an economy, and the sentence follows each case', () => {
  assert.equal(buildTreasuryForecast(world({}), OWN), null);
  const sentence = (credits: number, upkeepPerTurn: number, queuedCredits: number, coverTurns: number | null) =>
    formatTreasuryForecastSentence({ forecast: { credits, upkeepPerTurn, queuedCredits, coverTurns }, deep: false });
  assert.equal(sentence(50, 0, 0, null), '');
  assert.equal(sentence(50, 0, 40, null), 'Your credits queues hold 40 more credits.');
  assert.equal(
    sentence(50, 6, 40, null),
    'Your credits queues hold 40 more credits. With them, the treasury covers upkeep for at least 100 more turns.'
  );
  assert.equal(sentence(10, 15, 40, 1), 'Your credits queues hold 40 more credits. With them, the treasury covers upkeep for 1 more turn.');
  assert.equal(sentence(10, 15, 40, 3), 'Your credits queues hold 40 more credits. With them, the treasury covers upkeep for 3 more turns.');
  assert.equal(sentence(4, 15, 40, 0), "Your credits queues hold 40 more credits, but the treasury cannot cover this turn's upkeep.");
  assert.equal(sentence(30, 15, 0, 1), 'No credits are queued, so the treasury covers upkeep for 1 more turn.');
  assert.equal(sentence(30, 15, 0, 2), 'No credits are queued, so the treasury covers upkeep for 2 more turns.');
  assert.equal(sentence(0, 15, 0, 0), "No credits are queued, and the treasury cannot cover this turn's upkeep.");
});

test('a deep treasury adds the spend sentence', () => {
  const spend =
    'Your 900 credits are more than you need: spend them on mercenaries before you queue more credits, and queue units instead of credits where a city can still build them.';
  const sentence = (upkeepPerTurn: number, queuedCredits: number) =>
    formatTreasuryForecastSentence({ forecast: { credits: 900, upkeepPerTurn, queuedCredits, coverTurns: null }, deep: true });
  assert.equal(sentence(6, 40), `Your credits queues hold 40 more credits. With them, the treasury covers upkeep for at least 100 more turns. ${spend}`);
  assert.equal(sentence(0, 0), spend);
});

test('the run-out bullet appears at 5 turns or fewer', () => {
  const tail =
    'Queue more credits, with a larger count or in more cities, raise no more mercenaries, or fire the ones you can spare. Otherwise random mercenaries desert to Neutral.';
  const state = (credits: number, upkeep: number) => world({ mercenaryEconomy: economy(credits, upkeep) });
  assert.equal(
    formatTreasuryRunOutAttention(buildTreasuryForecast(state(50, 10), OWN)),
    `Treasury: your 50 credits and the 0 credits still queued pay your 10 credits of mercenary upkeep for only 5 more turns. ${tail}`
  );
  assert.equal(
    formatTreasuryRunOutAttention(buildTreasuryForecast(state(10, 10), OWN)),
    `Treasury: your 10 credits and the 0 credits still queued pay your 10 credits of mercenary upkeep for only 1 more turn. ${tail}`
  );
  assert.equal(
    formatTreasuryRunOutAttention(buildTreasuryForecast(state(9, 10), OWN)),
    `Treasury: your 9 credits and this turn's credits cannot pay this turn's 10 credits of mercenary upkeep. ${tail}`
  );
  assert.equal(formatTreasuryRunOutAttention(buildTreasuryForecast(state(60, 10), OWN)), null);
  assert.equal(
    formatTreasuryRunOutAttention(buildTreasuryForecast(creditsWorld({ urban: 50, credits: 5, upkeep: 6, items: 99 }), OWN)),
    null
  );
  assert.equal(formatTreasuryRunOutAttention(null), null);
});

test('a deep treasury covers forty turns of upkeep and the size floor', () => {
  const deep = (credits: number, upkeepPerTurn: number, gameSize: GameStateSnapshot['gameSize'] = 'small') =>
    isTreasuryDeep({ forecast: { credits, upkeepPerTurn, queuedCredits: 0, coverTurns: null }, gameSize });
  // Upkeep-bound: 40 x 40 = 1600 is above the small floor of 500.
  assert.equal(deep(1600, 40), true);
  assert.equal(deep(1599, 40), false);
  // Size-bound: 40 x 10 = 400 is below the floor of 500.
  assert.equal(deep(500, 10), true);
  assert.equal(deep(499, 10), false);
  // Upkeep 0: only the size floor applies, and it scales with the size.
  assert.equal(deep(500, 0), true);
  assert.equal(deep(499, 0), false);
  assert.equal(deep(999, 0, 'medium'), false);
  assert.equal(deep(1000, 0, 'medium'), true);
});

test('the hoard bullet needs a deep treasury, and its wording follows the caps', () => {
  const caps = getMaxUnitsPerType('small');
  const capSmall = caps.infantry + caps.armor + caps.naval + caps.air;
  assert.equal(capSmall, 34);
  const hoard = (state: GameStateSnapshot) =>
    formatTreasuryHoardAttention({ state, ownSeat: OWN, forecast: buildTreasuryForecast(state, OWN) });
  const ask =
    'Raise mercenaries where Raise Options under Mercenaries lists a cell, and queue units instead of credits where a city can still build them.';
  const small = (credits: number, upkeep: number, built: number, extra: GameStateSnapshot['units'] = []) =>
    world({ mercenaryEconomy: economy(credits, upkeep), units: [...ownUnits(built), ...extra] });

  assert.equal(
    hoard(small(1200, 30, 16)),
    `Treasury: 1200 credits, 40 turns of mercenary upkeep, while you field 16 infantry, armor, naval, and air units against a combined cap of 34. ${ask}`
  );
  assert.ok(hoard(small(1200, 30, 16))?.includes(`${SECTION_TITLE_RAISE_OPTIONS} under ${SECTION_TITLE_MERCENARIES}`));
  assert.equal(hoard(small(1199, 30, 16)), null);
  const atCaps =
    'Mercenaries do not count toward those caps: raise them where Raise Options under Mercenaries lists a cell.';
  assert.equal(
    hoard(small(1200, 30, 17)),
    `Treasury: 1200 credits, 40 turns of mercenary upkeep, while you field 17 infantry, armor, naval, and air units against a combined cap of 34. ${atCaps}`
  );
  assert.equal(
    hoard(small(500, 0, 16)),
    `Treasury: 500 credits and no mercenary upkeep, while you field 16 infantry, armor, naval, and air units against a combined cap of 34. ${ask}`
  );
  assert.equal(hoard(small(499, 0, 16)), null);
  assert.notEqual(hoard(small(1200, 30, 16, ownUnits(10, true))), null);
  assert.match(hoard(small(1200, 30, 16, ownUnits(10, true))) ?? '', /field 16 infantry/);

  const medium = (credits: number) => world({ gameSize: 'medium', mercenaryEconomy: economy(credits, 0) });
  assert.equal(hoard(medium(999)), null);
  assert.match(hoard(medium(1000)) ?? '', /combined cap of 68\./);
});

test('treasuryAttention never returns both bullets', () => {
  const draining = treasuryAttention(world({ mercenaryEconomy: economy(20, 10) }), OWN);
  assert.equal(typeof draining.runOut, 'string');
  assert.equal(draining.hoard, null);

  const rich = treasuryAttention(world({ mercenaryEconomy: economy(900, 10), units: ownUnits(3) }), OWN);
  assert.equal(rich.runOut, null);
  assert.equal(typeof rich.hoard, 'string');

  assert.deepEqual(treasuryAttention(world({}), OWN), { runOut: null, hoard: null });
});
