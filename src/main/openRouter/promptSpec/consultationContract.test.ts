/**
 * Contract tests for submit-only opening, repair, and corrective user messages.
 * Run: `npm run build:main` then `node dist/main/openRouter/promptSpec/consultationContract.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRODUCTION_CAP_QUEUE_GUIDANCE } from '../../productionCaps';
import {
  MALFORMED_COMPLETION_RETRY_LIMIT,
  buildMalformedCompletionCorrectiveMessage,
  resolveMalformedCompletionRetry,
  setMalformedCompletionRetryDelayOverrideForTests,
} from '../malformedCompletionRetry';
import {
  TACTICAL_STANDING_ORDER_PROHIBITION,
  envelopeFieldsForGates,
  type EnvelopeGates,
} from './envelopeContract';
import {
  buildOpeningUserMessage,
  buildRepairRequestMessage,
  type OpeningMessageGates,
} from './consultationText';

/**
 * Fully enabled strategic opening gates used as the baseline for presence and absence assertions.
 *
 * Purpose: Each case flips one flag off this object.
 * When to use: The opening-message cases in this file.
 * Expected outcome: A complete `OpeningMessageGates` value.
 * Exceptions: None.
 */
function strategicOpening(overrides: Partial<OpeningMessageGates> = {}): OpeningMessageGates {
  return {
    coordinateMode: 'strategic',
    planningEnabled: true,
    ordersEnabled: true,
    memoryEnabled: true,
    productionEnabled: true,
    fallbackMovementEnabled: false,
    hasBriefing: true,
    hasAirUnits: true,
    hasBestOptionsTable: true,
    ...overrides,
  };
}

/**
 * Strings that are system-prompt rules and must not appear in any opening message.
 *
 * Purpose: consultation-flow.md section 2.1 forbids restating these.
 * When to use: After `buildOpeningUserMessage`.
 * Expected outcome: None of these substrings appear.
 * Exceptions: None.
 */
const SYSTEM_OWNED_RULES: readonly string[] = [
  PRODUCTION_CAP_QUEUE_GUIDANCE,
  'when at least one controlled hex has availableUnitTypes and an empty queue, or a queue blocked at cap while another type can still be built',
  'Prefer setting queues on every eligible',
  'include memoryUpdates in your final JSON for strategy notes',
  'Copy Best Options approach and move/melee Target Hexes into explicit_move',
];

test('opening message omits system-owned rules for every gate combination', () => {
  const samples: OpeningMessageGates[] = [
    strategicOpening(),
    strategicOpening({
      planningEnabled: false,
      ordersEnabled: false,
      memoryEnabled: false,
      productionEnabled: false,
      fallbackMovementEnabled: true,
      hasAirUnits: false,
      hasBestOptionsTable: false,
    }),
    strategicOpening({ hasBriefing: false }),
    strategicOpening({ planningEnabled: false, ordersEnabled: true, fallbackMovementEnabled: false }),
    {
      ...strategicOpening(),
      coordinateMode: 'tactical',
      ordersEnabled: false,
      memoryEnabled: false,
      productionEnabled: false,
    },
  ];
  for (const gates of samples) {
    const text = buildOpeningUserMessage(gates);
    for (const banned of SYSTEM_OWNED_RULES) {
      assert.ok(!text.includes(banned), `opening message restates a system rule: ${banned.slice(0, 48)}`);
    }
  }
});

test('opening message names envelope fields including air tails when air is present', () => {
  const withAir = buildOpeningUserMessage(strategicOpening({ hasAirUnits: true }));
  const envelope: EnvelopeGates = {
    coordinateMode: 'strategic',
    includeAirActions: true,
    includeMemoryUpdates: true,
    includeProductionOrders: true,
    includeStandingOrderActions: true,
  };
  for (const field of envelopeFieldsForGates(envelope)) {
    assert.ok(withAir.includes(`"${field}"`), `opening message missing ${field}`);
  }
  const withoutAir = buildOpeningUserMessage(strategicOpening({ hasAirUnits: false }));
  assert.ok(!withoutAir.includes('"airStrikes"'));
  assert.ok(!withoutAir.includes('"ferryOrders"'));
});

