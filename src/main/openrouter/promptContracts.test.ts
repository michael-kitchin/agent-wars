/**
 * Contract tests for final JSON prompt helpers.
 */

import * as assert from 'assert';
import { getToolFlags } from './openRouterToolGroups';
import { buildFinalJsonContractInstruction, getFinalJsonOrdersExampleBlock } from './promptContracts';
import {
  getMovementOrderInstruction,
  buildToolUsageGuidance,
  getInitialUserMessage,
  buildAvailableToolsIntro,
} from './promptText';

/**
 * Defines the `testExampleBlockParsesWithParser` function shape (function testExampleBlockParsesWithParser(): void).

 * Purpose: Supports maintainability by documenting why `testExampleBlockParsesWithParser` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testExampleBlockParsesWithParser(): void {
  const block = getFinalJsonOrdersExampleBlock({ includeMemoryUpdates: false, includeProductionOrders: false });
  const jsonMatch = block.match(/```json\s*([\s\S]*?)```/);
  assert.ok(jsonMatch, 'example should be fenced json');
  const parsed = JSON.parse(jsonMatch[1]!.trim()) as { message?: string; strategy?: string; orders?: unknown[] };
  assert.strictEqual(parsed.message, 'You will not find safety in delay.');
  assert.strictEqual(typeof parsed.strategy, 'string');
  const messageKeyAt = jsonMatch[1]!.indexOf('"message"');
  const strategyKeyAt = jsonMatch[1]!.indexOf('"strategy"');
  assert.ok(messageKeyAt >= 0 && messageKeyAt < strategyKeyAt, 'example JSON must list message before strategy');
  assert.ok(Array.isArray(parsed.orders));
  assert.ok(parsed.orders!.length >= 3);
}

/**
 * Ensures the tactical illustrative JSON example leads with explicit_move and omits assign_order.
 *
 * Purpose: Keeps the tactical final-JSON example aligned with blocked standing-order actions.
 * When to use: After edits to `getFinalJsonOrdersExampleBlock` tactical branch.
 * Expected outcome: Example contains explicit_move and does not contain assign_order.
 * Exceptions: Assertion failure on contract drift.
 */
function testTacticalExampleBlockLeadsWithExplicitMove(): void {
  const block = getFinalJsonOrdersExampleBlock({
    includeMemoryUpdates: false,
    includeProductionOrders: false,
    coordinateMode: 'tactical',
  });
  assert.ok(block.includes('"explicit_move"'));
  assert.ok(!block.includes('"assign_order"'));
  assert.ok(block.includes('This close, hesitation is already a casualty.'));
  const messageKeyAt = block.indexOf('"message"');
  const strategyKeyAt = block.indexOf('"strategy"');
  assert.ok(messageKeyAt >= 0 && messageKeyAt < strategyKeyAt, 'tactical example JSON must list message before strategy');
}

/**
 * Defines the `testExampleBlockIncludesOptionalTails` function shape (function testExampleBlockIncludesOptionalTails(): void).

 * Purpose: Supports maintainability by documenting why `testExampleBlockIncludesOptionalTails` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/**
 * Defines the `testTacticalCallbacksClauseMentionsBeat` function shape.
 *
 * Purpose: Ensures tactical mode expands the JSON contract callbacks guidance.
 * When to use: Regression after edits to `buildFinalJsonContractInstruction`.
 * Expected outcome: Tactical string mentions tactical beat and event-driven.
 * Exceptions: Assertion failure on contract drift.
 */
/**
 * Defines the `testTacticalPlanningMovementInstructionAddsReachabilityClause` function shape.
 *
 * Purpose: Regression for tactical AI prompts: planning + explicit_move must mention terrain-weighted reachability.
 * When to use: After edits to `getMovementOrderInstruction`.
 * Expected outcome: Tactical mode appends reachability/drop guidance; planning dests may copy Best Options Target Hexes or plan_route orderToHexCode.
 * Exceptions: Assertion failure on contract drift.
 */
function testTacticalPlanningMovementInstructionAddsReachabilityClause(): void {
  const flags = getToolFlags(['plan_route']);
  assert.ok(flags.planningEnabled);
  const tactical = getMovementOrderInstruction(flags, 'tactical');
  assert.ok(tactical.includes('orderToHexCode'));
  assert.ok(tactical.includes('terrain'));
  assert.ok(tactical.includes('first leg'));
  const strategic = getMovementOrderInstruction(flags, 'strategic');
  assert.ok(strategic.includes('orderToHexCode'));
  assert.ok(!strategic.includes('first leg'));
  const noBriefing = getMovementOrderInstruction(flags, 'tactical', false);
  assert.ok(!noBriefing.includes('Best Options This Turn'));
  assert.ok(noBriefing.includes('orderToHexCode'));
}

