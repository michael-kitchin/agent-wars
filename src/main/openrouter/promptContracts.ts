import { logDebug } from '../logger';
import {
  buildCallbackContractClause,
  buildInvalidOutputRulesClause,
  buildMemoryWriteLimitsClause,
  envelopeFieldsForGates,
  legalOrderActionsForMode,
  TACTICAL_STANDING_ORDER_PROHIBITION,
  type EnvelopeGates,
} from './promptSpec/envelopeContract';

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
}): string {
  const {
    includeMemoryUpdates,
    includeProductionOrders,
    includeAirActions = true,
    includeNavalActions = true,
    includeStandingOrderActions = true,
    movementOrderInstruction,
    submitMemoryClause,
    productionSubmitClause,
    coordinateMode = 'strategic',
  } = args;
  logDebug('promptContracts buildFinalJsonContractInstruction', {
    includeMemoryUpdates,
    includeProductionOrders,
    includeAirActions,
    includeNavalActions,
    includeStandingOrderActions,
    coordinateMode,
  });
  const gates: EnvelopeGates = {
    coordinateMode,
    includeAirActions,
    includeMemoryUpdates,
    includeProductionOrders,
    includeStandingOrderActions: coordinateMode !== 'tactical' && includeStandingOrderActions,
  };
  const fields = envelopeFieldsForGates(gates);
  const headerSlots: Record<string, string> = {
    message: '"message": "<one-line taunt or threat>"',
    strategy: '"strategy": "<one-line>"',
    orders: '"orders": [ ... ]',
    airStrikes: '"airStrikes": [ ... ]',
    ferryOrders: '"ferryOrders": [ ... ]',
    callbacks: '"callbacks": [...]',
    memoryUpdates: '"memoryUpdates": [...]',
    productionOrders: '"productionOrders": [...]',
  };
  const submitHeader = `Submit your final JSON only (valid JSON, no comments): { ${fields
    .map((field) => headerSlots[field])
    .join(', ')} }.`;
  const strictSchemaClause =
    'Strict schema: top-level must be a JSON object with "message" (string), "strategy" (string) and "orders" (array); do not return a top-level array. The "message" field is a one-line in-character taunt or threat addressed to the human player (psychological warfare only: do not reveal real orders, hex codes, unit ids, or operational intent). The "strategy" field is a one-line summary of your plan for this turn.';
  const airUnitOrderNote = includeAirActions
    ? ' Air units never move hex by hex, so "march", "patrol", and "pursue" are rejected for them — use airStrikes for attacks, ferryOrders to reposition, or a "defend" order to keep striking targets in range'
    : '';
  const standingOrdersIssuable = coordinateMode !== 'tactical' && includeStandingOrderActions;
  const actionList = legalOrderActionsForMode(
    coordinateMode,
    includeNavalActions,
    standingOrdersIssuable
  ).join(', ');
  const sealiftActionClause = includeNavalActions
    ? ', transport_move (include "navalUnitId" and "destination" hex code), disembark (include "unitId" and "destination" hex code — clears cargo assignment then moves in one action), embark (include "unitId" and "navalUnitId")'
    : '';
  const sharedMoveFireClause = `explicit_move (include "destination": briefing hex code for this ${coordinateMode === 'tactical' ? "beat's march" : "turn's move"}; auto-debarks embarked cargo before marching), ranged_attack (include exactly one of targetHexCode or targetUnitId; ranged-only units/actions)${sealiftActionClause}`;
  const ordersClause =
    coordinateMode === 'tactical'
      ? `The "orders" array is processed in list order. Each entry includes "action" and usually "unitId". Actions: ${actionList}. ${sharedMoveFireClause}. ${TACTICAL_STANDING_ORDER_PROHIBITION}`
      : standingOrdersIssuable
        ? `The "orders" array is processed in list order. Each entry includes "action" and usually "unitId". Actions: ${actionList}. assign_order (include "order": { "type": "defend"|"march"|"pursue"|"patrol"|"hold_fire", ... } — required fields per type: "march" needs "destination" (one two-character briefing hex code); "defend" needs "defendHex" (one hex code); "patrol" needs "waypoints" (an array of two or more hex codes, visited in order then looped — a single "destination" is not a valid patrol); "pursue" needs "targetUnitId" (an enemy unit id string); "hold_fire" needs no extra fields.` +
          airUnitOrderNote +
          `), cancel_order, ${sharedMoveFireClause}. assign_order place fields are operational-map briefing hex codes, not plan_route orderToHexCode; they may be multi-turn goals. Best Options Target Hexes are this-turn dests only.`
        : `The "orders" array is processed in list order. Each entry includes "action" and usually "unitId". Actions: ${actionList}. ${sharedMoveFireClause}. Best Options Target Hexes are this-turn dests only.`;
  const airClause = includeAirActions
    ? 'Optional top-level air actions: airStrikes[] entries use { "unitId": "...", exactly one of "targetHexCode" or "targetUnitId", "targetType": "units"|"urban"|"airport"|"seaport" }, ferryOrders[] entries use { "unitId": "...", "destination": "<hex code>" }. '
    : '';
  const callbacksClause = buildCallbackContractClause(coordinateMode);
  const invalidOutputClause = buildInvalidOutputRulesClause(gates);
  const memoryLimits =
    coordinateMode !== 'tactical' && includeMemoryUpdates ? buildMemoryWriteLimitsClause() : '';
  const memoryClause = coordinateMode === 'tactical' ? '' : submitMemoryClause;
  const productionClause = coordinateMode === 'tactical' ? '' : productionSubmitClause;
  return `${submitHeader} ${strictSchemaClause} ${ordersClause} ${airClause}${invalidOutputClause}${movementOrderInstruction} ${callbacksClause}${memoryClause}${memoryLimits} ${productionClause}`;
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
  logDebug('promptContracts getFinalJsonOrdersExampleBlock', {
    includeMemoryUpdates: flags.includeMemoryUpdates,
    includeProductionOrders: flags.includeProductionOrders,
    includeAirActions,
    includeStandingOrderActions,
    coordinateMode,
  });
  const gates: EnvelopeGates = {
    coordinateMode,
    includeAirActions,
    includeMemoryUpdates: flags.includeMemoryUpdates,
    includeProductionOrders: flags.includeProductionOrders,
    includeStandingOrderActions: coordinateMode !== 'tactical' && includeStandingOrderActions,
  };
  const tactical = coordinateMode === 'tactical';
  const standingOrdersIssuable = !tactical && includeStandingOrderActions;
  const values: Record<string, unknown> = {
    message: tactical ? 'This close, hesitation is already a casualty.' : 'You will not find safety in delay.',
    strategy: tactical
      ? 'Close with observed enemies this beat using explicit moves and fire.'
      : 'Close with observed enemies and keep production moving.',
    orders: tactical || !standingOrdersIssuable
      ? [
          { action: 'explicit_move', unitId: tactical ? 'opp-parent:01' : 'example-armor-1', destination: 'CD' },
          { action: 'ranged_attack', unitId: tactical ? 'opp-parent:02' : 'example-naval-1', targetUnitId: tactical ? 'hum-parent:01' : 'example-human-1' },
        ]
      : [
          { action: 'assign_order', unitId: 'example-infantry-1', order: { type: 'march', destination: 'CD' } },
          { action: 'assign_order', unitId: 'example-naval-2', order: { type: 'patrol', waypoints: ['CD', 'CF'] } },
          { action: 'explicit_move', unitId: 'example-armor-1', destination: 'CF' },
          { action: 'ranged_attack', unitId: 'example-naval-1', targetUnitId: 'example-human-1' },
        ],
    airStrikes: [],
    ferryOrders: [],
    callbacks: [],
    memoryUpdates: [],
    productionOrders: [{ action: 'set_build_queue', hex: 'CF', unitType: 'air', count: 1 }],
  };
  const example: Record<string, unknown> = {};
  for (const field of envelopeFieldsForGates(gates)) {
    example[field] = values[field];
  }
  const json = JSON.stringify(example, null, 2);
  return (
    'Example (illustrative only — use briefing hex codes and unit ids from this operational map, not these placeholders):\n```json\n' +
    json +
    '\n```'
  );
}
