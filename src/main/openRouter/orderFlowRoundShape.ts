/**
 * Per-round `tool_choice` and schema rule for the order-flow tool loop.
 *
 * Purpose: A consultation that offers tools lets the model call one or submit the envelope on every round.
 * Keeping that rule in one pure function lets it be tested without the loop.
 * When to use: Once per tool-loop round, including malformed-completion retries. The repair call does not use it.
 * Expected outcome: The `tool_choice` to send (or none), whether the schema may be attached, and which answers are
 * legal on the round.
 * Exceptions: None.
 */

import { logTrace } from '../logger';

/**
 * The answers a model may legally give on one tool-loop round.
 *
 * Purpose: Lets the malformed-completion note ask only for an answer the request allows.
 * When to use: `OrderFlowRoundShape.answerShape` and `buildMalformedCompletionCorrectiveMessage`.
 * Expected outcome: The resolver returns `orders` when no tools are offered and `toolCallOrOrders` otherwise.
 * `toolCall` is honored by the corrective-message builder if a caller passes it. The order loop does not.
 * Exceptions: None.
 */
export type OrderFlowAnswerShape = 'toolCall' | 'toolCallOrOrders' | 'orders';

/**
 * Facts about the consultation and model that decide one round's request shape.
 *
 * Purpose: One object so the tool count and the `tool_choice` support flag cannot be passed in the wrong order.
 * When to use: Built by the tool loop before each round.
 * Expected outcome: Read only by `resolveOrderFlowRoundShape`.
 * Exceptions: None.
 */
export interface OrderFlowRoundShapeInput {
  /**
   * Number of tools offered this consultation.
   *
   * Contract: Zero when the player turned every tool group off or the model does not support tools.
   * When to use: Deciding whether the round offers tools at all.
   * Expected outcome: Zero means no `tools` and no `tool_choice` are sent, and only the envelope is legal.
   * Exceptions: None.
   */
  readonly toolCount: number;
  /**
   * Whether this model's requests may carry `tool_choice`.
   *
   * Contract: From the consultation's request profile.
   * When to use: Omitting `tool_choice` for models that do not list it.
   * Expected outcome: `false` yields `toolChoice: null` while the tools and the schema are still sent.
   * Exceptions: None.
   */
  readonly toolChoiceSupported: boolean;
}

/**
 * Request shape for one tool-loop round.
 *
 * Purpose: Carries the per-round decisions from the resolver to the request body and the malformed-completion note.
 * When to use: Returned by `resolveOrderFlowRoundShape`.
 * Expected outcome: Immutable for the round.
 * Exceptions: None.
 */
export interface OrderFlowRoundShape {
  /**
   * `tool_choice` to send this round.
   *
   * Contract: `null` means send no `tool_choice` field. The resolver does not return `required`.
   * When to use: Building the round's request body.
   * Expected outcome: `auto` allows a tool call or the envelope on every round that offers tools.
   * Exceptions: None.
   */
  readonly toolChoice: 'auto' | null;
  /**
   * Which answers the round's request allows.
   *
   * Contract: `orders` when no tools are offered, otherwise `toolCallOrOrders`.
   * When to use: The malformed-completion corrective note.
   * Expected outcome: The note never asks for an answer the provider will refuse or cannot produce.
   * Exceptions: None.
   */
  readonly answerShape: OrderFlowAnswerShape;
  /**
   * Whether the envelope schema may be attached this round.
   *
   * Contract: Passed to `postOrdersChatRequest` as `attachResponseFormat`.
   * When to use: Each round's chat request.
   * Expected outcome: True on every tool-loop round. The request helper still withholds the schema when the model
   * lacks support or rejected it this session.
   * Exceptions: None.
   */
  readonly attachResponseFormat: boolean;
}

/**
 * Picks one round's request shape.
 *
 * Purpose: The briefing already lists the legal moves, so a round must not force a tool call before the model may
 * submit the envelope. `auto` allows either answer, and the schema rides along because it is legal beside `auto`.
 * When to use: `resolveOrderFlowRoundShape` only.
 * Expected outcome: No tools: no `tool_choice`, the schema, and only orders are legal. Tools with `tool_choice`
 * support: `auto`, the schema, and either answer. Tools without that support: no `tool_choice`, the schema, and
 * either answer.
 * Exceptions: None.
 */
function pickOrderFlowRoundShape(input: OrderFlowRoundShapeInput): OrderFlowRoundShape {
  const { toolCount, toolChoiceSupported } = input;
  if (toolCount === 0) return { toolChoice: null, attachResponseFormat: true, answerShape: 'orders' };
  if (!toolChoiceSupported) return { toolChoice: null, attachResponseFormat: true, answerShape: 'toolCallOrOrders' };
  return { toolChoice: 'auto', attachResponseFormat: true, answerShape: 'toolCallOrOrders' };
}

/**
 * Resolves the `tool_choice`, schema, and legal-answer decision for one order-flow round.
 *
 * Purpose: Single entry point the tool loop calls each round, with a trace of the inputs and the decision.
 * When to use: Every tool-loop round, including malformed-completion retries. Not the repair call.
 * Expected outcome: The shape described on `pickOrderFlowRoundShape`.
 * Exceptions: None.
 */
export function resolveOrderFlowRoundShape(input: OrderFlowRoundShapeInput): OrderFlowRoundShape {
  const shape = pickOrderFlowRoundShape(input);
  logTrace('orderFlowRoundShape resolveOrderFlowRoundShape', { ...input, ...shape });
  return shape;
}
