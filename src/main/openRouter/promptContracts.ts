import { logDebug } from '../logger';
import {
  EXAMPLE_CALLBACKS,
  EXAMPLE_MEMORY_UPDATES,
  EXAMPLE_MISSILE_LAUNCHES,
  EXAMPLE_PRODUCTION_ORDERS,
} from './promptSpec/envelopeExampleRows';
import {
  buildCallbackContractClause,
  buildInvalidOutputRulesClause,
  buildMemoryWriteLimitsClause,
  envelopeFieldsForGates,
  TACTICAL_STANDING_ORDER_PROHIBITION,
  type EnvelopeGates,
} from './promptSpec/envelopeContract';

/**
 * Renders the orders action list as one bullet per action.
 *
 * Purpose: A comma-separated sentence hides which words belong to which action.
 * When to use: The orders paragraphs of the JSON contract.
 * Expected outcome: `Actions:`, a blank line, then one bullet per legal action. Naval and standing-order bullets follow their gates. The tactical prohibition, or the place-field sentence, follows the list.
 * Exceptions: None.
 */
function formatOrderActionList(args: {
  readonly coordinateMode: 'strategic' | 'tactical';
  readonly includeAirActions: boolean;
  readonly includeNavalActions: boolean;
  readonly standingOrdersIssuable: boolean;
}): string {
  const moveNoun = args.coordinateMode === 'tactical' ? "beat's march" : "turn's move";
  const rangedReach = args.coordinateMode === 'tactical'
    ? 'every type with a tactical reach, infantry included'
    : 'units with a strategic ranged reach of at least one, never infantry';
  const bullets: string[] = [];
  if (args.standingOrdersIssuable) {
    const airNote = args.includeAirActions
      ? ' Air units never move hex by hex, so "march", "patrol", and "pursue" are rejected for them — use airStrikes for attacks, ferryOrders to reposition, airDrops to land embarked infantry, or a "defend" order to keep striking targets in range.'
      : '';
    bullets.push(
      '- assign_order: include "order": { "type": "defend"|"march"|"pursue"|"patrol"|"hold_fire", ... }. Required fields per type: "march" needs "destination" (one two-character briefing hex code); "defend" needs "defendHex" (one hex code); "patrol" needs "waypoints" (an array of two or more hex codes, visited in order then looped — a single "destination" is not a valid patrol); "pursue" needs "targetUnitId" (an enemy unit id string); "hold_fire" needs no extra fields.' +
        airNote
    );
    bullets.push('- cancel_order');
  }
  bullets.push(
    `- explicit_move: include "destination": briefing hex code for this ${moveNoun}; auto-debarks embarked cargo before marching.`
  );
  bullets.push(`- ranged_attack: include exactly one of targetHexCode or targetUnitId; ${rangedReach}.`);
  if (args.includeNavalActions) {
    bullets.push('- transport_move: include "navalUnitId" and "destination" hex code.');
  }
  if (args.includeNavalActions || args.includeAirActions) {
    bullets.push('- disembark: include "unitId" and "destination" hex code — clears cargo assignment then moves in one action.');
    bullets.push('- embark: include "unitId" and "navalUnitId".');
  }
  const tail = args.coordinateMode === 'tactical'
    ? TACTICAL_STANDING_ORDER_PROHIBITION
    : args.standingOrdersIssuable
      ? 'assign_order place fields are operational-map briefing hex codes, not plan_route orderToHexCode; they may be multi-turn goals. Best Options Target Hexes are this-turn dests only.'
      : 'Best Options Target Hexes are this-turn dests only.';
  return `Actions:\n\n${bullets.join('\n')}\n\n${tail}`;
}

