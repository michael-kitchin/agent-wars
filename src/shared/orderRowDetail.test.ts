import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIR_STRIKE_TARGET_TYPE_LABELS, formatOrderRowDetail, formatQueuedOrdersSubtitle } from './orderRowDetail';

test('formatOrderRowDetail names the target code and the distance', () => {
  assert.equal(formatOrderRowDetail({ targetCode: 'E5', distanceHexes: 1, note: null }), '→ E5 · 1h');
  assert.equal(formatOrderRowDetail({ targetCode: 'E8.K3', distanceHexes: 0, note: null }), '→ E8.K3 · 0h');
});

test('formatOrderRowDetail adds a ferry or strike note', () => {
  assert.equal(formatOrderRowDetail({ targetCode: 'E8', distanceHexes: 1, note: 'Ferry' }), '→ E8 · 1h · Ferry');
  assert.equal(
    formatOrderRowDetail({ targetCode: 'GK', distanceHexes: 2, note: AIR_STRIKE_TARGET_TYPE_LABELS.airport }),
    '→ GK · 2h · Airports'
  );
});

test('formatOrderRowDetail shows a question mark for an unknown code or distance', () => {
  assert.equal(formatOrderRowDetail({ targetCode: null, distanceHexes: null, note: null }), '→ ? · ?h');
  assert.equal(formatOrderRowDetail({ targetCode: '', distanceHexes: 3, note: '' }), '→ ? · 3h');
});

test('formatQueuedOrdersSubtitle names the turn, or the beat during a battle', () => {
  assert.equal(formatQueuedOrdersSubtitle(6, 7, null), '6 queued for turn 7');
  assert.equal(formatQueuedOrdersSubtitle(0, 7, 2), '0 queued for beat 2');
});
