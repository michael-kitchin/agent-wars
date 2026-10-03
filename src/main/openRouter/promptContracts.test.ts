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
  buildProductionSubmitClause,
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
  assert.ok(!block.includes('```'), 'example must not be a markdown fence the model will copy');
  assert.ok(!/\n {2}"/.test(block), 'example JSON must be compact, not pretty-printed');
  const jsonStart = block.indexOf('{');
  assert.ok(jsonStart >= 0, 'example should contain a JSON object');
  const parsed = JSON.parse(block.slice(jsonStart)) as { message?: string; strategy?: string; orders?: unknown[] };
  assert.strictEqual(parsed.message, 'You will not find safety in delay.');
  assert.strictEqual(typeof parsed.strategy, 'string');
  const messageKeyAt = block.indexOf('"message"');
  const strategyKeyAt = block.indexOf('"strategy"');
  assert.ok(messageKeyAt >= 0 && messageKeyAt < strategyKeyAt, 'example JSON must list message before strategy');
  const airAt = block.indexOf('"airStrikes"');
  const ferryAt = block.indexOf('"ferryOrders"');
  const callbacksAt = block.indexOf('"callbacks"');
  assert.ok(airAt >= 0 && airAt < ferryAt && ferryAt < callbacksAt, 'example JSON must list air tails before callbacks');
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
  assert.ok(block.includes('a1-t1-s1'), 'tactical example must use a compact sub-unit id');
  assert.ok(!block.includes('opp-parent:01'), 'tactical example must not use live-looking parent ids');
  assert.ok(!block.includes('hum-parent:01'), 'tactical example must not use live-looking enemy ids');
  assert.ok(block.includes('"unitIds"'), 'tactical example teaches grouped unitIds');
  assert.ok(!block.includes('```'), 'tactical example must not be a markdown fence');
  assert.ok(!/\n {2}"/.test(block), 'tactical example JSON must be compact');
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
  assert.ok(guidance.includes('unitIds'), 'tactical guidance teaches grouped unitIds');
  assert.ok(!guidance.includes('one per unit that needs to move'));
  const move = getMovementOrderInstruction(flags, 'tactical');
  assert.ok(move.includes('Best Options This Turn'));
  const user = getInitialUserMessage(flags, true, 'tactical');
  assert.ok(!user.includes('Call plan_route for each sub-unit'));
  assert.ok(user.includes('one move or approach row'));
  assert.ok(user.includes('one ranged row per sub-unit'));
  assert.ok(!user.includes('Give every sub-unit with a move or approach option a move order'));
  assert.ok(user.includes('Do not emit assign_order or cancel_order for tactical sub-unit ids.'));
  assert.ok(!user.includes('Copy Best Options approach and move/melee Target Hexes into explicit_move'));
  assert.ok(guidance.includes('approach or move/melee'));
  const intro = buildAvailableToolsIntro(flags, true, 'tactical');
  assert.ok(intro.includes('Best Options This Turn'));
  assert.ok(intro.includes('ranged_attack'), 'tactical intro maps ranged rows');
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
  assert.ok(guidance.includes('unitIds'), 'strategic guidance teaches grouped unitIds');
  assert.ok(!guidance.includes('one per unit that needs to move'));
  assert.ok(!guidance.includes('Issue explicit_move for every'));
  assert.ok(guidance.includes('one-step explicit_move'));
  assert.ok(guidance.includes('do not need explicit orders'));
  const move = getMovementOrderInstruction(flags, 'strategic');
  assert.ok(move.includes('Best Options This Turn'));
  const user = getInitialUserMessage(flags, true, 'strategic');
  assert.ok(!user.includes('Call plan_route for each unit that needs a move'));
  assert.ok(user.includes('one option row per unit per action'));
  assert.ok(user.includes('into the matching envelope field'));
  assert.ok(!user.includes('one-step move'));
  const intro = buildAvailableToolsIntro(flags, true, 'strategic');
  assert.ok(intro.includes('Best Options This Turn'));
  assert.ok(intro.includes('one-step move'));
  assert.ok(intro.includes('ranged_attack'), 'strategic intro maps ranged rows');
  assert.ok(!intro.includes('exact routing (plan_route)'));
}

/**
 * Ensures strategic prompts send ferry Best Options hexes to ferryOrders, not explicit_move.
 *
 * Purpose: After air ferry dests were labeled `ferry`, HOW TO USE still said copy every Target Hex into explicit_move, which air cannot use.
 * When to use: After edits to strategic `buildAvailableToolsIntro`, `buildToolUsageGuidance`, or `getInitialUserMessage`.
 * Expected outcome: Ferry dest copy names ferryOrders; explicit_move copy is limited to approach / move/melee rows.
 * Exceptions: None.
 */
function testStrategicPromptRoutesFerryBestOptionsToFerryOrders(): void {
  const flags = getToolFlags(undefined);
  const guidance = buildToolUsageGuidance(flags, true, 'strategic');
  assert.ok(guidance.includes('ferryOrders'), 'tool guidance must name ferryOrders for ferry dests');
  assert.ok(guidance.includes('ferry'), 'tool guidance must mention ferry rows');
  assert.ok(
    /approach or move\/melee/i.test(guidance),
    'explicit_move copy must be limited to approach or move/melee rows'
  );
  const intro = buildAvailableToolsIntro(flags, true, 'strategic');
  assert.ok(intro.includes('ferryOrders'));
  assert.ok(!/^.*Copy Best Options This Turn Target Hexes into explicit_move/m.test(intro));
  const user = getInitialUserMessage(flags, true, 'strategic', { hasAirUnits: true });
  assert.ok(user.includes('"ferryOrders"'));
  const noAirUser = getInitialUserMessage(flags, true, 'strategic', { hasAirUnits: false });
  assert.ok(!noAirUser.includes('"ferryOrders"'));
  const move = getMovementOrderInstruction(flags, 'strategic');
  assert.ok(/approach or move\/melee/i.test(move));
}

/**
 * Ensures standing-order coaching does not send march dests to the unit's current hex.
 *
 * Purpose: Turn 13 assigned march to FK for infantry already at FK; those orders were dropped as already arrived.
 * When to use: After edits to strategic standing-order HOW TO USE copy.
 * Expected outcome: Guidance tells the model not to march to the current Hex and to copy a Best Options dest or defend to hold.
 * Exceptions: None.
 */
function testStrategicPromptDoesNotMarchToCurrentHex(): void {
  const flags = getToolFlags(undefined);
  const guidance = buildToolUsageGuidance(flags, true, 'strategic');
  assert.ok(/already arrived/i.test(guidance), 'must warn that current-hex marches are dropped');
  assert.ok(/defend to hold/i.test(guidance));
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
    !/do not queue types at maximum/i.test(user),
    'user message must not restate production cap rules the system prompt already owns'
  );
  assert.ok(!user.includes('Prefer setting queues on every eligible'));
}