/**
 * Defines the `buildFinalJsonContractInstruction` function shape (export function buildFinalJsonContractInstruction(args: { includeMemoryUpdates: boolean; includeProductionOrders: boolean; movementOrderInstruction: st).

 * Purpose: Supports maintainability by documenting why `buildFinalJsonContractInstruction` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildFinalJsonContractInstruction(args: {
  includeMemoryUpdates: boolean;
  includeProductionOrders: boolean;
  /**
   * When false, omit airStrikes/ferryOrders from the submit header and schema (no air units on the roster).
   *
   * Contract: Defaults to true for backward-compatible strategic prompts.
   * When to use: Pass from `buildSystemPromptForTools` based on opponent air presence.
   * Expected outcome: No-air consultations do not advertise unused air/ferry fields.
   * Exceptions: None.
   */
  includeAirActions?: boolean;
  /**
   * When false, omit embark / transport_move / disembark from the action list (no naval units on the roster).
   *
   * Contract: Defaults to true for backward-compatible prompts that already had a ship.
   * When to use: Pass from `buildSystemPromptForTools` based on opponent naval presence.
   * Expected outcome: No-naval consultations do not advertise unused sealift actions.
   * Exceptions: None.
   */
  includeNavalActions?: boolean;
  /**
   * When false, omit assign_order / cancel_order from the legal-action list (standing-order tools off).
   *
   * Contract: Defaults to true for backward-compatible strategic prompts.
   * When to use: Pass from `buildSystemPromptForTools` based on `flags.ordersEnabled` and mode.
   * Expected outcome: Orders-off consultations do not advertise standing-order actions.
   * Exceptions: None.
   */
  includeStandingOrderActions?: boolean;
  /**
   * When true, the contract names `missileLaunches`. Omitted means false.
   *
   * Contract: Strategic only. A tactical prompt never advertises the field.
   * When to use: Pass from `buildSystemPromptForTools` when the roster has a missile and the mode is strategic.
   * Expected outcome: The header, the clause, and the example include the field together.
   * Exceptions: None.
   */
  includeMissileActions?: boolean;
  /**
   * When true, the contract names `exitBattle` after `orders`.
   *
   * Contract: Omitted means false. True only for a battle between two AI seats.
   * When to use: Pass from `buildSystemPromptForTools` when `leadPartyId` is set.
   * Expected outcome: The header and the example include the boolean together.
   * Exceptions: None.
   */
  includeExitBattle?: boolean;
  /**
   * When true, the contract names optional `campaignTarget`.
   *
   * Contract: Omitted means false. True on a strategic regional consult with standing orders on.
   * When to use: Pass from `buildConsultPromptParts` when `campaignEnabled` is true.
   * Expected outcome: The header and one paragraph name the field. The example omits it. `operations` follows it when that gate is on.
   * Exceptions: None.
   */
  includeCampaignTarget?: boolean;
  /**
   * When true, the contract names optional `operations` after `campaignTarget`.
   *
   * Contract: Omitted means false. True on a strategic consult with standing orders on.
   * When to use: Pass from `buildConsultPromptParts` when `operationsEnabled` is true.
   * Expected outcome: The header and one paragraph name the field. The example omits it.
   * Exceptions: None.
   */
  includeOperations?: boolean;
  movementOrderInstruction: string;
  submitMemoryClause: string;
  productionSubmitClause: string;
  /**
   * When `tactical`, expands the callbacks/orders clauses for in-battle consultations.
   *
   * Contract: Optional; omit or `strategic` for strategic Ready prompts.
   * When to use: Pass from `buildSystemPromptForTools` when assembling tactical system prompts.
   * Expected outcome: Tactical text omits live assign_order actions and expands callback beat guidance.
   * Exceptions: None.
   */
  coordinateMode?: 'strategic' | 'tactical';
  /**
   * When true, the request already attaches the JSON schema, so the prose does not restate it.
   *
   * Contract: Omitted means false. The field meanings, the action list, and the example stay.
   * When to use: A consult whose profile will attach structured outputs and whose model has not rejected them.
   * Expected outcome: The skeleton, the strict-schema line, and the legacy top-level-array sentence are absent.
   * Exceptions: None.
   */
  structuredOutputs?: boolean;
}): string {
  const {
    includeMemoryUpdates,
    includeProductionOrders,
    includeAirActions = true,
    includeNavalActions = true,
    includeStandingOrderActions = true,
    includeMissileActions = false,
    includeExitBattle = false,
    includeCampaignTarget = false,
    includeOperations = false,
    movementOrderInstruction,
    submitMemoryClause,
    productionSubmitClause,
    coordinateMode = 'strategic',
    structuredOutputs = false,
  } = args;
  logDebug('promptContracts buildFinalJsonContractInstruction', {
    includeMemoryUpdates,
    includeProductionOrders,
    includeAirActions,
    includeNavalActions,
    includeStandingOrderActions,
    includeMissileActions,
    includeExitBattle,
    includeCampaignTarget,
    includeOperations,
    coordinateMode,
    structuredOutputs,
  });
  const gates: EnvelopeGates = {
    coordinateMode,
    includeAirActions,
    includeMemoryUpdates,
    includeProductionOrders,
    includeStandingOrderActions: coordinateMode !== 'tactical' && includeStandingOrderActions,
    includeMissileActions: coordinateMode !== 'tactical' && includeMissileActions,
    includeExitBattle,
    includeNavalActions,
    includeCampaignTarget: coordinateMode !== 'tactical' && includeCampaignTarget,
    includeOperations: coordinateMode !== 'tactical' && includeOperations,
  };
  const fields = envelopeFieldsForGates(gates);
  const headerSlots: Record<string, string> = {
    message: '"message": "<one-line taunt or threat>"',
    strategy: '"strategy": "<one-line>"',
    orders: '"orders": [ ... ]',
    exitBattle: '"exitBattle": false',
    airStrikes: '"airStrikes": [ ... ]',
    ferryOrders: '"ferryOrders": [ ... ]',
    airDrops: '"airDrops": [ ... ]',
    missileLaunches: '"missileLaunches": [ ... ]',
    callbacks: '"callbacks": [...]',
    memoryUpdates: '"memoryUpdates": [...]',
    productionOrders: '"productionOrders": [...]',
    campaignTarget: '"campaignTarget": "<optional hex code>"',
    operations: '"operations": [...]',
  };
  const submitHeader = `Submit your final JSON only (one compact JSON object, no markdown fence, no extra whitespace, no comments): { ${fields
    .map((field) => headerSlots[field])
    .join(', ')} }.`;
  const periodNoun = coordinateMode === 'tactical' ? 'beat' : 'turn';
  const strictSchemaParagraphs = [
    'Strict schema: top-level must be a JSON object with "message" (string), "strategy" (string) and "orders" (array); do not return a top-level array.',
    'The "message" field is a one-line in-character taunt or threat addressed to your enemies (psychological warfare only: do not reveal real orders, hex codes, unit ids, or operational intent).',
    `The "strategy" field is a one-line summary of your plan for this ${periodNoun}.`,
  ];
  const standingOrdersIssuable = coordinateMode !== 'tactical' && includeStandingOrderActions;
  const actorIdClause =
    'Each entry includes "action" and "unitId" or "unitIds" (copy several ids from one Best Options row into unitIds instead of one object per unit)';
  const ordersParagraphs = [
    `The "orders" array is processed in list order. ${actorIdClause}.`,
    formatOrderActionList({
      coordinateMode,
      includeAirActions,
      includeNavalActions,
      standingOrdersIssuable,
    }),
  ];
  const airClause = includeAirActions
    ? 'Optional top-level air actions: airStrikes[] entries use { "unitId" or "unitIds", exactly one of "targetHexCode" or "targetUnitId", "targetType": "units"|"urban"|"airport"|"seaport" }, ferryOrders[] entries use { "unitId" or "unitIds", "destination": "<hex code>" }, airDrops[] entries use { "unitId" or "unitIds", "destination": "<hex code>" }. '
    : '';
  const missileClause = includeMissileActions && coordinateMode !== 'tactical'
    ? 'Optional top-level missile launches: missileLaunches[] entries use { "unitId" or "unitIds", "targetHexCode" }; each missile launches once and is spent. '
    : '';
  const callbacksClause = buildCallbackContractClause(coordinateMode);
  const invalidOutputClause = buildInvalidOutputRulesClause(gates, structuredOutputs);
  const memoryLimits =
    coordinateMode !== 'tactical' && includeMemoryUpdates ? buildMemoryWriteLimitsClause() : '';
  const memoryClause = coordinateMode === 'tactical' ? '' : submitMemoryClause;
  const productionClause = coordinateMode === 'tactical' ? '' : productionSubmitClause;
  const memoryParagraph = [memoryClause, memoryLimits].map((part) => part.trim()).filter((part) => part.length > 0).join(' ');
  const campaignParagraph =
    gates.includeCampaignTarget === true
      ? 'Optional "campaignTarget": the hex code of an enemy city for your ground campaign, as a string. Omit it to keep the target. Sending the current target changes nothing. The engine keeps your target until you take it, it stops being an enemy city, or no ground unit can reach it by land. An unknown or unreachable city is dropped.'
      : '';
  const operationsParagraph =
    gates.includeOperations === true
      ? 'Optional "operations": launch or cancel an operation. To launch a row of Operation Options, add {"action":"launch","option":"<letter>"}. To launch against a city that is not listed, add {"action":"launch","objective":"<hex code>","method":"land"}, "sea", or "air"; the engine builds the operation if your free units can reach it, and the next briefing says why if they cannot. To call one off, add {"action":"cancel","id":"<operation id>"} with an id from the Active Operations section. At most one launch per turn. Omit the array to change nothing. A land launch gives your ground campaign a new target, the same as "campaignTarget".'
      : '';
  const paragraphs = [
    ...(structuredOutputs ? [] : [submitHeader]),
    ...(structuredOutputs ? strictSchemaParagraphs.slice(1) : strictSchemaParagraphs),
    ...ordersParagraphs,
    airClause.trim(),
    missileClause.trim(),
    ...invalidOutputClause.split('\n\n'),
    movementOrderInstruction.trim(),
    ...callbacksClause.split('\n\n'),
    campaignParagraph,
    operationsParagraph,
    memoryParagraph,
    ...productionClause.split('\n\n'),
  ].map((part) => part.trim()).filter((part) => part.length > 0);
  return paragraphs.join('\n\n');
}

