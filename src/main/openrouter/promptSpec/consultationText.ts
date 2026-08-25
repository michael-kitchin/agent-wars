/**
 * Submit-only user messages for the opening turn and the parse-repair request.
 *
 * Purpose: The system prompt owns every rule. These messages only say what to do now and which envelope
 * fields to emit. consultation-flow.md sections 2 and 5.
 * When to use: `requestOrdersFlow` for the opening user turn; `runParseRepairExchange` for the repair copy.
 * Expected outcome: No production doctrine, cap rules, memory-write instruction, or option-copy mapping
 * beyond one action clause. The tactical opening repeats `TACTICAL_STANDING_ORDER_PROHIBITION` identically.
 * Exceptions: None.
 */

import { logDebug } from '../../logger';
import {
  TACTICAL_STANDING_ORDER_PROHIBITION,
  buildRepairSchemaText,
  envelopeFieldsForGates,
  type EnvelopeGates,
  type PromptCoordinateMode,
} from './envelopeContract';

/**
 * Gates that select the opening-message branch and the envelope field list.
 *
 * Purpose: One object so the opening message cannot advertise a field the envelope contract omits.
 * When to use: Built from tool flags, mode, briefing presence, and roster.
 * Expected outcome: Tactical mode never names memory or production tails.
 * Exceptions: None.
 */
export interface OpeningMessageGates {
  /**
   * Strategic turn versus tactical beat.
   *
   * Contract: Selects the briefing-present planning branch and whether the standing-order prohibition is appended.
   * When to use: From `coordinateContext.mode`.
   * Expected outcome: `'strategic'` or `'tactical'`.
   * Exceptions: None.
   */
  readonly coordinateMode: PromptCoordinateMode;
  /**
   * Whether routing tools are enabled.
   *
   * Contract: Selects the planning-on branches versus standing-order / fallback / empty-orders branches.
   * When to use: From `getToolFlags().planningEnabled`.
   * Expected outcome: False never tells the model to call `plan_route`.
   * Exceptions: None.
   */
  readonly planningEnabled: boolean;
  /**
   * Whether standing-order tools are enabled.
   *
   * Contract: Strategic briefing-present branch may point at the orderless table only when this is true.
   * When to use: From `getToolFlags().ordersEnabled`. Ignored in tactical mode.
   * Expected outcome: False omits the orderless one-clause pointer.
   * Exceptions: None.
   */
  readonly ordersEnabled: boolean;
  /**
   * Whether memory tools are enabled.
   *
   * Contract: Controls whether `memoryUpdates` is named in the envelope list.
   * When to use: From `getToolFlags().memoryEnabled`. Ignored in tactical mode.
   * Expected outcome: The opening message names the tail; it does not restate memory-write doctrine.
   * Exceptions: None.
   */
  readonly memoryEnabled: boolean;
  /**
   * Whether production tools are enabled.
   *
   * Contract: Controls whether `productionOrders` is named in the envelope list.
   * When to use: From `getToolFlags().productionEnabled`. Ignored in tactical mode.
   * Expected outcome: The opening message names the tail; it does not restate queue doctrine.
   * Exceptions: None.
   */
  readonly productionEnabled: boolean;
  /**
   * Whether the adjacent-cell fallback listing is in the system prompt.
   *
   * Contract: Used when planning and standing orders are both off.
   * When to use: From `getToolFlags().fallbackMovementEnabled`.
   * Expected outcome: True points at the fallback listing; false accepts an empty `orders` array.
   * Exceptions: None.
   */
  readonly fallbackMovementEnabled: boolean;
  /**
   * Whether a commander briefing is attached.
   *
   * Contract: Planning-on branches distinguish briefing-present from tools-as-destination-source.
   * When to use: True when `briefingOverride` is non-empty.
   * Expected outcome: False never tells the model to copy Best Options rows.
   * Exceptions: None.
   */
  readonly hasBriefing: boolean;
  /**
   * Whether the opponent roster includes air units.
   *
   * Contract: Air and ferry tails are named only when they appear in `envelopeFieldsForGates`.
   * When to use: Same air check as the system prompt.
   * Expected outcome: False omits `airStrikes` and `ferryOrders` from the field list.
   * Exceptions: None.
   */
  readonly hasAirUnits: boolean;
  /**
   * Whether the briefing includes a Best Options table with rows.
   *
   * Contract: Copy-row wording is forbidden when the table is absent.
   * When to use: True when the briefing contains the Best Options heading.
   * Expected outcome: False points at the routing tool instead of an absent table.
   * Exceptions: None.
   */
  readonly hasBestOptionsTable: boolean;
}

/**
 * Builds the EnvelopeGates implied by an opening-message gate object.
 *
 * Purpose: The field list in the user message must match the system contract.
 * When to use: Inside `buildOpeningUserMessage`.
 * Expected outcome: Tactical drops memory, production, and standing-order actions.
 * Exceptions: None.
 */
