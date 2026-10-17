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
  assert.strictEqual(r.value.opponentTacticalDraft, undefined);
  assert.strictEqual(r.value.useEventDrivenConsultation, false);
  assert.strictEqual(r.value.aiPlanningRunEnabled, false);
}

/**
 * Verifies event-driven flags round-trip when explicitly true.
 *
 * Purpose: IPC contract for tactical post-beat consultation on the main process.
 * When to use: Regression after edits to `parseHumanTacticalCommitPayload`.
 * Expected outcome: Booleans preserved as true.
 * Exceptions: Assertion failure on contract drift.
 */
function testEventDrivenFlagsTrue(): void {
  const r = parseHumanTacticalCommitPayload({
    movementOrders: [],
    useEventDrivenConsultation: true,
    aiPlanningRunEnabled: true,
  });
  assert.strictEqual(r.ok, true);
  if (!r.ok) return;
  assert.strictEqual(r.value.useEventDrivenConsultation, true);
  assert.strictEqual(r.value.aiPlanningRunEnabled, true);
}

/**
 * Verifies optional `opponentTacticalDraft` parses into normalized tactical opponent plan rows.
 *
 * Purpose: Locks the combined Ready IPC shape for buffered AI tactical orders.
 * When to use: Regression coverage after tactical–strategic scheduling changes.
 * Expected outcome: Nested movement and support arrays match input shapes.
 * Exceptions: Assertion failure on contract drift.
 */
function testOpponentDraftRoundTrip(): void {
  const r = parseHumanTacticalCommitPayload({
    movementOrders: [],
    opponentTacticalDraft: {
      movementOrders: [{ unitId: 'o1', toH3Index: '8f283082dcb519f' }],
      rangedAttacks: [{ unitId: 'o1', targetH3Index: '8f283082dcb519f' }],
      airStrikes: [{ unitId: 'a1', targetH3Index: '8f283082dcb519f', targetType: 'units' as const }],
      ferryOrders: [{ unitId: 'a1', destinationH3Index: '8f283082dcb519f' }],
      embarkOrders: [{ unitId: 'l1', navalUnitId: 'n1' }],
    },
  });
  assert.strictEqual(r.ok, true);
  if (!r.ok) return;
  const d = r.value.opponentTacticalDraft;
  assert.ok(d);
  assert.deepStrictEqual(d!.movementOrders, [{ unitId: 'o1', toH3Index: '8f283082dcb519f' }]);
  assert.deepStrictEqual(d!.rangedAttacks, [{ unitId: 'o1', targetH3Index: '8f283082dcb519f' }]);
  assert.deepStrictEqual(d!.airStrikes, [
    { unitId: 'a1', targetH3Index: '8f283082dcb519f', targetType: 'units' },
  ]);
  assert.deepStrictEqual(d!.ferryOrders, [{ unitId: 'a1', destinationH3Index: '8f283082dcb519f' }]);
  assert.deepStrictEqual(d!.embarkOrders, [{ unitId: 'l1', navalUnitId: 'n1' }]);
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

/**
 * Rejects an opponent air strike whose target type is not one of the four legal kinds.
 *
 * Purpose: The shared air-strike parser must keep the same rejection the inline loop used.
 * When to use: After edits to `parseHumanTacticalCommitPayload`.
 * Expected outcome: `ok: false` with `Invalid tactical commit payload`.
 * Exceptions: Assertion failure on contract drift.
 */
function testRejectsBadOpponentAirTargetType(): void {
  const r = parseHumanTacticalCommitPayload({
    movementOrders: [],
    opponentTacticalDraft: { airStrikes: [{ unitId: 'a', targetH3Index: 'h', targetType: 'road' }] },
  });
  assert.strictEqual(r.ok, false);
  if (r.ok) return;
  assert.strictEqual(r.reason, 'Invalid tactical commit payload');
}

const tests: { name: string; fn: () => void }[] = [
  { name: 'parseHumanTacticalCommitPayload happy path', fn: testHappyPathMinimalMovement },
  { name: 'parseHumanTacticalCommitPayload event-driven flags true', fn: testEventDrivenFlagsTrue },
  { name: 'parseHumanTacticalCommitPayload opponent draft round trip', fn: testOpponentDraftRoundTrip },
  { name: 'parseHumanTacticalCommitPayload rejects bad movement', fn: testRejectsBadMovementRow },
  { name: 'parseHumanTacticalCommitPayload rejects null', fn: testRejectsNullPayload },
  { name: 'parseHumanTacticalCommitPayload rejects bad opponent air target', fn: testRejectsBadOpponentAirTargetType },
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
