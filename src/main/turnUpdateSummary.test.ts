/**
 * Tests for consolidated turn update toast builder. Run with: node dist/main/turnUpdateSummary.test.js
 */

import assert from 'node:assert/strict';
import {
  buildConsolidatedTurnUpdateToastMessage,
  MAP_TOAST_SECTION_HEADER_PREFIX,
  MAP_TOAST_UPDATES_SECTION_TITLE,
} from '../shared/consolidatedTurnUpdateToast';
import { emptyTurnLossSummary } from '../shared/lossSummary';
import { HUMAN_SEAT_ID } from '../shared/seatIds';

/**
 * Verifies section order and suppression when all sections empty.
 *
 * Purpose: Guards popup consolidation contract.
 * When to use: After changing `buildConsolidatedTurnUpdateToastMessage`.
 * Expected outcome: The turn-report sentence comes before Updates; null when nothing to show.
 * Exceptions: None.
 */
function testSectionOrderAndEmptySuppression(): void {
  const text = buildConsolidatedTurnUpdateToastMessage({
    readyResult: { success: true, deployedUnitsByType: { infantry: 2 } },
    turnLossSummary: emptyTurnLossSummary(),
    combatFallbackBullets: [],
    turnReport: {
      viewerSeatId: HUMAN_SEAT_ID,
      seats: [{ seatId: 'opponent', seatOrder: 2, homeRegion: 'Eastern Turkey' }],
      transitions: [{ h3Index: 'a', from: 'opponent', to: HUMAN_SEAT_ID }],
    },
  });
  assert.ok(text);
  const took = text!.indexOf('You took 1 hex from E. Turkey.');
  const otherIdx = text!.indexOf(`${MAP_TOAST_SECTION_HEADER_PREFIX}${MAP_TOAST_UPDATES_SECTION_TITLE}`);
  assert.ok(took >= 0 && otherIdx > took);
  const empty = buildConsolidatedTurnUpdateToastMessage({
    readyResult: { success: true },
    turnLossSummary: emptyTurnLossSummary(),
    combatFallbackBullets: [],
  });
  assert.strictEqual(empty, null);
  const unknownSentence = 'Unknown battle observed in Africa, Europe.';
  const withDeployment = buildConsolidatedTurnUpdateToastMessage({
    readyResult: { success: true, deployedUnitsByType: { infantry: 2 } },
    turnLossSummary: emptyTurnLossSummary(),
    combatFallbackBullets: [],
    turnReport: {
      viewerSeatId: HUMAN_SEAT_ID,
      seats: [{ seatId: 'opponent', seatOrder: 2, homeRegion: 'Eastern Turkey' }],
      transitions: [{ h3Index: 'a', from: 'opponent', to: HUMAN_SEAT_ID }],
    },
    unknownBattleLine: unknownSentence,
  });
  assert.ok(withDeployment);
  const updatesHeader = `${MAP_TOAST_SECTION_HEADER_PREFIX}${MAP_TOAST_UPDATES_SECTION_TITLE}`;
  const headerAt = withDeployment!.indexOf(updatesHeader);
  const deployedAt = withDeployment!.indexOf('2 infantry units deployed');
  const unknownAt = withDeployment!.indexOf(unknownSentence);
  assert.ok(withDeployment!.indexOf('You took 1 hex from E. Turkey.') < headerAt);
  assert.ok(headerAt < deployedAt && deployedAt < unknownAt);
  assert.ok(withDeployment!.endsWith(unknownSentence));
  const onlyUnknown = buildConsolidatedTurnUpdateToastMessage({
    readyResult: { success: true },
    turnLossSummary: emptyTurnLossSummary(),
    combatFallbackBullets: [],
    unknownBattleLine: unknownSentence,
  });
  assert.strictEqual(onlyUnknown, `${updatesHeader}\n${unknownSentence}`);
  for (const blank of ['   ', null, undefined] as const) {
    assert.strictEqual(
      buildConsolidatedTurnUpdateToastMessage({
        readyResult: { success: true },
        turnLossSummary: emptyTurnLossSummary(),
        combatFallbackBullets: [],
        unknownBattleLine: blank,
      }),
      null
    );
  }
  const withFallback = buildConsolidatedTurnUpdateToastMessage({
    readyResult: { success: true },
    turnLossSummary: emptyTurnLossSummary(),
    combatFallbackBullets: ['Casualty outcomes at 2 hexes.'],
    unknownBattleLine: unknownSentence,
  });
  assert.strictEqual(
    withFallback,
    `${updatesHeader}\nCasualty outcomes at 2 hexes.\n${unknownSentence}`
  );
}

function run(): void {
  testSectionOrderAndEmptySuppression();
  console.log('turnUpdateSummary.test.ts passed');
}

run();
