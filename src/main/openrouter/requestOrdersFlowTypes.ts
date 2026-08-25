/**
 * Public TypeScript contracts for `requestOrdersFlow` inputs and outcomes.
 *
 * Purpose: Keeps large structural types out of the orchestration module so the flow file stays navigable.
 * When to use: Import from here in tests or callers that only need types; runtime exports remain on `requestOrdersFlow`.
 * Expected outcome: Stable discriminated union between success and error results.
 * Exceptions: None.
 */

import type { AirStrikeOrder, EmbarkOrder, FerryOrder } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';

/**
 * Successful OpenRouter tool-flow outcome after validation, dedupe, and optional token metadata attachment.
 *
 * Purpose: Single success shape consumed by IPC and game action layers when AI movement/support orders apply.
 * When to use: Narrow with `result.success === true` after `requestOrdersFlow` resolves.
 * Expected outcome: `orders` may be empty when the model chose only non-move tools; optional arrays omit when unused.
 * Exceptions: None.
 */
export interface RequestOrdersResult {
  /**
   * Literal success discriminant for this result variant.
   *
   * Contract: Must be `true` on every `RequestOrdersResult` value.
   * When to use: Type narrowing alongside `success: false` errors.
   * Expected outcome: TypeScript narrows to the success branch.
   * Exceptions: None.
   */
  success: true;
  /**
   * Validated movement orders (unit id → destination res0/res4 index as applicable to mode).
   *
   * Contract: Each `unitId` exists in the current state for the acting player; destinations pass the same validators as human orders.
   * When to use: Apply after a successful `requestOrdersFlow` when movement tools produced rows.
   * Expected outcome: Zero or more rows; duplicates were collapsed to last-per-unit upstream.
   * Exceptions: None.
   */
  orders: { unitId: string; toH3Index: string }[];
  /**
   * Optional ranged attack orders after validation.
   *
   * Contract: When present, each row references valid shooter and in-range target for the snapshot.
   * When to use: Tactical or strategic ranged tool outputs that survived validation.
   * Expected outcome: Omitted or empty when the model issued no ranged attacks.
   * Exceptions: None.
   */
  rangedAttacks?: { unitId: string; targetH3Index: string }[];
  /**
   * Optional air strike payloads after validation.
   *
   * Contract: Matches `AirStrikeOrder` invariants expected by combat resolution.
   * When to use: When the model returned air strike tool rows that passed validation.
   * Expected outcome: Omitted when unused.
   * Exceptions: None.
   */
  airStrikes?: AirStrikeOrder[];
  /**
   * Optional ferry orders linking carriers and cargo destinations.
   *
   * Contract: Satisfies `FerryOrder` shape expected by embark/sealift resolution.
   * When to use: Naval ferry tool outputs that survived tactical/strategic checks.
   * Expected outcome: Omitted when unused.
   * Exceptions: None.
   */
  ferryOrders?: FerryOrder[];
  /**
   * Optional embark orders assigning land units to naval transports.
   *
   * Contract: Satisfies `EmbarkOrder` invariants for the active snapshot.
   * When to use: When embark tool rows were emitted and validated.
   * Expected outcome: Omitted when unused.
   * Exceptions: None.
   */
  embarkOrders?: EmbarkOrder[];
  /**
   * Free-text strategy summary from the model when provided.
   *
   * Contract: Opaque prose for UI/logging; not parsed for mechanics.
   * When to use: Surface in dev or commander panels when present.
   * Expected outcome: Short human-readable rationale or omitted.
   * Exceptions: None.
   */
  strategy?: string;
  /**
   * One-line in-character taunt or threat from the model when provided.
   *
   * Contract: Opaque prose for the player-facing toast and later prompts; not parsed for mechanics.
   * When to use: Surface beside `strategy` after a successful consultation.
   * Expected outcome: Trimmed string or omitted when the model did not emit a message.
   * Exceptions: None.
   */
  message?: string;
  /**
   * Count of tool rows dropped during validation.
   *
   * Contract: Non-negative integer when present; aligns with `dropReasons` length when both provided.
   * When to use: Diagnostics when partial acceptance occurred.
   * Expected outcome: Omitted when nothing was dropped.
   * Exceptions: None.
   */
  dropped?: number;
  /**
   * One-line reasons parallel to dropped invalid rows.
   *
   * Contract: Human-readable; not a stable API for automation.
   * When to use: Logging and support alongside `dropped`.
   * Expected outcome: Omitted when empty.
   * Exceptions: None.
   */
  dropReasons?: string[];
  /**
   * Per-tool-name invocation counts for the completed request.
   *
   * Contract: Keys are tool names; values are non-negative integers.
   * When to use: Telemetry and cost estimation surfaces.
   * Expected outcome: Sparse map omitting unused tools is allowed.
   * Exceptions: None.
   */
  toolInvocationCounts?: Record<string, number>;
  /**
   * Provider-reported currency cost when available.
   *
   * Contract: Opaque float from billing metadata when the transport exposes it.
   * When to use: Optional accounting dashboards.
   * Expected outcome: Omitted when unknown.
   * Exceptions: None.
   */
  cost?: number;
  /**
   * Wall-clock milliseconds spent inside the flow for this request.
   *
   * Contract: Measured in the main process around network/tool work.
   * When to use: Performance logging and timeout diagnostics.
   * Expected outcome: Omitted when not measured.
   * Exceptions: None.
   */
  wallClockMs?: number;
  /**
   * Provider input token estimate when headers/body expose usage.
   *
   * Contract: Non-negative integer when present.
   * When to use: Token budgeting for prompts.
   * Expected outcome: Omitted when unknown.
   * Exceptions: None.
   */
  inputTokens?: number;
  /**
   * Provider output token estimate when headers/body expose usage.
   *
   * Contract: Non-negative integer when present.
   * When to use: Token budgeting for completions.
   * Expected outcome: Omitted when unknown.
   * Exceptions: None.
   */
  outputTokens?: number;
}

