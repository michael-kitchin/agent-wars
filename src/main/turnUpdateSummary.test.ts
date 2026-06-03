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

/**
 * Verifies section order and suppression when all sections empty.
 *
 * Purpose: Guards popup consolidation contract.
 * When to use: After changing `buildConsolidatedTurnUpdateToastMessage`.
 * Expected outcome: Human before AI before Other; null when nothing to show.
 * Exceptions: None.
 */
function testSectionOrderAndEmptySuppression(): void {
  const summary = emptyTurnLossSummary();
  summary.human.ranged.push({ unitType: 'infantry', displayName: 'Alpha' });
  summary.ai.melee.push({ unitType: 'armor', displayName: 'Bravo' });
  const text = buildConsolidatedTurnUpdateToastMessage({
    readyResult: { success: true, deployedUnitsByType: { infantry: 2 } },
    turnLossSummary: summary,
    combatFallbackBullets: [],
  });
  assert.ok(text);
  const humanIdx = text!.indexOf(`${MAP_TOAST_SECTION_HEADER_PREFIX}Human Losses`);
  const aiIdx = text!.indexOf(`${MAP_TOAST_SECTION_HEADER_PREFIX}AI Losses`);
  const otherIdx = text!.indexOf(`${MAP_TOAST_SECTION_HEADER_PREFIX}${MAP_TOAST_UPDATES_SECTION_TITLE}`);
  assert.ok(humanIdx >= 0 && aiIdx > humanIdx && otherIdx > aiIdx);
  assert.ok(text!.includes('Ranged attack: Alpha'));
  assert.ok(text!.includes('Melee attack: Bravo'));
  const empty = buildConsolidatedTurnUpdateToastMessage({
    readyResult: { success: true },
    turnLossSummary: emptyTurnLossSummary(),
    combatFallbackBullets: [],
  });
  assert.strictEqual(empty, null);
}

function run(): void {
  testSectionOrderAndEmptySuppression();
  console.log('turnUpdateSummary.test.ts passed');
}

run();