/**
 * Documents the `FinalJsonExampleFlags` interface as a named contract surface (export interface FinalJsonExampleFlags).

 * Purpose: Supports maintainability by documenting why `FinalJsonExampleFlags` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface FinalJsonExampleFlags {
    /**
   * Specifies the contract for the `includeMemoryUpdates` member (includeMemoryUpdates: boolean;).

   * Contract: Describes stable behavior for callers of `includeMemoryUpdates` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
includeMemoryUpdates: boolean;
    /**
   * Specifies the contract for the `includeProductionOrders` member (includeProductionOrders: boolean;).

   * Contract: Describes stable behavior for callers of `includeProductionOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
includeProductionOrders: boolean;
  /**
   * When false, illustrative JSON omits airStrikes/ferryOrders fields.
   *
   * Contract: Optional; defaults to true.
   * When to use: Pass false when the opponent roster has no air units.
   * Expected outcome: Example matches the contract instruction for the consultation.
   * Exceptions: None.
   */
  includeAirActions?: boolean;
  /**
   * When false, the illustrative orders[] example omits assign_order / cancel_order.
   *
   * Contract: Optional; defaults to true for strategic examples.
   * When to use: Pass false when standing-order tools are off.
   * Expected outcome: Example matches the contract instruction for the consultation.
   * Exceptions: None.
   */
  includeStandingOrderActions?: boolean;
  /**
   * When true, the example includes one missile launch. Omitted means false.
   *
   * Contract: Strategic only.
   * When to use: The same flag as `buildFinalJsonContractInstruction`.
   * Expected outcome: The example object contains `missileLaunches` only when the contract names that field.
   * Exceptions: None.
   */
  includeMissileActions?: boolean;
  /**
   * When true, the example includes `exitBattle: false` after `orders`.
   *
   * Contract: Omitted means false.
   * When to use: The same flag as `buildFinalJsonContractInstruction`.
   * Expected outcome: The example object contains `exitBattle` only for an AI-only battle.
   * Exceptions: None.
   */
  includeExitBattle?: boolean;
  /**
   * When `tactical`, the illustrative orders[] example leads with explicit_move / ranged_attack (assign_order stays blocked for sub-unit ids).
   *
   * Contract: Optional coordinate mode for example/contract text; omit or `strategic` for strategic prompts.
   * When to use: Pass `tactical` from tactical `buildSystemPromptForTools` / contract builders.
   * Expected outcome: Callers get tactical-appropriate action lists and examples.
   * Exceptions: None.
   */
  coordinateMode?: 'strategic' | 'tactical';
}

