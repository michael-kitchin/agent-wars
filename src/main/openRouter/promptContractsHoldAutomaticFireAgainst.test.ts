/**
 * The orders contract offers `holdAutomaticFireAgainst` on every consult and leaves it out of the example.
 * Run with: node dist/main/openRouter/promptContractsHoldAutomaticFireAgainst.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFinalJsonContractInstruction, getFinalJsonOrdersExampleBlock } from './promptContracts';
import { buildHoldAutomaticFireAgainstParagraph } from './promptSpec/holdAutomaticFireAgainstRuleText';

/**
 * The contract text for one theater.
 *
 * Purpose: Each case changes only the theater or the structured-output flag.
 * When to use: Every contract case.
 * Expected outcome: The instruction the orders system message carries.
 * Exceptions: None.
 */
function contract(coordinateMode: 'strategic' | 'tactical', structuredOutputs = false): string {
  return buildFinalJsonContractInstruction({
    includeMemoryUpdates: false,
    includeProductionOrders: false,
    movementOrderInstruction: '',
    submitMemoryClause: '',
    productionSubmitClause: '',
    coordinateMode,
    structuredOutputs,
  });
}

test('each theater gets the field paragraph with its own period', () => {
  assert.ok(contract('strategic').includes(buildHoldAutomaticFireAgainstParagraph('turn')));
  assert.ok(contract('tactical').includes(buildHoldAutomaticFireAgainstParagraph('beat')));
});

test('the submit header lists the field last', () => {
  for (const mode of ['strategic', 'tactical'] as const) {
    assert.ok(contract(mode).includes('"holdAutomaticFireAgainst": [...] }.'), mode);
  }
});

test('the field paragraph stays when structured outputs are on', () => {
  assert.ok(contract('strategic', true).includes(buildHoldAutomaticFireAgainstParagraph('turn')));
});

test('the example block does not show the field', () => {
  for (const coordinateMode of ['strategic', 'tactical'] as const) {
    const block = getFinalJsonOrdersExampleBlock({ includeMemoryUpdates: false, includeProductionOrders: false, coordinateMode });
    assert.equal(block.includes('holdAutomaticFireAgainst'), false, coordinateMode);
  }
});