function envelopeGatesFromOpening(gates: OpeningMessageGates): EnvelopeGates {
  const tactical = gates.coordinateMode === 'tactical';
  return {
    coordinateMode: gates.coordinateMode,
    includeAirActions: gates.hasAirUnits,
    includeMemoryUpdates: gates.memoryEnabled && !tactical,
    includeProductionOrders: gates.productionEnabled && !tactical,
    includeStandingOrderActions: gates.ordersEnabled && !tactical,
  };
}

/**
 * Formats envelope keys as a quoted list in canonical order.
 *
 * Purpose: Item 3 of the opening-message contract is the field list, not a restated schema.
 * When to use: After `envelopeFieldsForGates`.
 * Expected outcome: `"message", "strategy", "orders", ...` with optional tails only when gated on.
 * Exceptions: None.
 */
function formatQuotedEnvelopeFields(gates: EnvelopeGates): string {
  return envelopeFieldsForGates(gates).map((field) => `"${field}"`).join(', ');
}

/**
 * One-clause action for this period, per consultation-flow.md section 2.2.
 *
 * Purpose: The opening message may point at options or tools, but must not restate the copy-row mapping.
 * When to use: Second sentence of `buildOpeningUserMessage`.
 * Expected outcome: A single clause (or two when the orderless pointer applies).
 * Exceptions: None.
 */
function buildOpeningActionClause(gates: OpeningMessageGates): string {
  if (gates.planningEnabled && gates.hasBriefing) {
    if (gates.coordinateMode === 'tactical') {
      if (!gates.hasBestOptionsTable) {
        return 'No options are listed this period; use the routing tool for destinations.';
      }
      return 'Give every sub-unit with a move or approach option a move order, copying its target; use the routing tool only for an unlisted destination.';
    }
    const optionsClause = gates.hasBestOptionsTable
      ? 'Copy option targets into the matching envelope field; use the routing tool only for an unlisted destination.'
      : 'No options are listed this period; use the routing tool for destinations.';
    const orderlessClause =
      gates.ordersEnabled
        ? ' Give the units in the orderless table standing orders.'
        : '';
    return optionsClause + orderlessClause;
  }
  if (gates.planningEnabled && !gates.hasBriefing) {
    return 'Use the listed tools to derive destinations; there is no options table.';
  }
  if (!gates.planningEnabled && gates.ordersEnabled) {
    return 'Movement planning is unavailable; issue missions as standing orders in the envelope and leave movement empty.';
  }
  if (!gates.planningEnabled && !gates.ordersEnabled && gates.fallbackMovementEnabled) {
    return 'Use the fallback adjacent-cell listing in the system prompt as the only source of move destinations.';
  }
  return 'Point at the briefing and submit an empty orders array if you have no legal moves.';
}

/**
 * Builds the opening user message for this consultation.
 *
 * Purpose: Submit-only: situation, action, envelope fields — no restated rules.
 * When to use: The first user turn after the system prompt.
 * Expected outcome: Three parts in order. Tactical appends `TACTICAL_STANDING_ORDER_PROHIBITION`.
 * Exceptions: None.
 */
export function buildOpeningUserMessage(gates: OpeningMessageGates): string {
  logDebug('promptSpec buildOpeningUserMessage', { ...gates });
  const envelope = envelopeGatesFromOpening(gates);
  const fields = formatQuotedEnvelopeFields(envelope);
  const situation = gates.hasBriefing
    ? "Use the Commander's Briefing in the system prompt above."
    : 'Use the tools listed in the system prompt above.';
  const action = buildOpeningActionClause(gates);
  const envelopeClause = `Then submit JSON with ${fields}.`;
  const tacticalBan =
    gates.coordinateMode === 'tactical' ? ` ${TACTICAL_STANDING_ORDER_PROHIBITION}` : '';
  return `${situation} ${action} ${envelopeClause}${tacticalBan}`;
}

/**
 * Builds the parse-repair user message.
 *
 * Purpose: consultation-flow.md section 5: three submit clauses, the inlined schema, and the two shape constraints.
 * When to use: The repair copy's user turn. Must not be appended to the main transcript.
 * Expected outcome: JSON-only instruction plus `buildRepairSchemaText`; no game rules.
 * Exceptions: None.
 */
export function buildRepairRequestMessage(gates: EnvelopeGates): string {
  logDebug('promptSpec buildRepairRequestMessage', { ...gates });
  return (
    'Your previous response was not parseable JSON. Reply now with JSON only (no prose, no markdown, no code fences) ' +
    `using exactly this top-level object schema: ${buildRepairSchemaText(gates)}. Omit optional arrays when empty.`
  );
}
