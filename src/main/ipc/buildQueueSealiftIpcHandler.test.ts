/**
 * Contracts for the sealift slot payload check.
 *
 * Purpose: The IPC boundary accepts only slot indexes a carrier could have.
 * When to use: After changes to `parseSealiftSlotPayload` or `MAX_CARRIER_CARGO_SLOTS`.
 * Expected outcome: Process exit 0.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSealiftSlotPayload } from './buildQueueSealiftIpcHandler';

test('the slot index is an integer from 1 to 4', () => {
  const base = { h3Index: 'hex', navalUnitId: 'ship', landUnitId: 'inf-a' };
  assert.deepEqual(parseSealiftSlotPayload({ ...base, slotIndex: 1 }), { ...base, slotIndex: 1 });
  assert.deepEqual(parseSealiftSlotPayload({ ...base, slotIndex: 4 }), { ...base, slotIndex: 4 });
  for (const slotIndex of [0, 5, 1.5, '1']) {
    assert.equal(parseSealiftSlotPayload({ ...base, slotIndex: slotIndex as number }), null, String(slotIndex));
  }
  assert.equal(parseSealiftSlotPayload(undefined), null);
});

test('a blank or non-string land unit empties the slot and a padded id is trimmed', () => {
  const base = { h3Index: 'hex', navalUnitId: 'ship', slotIndex: 1 };
  for (const landUnitId of ['', '   ', null, 7]) {
    assert.deepEqual(
      parseSealiftSlotPayload({ ...base, landUnitId: landUnitId as string | null }),
      { ...base, landUnitId: null },
      String(landUnitId),
    );
  }
  assert.deepEqual(parseSealiftSlotPayload({ ...base, landUnitId: ' inf-a ' }), { ...base, landUnitId: 'inf-a' });
});
