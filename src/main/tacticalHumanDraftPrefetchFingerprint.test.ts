/**
 * Phase 4 regression: deterministic tactical human-draft fingerprinting. Run:
 * `node dist/main/tacticalHumanDraftPrefetchFingerprint.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTacticalHumanDraftPrefetchFingerprint } from '../shared/tacticalHumanDraftPrefetchFingerprint';

test('buildTacticalHumanDraftPrefetchFingerprint is stable under row reordering', () => {
  const a = buildTacticalHumanDraftPrefetchFingerprint({
    tacticalPendingMarches: [
      { subUnitId: 'b', destinationH3Index: '842' },
      { subUnitId: 'a', destinationH3Index: '841' },
    ],
    pendingRangedAttacks: [],
    pendingAirStrikes: [],
    pendingFerryOrders: [],
    pendingEmbarkOrders: [],
  });
  const b = buildTacticalHumanDraftPrefetchFingerprint({
    tacticalPendingMarches: [
      { subUnitId: 'a', destinationH3Index: '841' },
      { subUnitId: 'b', destinationH3Index: '842' },
    ],
    pendingRangedAttacks: [],
    pendingAirStrikes: [],
    pendingFerryOrders: [],
    pendingEmbarkOrders: [],
  });
  assert.strictEqual(a, b);
});

test('buildTacticalHumanDraftPrefetchFingerprint changes when a march destination changes', () => {
  const before = buildTacticalHumanDraftPrefetchFingerprint({
    tacticalPendingMarches: [{ subUnitId: 'u1', destinationH3Index: '841' }],
    pendingRangedAttacks: [],
    pendingAirStrikes: [],
    pendingFerryOrders: [],
    pendingEmbarkOrders: [],
  });
  const after = buildTacticalHumanDraftPrefetchFingerprint({
    tacticalPendingMarches: [{ subUnitId: 'u1', destinationH3Index: '842' }],
    pendingRangedAttacks: [],
    pendingAirStrikes: [],
    pendingFerryOrders: [],
    pendingEmbarkOrders: [],
  });
  assert.notStrictEqual(before, after);
});