/**
 * The envelope must require a queue write when a blocked-at-cap queue still has an alternative type.
 *
 * Purpose: Turn 18 had FM/FV/DF queued as infantry at cap with air still buildable; the submit clause only
 * mandated productionOrders for empty queues, so the model issued none.
 * When to use: After edits to `buildProductionSubmitClause`.
 * Expected outcome: The clause names empty queues and queues blocked at cap while another type can still be built.
 * Exceptions: None.
 */
function testProductionSubmitRequiresBlockedQueueReplacement(): void {
  const flags = getToolFlags(undefined);
  const clause = buildProductionSubmitClause(flags);
  assert.ok(/empty queue/i.test(clause), 'still requires a write when a queue is empty');
  assert.ok(
    /blocked at cap/i.test(clause) && /still-available type|another type can still be built/i.test(clause),
    `must also require a write for replaceable blocked queues: ${clause}`
  );
}

/**
 * A precomputed briefing must not name assessment or estimate tools, even as a prohibition.
 *
 * Purpose: assembly-contract.md section 4.2: a tool absent from the callable list must not be named as something to call.
 * Turn 18 still said "Do NOT call assess_unit, assess_hex, or estimate_combat" after those tools were stripped.
 * When to use: After edits to `buildToolUsageGuidance` briefing-present bullets.
 * Expected outcome: Briefing-present guidance omits those three names; no-briefing guidance may still name them.
 * Exceptions: None.
 */