test('tactical opening repeats the standing-order prohibition and strategic opening does not', () => {
  const tactical = buildOpeningUserMessage({
    ...strategicOpening(),
    coordinateMode: 'tactical',
    ordersEnabled: false,
    memoryEnabled: false,
    productionEnabled: false,
  });
  assert.ok(tactical.includes(TACTICAL_STANDING_ORDER_PROHIBITION));
  const strategic = buildOpeningUserMessage(strategicOpening());
  assert.ok(!strategic.includes(TACTICAL_STANDING_ORDER_PROHIBITION));
});

test('opening action clause points at one move row and one ranged row without restating the mapping', () => {
  const tactical = buildOpeningUserMessage({
    ...strategicOpening(),
    coordinateMode: 'tactical',
    ordersEnabled: false,
    memoryEnabled: false,
    productionEnabled: false,
  });
  assert.match(tactical, /one move or approach row/i);
  assert.match(tactical, /one ranged row per sub-unit/i);
  assert.ok(!tactical.includes('Give every sub-unit with a move or approach option a move order'));
  assert.ok(!tactical.includes('Copy Best Options approach and move/melee Target Hexes into explicit_move'));
  const strategic = buildOpeningUserMessage(strategicOpening());
  assert.match(strategic, /one option row per unit per action/i);
  assert.ok(strategic.includes('into the matching envelope field'));
});

test('repair request is schema-only and inlines buildRepairSchemaText', () => {
  const gates: EnvelopeGates = {
    coordinateMode: 'strategic',
    includeAirActions: true,
    includeMemoryUpdates: true,
    includeProductionOrders: true,
    includeStandingOrderActions: true,
  };
  const text = buildRepairRequestMessage(gates);
  assert.match(text, /not parseable JSON/i);
  assert.match(text, /compact JSON only/i);
  assert.match(text, /no prose, no markdown, no code fences/i);
  assert.match(text, /no extra whitespace/i);
  assert.match(text, /Omit optional arrays when empty/);
  assert.match(text, /orders\[\] only; no movementOrders\/rangedAttacks; never a top-level array/);
  assert.ok(!text.includes(PRODUCTION_CAP_QUEUE_GUIDANCE));
  assert.ok(!text.includes('home region'));
});

test('corrective message has four clauses, is last-retry only, and does not disable tools', () => {
  const text = buildMalformedCompletionCorrectiveMessage();
  assert.match(text, /neither a tool call nor any text/i);
  assert.match(text, /Do not repeat/i);
  assert.match(text, /exactly one of/i);
  assert.match(text, /Never return an empty message/i);
  assert.ok(!/do not (use|call) tools|tool_choice|tools disabled/i.test(text));
  assert.equal(MALFORMED_COMPLETION_RETRY_LIMIT, 2);
  const required = buildMalformedCompletionCorrectiveMessage('toolCall');
  assert.match(required, /single well-formed tool call/i);
  assert.ok(!required.includes('JSON object'), required);
  assert.match(required, /Never return an empty message/i);
  const ordersOnly = buildMalformedCompletionCorrectiveMessage('orders');
  assert.match(ordersOnly, /final orders as one JSON object/i);
  assert.ok(!/well-formed tool call|exactly one of/i.test(ordersOnly), ordersOnly);
  assert.match(ordersOnly, /Never return an empty message/i);
});

test('corrective message is appended only before the final malformed retry', async () => {
  setMalformedCompletionRetryDelayOverrideForTests(0);
  try {
    const malformed = {
      toolCalls: undefined,
      content: null,
      finishReason: undefined,
      nativeFinishReason: undefined,
    };
    const first = await resolveMalformedCompletionRetry({
      completion: malformed,
      retryCount: 0,
      iteration: 1,
      turnNumber: 1,
      tacticalBattleId: null,
    });
    assert.equal(first.status, 'retry');
    if (first.status === 'retry') {
      assert.equal(first.correctiveMessage, null);
      assert.equal(first.retryCount, 1);
    }
    const last = await resolveMalformedCompletionRetry({
      completion: malformed,
      retryCount: 1,
      iteration: 2,
      turnNumber: 1,
      tacticalBattleId: null,
    });
    assert.equal(last.status, 'retry');
    if (last.status === 'retry') {
      assert.equal(last.correctiveMessage, buildMalformedCompletionCorrectiveMessage());
      assert.equal(last.retryCount, MALFORMED_COMPLETION_RETRY_LIMIT);
    }
  } finally {
    setMalformedCompletionRetryDelayOverrideForTests(null);
  }
});
