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
import { gridDisk } from 'h3-js';
import { AI_SEAT_IDS, NEUTRAL_OWNER_ID } from '../../shared/seatIds';
import type { GameStateSnapshot } from '../../shared/ipc/gameStateTypes';
import { SECTION_TITLE_MERCENARIES } from './promptSpec/sectionHeadings';
import { buildMercenaryRule } from './promptSpec/gameRuleMercenaryText';
import { getGameStateForPlayer, getScenarioHomeRegionHexes, getSeatRoster, setTreasuryCredits, dbGetAll, dbRun, setHexController } from '../gameDb';
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { createStrategicUnit } from '../gameActions/strategicUnitSpawn';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { CHOKEPOINT_MAX_PASSABLE_NEIGHBORS, countNeighborTerrain } from '../tools/hexNeighborTerrain';
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
    const empty = {
      ...loaded,
      units: loaded.units.filter((unit) => unit.player === seat),
      exploredHexes: [],
    };
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
    assert.ok(block.includes('| Hex | To Campaign Target | Enemy Units Within 2 | Chokepoint | Capacity | Resumes building | Options |'), block);
    const raiseRows = block
      .slice(block.indexOf('## Raise Options'))
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.startsWith('| Hex |') && !line.startsWith('| --- |'));
    const resumes = (line: string): string => line.split('|').slice(1, -1).map((cell) => cell.trim())[5] ?? '';
    const hexIndex = raiseRows.findIndex((line) => line.startsWith(`| ${hex} | `));
    const firstNo = raiseRows.findIndex((line) => resumes(line) === 'no');
    assert.ok(hexIndex >= 0, raiseRows.join('\n'));
    assert.equal(resumes(raiseRows[hexIndex] ?? ''), 'yes', raiseRows[hexIndex]);
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

/**
 * A city outside every home region, controlled by the seat and cleared of units.
 *
 * Purpose: Raise-option cases need one hex the table will list.
 * When to use: Tests that read Raise Options on a temporary match.
 * Expected outcome: The hex index. Throws when the fixture map has no such city.
 * Exceptions: Assertion failure when the query finds nothing.
 */
function outsideCity(seat: string): string {
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

test('zero credits with a raise option prints the hire rule and the raise table', () => {
  withTempGameDb('aw-brief-merc-raise-', () => {
    const seat = AI_SEAT_IDS[0];
    const hex = outsideCity(seat);
    setTreasuryCredits(seat, 0);
    const loaded = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const state = {
      ...loaded,
      units: loaded.units.filter((unit) => unit.player === seat),
      exploredHexes: [...new Set([...(loaded.exploredHexes ?? []), hex])],
    };
    const block = buildMercenariesBriefingBlock(state, (h3Index) => h3Index, 'strategic', {
      productionEnabled: true,
      campaignTargetH3: hex,
    });
    assert.ok(block.includes(buildMercenaryRule()));
    assert.ok(block.includes('## Raise Options'));
    assert.equal(block.includes('No one to rehire.'), false);
  });
});

test('the enemy column ignores neutrals and units beyond the radius', () => {
  withTempGameDb('aw-brief-merc-enemy-', () => {
    const seat = AI_SEAT_IDS[0];
    const other = AI_SEAT_IDS[1];
    assert.ok(other);
    const hex = outsideCity(seat);
    const disk1 = new Set(gridDisk(hex, 1));
    const disk2 = new Set(gridDisk(hex, 2));
    const atDistance1 = [...disk1].find((candidate) => candidate !== hex);
    const atDistance2 = [...disk2].find((candidate) => !disk1.has(candidate));
    const atDistance3 = gridDisk(hex, 3).find((candidate) => !disk2.has(candidate));
    assert.ok(atDistance1 && atDistance2 && atDistance3);
    setTreasuryCredits(seat, 0);
    const loaded = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const state = {
      ...loaded,
      exploredHexes: [...new Set([...(loaded.exploredHexes ?? []), hex])],
      units: [
        ...loaded.units.filter((unit) => unit.player === seat),
        { id: 'neutral-near', player: NEUTRAL_OWNER_ID, unitType: 'infantry', h3Index: atDistance1 },
        { id: 'enemy-near', player: other, unitType: 'infantry', h3Index: atDistance2 },
        { id: 'enemy-far', player: other, unitType: 'infantry', h3Index: atDistance3 },
      ] as GameStateSnapshot['units'],
    };
    const block = buildMercenariesBriefingBlock(state, (h3Index) => h3Index, 'strategic', {
      productionEnabled: true,
      campaignTargetH3: hex,
    });
    const row = block.split('\n').find((line) => line.startsWith(`| ${hex} | `));
    assert.ok(row, block);
    const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
    assert.equal(cells[2], '1');
  });
});

test('the chokepoint column follows the passable-neighbor cutoff', () => {
  withTempGameDb('aw-brief-merc-choke-', () => {
    const seat = AI_SEAT_IDS[0];
    const homes = new Set(getSeatRoster().flatMap((row) => getScenarioHomeRegionHexes(row.homeRegion)));
    const loaded = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const hexSet = new Set(loaded.hexes.map((hex) => hex.h3Index));
    const terrainByH3 = new Map(loaded.hexes.map((hex) => [hex.h3Index, hex.terrain]));
    let choke: string | undefined;
    let open: string | undefined;
    for (const row of dbGetAll<{ h3Index: string }>(
      'SELECT h3_index AS h3Index FROM res_s_infrastructure WHERE urban_hex_count >= 10 AND fortified_count = 0'
    )) {
      const h3Index = row.h3Index;
      if (homes.has(h3Index) || isNeutralBorderHex(h3Index) || !hexSet.has(h3Index)) continue;
      const passable = countNeighborTerrain({ hexH3: h3Index, hexSet, terrainByH3, passableFor: 'land' }).passableNeighbors;
      if (passable <= CHOKEPOINT_MAX_PASSABLE_NEIGHBORS) choke ??= h3Index;
      else open ??= h3Index;
      if (choke && open) break;
    }
    assert.ok(choke && open, 'fixture needs one chokepoint city and one open city');
    for (const [hex, expected] of [[choke, 'yes'], [open, 'no']] as const) {
      setHexController(hex, seat);
      dbRun('DELETE FROM units WHERE h3_index = ?', [hex]);
      const again = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
      const state = { ...again, exploredHexes: [...new Set([...(again.exploredHexes ?? []), hex])] };
      const block = buildMercenariesBriefingBlock(state, (h3Index) => h3Index, 'strategic', {
        productionEnabled: true,
        campaignTargetH3: hex,
      });
      const row = block.split('\n').find((line) => line.startsWith(`| ${hex} | `));
      assert.ok(row, block);
      const chokepoint = row.split('|').slice(1, -1).map((cell) => cell.trim())[3];
      assert.equal(chokepoint, expected, row);
    }
  });
});

test('raise options sort the nearer cell first, treat a null target as a tie, and sort a null distance last', () => {
  assert.ok(compareByCampaignTarget('1:0', '4:0', '0:0', hop) < 0);
  assert.equal(compareByCampaignTarget('1:0', '4:0', null, hop), 0);
  assert.ok(compareByCampaignTarget('missing', '1:0', '0:0', hop) > 0);
});
