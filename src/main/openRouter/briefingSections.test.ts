/**
 * Contract tests for production briefing copy.
 * Run with: node dist/main/openRouter/briefingSections.test.js
 */

import assert from 'node:assert/strict';
import type { GameStateSnapshot } from '../gameDb';
import {
  PRODUCTION_EMPTY_QUEUES_SENTENCE,
  buildEmptyProductionQueuesSection,
  buildProductionBriefingBlock,
  formatBriefingAvailableUnitTypes,
  formatBriefingProductionQueueCell,
} from './briefingSections';

/**
 * Ensures production briefing copy hides types at deployment cap and marks stalled queues.
 *
 * Purpose: Turn 9 still listed armor as available and queued armor as healthy at 32/32, so empty hexes were filled with armor that cannot spawn.
 * When to use: After edits to production briefing available-type / queue formatting.
 * Expected outcome: Maxed types are omitted from available when another type remains; a hex that can only build capped types still lists them but is marked all-at-cap so the cap guidance is not read as "swap in another type"; queued maxed types are annotated as blocked.
 * Exceptions: None.
 */
function testProductionBriefingHidesMaxedTypesAndAnnotatesBlockedQueues(): void {
  const maxed = new Set(['armor']);
  assert.equal(
    formatBriefingAvailableUnitTypes(['infantry', 'armor', 'naval', 'air'], maxed),
    'infantry, naval, air'
  );
  assert.equal(formatBriefingAvailableUnitTypes(['armor'], maxed), 'armor (all at cap)');
  assert.equal(
    formatBriefingAvailableUnitTypes(['infantry', 'armor', 'air'], new Set(['infantry', 'armor', 'air'])),
    'infantry, armor, air (all at cap)'
  );
  assert.equal(formatBriefingAvailableUnitTypes([], maxed), '—');
  assert.equal(formatBriefingProductionQueueCell('1 armor', 'armor', maxed), '1 armor (blocked: at cap)');
  assert.equal(formatBriefingProductionQueueCell('1 infantry', 'infantry', maxed), '1 infantry');
  assert.equal(formatBriefingProductionQueueCell('—', undefined, maxed), '—');
}

/**
 * Production tools off omit the section; tools on with no queues keep the defined empty form.
 *
 * Purpose: The include/omit matrix gates production on the tool flag, not on whether queues exist.
 * When to use: After edits to `buildProductionBriefingBlock` empty handling.
 * Expected outcome: Disabled returns ''; empty-form helper names Production Status and the empty-queue sentence.
 * Exceptions: None.
 */
function testProductionSectionGateIsTheToolFlag(): void {
  const disabled = buildProductionBriefingBlock({
    productionEnabled: false,
    state: { hexes: [], units: [], phase: 'planning', turnNumber: 1, pendingOrders: [] } as GameStateSnapshot,
    latLngByH3: new Map(),
    resolveToH3: () => undefined,
    formatHexLabel: () => 'AB',
  });
  assert.equal(disabled, '');
  const emptyForm = buildEmptyProductionQueuesSection();
  assert.ok(emptyForm.includes('# Production Status'));
  assert.ok(emptyForm.includes(PRODUCTION_EMPTY_QUEUES_SENTENCE));
}

function run(): void {
  testProductionBriefingHidesMaxedTypesAndAnnotatesBlockedQueues();
  testProductionSectionGateIsTheToolFlag();
  console.log('briefingSections.test.ts passed');
}

run();
