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
