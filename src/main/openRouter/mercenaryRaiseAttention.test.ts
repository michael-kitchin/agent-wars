/**
 * Contract tests for the mercenary raise planner and the raise attention line.
 * Run: `npm run build:main` then `node dist/main/openRouter/mercenaryRaiseAttention.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { HIREABLE_UNIT_TYPES, MERCENARY_RAISE_CAPACITY_MULTIPLIER } from '../../shared/mercenaryRules';
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import type { HireRaiseOption } from '../../shared/ipc/mercenaryTypes';
import {
  dbGetAll,
  dbRun,
  getGameStateForPlayer,
  getScenarioHomeRegionHexes,
  getSeatRoster,
  setHexController,
} from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { raiseOptionRowsForSeat, type RaiseOptionRow } from './briefingSectionsMercenaries';
import {
  formatMercenaryRaiseAttention,
  MERCENARY_RAISE_ATTENTION_MAX_CELLS,
  MERCENARY_UPKEEP_RESERVE_TURNS,
  planMercenaryRaises,
} from './mercenaryRaiseAttention';
import { isTreasuryDeep, TREASURY_HOARD_UPKEEP_TURNS } from './treasuryForecast';

/**
 * A city outside every home region, controlled by the seat and cleared of units.
 *
 * Purpose: The raise line needs one hex the hire rules will offer. With no unit and no fortification it is occupation-paused, so raising there resumes its queue.
 * When to use: Inside a temporary match.
 * Expected outcome: The hex index.
 * Exceptions: Assertion failure when the fixture map has no such city.
 */
function outsideCity(seat: (typeof AI_SEAT_IDS)[number]): string {
  const homes = new Set(getSeatRoster().flatMap((row) => getScenarioHomeRegionHexes(row.homeRegion)));
  const hex = dbGetAll<{ h3Index: string }>(
    'SELECT h3_index AS h3Index FROM res_s_infrastructure WHERE urban_hex_count >= 10 AND fortified_count = 0'
  )
    .map((row) => row.h3Index)
    .find((h3Index) => !homes.has(h3Index) && !isNeutralBorderHex(h3Index));
  assert.ok(hex, 'fixture needs a city outside every home');
  setHexController(hex, seat);
  dbRun('DELETE FROM units WHERE h3_index = ?', [hex]);
  return hex;
}

/**
 * The option the attention line would name on this row.
 *
 * Purpose: The test's treasury has to match the same fee and type order the line uses.
 * When to use: After `raiseOptionRowsForSeat`.
 * Expected outcome: Lowest fee, then the hire-type order.
 * Exceptions: Throws when the row has no option.
 */
function cheapest(options: readonly HireRaiseOption[]): HireRaiseOption {
  const sorted = [...options].sort(
    (left, right) => left.fee - right.fee || HIREABLE_UNIT_TYPES.indexOf(left.unitType) - HIREABLE_UNIT_TYPES.indexOf(right.unitType)
  );
  const option = sorted[0];
  assert.ok(option);
  return option;
}

/** Infantry option with a fee of 5, upkeep of 5, and a unit cost of 20, as the planner cases use. */
const INFANTRY: HireRaiseOption = { unitType: 'infantry', unitCost: 20, fee: 5, upkeep: 5 };

/**
 * A raise row for the planner cases.
 *
 * Purpose: Keeps each case to the hex, the capacity, and whether it resumes.
 * When to use: The planner cases.
 * Expected outcome: A row with the single infantry option.
 * Exceptions: None.
 */
function plannerRow(h3Index: string, capacityLeft = 400, resumes = false): RaiseOptionRow {
  return { h3Index, capacityLeft, resumes, options: [INFANTRY] } as RaiseOptionRow;
}

test('the planner keeps twenty turns of total upkeep', () => {
  const credits = 20 * 100 + 3 * (5 + 20 * 5);
  const rows = [plannerRow('a')];
  const plan = (treasury: number) => planMercenaryRaises({ credits: treasury, upkeepPerTurn: 100, rows, homeHexes: new Set() });
  assert.equal(MERCENARY_UPKEEP_RESERVE_TURNS, 20);
  assert.equal(plan(credits)[0]?.count, 3);
  assert.equal(plan(credits - 1)[0]?.count, 2);
});

test('the planner takes resuming cells first, then cells outside home', () => {
  const rows = [plannerRow('a'), plannerRow('b'), plannerRow('c', 400, true)];
  const plan = planMercenaryRaises({ credits: 1_000_000, upkeepPerTurn: 0, rows, homeHexes: new Set(['a']) });
  assert.deepEqual(plan.map((cell) => cell.h3Index), ['c', 'b', 'a']);
  assert.deepEqual(plan.map((cell) => cell.resumes), [true, false, false]);
});