/**
 * Locks strategic sealift tool-use copy to cargo already aboard, not co-located land.
 *
 * Purpose: Naval Transport Status Aboard is assignment-based; the HOW TO USE line must not promise co-located land.
 * When to use: After edits to `buildToolUsageGuidance` strategic sealift bullet.
 * Expected outcome: Mentions cargo already aboard and nearest embark; does not mention co-located land.
 * Exceptions: Assertion failure on contract drift.
 */
function testStrategicSealiftGuidanceUsesCargoAboard(): void {
  const flags = getToolFlags(undefined);
  const text = buildToolUsageGuidance(flags, true, 'strategic');
  assert.ok(text.includes('cargo already aboard'));
  assert.ok(text.includes('nearest embark hex'));
  assert.ok(!text.includes('co-located land'));
}

/**
 * Ensures tactical prompts let the model copy Best Options this-beat hexes without one plan_route per unit.
 *
 * Purpose: Consultation on a 24-unit battle stopped after three plan_route calls because the prompt required orderToHexCode for every explicit_move.
 * When to use: After edits to `buildToolUsageGuidance`, `getMovementOrderInstruction`, or `getInitialUserMessage` tactical planning copy.
 * Expected outcome: Guidance names Best Options Target Hexes as copyable dests and does not require plan_route for every sub-unit.
 * Exceptions: None.
 */
function testTacticalPromptAllowsCopyingBestOptionsHexes(): void {
  const flags = getToolFlags(['plan_route']);
  const guidance = buildToolUsageGuidance(flags, true, 'tactical');
  assert.ok(guidance.includes('Best Options This Turn'));
  assert.ok(guidance.includes('Target Hexes'));
  assert.ok(!guidance.includes('one per unit that needs to move'));
  const move = getMovementOrderInstruction(flags, 'tactical');
  assert.ok(move.includes('Best Options This Turn'));
  const user = getInitialUserMessage(flags, true, 'tactical');
  assert.ok(!user.includes('Call plan_route for each sub-unit'));
  assert.ok(user.includes('Best Options'));
  assert.ok(user.includes('approach or move/melee'));
  assert.ok(guidance.includes('approach or move/melee'));
  const intro = buildAvailableToolsIntro(flags, true, 'tactical');
  assert.ok(intro.includes('Best Options This Turn'));
  assert.ok(!intro.includes('exact routing (plan_route)'));
}

/**
 * Ensures strategic prompts allow Best Options dest copy for explicit_move without one plan_route per unit, and do not nudge overrides of standing orders.
 *
 * Purpose: The captured strategic system prompt used the same orderToHexCode-only dest contract as tactical. Strategic units usually already have standing marches; dest copy must not tell the model to explicit_move every row.
 * When to use: After edits to strategic briefing tool intro, standing-order guidance, or `getInitialUserMessage`.
 * Expected outcome: Best Options Target Hexes are copyable dests; standing-order primacy remains; no per-unit plan_route requirement.
 * Exceptions: None.
 */
function testStrategicPromptAllowsCopyingBestOptionsHexesWithoutStandingOrderOverride(): void {
  const flags = getToolFlags(undefined);
  const guidance = buildToolUsageGuidance(flags, true, 'strategic');
  assert.ok(guidance.includes('Best Options This Turn'));
  assert.ok(guidance.includes('Target Hexes'));
  assert.ok(!guidance.includes('one per unit that needs to move'));
  assert.ok(!guidance.includes('Issue explicit_move for every'));
  assert.ok(guidance.includes('one-step explicit_move'));
  assert.ok(guidance.includes('do not need explicit orders'));
  const move = getMovementOrderInstruction(flags, 'strategic');
  assert.ok(move.includes('Best Options This Turn'));
  const user = getInitialUserMessage(flags, true, 'strategic');
  assert.ok(!user.includes('Call plan_route for each unit that needs a move'));
  assert.ok(user.includes('Best Options'));
  assert.ok(user.includes('one-step move'));
  const intro = buildAvailableToolsIntro(flags, true, 'strategic');
  assert.ok(intro.includes('Best Options This Turn'));
  assert.ok(intro.includes('one-step move'));
  assert.ok(!intro.includes('exact routing (plan_route)'));
}

/**
 * Ensures production tool guidance tells the model not to queue types already at deployment cap.
 *
 * Purpose: The Turn 9 prompt said armor was at maximum but still told the model to fill every empty queue, and the model queued more armor.
 * When to use: After edits to `buildToolUsageGuidance` or `getInitialUserMessage` production copy.
 * Expected outcome: Strategic production guidance mentions skipping types at maximum in favor of still-buildable types.
 * Exceptions: None.
 */
function testProductionGuidanceSkipsTypesAtDeploymentCap(): void {
  const flags = getToolFlags(undefined);
  const guidance = buildToolUsageGuidance(flags, true, 'strategic');
  assert.ok(guidance.includes('at maximum'), 'tool guidance must mention deployment-cap maximums');
  assert.ok(
    /do not queue types at maximum/i.test(guidance),
    'tool guidance must tell the model not to queue capped types'
  );
  const user = getInitialUserMessage(flags, true, 'strategic');
  assert.ok(
    /do not queue types at maximum/i.test(user),
    'user message must tell the model not to queue capped types'
  );
}

