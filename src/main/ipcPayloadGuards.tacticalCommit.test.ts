import * as assert from 'assert';
import { parseHumanTacticalCommitPayload } from './ipcPayloadGuards';

/**
 * Verifies a minimal valid tactical commit payload parses to normalized rows.
 *
 * Purpose: Locks the happy path for tactical Ready IPC payload guards.
 * When to use: Regression coverage after edits to `parseHumanTacticalCommitPayload`.
 * Expected outcome: `ok: true` with movement row preserved and optional arrays defaulted empty.
 * Exceptions: Assertion failure on contract drift.
 */
function testHappyPathMinimalMovement(): void {
  const r = parseHumanTacticalCommitPayload({
    movementOrders: [{ unitId: 'u1', toH3Index: '8f283082dcb519f' }],
  });
  assert.strictEqual(r.ok, true);
  if (!r.ok) return;
  assert.deepStrictEqual(r.value.movementOrders, [{ unitId: 'u1', toH3Index: '8f283082dcb519f' }]);
  assert.deepStrictEqual(r.value.rangedAttacks, []);
  assert.deepStrictEqual(r.value.airStrikes, []);
  assert.deepStrictEqual(r.value.ferryOrders, []);
  assert.deepStrictEqual(r.value.embarkOrders, []);
}

/**
 * Verifies invalid movement rows are rejected without partial data.
 *
 * Purpose: Essential failure contract for malformed tactical commit IPC.
 * When to use: Same as other tactical commit guard tests.
 * Expected outcome: `ok: false` with stable reason string.
 * Exceptions: Assertion failure on contract drift.
 */
function testRejectsBadMovementRow(): void {
  const r = parseHumanTacticalCommitPayload({
    movementOrders: [{ unitId: 'u1', toH3Index: 123 }],
  } as unknown);
  assert.strictEqual(r.ok, false);
  if (r.ok) return;
  assert.strictEqual(r.reason, 'Invalid tactical commit payload');
}

/**
 * Verifies non-object payloads are rejected.
 *
 * Purpose: Ensures `unknown` IPC edge cases do not throw.
 * When to use: Tactical commit guard regression.
 * Expected outcome: `ok: false`.
 * Exceptions: Assertion failure on contract drift.
 */
function testRejectsNullPayload(): void {
  const r = parseHumanTacticalCommitPayload(null);
  assert.strictEqual(r.ok, false);
}

const tests: { name: string; fn: () => void }[] = [
  { name: 'parseHumanTacticalCommitPayload happy path', fn: testHappyPathMinimalMovement },
  { name: 'parseHumanTacticalCommitPayload rejects bad movement', fn: testRejectsBadMovementRow },
  { name: 'parseHumanTacticalCommitPayload rejects null', fn: testRejectsNullPayload },
];

for (const t of tests) {
  try {
    t.fn();
    console.log(`OK ${t.name}`);
  } catch (e) {
    console.error(`FAIL ${t.name}`, e);
    process.exit(1);
  }
}
