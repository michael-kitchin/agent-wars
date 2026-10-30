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
import { getGameStateForPlayer, getScenarioHomeRegionHexes, getSeatRoster, setTreasuryCredits } from '../gameDb';
import { createStrategicUnit } from '../gameActions/strategicUnitSpawn';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { buildMercenariesBriefingBlock } from './briefingSectionsMercenaries';

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
    assert.ok(block.includes('Your mercenaries'));
    assert.equal(buildMercenariesBriefingBlock(state, (hex) => hex, 'tactical', { productionEnabled: true }), '');
    const quiet = buildMercenariesBriefingBlock(state, (hex) => hex, 'strategic', { productionEnabled: false });
    assert.ok(quiet.includes('Treasury: 40 credits.'));
    assert.ok(quiet.includes('Your mercenaries'));
    assert.equal(quiet.includes('Rehire candidates'), false);
    assert.equal(quiet.includes('Raise options'), false);
  });
});
