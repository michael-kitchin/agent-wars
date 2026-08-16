import type {
  AirStrikeOrder,
  EmbarkOrder,
  FerryOrder,
  MovementOrder,
  RangedAttackOrder,
} from './ordersTypes';
import type { TacticalBattleSnapshot } from './tacticalTypes';
import type { TacticalOpponentPlanPayload } from './readyTypes';

/**
 * Documents the `OpenRouterModel` interface as a named contract surface (export interface OpenRouterModel).

 * Purpose: Supports maintainability by documenting why `OpenRouterModel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface OpenRouterModel {
    /**
   * Specifies the contract for the `id` member (id: string;).

   * Contract: Describes stable behavior for callers of `id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
id: string;
    /**
   * Specifies the contract for the `name` member (name?: string;).

   * Contract: Describes stable behavior for callers of `name` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
name?: string;
  /**
   * Optional model blurb from OpenRouter for the Model-tab description tooltip.

   * Contract: Trimmed plain text when present; whitespace-only values should be omitted by mappers.
   * When to use: Selected-model tooltip on the closed `#openrouter-model` select.
   * Expected outcome: Callers show trimmed text via `textContent`; missing/empty means no tooltip.
   * Exceptions: None.
   */
  description?: string;
  /**
   * Optional per-token USD pricing used to build the dropdown cost suffix.

   * Contract: `prompt` / `completion` are string forms of finite numbers when present.
   * When to use: `formatModelOptionSuffix` when building Model-tab option labels.
   * Expected outcome: Usable rates contribute to `$/…M`; both missing/invalid omits the cost part.
   * Exceptions: None.
   */
  pricing?: {
    /**
     * Per-token USD prompt rate as a decimal string when known.

     * Contract: Finite numeric string when set; invalid values are ignored by formatters.
     * When to use: Cost part of the model option suffix.
     * Expected outcome: Parsed with `Number` and summed with `completion` when usable.
     * Exceptions: None.
     */
    prompt?: string;
    /**
     * Per-token USD completion rate as a decimal string when known.

     * Contract: Finite numeric string when set; invalid values are ignored by formatters.
     * When to use: Cost part of the model option suffix.
     * Expected outcome: Parsed with `Number` and summed with `prompt` when usable.
     * Exceptions: None.
     */
    completion?: string;
  };
  /**
   * Optional reasoning defaults used for the Model-tab reasoning suffix phrase.

   * Contract: `default_effort` is a trimmed string when set; `default_enabled` / `mandatory` are booleans when set.
   * When to use: `formatModelOptionSuffix` for Model-tab option labels.
   * Expected outcome: Drives `reasoning: <effort>` / `reasoning: default` when on; omits the part when off/unknown.
   * Exceptions: None.
   */
  reasoning?: {
    /**
     * Default reasoning effort label from OpenRouter when provided.

     * Contract: Trimmed non-empty string when set.
     * When to use: Value after `reasoning:` when reasoning is on by default or mandatory.
     * Expected outcome: `reasoning: high` style phrases; omitted value yields `reasoning: default`.
     * Exceptions: None.
     */
    default_effort?: string;
    /**
     * Whether reasoning is enabled by default for this model.

     * Contract: Strict boolean when set (`=== true` / `=== false` only).
     * When to use: With `mandatory` to choose the on-style reasoning phrase vs omitting it.
     * Expected outcome: `true` (or mandatory) → on phrase; off/unknown → omit reasoning part.
     * Exceptions: None.
     */
    default_enabled?: boolean;
    /**
     * Whether reasoning cannot be disabled for this model.

     * Contract: Strict boolean when set; `true` forces the on-style reasoning suffix phrase.
     * When to use: OpenRouter `reasoning.mandatory` from the models list API.
     * Expected outcome: Treated like enabled-for-display when formatting the option suffix.
     * Exceptions: None.
     */
    mandatory?: boolean;
  };
}