/**
 * Failure envelope when the OpenRouter request, tool loop, or post-parse validation cannot produce orders.
 *
 * Purpose: Gives UI and logs a stable `error` string without throwing across the IPC boundary.
 * When to use: Narrow with `result.success === false`.
 * Expected outcome: `error` is human-readable and safe to show in dev-facing surfaces.
 * Exceptions: None.
 */
export interface RequestOrdersError {
  /**
   * Literal failure discriminant for this result variant.
   *
   * Contract: Must be `false` on every `RequestOrdersError` value.
   * When to use: Type narrowing against successes.
   * Expected outcome: TypeScript narrows to the error branch.
   * Exceptions: None.
   */
  success: false;
  /**
   * Human-readable failure description for logs and UI.
   *
   * Contract: Non-empty string summarizing the first blocking problem.
   * When to use: Display or log when `success` is false.
   * Expected outcome: Caller can present or record the message verbatim.
   * Exceptions: None.
   */
  error: string;
}

/**
 * Optional tuning for a single `requestOrdersFlow` invocation (tool subset, abort, logging, tactical mode).
 *
 * Purpose: Passes per-request overrides without expanding the main positional parameter list.
 * When to use: Call sites pass only fields they need; omit for default full strategic tool surface.
 * Expected outcome: `tacticalAiBattle` switches validation and prompt projection to res4 tactical semantics when set.
 * Exceptions: None.
 */
export interface RequestOrdersOptions {
  /**
   * Subset of tool names enabled for this request.
   *
   * Contract: Names must match catalog entries; unknown names are ignored by downstream builders.
   * When to use: UI toggles or tests that disable expensive tools.
   * Expected outcome: Prompt and tool list reflect the intersection of flags and this list.
   * Exceptions: None.
   */
  enabledToolNames?: string[];
  /**
   * Cooperative cancellation for in-flight HTTP/tool work.
   *
   * Contract: When aborted, the flow should stop quickly and return an error-shaped result.
   * When to use: Renderer or session teardown paths.
   * Expected outcome: Fetch layers observe the signal and abort.
   * Exceptions: None.
   */
  signal?: AbortSignal;
  /**
   * Streamed log line sink for UI consoles during AI turns.
   *
   * Contract: Receives plain text lines; `isError` hints styling only.
   * When to use: When embedding the flow in a debug or commander console.
   * Expected outcome: Zero or more lines emitted during the request.
   * Exceptions: None.
   */
  onLog?: (line: string, isError?: boolean) => void;
  /**
   * Enables precomputation path that strips certain tool names from the enabled set.
   *
   * Contract: When true with no explicit tool list, defaults exclude assessment/estimation tools per internal policy.
   * When to use: Faster iterations where full tool surface is unnecessary.
   * Expected outcome: Precomputation runs when combined conditions inside the flow are met.
   * Exceptions: None.
   */
  usePrecomputation?: boolean;
  /**
   * Active tactical snapshot for res4-only AI order requests.
   *
   * Contract: When set, validation targets tactical sub-units and res4 geometry only.
   * When to use: `game:requestAiOrders` while a tactical session is active.
   * Expected outcome: Strategic production/memory tooling is omitted from prompts.
   * Exceptions: None.
   */
  tacticalAiBattle?: TacticalBattleSnapshot;
}

