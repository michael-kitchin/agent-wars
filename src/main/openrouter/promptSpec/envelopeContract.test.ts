/**
 * Contract tests for the shared response-envelope field order, gating, and repair schema.
 * Run: `npm run build:main` then `node dist/main/openrouter/promptSpec/envelopeContract.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ENVELOPE_FIELD_ORDER,
  buildCallbackContractClause,
  buildInvalidOutputRulesClause,
  buildMemoryWriteLimitsClause,
  buildRepairSchemaText,
  envelopeFieldsForGates,
  legalOrderActionsForMode,
  type EnvelopeGates,
} from './envelopeContract';
import { CALLBACK_EVENT_VOCAB } from '../orderResponseParsing';
import { buildCallbackVocabularyClause, TAUGHT_CALLBACK_EVENTS } from './callbackVocabularyText';
import { CONTENT_MAX_LENGTH, KEY_MAX_LENGTH } from '../../tools/tool4Memory';

/**
 * Returns every combination of the four envelope gates.
 *
 * Purpose: The subsequence and tactical-drop rules must hold for the whole matrix, not one happy path.
 * When to use: The gating cases in this file.
 * Expected outcome: Sixteen objects covering both modes and the three boolean flags.
 * Exceptions: None.
 */
function allGateCombinations(): EnvelopeGates[] {
  const modes = ['strategic', 'tactical'] as const;
  const flags = [false, true];
  const out: EnvelopeGates[] = [];
  for (const coordinateMode of modes) {
    for (const includeAirActions of flags) {
      for (const includeMemoryUpdates of flags) {
        for (const includeProductionOrders of flags) {
          out.push({ coordinateMode, includeAirActions, includeMemoryUpdates, includeProductionOrders });
        }
      }
    }
  }
  return out;
}

/**
 * Returns whether `actual` is a subsequence of `expected`.
 *
 * Purpose: Field lists may drop optional keys but must never reorder the canonical sequence.
 * When to use: After `envelopeFieldsForGates`.
 * Expected outcome: True only when every actual element appears in order inside expected.
 * Exceptions: None.
 */
function isSubsequence(actual: readonly string[], expected: readonly string[]): boolean {
  let i = 0;
  for (const item of actual) {
    const found = expected.indexOf(item, i);
    if (found < 0) return false;
    i = found + 1;
  }
  return true;
}

test('ENVELOPE_FIELD_ORDER is the canonical eight-field sequence', () => {
  assert.deepEqual(ENVELOPE_FIELD_ORDER, [
    'message',
    'strategy',
    'orders',
    'airStrikes',
    'ferryOrders',
    'callbacks',
    'memoryUpdates',
    'productionOrders',
  ]);
});

test('envelopeFieldsForGates drops tails by flag and always drops memory and production in tactical', () => {
  const strategicAll = envelopeFieldsForGates({
    coordinateMode: 'strategic',
    includeAirActions: true,
    includeMemoryUpdates: true,
    includeProductionOrders: true,
  });
  assert.deepEqual(strategicAll, ENVELOPE_FIELD_ORDER);

  const noAir = envelopeFieldsForGates({
    coordinateMode: 'strategic',
    includeAirActions: false,
    includeMemoryUpdates: true,
    includeProductionOrders: true,
  });
  assert.ok(!noAir.includes('airStrikes'));
  assert.ok(!noAir.includes('ferryOrders'));
  assert.ok(noAir.includes('callbacks'));
  assert.ok(noAir.includes('memoryUpdates'));
  assert.ok(noAir.includes('productionOrders'));

  const noTails = envelopeFieldsForGates({
    coordinateMode: 'strategic',
    includeAirActions: false,
    includeMemoryUpdates: false,
    includeProductionOrders: false,
  });
  assert.deepEqual(noTails, ['message', 'strategy', 'orders', 'callbacks']);

  const tacticalWithFlagsOn = envelopeFieldsForGates({
    coordinateMode: 'tactical',
    includeAirActions: true,
    includeMemoryUpdates: true,
    includeProductionOrders: true,
  });
  assert.ok(!tacticalWithFlagsOn.includes('memoryUpdates'));
  assert.ok(!tacticalWithFlagsOn.includes('productionOrders'));
  assert.ok(tacticalWithFlagsOn.includes('airStrikes'));
  assert.ok(tacticalWithFlagsOn.includes('callbacks'));
});

test('every gate combination returns a subsequence of ENVELOPE_FIELD_ORDER', () => {
  for (const gates of allGateCombinations()) {
    const fields = envelopeFieldsForGates(gates);
    assert.ok(
      isSubsequence(fields, ENVELOPE_FIELD_ORDER),
      `reordered fields for ${JSON.stringify(gates)}: ${fields.join(',')}`
    );
    assert.ok(fields.includes('message'));
    assert.ok(fields.includes('strategy'));
    assert.ok(fields.includes('orders'));
    assert.ok(fields.includes('callbacks'));
  }
});

test('legalOrderActionsForMode omits standing-order actions in tactical', () => {
  const tactical = legalOrderActionsForMode('tactical');
  assert.ok(!tactical.includes('assign_order'));
  assert.ok(!tactical.includes('cancel_order'));
  assert.ok(tactical.includes('explicit_move'));
  assert.ok(tactical.includes('ranged_attack'));
  const strategic = legalOrderActionsForMode('strategic');
  assert.ok(strategic.includes('assign_order'));
  assert.ok(strategic.includes('cancel_order'));
  assert.ok(strategic.includes('embark'));
  const noNaval = legalOrderActionsForMode('strategic', false);
  assert.ok(!noNaval.includes('embark'));
  assert.ok(!noNaval.includes('transport_move'));
  assert.ok(!noNaval.includes('disembark'));
  assert.ok(noNaval.includes('explicit_move'));
  const noStanding = legalOrderActionsForMode('strategic', true, false);
  assert.ok(!noStanding.includes('assign_order'));
  assert.ok(!noStanding.includes('cancel_order'));
  assert.ok(noStanding.includes('explicit_move'));
});