/**
 * Documents the `RequestAiOrdersResult` type alias (export type RequestAiOrdersResult).

 * Purpose: Supports maintainability by documenting why `RequestAiOrdersResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type RequestAiOrdersResult =
  | {
            /**
       * Specifies the contract for the `success` member (success: true;).

       * Contract: Describes stable behavior for callers of `success` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
success: true;
            /**
       * Specifies the contract for the `orders` member (orders: MovementOrder[];).

       * Contract: Describes stable behavior for callers of `orders` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
orders: MovementOrder[];
            /**
       * Specifies the contract for the `rangedAttacks` member (rangedAttacks?: RangedAttackOrder[];).

       * Contract: Describes stable behavior for callers of `rangedAttacks` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
rangedAttacks?: RangedAttackOrder[];
            /**
       * Specifies the contract for the `airStrikes` member (airStrikes?: AirStrikeOrder[];).

       * Contract: Describes stable behavior for callers of `airStrikes` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
airStrikes?: AirStrikeOrder[];
            /**
       * Specifies the contract for the `ferryOrders` member (ferryOrders?: FerryOrder[];).

       * Contract: Describes stable behavior for callers of `ferryOrders` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
ferryOrders?: FerryOrder[];
            /**
       * Specifies the contract for the `embarkOrders` member (embarkOrders?: EmbarkOrder[];).

       * Contract: Describes stable behavior for callers of `embarkOrders` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
embarkOrders?: EmbarkOrder[];
            /**
       * Specifies the contract for the `strategy` member (strategy?: string;).

       * Contract: Describes stable behavior for callers of `strategy` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
strategy?: string;
            /**
       * One-line in-character taunt or threat from the model when provided.

       * Contract: Opaque prose for the player-facing toast and later prompts; not parsed for mechanics.
       * When to use: Surface beside `strategy` after a successful consultation.
       * Expected outcome: Trimmed string or omitted when the model did not emit a message.
       * Exceptions: None.
       */
message?: string;
            /**
       * Specifies the contract for the `dropped` member (dropped?: number;).

       * Contract: Describes stable behavior for callers of `dropped` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
dropped?: number;
            /**
       * Specifies the contract for the `dropReasons` member (dropReasons?: string[];).

       * Contract: Describes stable behavior for callers of `dropReasons` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
dropReasons?: string[];
            /**
       * Specifies the contract for the `toolInvocationCounts` member (toolInvocationCounts?: Record<string, number>;).

       * Contract: Describes stable behavior for callers of `toolInvocationCounts` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
toolInvocationCounts?: Record<string, number>;
            /**
       * Specifies the contract for the `cost` member (cost?: number;).

       * Contract: Describes stable behavior for callers of `cost` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
cost?: number;
            /**
       * Specifies the contract for the `wallClockMs` member (wallClockMs?: number;).

       * Contract: Describes stable behavior for callers of `wallClockMs` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
wallClockMs?: number;
            /**
       * Specifies the contract for the `inputTokens` member (inputTokens?: number;).

       * Contract: Describes stable behavior for callers of `inputTokens` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
inputTokens?: number;
            /**
       * Specifies the contract for the `outputTokens` member (outputTokens?: number;).

       * Contract: Describes stable behavior for callers of `outputTokens` in this codebase.
       * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
       * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
       * Exceptions: None.
       */
outputTokens?: number;
            /**
       * Specifies the contract for the `tacticalBattle` member (tacticalBattle?: TacticalBattleSnapshot;).

       * Contract: Present after a successful `requestAiOrders` during an active tactical session as the authoritative committed snapshot (unchanged until tactical Ready applies buffered plans).
       * When to use: Renderer refreshes `S.tacticalBattleSnapshot` when provided; combined with `tacticalOpponentPlan` for strategic-style scheduling.
       * Expected outcome: Same shape as `getActiveTacticalBattleSnapshot`; may match the pre-request snapshot when only buffering opponent drafts.
       * Exceptions: None.
       */
tacticalBattle?: TacticalBattleSnapshot;
            /**
       * Specifies the contract for the `tacticalOpponentPlan` member (tacticalOpponentPlan?: TacticalOpponentPlanPayload;).

       * Contract: Present on successful tactical AI consultations: opponent orders to apply on the next tactical Ready, replacing any prior buffer (see tactical–strategic alignment plan D5).
       * When to use: Renderer stores this as `S.tacticalOpponentDraft` until Ready commits it alongside human drafts.
       * Expected outcome: Normalized arrays; may be all-empty when the model returned no applicable opponent rows.
       * Exceptions: None.
       */
tacticalOpponentPlan?: TacticalOpponentPlanPayload;
    }
  | {   /**
   * Specifies the contract for the `success` member (success: false;).

   * Contract: Describes stable behavior for callers of `success` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
success: false;   /**
   * Specifies the contract for the `error` member (error: string).

   * Contract: Describes stable behavior for callers of `error` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
error: string };
