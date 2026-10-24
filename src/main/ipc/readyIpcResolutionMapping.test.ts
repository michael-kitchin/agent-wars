/**
 * Essential mapping tests for post-consult toast fields on Ready / tactical post-beat IPC.
 */

import * as assert from 'assert';
import { runEventDrivenAfterTacticalBeatConsultation, toTacticalPostBeatConsultFields } from './readyIpcResolutionMapping';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';

/**
 * Ensures `toTacticalPostBeatConsultFields` maps `message` independently of `strategy`.
 *
 * Purpose: Message-only and strategy-only consults must still reach the renderer toast.
 * When to use: After edits to `optionalConsultToastFields` or the post-beat merge mapper.
 * Expected outcome: Non-empty trimmed text becomes `aiMessage` / `aiStrategy`; whitespace is omitted.
 * Exceptions: None.
 */
function testMapsMessageIndependentlyOfStrategy(): void {
  const both = toTacticalPostBeatConsultFields('bt-1', {
    attachTacticalOpponentPlanToIpc: false,
    message: 'You will not find safety in delay.',
    strategy: 'Hold the ridge.',
  });
  assert.strictEqual(both.aiMessage, 'You will not find safety in delay.');
  assert.strictEqual(both.aiStrategy, 'Hold the ridge.');

  const messageOnly = toTacticalPostBeatConsultFields('bt-1', {
    attachTacticalOpponentPlanToIpc: false,
    message: 'You will not find safety in delay.',
  });
  assert.strictEqual(messageOnly.aiMessage, 'You will not find safety in delay.');
  assert.strictEqual(messageOnly.aiStrategy, undefined);

  const strategyOnly = toTacticalPostBeatConsultFields('bt-1', {
    attachTacticalOpponentPlanToIpc: false,
    strategy: 'Hold the ridge.',
  });
  assert.strictEqual(strategyOnly.aiMessage, undefined);
  assert.strictEqual(strategyOnly.aiStrategy, 'Hold the ridge.');

  const whitespace = toTacticalPostBeatConsultFields('bt-1', {
    attachTacticalOpponentPlanToIpc: false,
    message: '   ',
    strategy: '\n',
  });
  assert.strictEqual(whitespace.aiMessage, undefined);
  assert.strictEqual(whitespace.aiStrategy, undefined);
}

/**
 * Ensures skipped event-driven tactical consultation does not invent toast fields.
 *
 * Purpose: Empty merge source must not attach `aiMessage` when Run/consult flags are off.
 * When to use: After edits to `runEventDrivenAfterTacticalBeatConsultation` early-return.
 * Expected outcome: `{}` when either consult flag is false.
 * Exceptions: None.
 */
async function testSkippedTacticalConsultReturnsEmptyMerge(): Promise<void> {
  const tacticalBattle = { battleId: 'bt-skip' } as TacticalBattleSnapshot;
  const skipped = await runEventDrivenAfterTacticalBeatConsultation({
    useEventDrivenConsultation: false,
    aiPlanningRunEnabled: true,
    tacticalBattle,
    tacticalResolutionPlayback: { humanMoves: [] },
    modelId: '',
    enabledToolNames: [],
    hasKey: () => false,
    requestOrders: async () => ({ success: true, orders: [], message: 'should not appear' }),
    timeoutMs: 1000,
    errorLogMessage: 'test',
  });
  assert.deepStrictEqual(skipped, {});
}

/**
 * Ensures a finite consult cost is copied onto tactical post-beat IPC fields and omitted when absent.
 *
 * Purpose: The match cost readout can add the consult cost only when main actually returned one.
 * When to use: After edits to `toTacticalPostBeatConsultFields` cost copying.
 * Expected outcome: `cost` is `0.25` when the merge source has that cost, and the property is absent when cost is missing or `NaN`.
 * Exceptions: None.
 */
function testCopiesFiniteCostAndOmitsMissingCost(): void {
  const withCost = toTacticalPostBeatConsultFields('bt-1', {
    attachTacticalOpponentPlanToIpc: false,
    cost: 0.25,
  });
  assert.strictEqual(withCost.cost, 0.25);

  const withoutCost = toTacticalPostBeatConsultFields('bt-1', {
    attachTacticalOpponentPlanToIpc: false,
  });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(withoutCost, 'cost'), false);

  const nanCost = toTacticalPostBeatConsultFields('bt-1', {
    attachTacticalOpponentPlanToIpc: false,
    cost: Number.NaN,
  });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(nanCost, 'cost'), false);
}

async function runAll(): Promise<void> {
  testMapsMessageIndependentlyOfStrategy();
  testCopiesFiniteCostAndOmitsMissingCost();
  await testSkippedTacticalConsultReturnsEmptyMerge();
  console.log('OK readyIpcResolutionMapping tests');
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
