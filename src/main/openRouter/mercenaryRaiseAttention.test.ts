/**
 * Contract tests for the mercenary raise attention line.
 * Run: `npm run build:main` then `node dist/main/openRouter/mercenaryRaiseAttention.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { HIREABLE_UNIT_TYPES } from '../../shared/mercenaryRules';
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
import { raiseOptionRowsForSeat } from './briefingSectionsMercenaries';
import { formatMercenaryRaiseAttention, MERCENARY_UPKEEP_RESERVE_TURNS } from './mercenaryRaiseAttention';

/**
 * A city outside every home region, controlled by the seat and cleared of units.
 *
 * Purpose: The raise line needs one hex the hire rules will offer.
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

test('the line fires when the option is affordable and stays quiet one credit under that price', () => {
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
    const option = cheapest(row.options);
    const price = option.fee + MERCENARY_UPKEEP_RESERVE_TURNS * option.upkeep;
    const economy = {
      credits: price,
      upkeepPerTurn: price + 5000,
      pendingHireFees: 0,
      mercenaryCount: 0,
    };
    const affordable = formatMercenaryRaiseAttention({
      state: { ...probed, mercenaryEconomy: economy },
      ownSeat: seat,
      format: (h3) => h3,
      campaignTargetH3: null,
    });
    assert.equal(
      affordable,
      `Mercenaries: your treasury of ${price} credits can raise ${option.unitType} at ${hex} for ${option.fee}. Add a raise_mercenaries row to productionOrders.`
    );
    const short = formatMercenaryRaiseAttention({
      state: { ...probed, mercenaryEconomy: { ...economy, credits: price - 1 } },
      ownSeat: seat,
      format: (h3) => h3,
      campaignTargetH3: null,
    });
    assert.equal(short, null);
  });
});

test('an affordable hex outside the home region is named ahead of one inside it', () => {
  withTempGameDb('aw-raise-attention-home-', () => {
    const seat = AI_SEAT_IDS[0];
    const roster = getSeatRoster().find((row) => row.seatId === seat);
    assert.ok(roster);
    const homes = getScenarioHomeRegionHexes(roster.homeRegion);
    const homeSet = new Set(homes);
    const homeCity = dbGetAll<{ h3Index: string }>(
      'SELECT h3_index AS h3Index FROM res_s_infrastructure WHERE urban_hex_count >= 10 AND fortified_count = 0'
    )
      .map((row) => row.h3Index)
      .find((h3Index) => homeSet.has(h3Index) && !isNeutralBorderHex(h3Index));
    assert.ok(homeCity, 'fixture needs a home city');
    setHexController(homeCity, seat);
    dbRun('DELETE FROM units WHERE h3_index = ?', [homeCity]);
    const outside = outsideCity(seat);
    const loaded = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const state = {
      ...loaded,
      units: loaded.units.filter((unit) => unit.player === seat),
      exploredHexes: [homeCity, outside],
      homeRegionHexesBySeat: { ...(loaded.homeRegionHexesBySeat ?? {}), [seat]: homes },
      mercenaryEconomy: { credits: 1_000_000, upkeepPerTurn: 2_000_000, pendingHireFees: 0, mercenaryCount: 0 },
    };
    const rows = raiseOptionRowsForSeat(state, seat, null);
    assert.ok(rows.some((row) => row.h3Index === homeCity));
    assert.ok(rows.some((row) => row.h3Index === outside));
    const bullet = formatMercenaryRaiseAttention({
      state,
      ownSeat: seat,
      format: (h3) => h3,
      campaignTargetH3: null,
    });
    assert.ok(bullet?.includes(`at ${outside} for`), bullet ?? '');
    assert.equal(bullet?.includes(`at ${homeCity} for`), false);
  });
});
