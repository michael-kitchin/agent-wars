/**
 * The Mercenaries section follows the seat's economy and whether it can produce.
 *
 * Purpose: A battle hides the section. A seat that cannot produce still sees upkeep.
 * When to use: After changing `buildMercenariesBriefingBlock`.
 * Expected outcome: The cases below. Each case removes its temporary match.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { SECTION_TITLE_MERCENARIES } from './promptSpec/sectionHeadings';
import { getGameStateForPlayer, getScenarioHomeRegionHexes, getSeatRoster, setTreasuryCredits, dbGetAll, dbRun, setHexController } from '../gameDb';
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { createStrategicUnit } from '../gameActions/strategicUnitSpawn';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { buildMercenariesBriefingBlock, compareByCampaignTarget } from './briefingSectionsMercenaries';

test('the section names the treasury and the mercenary, and a battle omits it', () => {
  withTempGameDb('aw-brief-merc-', () => {
    const seat = AI_SEAT_IDS[0];
    const home = getSeatRoster().find((row) => row.seatId === seat);
    assert.ok(home);
    const h3 = getScenarioHomeRegionHexes(home.homeRegion)[0];
    assert.ok(h3);
    createStrategicUnit({ owner: seat, unitType: 'infantry', h3Index: h3, turnNumber: 1, isMercenary: true });
    setTreasuryCredits(seat, 40);
    const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const block = buildMercenariesBriefingBlock(state, (hex) => hex, 'strategic', { productionEnabled: true });
    assert.ok(block.includes(`# ${SECTION_TITLE_MERCENARIES}`));
    assert.ok(block.includes('Treasury: 40 credits.'));
    assert.ok(block.includes('## Your Mercenaries'));
    assert.equal(buildMercenariesBriefingBlock(state, (hex) => hex, 'tactical', { productionEnabled: true }), '');
    const quiet = buildMercenariesBriefingBlock(state, (hex) => hex, 'strategic', { productionEnabled: false });
    assert.ok(quiet.includes('Treasury: 40 credits.'));
    assert.ok(quiet.includes('## Your Mercenaries'));
    assert.equal(quiet.includes('## Rehire Candidates'), false);
    assert.equal(quiet.includes('## Raise Options'), false);
  });
});

test('zero credits with nothing to rehire is one line, and an owned mercenary keeps upkeep', () => {
  withTempGameDb('aw-brief-merc-empty-', () => {
    const seat = AI_SEAT_IDS[0];
    setTreasuryCredits(seat, 0);
    const loaded = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const empty = { ...loaded, units: loaded.units.filter((unit) => unit.player === seat) };
    const short = buildMercenariesBriefingBlock(empty, (hex) => hex, 'strategic', { productionEnabled: true });
    assert.equal(short, `# ${SECTION_TITLE_MERCENARIES}\n\nTreasury: 0 credits. No one to rehire.`);
    assert.equal(short.includes('desert'), false);
    const home = getSeatRoster().find((row) => row.seatId === seat);
    assert.ok(home);
    const h3 = getScenarioHomeRegionHexes(home.homeRegion)[0];
    assert.ok(h3);
    createStrategicUnit({ owner: seat, unitType: 'infantry', h3Index: h3, turnNumber: 1, isMercenary: true });
    const owned = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const full = buildMercenariesBriefingBlock(owned, (hex) => hex, 'strategic', { productionEnabled: true });
    assert.ok(full.includes('each mercenary costs its upkeep'));
    assert.ok(full.includes('## Your Mercenaries'));
    assert.equal(full.includes('No one to rehire.'), false);
  });
});

test('a raise cell that would restart a paused city is marked and listed first', () => {
  withTempGameDb('aw-brief-merc-resume-', () => {
    const seat = AI_SEAT_IDS[0];
    const homes = new Set(getSeatRoster().flatMap((row) => getScenarioHomeRegionHexes(row.homeRegion)));
    const hex = dbGetAll<{ h3Index: string }>(
      'SELECT h3_index AS h3Index FROM res_s_infrastructure WHERE urban_hex_count >= 10 AND fortified_count = 0'
    )
      .map((row) => row.h3Index)
      .find((h3Index) => !homes.has(h3Index) && !isNeutralBorderHex(h3Index));
    assert.ok(hex, 'fixture needs a city outside every home');
    setHexController(hex, seat);
    dbRun('DELETE FROM units WHERE h3_index = ?', [hex]);
    setTreasuryCredits(seat, 40);
    const loaded = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const state = { ...loaded, exploredHexes: [...new Set([...(loaded.exploredHexes ?? []), hex])] };
    const block = buildMercenariesBriefingBlock(state, (h3Index) => h3Index, 'strategic', { productionEnabled: true });
    assert.ok(block.includes('| Hex | Capacity | Resumes building | Options |'), block);
    const raiseRows = block
      .slice(block.indexOf('## Raise Options'))
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.startsWith('| Hex |') && !line.startsWith('| --- |'));
    const hexIndex = raiseRows.findIndex((line) => line.startsWith(`| ${hex} | `));
    const firstNo = raiseRows.findIndex((line) => line.includes(' | no | '));
    assert.ok(hexIndex >= 0, raiseRows.join('\n'));
    assert.ok(raiseRows[hexIndex]?.includes(' | yes | '), raiseRows[hexIndex]);
    assert.ok(firstNo === -1 || hexIndex < firstNo, 'yes rows must sort before no rows');
  });
});

/**
 * Chebyshev distance on `x:y` labels.
 *
 * Purpose: The sort cases do not need a real H3 grid.
 * When to use: The campaign-target comparison below.
 * Expected outcome: The larger axis gap. A null pair is not used.
 * Exceptions: None.
 */
const hop = (a: string, b: string): number | null => {
  if (a === 'missing' || b === 'missing') return null;
  const [ax, ay] = a.split(':').map(Number);
  const [bx, by] = b.split(':').map(Number);
  return Math.max(Math.abs(ax! - bx!), Math.abs(ay! - by!));
};

test('raise options sort the nearer cell first, treat a null target as a tie, and sort a null distance last', () => {
  assert.ok(compareByCampaignTarget('1:0', '4:0', '0:0', hop) < 0);
  assert.equal(compareByCampaignTarget('1:0', '4:0', null, hop), 0);
  assert.ok(compareByCampaignTarget('missing', '1:0', '0:0', hop) > 0);
});
