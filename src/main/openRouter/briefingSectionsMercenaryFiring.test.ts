/**
 * The Firing Risk block lists at-risk home hexes for a seat that holds mercenaries.
 *
 * Purpose: A commander must see which fires are dangerous or refused.
 * When to use: After changing `buildMercenaryFiringRiskBlock`.
 * Expected outcome: The cases below. Each case removes its temporary match.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, type SeatId } from '../../shared/seatIds';
import { dbRun, getGameStateForPlayer, getScenarioHomeRegionHexes, getSeatRoster, setHexController } from '../gameDb';
import { projectedHomeLoss, readFireRiskInputs } from '../gameActions/mercenaryFireRisk';
import { createStrategicUnit } from '../gameActions/strategicUnitSpawn';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { buildMercenaryFiringRiskBlock, SECTION_TITLE_FIRING_RISK } from './briefingSectionsMercenaryFiring';
import { subHeading } from './promptSpec/sectionHeadings';

const SEAT: SeatId = AI_SEAT_IDS[0];

/**
 * The seat's first home hex that it controls.
 *
 * Purpose: Cases place units in a real home hex.
 * When to use: Inside `withTempGameDb`.
 * Expected outcome: A hex id with its fortification cleared.
 * Exceptions: Throws when the seat has no home hex.
 */
function openHomeHex(): string {
  const home = getSeatRoster().find((row) => row.seatId === SEAT);
  assert.ok(home);
  const hex = getScenarioHomeRegionHexes(home.homeRegion)[0];
  assert.ok(hex);
  dbRun('UPDATE res_s_infrastructure SET fortified_count = 0 WHERE h3_index = ?', [hex]);
  return hex;
}

/**
 * Builds the block for the seat from a fresh snapshot.
 *
 * Purpose: Each case reads the same way the briefing does.
 * When to use: After placing units.
 * Expected outcome: The block text.
 * Exceptions: None.
 */
function blockFor(state = getGameStateForPlayer(SEAT, { maskUnexploredTerrain: false })): string {
  return buildMercenaryFiringRiskBlock({ state, ownSeat: SEAT, format: (hex) => hex });
}

test('a mercenary in an owned home hex gets a Firing Risk row', () => {
  withTempGameDb('aw-firing-row-', () => {
    const hex = openHomeHex();
    createStrategicUnit({ owner: SEAT, unitType: 'infantry', h3Index: hex, turnNumber: 1, isMercenary: true });
    const block = blockFor();
    assert.ok(block.startsWith(`${subHeading(SECTION_TITLE_FIRING_RISK)}\n\n`));
    assert.ok(block.includes('A fired mercenary left alone in one of these home hexes hands it to Neutral at the end of the turn.'));
    assert.ok(block.includes('Neutral takes it at the end of the turn'));
    createStrategicUnit({ owner: SEAT, unitType: 'infantry', h3Index: hex, turnNumber: 1, isMercenary: false });
    assert.ok(blockFor().includes('fights your units there; Neutral takes it if it wins'));
  });
});

test('a second mercenary in the hex stays behind and fights', () => {
  withTempGameDb('aw-firing-pair-', () => {
    const hex = openHomeHex();
    createStrategicUnit({ owner: SEAT, unitType: 'infantry', h3Index: hex, turnNumber: 1, isMercenary: true });
    createStrategicUnit({ owner: SEAT, unitType: 'infantry', h3Index: hex, turnNumber: 1, isMercenary: true });
    const block = blockFor();
    assert.ok(block.includes('fights your units there; Neutral takes it if it wins') || block.includes('refused: knocks you out'), block);
    assert.equal(block.includes('Neutral takes it at the end of the turn'), false);
  });
});

test('a fortified hex, a non-home hex, or an embarked mercenary gives no block', () => {
  withTempGameDb('aw-firing-none-', () => {
    const hex = openHomeHex();
    const unit = createStrategicUnit({ owner: SEAT, unitType: 'infantry', h3Index: hex, turnNumber: 1, isMercenary: true });
    const state = getGameStateForPlayer(SEAT, { maskUnexploredTerrain: false });
    const embarked = { ...state, units: state.units.map((row) => (row.isMercenary ? { ...row, embarkedOnCarrierUnitId: 'ship' } : row)) };
    assert.equal(blockFor(embarked), '');
    dbRun('UPDATE res_s_infrastructure SET fortified_count = 1 WHERE h3_index = ?', [hex]);
    assert.equal(blockFor(), '');
    dbRun('UPDATE res_s_infrastructure SET fortified_count = 0 WHERE h3_index = ?', [hex]);
    const risk = readFireRiskInputs(SEAT);
    assert.ok(risk);
    const away = [...risk.controlByHex.keys()].find((h3) => !risk.homeHexes.includes(h3));
    assert.ok(away);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [away, unit]);
    assert.equal(blockFor(), '');
  });
});

test('a fire that would knock out is marked refused and listed first', () => {
  withTempGameDb('aw-firing-refused-', () => {
    const risk = readFireRiskInputs(SEAT);
    assert.ok(risk);
    const lender = AI_SEAT_IDS[1];
    const bySize = [...risk.homeHexes].sort((a, b) => risk.baselineUrbanCellsForHex(a) - risk.baselineUrbanCellsForHex(b));
    let tipping: string | null = null;
    for (const hex of bySize) {
      setHexController(hex, lender);
      const now = readFireRiskInputs(SEAT);
      assert.ok(now);
      if (projectedHomeLoss(now, new Set()).homeLost) {
        setHexController(hex, SEAT);
        tipping = hex;
        break;
      }
    }
    assert.ok(tipping);
    dbRun('UPDATE res_s_infrastructure SET fortified_count = 0 WHERE h3_index = ?', [tipping]);
    createStrategicUnit({ owner: SEAT, unitType: 'infantry', h3Index: tipping, turnNumber: 1, isMercenary: true });
    const block = blockFor();
    const firstRow = block.split('\n').find((line) => line.startsWith(`| ${tipping}`));
    assert.ok(firstRow?.includes('refused: knocks you out'), block);
  });
});

test('the block has no triple newline and one blank line between paragraph and table', () => {
  withTempGameDb('aw-firing-layout-', () => {
    createStrategicUnit({ owner: SEAT, unitType: 'infantry', h3Index: openHomeHex(), turnNumber: 1, isMercenary: true });
    const block = blockFor();
    assert.equal(block.includes('\n\n\n'), false);
    assert.equal(block.split('\n\n').length, 3);
  });
});