function testBriefingGuidanceDoesNotNameUncallableAssessmentTools(): void {
  const flags = getToolFlags(undefined);
  const withBriefing = buildToolUsageGuidance(flags, true, 'strategic');
  assert.ok(!withBriefing.includes('assess_unit'), withBriefing);
  assert.ok(!withBriefing.includes('assess_hex'), withBriefing);
  assert.ok(!withBriefing.includes('estimate_combat'), withBriefing);
  const withoutBriefing = buildToolUsageGuidance(flags, false, 'strategic');
  assert.ok(
    withoutBriefing.includes('assess_unit') || withoutBriefing.includes('estimate_combat'),
    'no-briefing guidance may still name callable assessment tools'
  );
  assert.match(withoutBriefing, /differ by type and birth country/);
  assert.doesNotMatch(withoutBriefing, /results will be identical/);
}

/**
 * Ensures tool guidance asks the model to batch independent tool calls in one reply.
 *
 * Purpose: One tool call per reply multiplies round trips; the batching bullet must reach both modes.
 * When to use: After edits to `buildToolUsageGuidance` mechanic bullets.
 * Expected outcome: Strategic briefing-present and tactical no-briefing guidance both carry the batching bullet.
 * Exceptions: Assertion failure on contract drift.
 */
function testToolGuidanceAsksForBatchedToolCalls(): void {
  const flags = getToolFlags(undefined);
  assert.ok(buildToolUsageGuidance(flags, true, 'strategic').includes('Batch independent tool calls'));
  assert.ok(buildToolUsageGuidance(flags, false, 'tactical').includes('Batch independent tool calls'));
}

/**
 * The illustrative JSON example must not use live roster id prefixes the model can copy onto the map.
 *
 * Purpose: Turn 18's example marched opponent-infantry-1 (a real unit) to water cell AB.
 * When to use: After edits to `getFinalJsonOrdersExampleBlock`.
 * Expected outcome: Example unit ids use compact grammar; production example is not infantry.
 * Exceptions: None.
 */
function testExampleBlockUsesPlaceholderIdsNotLiveRosterIds(): void {
  const block = getFinalJsonOrdersExampleBlock({ includeMemoryUpdates: true, includeProductionOrders: true });
  assert.ok(!block.includes('opponent-infantry-1'), 'must not use a live infantry id');
  assert.ok(!block.includes('opponent-armor-2'), 'must not use a live armor id');
  assert.ok(!block.includes('opponent-naval-1'), 'must not use a live-looking naval id');
  assert.ok(!block.includes('human-armor-1'), 'must not use a live-looking enemy id');
  assert.ok(block.includes('a1-i1'), 'placeholder infantry id');
  assert.ok(block.includes('"unitType": "air"') || block.includes('"unitType":"air"'), 'production example must not queue infantry');
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
  assert.ok(tactical.includes('this beat'), 'tactical strategy field is a plan for this beat');
  assert.ok(!tactical.includes('plan for this turn'), 'tactical contract must not call the beat a turn');
  assert.ok(!tactical.includes('ranged-only'), 'envelope must not call fire ranged-only');
  assert.ok(tactical.includes('unitIds'), 'tactical contract teaches grouped unitIds');
  assert.match(tactical, /compact JSON/i);
  assert.match(tactical, /no markdown fence/i);
  assert.match(tactical, /replac/i);
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
  assert.ok(!strategic.includes('ranged-only'), 'strategic envelope must not call fire ranged-only');
  assert.ok(strategic.includes('unitIds'), 'strategic contract teaches grouped unitIds');
}