/**
 * Defines the `getFinalJsonOrdersExampleBlock` function shape (export function getFinalJsonOrdersExampleBlock(flags: FinalJsonExampleFlags): string).

 * Purpose: Supports maintainability by documenting why `getFinalJsonOrdersExampleBlock` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getFinalJsonOrdersExampleBlock(flags: FinalJsonExampleFlags): string {
  const coordinateMode = flags.coordinateMode ?? 'strategic';
  const includeAirActions = flags.includeAirActions !== false;
  const includeStandingOrderActions = flags.includeStandingOrderActions !== false;
  const includeMissileActions = flags.includeMissileActions === true && coordinateMode !== 'tactical';
  const includeExitBattle = flags.includeExitBattle === true;
  logDebug('promptContracts getFinalJsonOrdersExampleBlock', {
    includeMemoryUpdates: flags.includeMemoryUpdates,
    includeProductionOrders: flags.includeProductionOrders,
    includeAirActions,
    includeStandingOrderActions,
    includeMissileActions,
    includeExitBattle,
    coordinateMode,
  });
  const gates: EnvelopeGates = {
    coordinateMode,
    includeAirActions,
    includeMemoryUpdates: flags.includeMemoryUpdates,
    includeProductionOrders: flags.includeProductionOrders,
    includeStandingOrderActions: coordinateMode !== 'tactical' && includeStandingOrderActions,
    includeMissileActions,
    includeExitBattle,
  };
  const tactical = coordinateMode === 'tactical';
  const standingOrdersIssuable = !tactical && includeStandingOrderActions;
  const values: Record<string, unknown> = {
    message: tactical ? 'This close, hesitation is already a casualty.' : 'You will not find safety in delay.',
    strategy: tactical
      ? 'Close with observed enemies this beat using explicit moves and fire.'
      : 'Close with observed enemies and keep production moving.',
    exitBattle: false,
    orders: tactical || !standingOrdersIssuable
      ? [
          {
            action: 'explicit_move',
            unitIds: tactical ? ['a1-t1-s1', 'a1-t1-s2'] : ['a1-t1', 'a1-t3'],
            destination: 'CD',
          },
          {
            action: 'ranged_attack',
            unitIds: tactical ? ['a1-t1-s1', 'a1-t1-s2'] : ['a1-n1'],
            targetUnitId: tactical ? 'h1-i1-s1' : 'h1-i1',
          },
        ]
      : [
          { action: 'assign_order', unitId: 'a1-i1', order: { type: 'march', destination: 'CD' } },
          { action: 'assign_order', unitId: 'a1-n2', order: { type: 'patrol', waypoints: ['CD', 'CF'] } },
          { action: 'explicit_move', unitIds: ['a1-t1', 'a1-t3'], destination: 'CF' },
          { action: 'ranged_attack', unitId: 'a1-n1', targetUnitId: 'h1-i1' },
        ],
    airStrikes: [],
    ferryOrders: [],
    airDrops: [],
    missileLaunches: EXAMPLE_MISSILE_LAUNCHES,
    callbacks: EXAMPLE_CALLBACKS,
    memoryUpdates: EXAMPLE_MEMORY_UPDATES,
    productionOrders: EXAMPLE_PRODUCTION_ORDERS,
  };
  const example: Record<string, unknown> = {};
  for (const field of envelopeFieldsForGates(gates)) {
    example[field] = values[field];
  }
  const json = JSON.stringify(example);
  return (
    'Example (illustrative only — use briefing hex codes and unit ids from this operational map, not these placeholders). Emit compact JSON with no markdown fence:\n' +
    json
  );
}