test("the planner stops at six cells and at each cell's capacity", () => {
  const eight = Array.from({ length: 8 }, (_, index) => plannerRow(`h${index}`, 40));
  const plan = planMercenaryRaises({ credits: 1_000_000, upkeepPerTurn: 0, rows: eight, homeHexes: new Set() });
  assert.equal(plan.length, MERCENARY_RAISE_ATTENTION_MAX_CELLS);
  assert.ok(plan.every((cell) => cell.count === 2));
});

test('the planner spends the treasury across cells, not per cell', () => {
  const rows = [plannerRow('a', 60), plannerRow('b', 400)];
  const input = { credits: 5 * (5 + 20 * 5), upkeepPerTurn: 0, rows, homeHexes: new Set<string>() };
  const plan = planMercenaryRaises(input);
  assert.deepEqual(plan.map((cell) => [cell.h3Index, cell.count]), [['a', 3], ['b', 2]]);
  assert.equal(input.credits, 525);
  assert.equal(rows[0]?.capacityLeft, 60);
});

test('the raise bullet lists each cell, and marks one that restarts a paused queue', () => {
  withTempGameDb('aw-raise-attention-', () => {
    const seat = AI_SEAT_IDS[0];
    const hex = outsideCity(seat);
    const loaded = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const probed = {
      ...loaded,
      units: loaded.units.filter((unit) => unit.player === seat),
      exploredHexes: [hex],
      mercenaryEconomy: { credits: 0, upkeepPerTurn: 0, pendingHireFees: 0, mercenaryCount: 0 },
    };
    const row = raiseOptionRowsForSeat(probed, seat, null).find((candidate) => candidate.h3Index === hex);
    assert.ok(row, 'the outside city should offer a raise');
    assert.equal(row.resumes, true);
    const option = cheapest(row.options);
    const perUnit = option.fee + MERCENARY_UPKEEP_RESERVE_TURNS * option.upkeep;
    const urbanFor = (units: number): number => (units * option.unitCost) / MERCENARY_RAISE_CAPACITY_MULTIPLIER;
    dbRun('UPDATE res_s_infrastructure SET urban_hex_count = ? WHERE h3_index = ?', [urbanFor(5), hex]);
    const again = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const result = formatMercenaryRaiseAttention({
      state: {
        ...again,
        units: again.units.filter((unit) => unit.player === seat),
        exploredHexes: [hex],
        mercenaryEconomy: { credits: perUnit * 2, upkeepPerTurn: 0, pendingHireFees: 0, mercenaryCount: 0 },
      },
      ownSeat: seat,
      format: (h3) => h3,
      campaignTargetH3: null,
    });
    assert.equal(
      result.text,
      `Mercenaries: your treasury of ${perUnit * 2} credits can raise 2 mercenaries this turn for ${2 * option.fee} credits and still keep 20 turns of upkeep: 2 ${option.unitType} at ${hex} (restarts its paused queue). Add one raise_mercenaries row per cell, with that count.`
    );
    assert.deepEqual(result.cells.map((cell) => [cell.h3Index, cell.count, cell.resumes]), [[hex, 2, true]]);
  });
});

test('the deep-treasury line sits above the raise reserve', () => {
  // A treasury the raise flag leaves at its reserve must not read as more than needed.
  const deepAt = (credits: number) =>
    isTreasuryDeep({ forecast: { credits, upkeepPerTurn: 100, queuedCredits: 0, coverTurns: null }, gameSize: 'small' });
  assert.ok(TREASURY_HOARD_UPKEEP_TURNS >= 2 * MERCENARY_UPKEEP_RESERVE_TURNS);
  assert.equal(deepAt(MERCENARY_UPKEEP_RESERVE_TURNS * 100), false);
  assert.equal(deepAt(TREASURY_HOARD_UPKEEP_TURNS * 100), true);
});

test('the raise bullet is quiet when no cell is affordable', () => {
  withTempGameDb('aw-raise-attention-quiet-', () => {
    const seat = AI_SEAT_IDS[0];
    const hex = outsideCity(seat);
    const loaded = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const probed = {
      ...loaded,
      units: loaded.units.filter((unit) => unit.player === seat),
      exploredHexes: [hex],
      mercenaryEconomy: { credits: 0, upkeepPerTurn: 0, pendingHireFees: 0, mercenaryCount: 0 },
    };
    const row = raiseOptionRowsForSeat(probed, seat, null).find((candidate) => candidate.h3Index === hex);
    assert.ok(row, 'the outside city should offer a raise');
    const option = cheapest(row.options);
    const price = option.fee + MERCENARY_UPKEEP_RESERVE_TURNS * option.upkeep;
    const short = formatMercenaryRaiseAttention({
      state: { ...probed, mercenaryEconomy: { credits: price - 1, upkeepPerTurn: 0, pendingHireFees: 0, mercenaryCount: 0 } },
      ownSeat: seat,
      format: (h3) => h3,
      campaignTargetH3: null,
    });
    assert.equal(short.text, null);
    assert.deepEqual(short.cells, []);
  });
});