function testExampleBlockIncludesOptionalTails(): void {
  const block = getFinalJsonOrdersExampleBlock({ includeMemoryUpdates: true, includeProductionOrders: true });
  assert.ok(block.includes('"memoryUpdates"'));
  assert.ok(block.includes('"productionOrders"'));
  assert.ok(block.includes('set_build_queue'));
  assert.ok(block.includes('"action": "write"') || block.includes('"action":"write"'), 'example must show a memory write');
  assert.ok(block.includes('infrastructure_destroyed'), 'example must show how to keep a callback');
  assert.ok(!block.includes('"memoryUpdates": []') && !block.includes('"memoryUpdates":[]'), 'example must not teach empty memoryUpdates');
  assert.ok(!block.includes('"callbacks": []') && !block.includes('"callbacks":[]'), 'example must not teach empty callbacks');
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
 * Sealift order verbs appear only when the opponent roster includes a naval unit.
 *
 * Purpose: Teaching embark/transport/disembark with no ship invites unfillable orders.
 * When to use: After `includeNavalActions` on the JSON contract.
 * Expected outcome: Default lists transport_move; includeNavalActions:false omits the three sealift verbs.
 * Exceptions: None.
 */
function testSealiftActionsGatedByIncludeNavalActions(): void {
  const withNaval = buildFinalJsonContractInstruction({
    includeMemoryUpdates: false,
    includeProductionOrders: false,
    movementOrderInstruction: '',
    submitMemoryClause: '',
    productionSubmitClause: '',
  });
  assert.ok(withNaval.includes('transport_move') && withNaval.includes('embark'), 'default contract lists sealift');
  const withoutNaval = buildFinalJsonContractInstruction({
    includeMemoryUpdates: false,
    includeProductionOrders: false,
    includeNavalActions: false,
    movementOrderInstruction: '',
    submitMemoryClause: '',
    productionSubmitClause: '',
  });
  assert.ok(!withoutNaval.includes('transport_move'), 'no-naval contract omits transport_move');
  assert.ok(!withoutNaval.includes('disembark'), 'no-naval contract omits disembark');
}

/**
 * Standing-order actions disappear from the contract and example when that tool group is off.
 *
 * Purpose: Teaching assign_order when the tools are off invites unfillable JSON.
 * When to use: After includeStandingOrderActions on the JSON contract.
 * Expected outcome: Default strategic lists assign_order; includeStandingOrderActions:false omits it from the action list and example.
 * Exceptions: None.
 */
function testStandingOrderActionsGatedByIncludeStandingOrderActions(): void {
  const withStanding = buildFinalJsonContractInstruction({
    includeMemoryUpdates: false,
    includeProductionOrders: false,
    movementOrderInstruction: '',
    submitMemoryClause: '',
    productionSubmitClause: '',
  });
  assert.ok(withStanding.includes('Actions: assign_order'), 'default strategic contract lists assign_order');
  const withoutStanding = buildFinalJsonContractInstruction({
    includeMemoryUpdates: false,
    includeProductionOrders: false,
    includeStandingOrderActions: false,
    movementOrderInstruction: '',
    submitMemoryClause: '',
    productionSubmitClause: '',
  });
  assert.ok(!withoutStanding.includes('Actions: assign_order'), 'orders-off contract omits assign_order from the action list');
  assert.ok(!withoutStanding.includes('cancel_order'), 'orders-off contract omits cancel_order');
  assert.ok(withoutStanding.includes('explicit_move'), 'orders-off contract still lists explicit_move');
  const example = getFinalJsonOrdersExampleBlock({
    includeMemoryUpdates: false,
    includeProductionOrders: false,
    includeStandingOrderActions: false,
  });
  assert.ok(!example.includes('"assign_order"'), 'orders-off example omits assign_order');
  assert.ok(example.includes('"explicit_move"'), 'orders-off example still shows explicit_move');
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
  { name: 'sealift actions gated by includeNavalActions', fn: testSealiftActionsGatedByIncludeNavalActions },
  {
    name: 'standing-order actions gated by includeStandingOrderActions',
    fn: testStandingOrderActionsGatedByIncludeStandingOrderActions,
  },
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
    name: 'strategic prompt routes ferry Best Options hexes to ferryOrders',
    fn: testStrategicPromptRoutesFerryBestOptionsToFerryOrders,
  },
  {
    name: 'strategic prompt does not march to current hex',
    fn: testStrategicPromptDoesNotMarchToCurrentHex,
  },
  {
    name: 'tool guidance asks for batched tool calls',
    fn: testToolGuidanceAsksForBatchedToolCalls,
  },
  {
    name: 'production guidance skips types at deployment cap',
    fn: testProductionGuidanceSkipsTypesAtDeploymentCap,
  },
  {
    name: 'production submit requires blocked queue replacement',
    fn: testProductionSubmitRequiresBlockedQueueReplacement,
  },
  {
    name: 'briefing guidance does not name uncallable assessment tools',
    fn: testBriefingGuidanceDoesNotNameUncallableAssessmentTools,
  },
  {
    name: 'example block uses placeholder ids not live roster ids',
    fn: testExampleBlockUsesPlaceholderIdsNotLiveRosterIds,
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
