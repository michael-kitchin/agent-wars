/**
 * Per-round `tool_choice` and schema rule for the order-flow tool loop.
 *
 * Purpose: A round that forces a tool call must not carry the envelope schema, and a round that may submit the
 * envelope should. Keeping that rule in one pure function lets it be tested without the loop.
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
 * Expected outcome: `toolCall` while `tool_choice` is `required`; `orders` when no tools are offered;
 * `toolCallOrOrders` otherwise.
 * Exceptions: None.
 */
export type OrderFlowAnswerShape = 'toolCall' | 'toolCallOrOrders' | 'orders';

/**
 * Facts about the consultation and model that decide one round's request shape.
 *
 * Purpose: One object so the four inputs cannot be passed in the wrong order.
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
   * Expected outcome: Zero means no `tools` and no `tool_choice` are sent.
   * Exceptions: None.
   */
  readonly toolCount: number;
  /**
   * Whether the model has called a tool earlier in this consultation.
   *
   * Contract: `false` until the first round that returned tool calls.
   * When to use: Deciding between the forced-tool round and the envelope-eligible rounds.
   * Expected outcome: `true` allows the envelope and the schema.
   * Exceptions: None.
   */
  readonly hasCalledTool: boolean;
  /**
   * Whether this model's provider rejected `tool_choice: required` earlier in the session.
   *
   * Contract: Read from the session rejection memory.
   * When to use: Replacing `required` with `auto` before the first tool call.
   * Expected outcome: Does not change whether the schema is attached.
   * Exceptions: None.
   */
  readonly requiredToolChoiceRejected: boolean;
  /**
   * Whether this model's requests may carry `tool_choice`.
   *
   * Contract: From the consultation's request profile.
   * When to use: Omitting `tool_choice` for models that do not list it.
   * Expected outcome: `false` yields `toolChoice: null`.
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
   * Contract: `null` means send no `tool_choice` field.
   * When to use: Building the round's request body.
   * Expected outcome: `required` forces a tool call; `auto` allows a tool call or the envelope.
   * Exceptions: None.
   */
  readonly toolChoice: 'required' | 'auto' | null;
  /**
   * Which answers the round's request allows.
   *
   * Contract: Follows `toolChoice` and the tool count: `toolCall` only when `toolChoice` is `required`, `orders` only
   * when no tools are offered.
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
   * Expected outcome: The schema is still withheld when the model lacks support or rejected it this session.
   * Exceptions: None.
   */
  readonly attachResponseFormat: boolean;
}

/**
 * Picks one round's request shape.
 *
 * Purpose: Before the first tool call there is no schema, because the envelope is not a legal answer on a `required`
 * round, and some providers (Gemini) reject the schema combined with `required`. `required` on every round would
 * forbid the envelope, and the loop would use up its round cap without producing orders, so later rounds use `auto`.
 * When to use: `resolveOrderFlowRoundShape` only.
 * Expected outcome: No tools: no `tool_choice`, the schema, and only orders are legal. Otherwise the schema follows
 * `hasCalledTool`, not the `tool_choice` actually sent, so a model that rejected `required` still gets no schema before
 * its first tool call. `tool_choice` is `null` when unsupported, `auto` after a tool call or once `required` was
 * rejected, else `required`; only `required` limits the legal answer to a tool call.
 * Exceptions: None.
 */
function pickOrderFlowRoundShape(input: OrderFlowRoundShapeInput): OrderFlowRoundShape {
  const { toolCount, hasCalledTool, requiredToolChoiceRejected, toolChoiceSupported } = input;
  if (toolCount === 0) return { toolChoice: null, attachResponseFormat: true, answerShape: 'orders' };
  const attachResponseFormat = hasCalledTool;
  if (!toolChoiceSupported) return { toolChoice: null, attachResponseFormat, answerShape: 'toolCallOrOrders' };
  if (hasCalledTool || requiredToolChoiceRejected) {
    return { toolChoice: 'auto', attachResponseFormat, answerShape: 'toolCallOrOrders' };
  }
  return { toolChoice: 'required', attachResponseFormat, answerShape: 'toolCall' };
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