/**
 * One OpenAI-style chat message in the consultation transcript.
 *
 * Purpose: Shared by the tool loop and the parse-repair exchange so those modules do not each invent a message shape.
 * When to use: The `messages` array in `requestOrdersFlow` and the extracted loop/repair helpers.
 * Expected outcome: Discriminated by `role`; tool results carry `tool_call_id`.
 * Exceptions: None.
 */
export type RequestOrdersChatMessage =
  | {
      /**
       * System-prompt role.
       *
       * Contract: Exactly `'system'`.
       * When to use: The first message in the consultation.
       * Expected outcome: Carries the assembled system prompt.
       * Exceptions: None.
       */
      readonly role: 'system';
      /**
       * System prompt body.
       *
       * Contract: Non-empty assembled prompt string.
       * When to use: Built by `buildSystemPromptForTools`.
       * Expected outcome: The model reads this as the rules and briefing.
       * Exceptions: None.
       */
      readonly content: string;
    }
  | {
      /**
       * User-turn role.
       *
       * Contract: Exactly `'user'`.
       * When to use: Opening message, malformed-completion correction, and repair request.
       * Expected outcome: The current instruction for this user turn.
       * Exceptions: None.
       */
      readonly role: 'user';
      /**
       * User message body.
       *
       * Contract: Plain text.
       * When to use: Opening and repair user turns.
       * Expected outcome: The model treats this as the current instruction.
       * Exceptions: None.
       */
      readonly content: string;
    }
  | {
      /**
       * Assistant-turn role.
       *
       * Contract: Exactly `'assistant'`.
       * When to use: Model replies, including those that only contain tool calls.
       * Expected outcome: `content` may be null when the turn is tool-only.
       * Exceptions: None.
       */
      readonly role: 'assistant';
      /**
       * Assistant text, if any.
       *
       * Contract: Null when the turn is tool-call-only.
       * When to use: Final JSON or intermediate commentary.
       * Expected outcome: Final-json turns have a string; tool turns may be null.
       * Exceptions: None.
       */
      readonly content: string | null;
      /**
       * Tool calls requested this turn.
       *
       * Contract: OpenAI function-call shape.
       * When to use: When the model asked for tools instead of final JSON.
       * Expected outcome: Omitted when the model submitted text.
       * Exceptions: None.
       */
      readonly tool_calls?: ReadonlyArray<{
        readonly id: string;
        readonly type: 'function';
        readonly function: { readonly name: string; readonly arguments: string };
      }>;
    }
  | {
      /**
       * Tool-result role.
       *
       * Contract: Exactly `'tool'`.
       * When to use: After executing a requested tool.
       * Expected outcome: `content` is JSON text the model can read.
       * Exceptions: None.
       */
      readonly role: 'tool';
      /**
       * Id matching the assistant's tool call.
       *
       * Contract: Must equal the `id` from the corresponding `tool_calls` entry.
       * When to use: Every tool result row.
       * Expected outcome: The provider can pair result with request.
       * Exceptions: None.
       */
      readonly tool_call_id: string;
      /**
       * Tool result body.
       *
       * Contract: JSON string.
       * When to use: Encoded tool output.
       * Expected outcome: The model sees the same encoding as other tool results.
       * Exceptions: None.
       */
      readonly content: string;
    };