test('buildRepairSchemaText matches field order and forbids tactical standing-order and tail fields', () => {
  const tactical: EnvelopeGates = {
    coordinateMode: 'tactical',
    includeAirActions: true,
    includeMemoryUpdates: true,
    includeProductionOrders: true,
  };
  const tacticalText = buildRepairSchemaText(tactical);
  assert.ok(!tacticalText.includes('assign_order'));
  assert.ok(!tacticalText.includes('cancel_order'));
  assert.ok(!tacticalText.includes('memoryUpdates'));
  assert.ok(!tacticalText.includes('productionOrders'));
  assert.ok(tacticalText.includes('movementOrders') || tacticalText.includes('rangedAttacks'));
  assert.ok(/top-level array/i.test(tacticalText));

  const strategic: EnvelopeGates = {
    coordinateMode: 'strategic',
    includeAirActions: true,
    includeMemoryUpdates: true,
    includeProductionOrders: true,
  };
  const strategicText = buildRepairSchemaText(strategic);
  assert.ok(strategicText.includes('assign_order'));
  assert.ok(strategicText.includes('cancel_order'));
  assert.ok(strategicText.includes('memoryUpdates'));
  assert.ok(strategicText.includes('productionOrders'));

  const noStandingText = buildRepairSchemaText({
    ...strategic,
    includeStandingOrderActions: false,
  });
  assert.ok(!noStandingText.includes('assign_order'));
  assert.ok(!noStandingText.includes('cancel_order'));
  assert.ok(noStandingText.includes('explicit_move'));

  for (const gates of allGateCombinations()) {
    const fields = envelopeFieldsForGates(gates);
    const text = buildRepairSchemaText(gates);
    let cursor = 0;
    for (const field of fields) {
      const at = text.indexOf(`"${field}"`, cursor);
      assert.ok(at >= 0, `repair schema missing ${field} for ${JSON.stringify(gates)}`);
      cursor = at + 1;
    }
  }
});

test('callback contract states that the response replaces the whole subscription list', () => {
  const strategic = buildCallbackContractClause('strategic');
  const tactical = buildCallbackContractClause('tactical');
  assert.match(strategic, /replac/i);
  assert.match(tactical, /replac/i);
  assert.match(tactical, /tactical beat/i);
  assert.match(tactical, /event-driven/i);
});

test('taught callback events are a subset of parser-accepted vocabulary', () => {
  for (const row of TAUGHT_CALLBACK_EVENTS) {
    assert.ok(CALLBACK_EVENT_VOCAB.has(row.event), `parser must accept taught event ${row.event}`);
  }
  assert.ok(CALLBACK_EVENT_VOCAB.has('territory_changed'));
  assert.ok(!TAUGHT_CALLBACK_EVENTS.some((row) => row.event === 'territory_changed'));
});

test('callback vocabulary clause names every taught event and its parameters', () => {
  const strategic = buildCallbackVocabularyClause('strategic');
  const tactical = buildCallbackVocabularyClause('tactical');
  for (const row of TAUGHT_CALLBACK_EVENTS) {
    assert.ok(strategic.includes(row.event), `strategic vocabulary missing ${row.event}`);
    assert.ok(strategic.includes(row.parameters), `strategic vocabulary missing parameters for ${row.event}`);
    assert.ok(tactical.includes(row.event), `tactical vocabulary missing ${row.event}`);
    assert.ok(tactical.includes(row.parameters), `tactical vocabulary missing parameters for ${row.event}`);
  }
  assert.ok(!strategic.includes('territory_changed'));
  assert.ok(!tactical.includes('territory_changed'));
  assert.ok(!strategic.includes('h3Index'), 'envelope must not teach raw H3 field names');
  assert.ok(!tactical.includes('h3Index'), 'envelope must not teach raw H3 field names');
  assert.ok(buildCallbackContractClause('strategic').includes(strategic));
});

test('memory write limits are derived from the engine constants', () => {
  const clause = buildMemoryWriteLimitsClause();
  assert.ok(clause.includes(String(KEY_MAX_LENGTH)));
  assert.ok(clause.includes(String(CONTENT_MAX_LENGTH)));
});

test('invalid-output rules name the mode-specific prohibitions', () => {
  const strategic = buildInvalidOutputRulesClause({
    coordinateMode: 'strategic',
    includeAirActions: true,
    includeMemoryUpdates: true,
    includeProductionOrders: true,
  });
  assert.match(strategic, /top-level/i);
  assert.ok(strategic.includes('movementOrders'));
  assert.match(strategic, /current (cell|hex)/i);
  assert.match(strategic, /friendly unit/i);

  const tactical = buildInvalidOutputRulesClause({
    coordinateMode: 'tactical',
    includeAirActions: true,
    includeMemoryUpdates: true,
    includeProductionOrders: true,
  });
  assert.ok(tactical.includes('assign_order'));
  assert.ok(tactical.includes('cancel_order'));
  assert.match(tactical, /friendly unit/i);
  assert.ok(!tactical.includes('infantry cannot'));
});