function testTacticalCallbacksClauseMentionsBeat(): void {
  const tactical = buildFinalJsonContractInstruction({
    includeMemoryUpdates: false,
    includeProductionOrders: false,
    movementOrderInstruction: '',
    submitMemoryClause: '',
    productionSubmitClause: '',
    coordinateMode: 'tactical',
  });
  assert.ok(tactical.includes('tactical beat'));
  assert.ok(tactical.includes('event-driven'));
  assert.ok(tactical.includes('"message" (string)'));
  assert.ok(tactical.includes('Do not emit assign_order'));
  assert.ok(!tactical.includes('Actions: assign_order'), 'tactical contract must not list assign_order as a live action');
  const strategic = buildFinalJsonContractInstruction({
    includeMemoryUpdates: false,
    includeProductionOrders: false,
    movementOrderInstruction: '',
    submitMemoryClause: '',
    productionSubmitClause: '',
    coordinateMode: 'strategic',
  });
  assert.ok(!strategic.includes('tactical beat'));
  assert.ok(strategic.includes('Actions: assign_order'));
  assert.ok(strategic.includes('operational-map'));
  assert.ok(strategic.includes('not plan_route orderToHexCode'));
}

function testExampleBlockIncludesOptionalTails(): void {
  const block = getFinalJsonOrdersExampleBlock({ includeMemoryUpdates: true, includeProductionOrders: true });
  assert.ok(block.includes('"memoryUpdates"'));
  assert.ok(block.includes('"productionOrders"'));
  assert.ok(block.includes('set_build_queue'));
}

/**
 * Ensures air/ferry JSON example fields appear only when includeAirActions is enabled.
 *
 * Purpose: Keeps final-order examples aligned with opponents that have no air units.
 * When to use: After edits to `getFinalJsonOrdersExampleBlock` / `buildFinalJsonContractInstruction` air gating.
 * Expected outcome: Default includes airStrikes/ferryOrders; includeAirActions:false omits both from example and contract header.
 * Exceptions: None.
 */
function testAirFieldsGatedByIncludeAirActions(): void {
  const withAir = getFinalJsonOrdersExampleBlock({ includeMemoryUpdates: false, includeProductionOrders: false });
  assert.ok(withAir.includes('"airStrikes"') && withAir.includes('"ferryOrders"'), 'default example includes air fields');
  const withoutAir = getFinalJsonOrdersExampleBlock({
    includeMemoryUpdates: false,
    includeProductionOrders: false,
    includeAirActions: false,
  });
  assert.ok(!withoutAir.includes('"airStrikes"') && !withoutAir.includes('"ferryOrders"'), 'no-air example omits air fields');
  const contractNoAir = buildFinalJsonContractInstruction({
    includeMemoryUpdates: false,
    includeProductionOrders: false,
    includeAirActions: false,
    movementOrderInstruction: '',
    submitMemoryClause: '',
    productionSubmitClause: '',
  });
  assert.ok(!contractNoAir.includes('airStrikes') && !contractNoAir.includes('ferryOrders'), 'no-air contract omits air fields');
}

/**
 * Documents the module-scope binding `tests` (tests).

 * Purpose: Supports maintainability by documenting why `tests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const tests = [
  { name: 'getFinalJsonOrdersExampleBlock contains parseable JSON', fn: testExampleBlockParsesWithParser },
  { name: 'getFinalJsonOrdersExampleBlock optional tails', fn: testExampleBlockIncludesOptionalTails },
  { name: 'air fields gated by includeAirActions', fn: testAirFieldsGatedByIncludeAirActions },
  { name: 'getFinalJsonOrdersExampleBlock tactical leads with explicit_move', fn: testTacticalExampleBlockLeadsWithExplicitMove },
  { name: 'buildFinalJsonContractInstruction tactical callbacks clause', fn: testTacticalCallbacksClauseMentionsBeat },
  {
    name: 'getMovementOrderInstruction tactical planning adds march reachability clause',
    fn: testTacticalPlanningMovementInstructionAddsReachabilityClause,
  },
  {
    name: 'buildToolUsageGuidance strategic sealift uses cargo aboard',
    fn: testStrategicSealiftGuidanceUsesCargoAboard,
  },
  {
    name: 'tactical prompt allows copying Best Options hexes without per-unit plan_route',
    fn: testTacticalPromptAllowsCopyingBestOptionsHexes,
  },
  {
    name: 'strategic prompt allows copying Best Options hexes without standing-order override',
    fn: testStrategicPromptAllowsCopyingBestOptionsHexesWithoutStandingOrderOverride,
  },
  {
    name: 'production guidance skips types at deployment cap',
    fn: testProductionGuidanceSkipsTypesAtDeploymentCap,
  },
];

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exit(1);
    }
  }
}

run();
