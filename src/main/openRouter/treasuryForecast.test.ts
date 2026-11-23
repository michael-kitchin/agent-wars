/**
 * Contract tests for the treasury forecast, its sentence, and the two attention bullets.
 * Run: `npm run build:main` then `node dist/main/openRouter/treasuryForecast.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { CREDITS_PER_ITEM } from '../../shared/creditsRules';
import { creditsItemCost } from '../../shared/gameRules';
import { getMaxUnitsPerType } from '../../shared/gameSize';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import type { GameStateSnapshot } from '../gameDb';
import { SECTION_TITLE_MERCENARIES, SECTION_TITLE_RAISE_OPTIONS } from './promptSpec/sectionHeadings';
import {
  buildTreasuryForecast,
  estimateCreditsIncomePerTurn,
  formatTreasuryForecastSentence,
  formatTreasuryHoardAttention,
  formatTreasuryRunOutAttention,
  treasuryAttention,
  treasuryCoverTurns,
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
 * Purpose: Income cases need a city the seat controls with a known number of urban cells.
 * When to use: The run-out and sentence cases.
 * Expected outcome: Income equals `Math.floor((urban * CREDITS_PER_ITEM) / creditsItemCost())`.
 * Exceptions: None.
 */
function creditsWorld(args: { readonly urban: number; readonly credits: number; readonly upkeep: number }): GameStateSnapshot {
  const city = ORIGIN;
  return world({
    mercenaryEconomy: economy(args.credits, args.upkeep),
    strategicControl: [{ h3Index: city, controllerPlayerId: OWN }],
    strategicInfrastructure: [{ h3Index: city, urbanHexCount: args.urban, airportCount: 0, seaportCount: 0 }],
    homeRegionHexesBySeat: { [OWN]: [city] },
    strategicBuildQueueTotals: [{ h3Index: city, queuedUnits: 1, nextUnitType: 'credits', nextRemainingCount: 1, storedPoints: 0 }],
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

test('cover turns count the payrolls the treasury and income pay', () => {
  assert.equal(treasuryCoverTurns({ credits: 10, upkeepPerTurn: 15, incomePerTurn: 10 }), 2);
  assert.equal(treasuryCoverTurns({ credits: 4, upkeepPerTurn: 15, incomePerTurn: 10 }), 0);
  assert.equal(treasuryCoverTurns({ credits: 0, upkeepPerTurn: 15, incomePerTurn: 0 }), 0);
  assert.equal(treasuryCoverTurns({ credits: -5, upkeepPerTurn: 15, incomePerTurn: 0 }), 0);
  assert.equal(treasuryCoverTurns({ credits: 10, upkeepPerTurn: 10, incomePerTurn: 10 }), null);
  assert.equal(treasuryCoverTurns({ credits: 0, upkeepPerTurn: 0, incomePerTurn: 0 }), null);
});

test("income counts only the seat's own unpaused cities whose next item is credits", () => {
  const [a, b, c, d, e] = [...gridDisk(ORIGIN, 1)].slice(0, 5);
  const urban = 12;
  const cells = [a, b, c, d, e];
  const queue = (h3Index: string, nextUnitType: string, buildPaused?: boolean) => ({
    h3Index,
    queuedUnits: 1,
    nextUnitType,
    nextRemainingCount: 1,
    storedPoints: 0,
    ...(buildPaused === undefined ? {} : { buildPaused }),
  });
  const state = world({
    strategicControl: cells.map((h3Index, index) => ({ h3Index, controllerPlayerId: index === 4 ? ENEMY : OWN })),
    strategicInfrastructure: cells.map((h3Index) => ({ h3Index, urbanHexCount: urban, airportCount: 0, seaportCount: 0 })),
    homeRegionHexesBySeat: { [OWN]: [a, b, d] },
    strategicBuildQueueTotals: [
      queue(a, 'credits'),
      queue(b, 'infantry'),
      queue(c, 'credits'),
      queue(d, 'credits', true),
      queue(e, 'credits'),
    ],
  } as Partial<GameStateSnapshot>);
  assert.equal(estimateCreditsIncomePerTurn(state, OWN), Math.floor((urban * CREDITS_PER_ITEM) / creditsItemCost()));
  assert.equal(estimateCreditsIncomePerTurn({ ...state, strategicBuildQueueTotals: undefined }, OWN), 0);
});

test('the forecast is null without an economy, and the sentence follows each case', () => {
  assert.equal(buildTreasuryForecast(world({}), OWN), null);
  const sentence = (forecast: Parameters<typeof formatTreasuryForecastSentence>[0]) => formatTreasuryForecastSentence(forecast);
  assert.equal(sentence({ credits: 50, upkeepPerTurn: 0, incomePerTurn: 0, coverTurns: null }), '');
  assert.equal(
    sentence({ credits: 50, upkeepPerTurn: 6, incomePerTurn: 20, coverTurns: null }),
    'At about 20 credits a turn from your credits queues, upkeep is covered.'
  );
  assert.equal(
    sentence({ credits: 10, upkeepPerTurn: 15, incomePerTurn: 5, coverTurns: 1 }),
    'At about 5 credits a turn from your credits queues, the treasury covers upkeep for 1 more turn.'
  );
  assert.equal(
    sentence({ credits: 30, upkeepPerTurn: 15, incomePerTurn: 5, coverTurns: 3 }),
    'At about 5 credits a turn from your credits queues, the treasury covers upkeep for 3 more turns.'
  );
  assert.equal(
    sentence({ credits: 4, upkeepPerTurn: 15, incomePerTurn: 10, coverTurns: 0 }),
    "At about 10 credits a turn from your credits queues, the treasury cannot cover this turn's upkeep."
  );
  assert.equal(
    sentence({ credits: 30, upkeepPerTurn: 15, incomePerTurn: 0, coverTurns: 2 }),
    'With no city producing credits, the treasury covers upkeep for 2 more turns.'
  );
  assert.equal(
    sentence({ credits: 0, upkeepPerTurn: 15, incomePerTurn: 0, coverTurns: 0 }),
    "With no city producing credits, the treasury cannot cover this turn's upkeep."
  );
});

test('the run-out bullet appears at 5 turns or fewer', () => {
  const tail = 'Queue credits in more cities or raise no more mercenaries, or random mercenaries desert to Neutral.';
  const state = (credits: number, upkeep: number) => world({ mercenaryEconomy: economy(credits, upkeep) });
  assert.equal(
    formatTreasuryRunOutAttention(buildTreasuryForecast(state(50, 10), OWN)),
    `Treasury: your 50 credits and about 0 credits a turn from credits queues pay your 10 credits of mercenary upkeep for only 5 more turns. ${tail}`
  );
  assert.equal(
    formatTreasuryRunOutAttention(buildTreasuryForecast(state(10, 10), OWN)),
    `Treasury: your 10 credits and about 0 credits a turn from credits queues pay your 10 credits of mercenary upkeep for only 1 more turn. ${tail}`
  );
  assert.equal(
    formatTreasuryRunOutAttention(buildTreasuryForecast(state(9, 10), OWN)),
    `Treasury: your 9 credits and about 0 credits a turn from credits queues cannot pay this turn's 10 credits of mercenary upkeep. ${tail}`
  );
  assert.equal(formatTreasuryRunOutAttention(buildTreasuryForecast(state(60, 10), OWN)), null);
  assert.equal(formatTreasuryRunOutAttention(buildTreasuryForecast(creditsWorld({ urban: 50, credits: 5, upkeep: 6 }), OWN)), null);
  assert.equal(formatTreasuryRunOutAttention(null), null);
});

test('the hoard bullet needs a deep treasury and units under half their caps', () => {
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
    hoard(small(600, 30, 16)),
    `Treasury: 600 credits, 20 turns of mercenary upkeep, while you field 16 infantry, armor, naval, and air units against a combined cap of 34. ${ask}`
  );
  assert.ok(hoard(small(600, 30, 16))?.includes(`${SECTION_TITLE_RAISE_OPTIONS} under ${SECTION_TITLE_MERCENARIES}`));
  assert.equal(hoard(small(599, 30, 16)), null);
  assert.equal(hoard(small(600, 30, 17)), null);
  assert.equal(
    hoard(small(500, 0, 16)),
    `Treasury: 500 credits and no mercenary upkeep, while you field 16 infantry, armor, naval, and air units against a combined cap of 34. ${ask}`
  );
  assert.equal(hoard(small(499, 0, 16)), null);
  assert.notEqual(hoard(small(600, 30, 16, ownUnits(10, true))), null);
  assert.match(hoard(small(600, 30, 16, ownUnits(10, true))) ?? '', /field 16 infantry/);

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
