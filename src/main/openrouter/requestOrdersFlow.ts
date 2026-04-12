import * as fs from 'fs';
import * as path from 'path';
import { cellToLatLng } from 'h3-js';
import type { AirStrikeOrder, EmbarkOrder, FerryOrder } from '../../shared/ipcTypes';
import { buildLatLngCoordinateMap } from '../mapData';
import { logDebug, logError } from '../logger';
import { buildJsonAssistantRepairSchema, parseOrdersResponse } from './orderResponseParsing';
import { createPathfindingSession, executeTool1 } from '../tools/tool1Pathfinding';
import { executeTool2 } from '../tools/tool2Assessment';
import { executeTool3 } from '../tools/tool3CombatEstimation';
import { executeTool4, getInjectionText } from '../tools/tool4Memory';
import { executeTool5, getInjectionText as getStandingOrderInjectionText, generateOrdersForStandingOrders } from '../tools/tool5StandingOrders';
import { executeTool6 } from '../tools/tool6Production';
import { runPrecomputation } from '../precomputation';
import { formatBriefing } from '../briefingFormatter';
import { getSubscriptions, replaceSubscriptions } from '../callbackSubscriptions';
import {
  clearAiLossEventsSinceConsultation,
  getAiLossEventsSinceConsultation,
  setAiLastConsultationTurn,
  setAiToolLimitExceededLastTurn,
} from '../gameDb';
import type { GameStateSnapshot } from '../gameDb';
import { buildProductionBriefingBlock } from './briefingSections';
import { getInitialUserMessage } from './promptText';
import { TOOL2_NAMES } from '../tools/tool2Assessment';
import { TOOL3_NAMES } from '../tools/tool3CombatEstimation';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { buildTacticalAiPlanState } from '../tacticalBattle/buildTacticalAiPlanState';
import { applyMovementOrdersToPlanState } from '../tacticalBattle/tacticalPlanStateMovement';
import { projectTacticalSnapshotAfterOpponentMovementOrders } from '../tacticalBattle/tacticalMovementApply';
import {
  validateTacticalOpponentAirStrikeOrder,
  validateTacticalOpponentEmbarkOrder,
  validateTacticalOpponentFerryOrder,
} from '../tacticalBattle/tacticalOpponentOrderValidation';
import { buildTacticalAiOrdersContextBlock } from './tacticalPromptProjection';

/**
 * Documents the `ChatMessage` type alias (type ChatMessage).

 * Purpose: Supports maintainability by documenting why `ChatMessage` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type ChatMessage =
  | {   /**
   * Specifies the contract for the `role` member (role: 'system';).

   * Contract: Describes stable behavior for callers of `role` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
role: 'system';   /**
   * Specifies the contract for the `content` member (content: string).

   * Contract: Describes stable behavior for callers of `content` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
content: string }
  | {   /**
   * Specifies the contract for the `role` member (role: 'user';).

   * Contract: Describes stable behavior for callers of `role` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
role: 'user';   /**
   * Specifies the contract for the `content` member (content: string).

   * Contract: Describes stable behavior for callers of `content` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
content: string }
  | {   /**
   * Specifies the contract for the `role` member (role: 'assistant';).

   * Contract: Describes stable behavior for callers of `role` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
role: 'assistant';   /**
   * Specifies the contract for the `content` member (content: string | null;).

   * Contract: Describes stable behavior for callers of `content` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
content: string | null;   /**
   * Specifies the contract for the `tool_calls` member (tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>).

   * Contract: Describes stable behavior for callers of `tool_calls` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | {   /**
   * Specifies the contract for the `role` member (role: 'tool';).

   * Contract: Describes stable behavior for callers of `role` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
role: 'tool';   /**
   * Specifies the contract for the `tool_call_id` member (tool_call_id: string;).

   * Contract: Describes stable behavior for callers of `tool_call_id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
tool_call_id: string;   /**
   * Specifies the contract for the `content` member (content: string).

   * Contract: Describes stable behavior for callers of `content` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
content: string };

/**
 * Documents the `RequestOrdersResult` interface as a named contract surface (export interface RequestOrdersResult).

 * Purpose: Supports maintainability by documenting why `RequestOrdersResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface RequestOrdersResult {
    /**
   * Specifies the contract for the `success` member (success: true;).

   * Contract: Describes stable behavior for callers of `success` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
success: true;
    /**
   * Specifies the contract for the `orders` member (orders: { unitId: string; toH3Index: string }[];).

   * Contract: Describes stable behavior for callers of `orders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
orders: { unitId: string; toH3Index: string }[];
    /**
   * Specifies the contract for the `rangedAttacks` member (rangedAttacks?: { unitId: string; targetH3Index: string }[];).

   * Contract: Describes stable behavior for callers of `rangedAttacks` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rangedAttacks?: { unitId: string; targetH3Index: string }[];
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
}

/**
 * Documents the `RequestOrdersError` interface as a named contract surface (export interface RequestOrdersError).

 * Purpose: Supports maintainability by documenting why `RequestOrdersError` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface RequestOrdersError {
    /**
   * Specifies the contract for the `success` member (success: false;).

   * Contract: Describes stable behavior for callers of `success` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
success: false;
    /**
   * Specifies the contract for the `error` member (error: string;).

   * Contract: Describes stable behavior for callers of `error` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
error: string;
}

/**
 * Documents the `RequestOrdersOptions` interface as a named contract surface (export interface RequestOrdersOptions).

 * Purpose: Supports maintainability by documenting why `RequestOrdersOptions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface RequestOrdersOptions {
    /**
   * Specifies the contract for the `enabledToolNames` member (enabledToolNames?: string[];).

   * Contract: Describes stable behavior for callers of `enabledToolNames` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
enabledToolNames?: string[];
    /**
   * Specifies the contract for the `signal` member (signal?: AbortSignal;).

   * Contract: Describes stable behavior for callers of `signal` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
signal?: AbortSignal;
    /**
   * Specifies the contract for the `onLog` member (onLog?: (line: string, isError?: boolean) => void;).

   * Contract: Describes stable behavior for callers of `onLog` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
onLog?: (line: string, isError?: boolean) => void;
    /**
   * Specifies the contract for the `usePrecomputation` member (usePrecomputation?: boolean;).

   * Contract: Describes stable behavior for callers of `usePrecomputation` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  usePrecomputation?: boolean;
    /**
   * Specifies the contract for the `tacticalAiBattle` member (tacticalAiBattle?: TacticalBattleSnapshot;).

   * Contract: When set, requestOrders runs against a res4-only plan state and omits strategic production/memory tooling from the prompt.
   * When to use: `game:requestAiOrders` while a milestone-2.1 tactical session is active in the main process.
   * Expected outcome: Movement validation targets tactical sub-unit ids and res4 destinations only.
   * Exceptions: None.
   */
tacticalAiBattle?: TacticalBattleSnapshot;
}

/**
 * Documents the module-scope binding `FULL_PROMPT_LOG_PREVIEW_CHARS` (FULL_PROMPT_LOG_PREVIEW_CHARS).

 * Purpose: Supports maintainability by documenting why `FULL_PROMPT_LOG_PREVIEW_CHARS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const FULL_PROMPT_LOG_PREVIEW_CHARS = 1200;
/**
 * Documents the module-scope binding `FULL_PROMPT_LOG_ENV_FLAG` (FULL_PROMPT_LOG_ENV_FLAG).

 * Purpose: Supports maintainability by documenting why `FULL_PROMPT_LOG_ENV_FLAG` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const FULL_PROMPT_LOG_ENV_FLAG = 'AGENT_WARS_LOG_FULL_PROMPTS';
/**
 * Documents the module-scope binding `FULL_RESPONSE_LOG_PREVIEW_CHARS` (FULL_RESPONSE_LOG_PREVIEW_CHARS).

 * Purpose: Supports maintainability by documenting why `FULL_RESPONSE_LOG_PREVIEW_CHARS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const FULL_RESPONSE_LOG_PREVIEW_CHARS = 1200;
/**
 * Documents the module-scope binding `FULL_RESPONSE_LOG_ENV_FLAG` (FULL_RESPONSE_LOG_ENV_FLAG).

 * Purpose: Supports maintainability by documenting why `FULL_RESPONSE_LOG_ENV_FLAG` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const FULL_RESPONSE_LOG_ENV_FLAG = 'AGENT_WARS_LOG_FULL_RESPONSES';
/**
 * Documents the module-scope binding `REQUEST_ORDERS_MAX_WALL_CLOCK_MS` (REQUEST_ORDERS_MAX_WALL_CLOCK_MS).

 * Purpose: Supports maintainability by documenting why `REQUEST_ORDERS_MAX_WALL_CLOCK_MS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const REQUEST_ORDERS_MAX_WALL_CLOCK_MS = 90_000;

/**
 * Documents the `AiPathfindingSessionMetrics` interface as a named contract surface (interface AiPathfindingSessionMetrics).

 * Purpose: Supports maintainability by documenting why `AiPathfindingSessionMetrics` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface AiPathfindingSessionMetrics {
    /**
   * Specifies the contract for the `created` member (created: number;).

   * Contract: Describes stable behavior for callers of `created` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
created: number;
    /**
   * Specifies the contract for the `reused` member (reused: number;).

   * Contract: Describes stable behavior for callers of `reused` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
reused: number;
    /**
   * Specifies the contract for the `planRouteToolCalls` member (planRouteToolCalls: number;).

   * Contract: Describes stable behavior for callers of `planRouteToolCalls` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
planRouteToolCalls: number;
    /**
   * Specifies the contract for the `checkDistanceToolCalls` member (checkDistanceToolCalls: number;).

   * Contract: Describes stable behavior for callers of `checkDistanceToolCalls` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
checkDistanceToolCalls: number;
    /**
   * Specifies the contract for the `totalToolCalls` member (totalToolCalls: number;).

   * Contract: Describes stable behavior for callers of `totalToolCalls` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
totalToolCalls: number;
}

/**
 * Documents the `AiPathfindingTurnAggregateMetrics` interface as a named contract surface (interface AiPathfindingTurnAggregateMetrics extends AiPathfindingSessionMetrics).

 * Purpose: Supports maintainability by documenting why `AiPathfindingTurnAggregateMetrics` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface AiPathfindingTurnAggregateMetrics extends AiPathfindingSessionMetrics {
    /**
   * Specifies the contract for the `turnNumber` member (turnNumber: number;).

   * Contract: Describes stable behavior for callers of `turnNumber` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnNumber: number;
    /**
   * Specifies the contract for the `requestCount` member (requestCount: number;).

   * Contract: Describes stable behavior for callers of `requestCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
requestCount: number;
}

/**
 * Documents the module-scope binding `aiPathfindingTurnAggregateMetrics` (aiPathfindingTurnAggregateMetrics: AiPathfindingTurnAggregateMetrics).

 * Purpose: Supports maintainability by documenting why `aiPathfindingTurnAggregateMetrics` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const aiPathfindingTurnAggregateMetrics: AiPathfindingTurnAggregateMetrics = {
    /**
   * Documents the object literal property `turnNumber` (turnNumber: -1).

   * Purpose: Supports maintainability by documenting why `turnNumber` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnNumber: -1,
    /**
   * Documents the object literal property `requestCount` (requestCount: 0).

   * Purpose: Supports maintainability by documenting why `requestCount` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
requestCount: 0,
    /**
   * Documents the object literal property `created` (created: 0).

   * Purpose: Supports maintainability by documenting why `created` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
created: 0,
    /**
   * Documents the object literal property `reused` (reused: 0).

   * Purpose: Supports maintainability by documenting why `reused` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
reused: 0,
    /**
   * Documents the object literal property `planRouteToolCalls` (planRouteToolCalls: 0).

   * Purpose: Supports maintainability by documenting why `planRouteToolCalls` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
planRouteToolCalls: 0,
    /**
   * Documents the object literal property `checkDistanceToolCalls` (checkDistanceToolCalls: 0).

   * Purpose: Supports maintainability by documenting why `checkDistanceToolCalls` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
checkDistanceToolCalls: 0,
    /**
   * Documents the object literal property `totalToolCalls` (totalToolCalls: 0).

   * Purpose: Supports maintainability by documenting why `totalToolCalls` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
totalToolCalls: 0,
};

/**
 * Defines the `getAiPathfindingTurnAggregateMetrics` function shape (function getAiPathfindingTurnAggregateMetrics(turnNumber: number): AiPathfindingTurnAggregateMetrics).

 * Purpose: Supports maintainability by documenting why `getAiPathfindingTurnAggregateMetrics` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getAiPathfindingTurnAggregateMetrics(turnNumber: number): AiPathfindingTurnAggregateMetrics {
  if (aiPathfindingTurnAggregateMetrics.turnNumber !== turnNumber) {
    aiPathfindingTurnAggregateMetrics.turnNumber = turnNumber;
    aiPathfindingTurnAggregateMetrics.requestCount = 0;
    aiPathfindingTurnAggregateMetrics.created = 0;
    aiPathfindingTurnAggregateMetrics.reused = 0;
    aiPathfindingTurnAggregateMetrics.planRouteToolCalls = 0;
    aiPathfindingTurnAggregateMetrics.checkDistanceToolCalls = 0;
    aiPathfindingTurnAggregateMetrics.totalToolCalls = 0;
  }
  return aiPathfindingTurnAggregateMetrics;
}

/**
 * Defines the `isFullLogEnvEnabled` function shape (function isFullLogEnvEnabled(flagName: string): boolean).

 * Purpose: Supports maintainability by documenting why `isFullLogEnvEnabled` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isFullLogEnvEnabled(flagName: string): boolean {
  let v = process.env[flagName]?.trim();
  if (v === undefined || v.length === 0) return false;
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  const lower = v.toLowerCase();
  return lower === '1' || lower === 'true' || lower === 'yes' || lower === 'on';
}

/**
 * Defines the `writeFullLogArtifact` function shape (function writeFullLogArtifact(fileName: string, content: string): string | null).

 * Purpose: Supports maintainability by documenting why `writeFullLogArtifact` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function writeFullLogArtifact(fileName: string, content: string): string | null {
  const absPath = path.join(process.cwd(), fileName);
  try {
    fs.writeFileSync(absPath, content, 'utf8');
    return absPath;
  } catch (err) {
    logError('openRouter requestOrders: failed to write full-log artifact', { fileName, err });
    return null;
  }
}

/**
 * Defines the `logPromptPreview` function shape (function logPromptPreview(label: string, content: string): void).

 * Purpose: Supports maintainability by documenting why `logPromptPreview` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function logPromptPreview(label: string, content: string): void {
  const fullPromptLoggingEnabled = isFullLogEnvEnabled(FULL_PROMPT_LOG_ENV_FLAG);
  if (fullPromptLoggingEnabled) {
    const fileName = label.includes('user message')
      ? 'debug-last-user-prompt.txt'
      : 'debug-last-system-prompt.txt';
    const absPath = writeFullLogArtifact(fileName, content);
    logDebug(`${label} (full)`, { chars: content.length, writtenTo: absPath ?? '(write failed)' });
    return;
  }
  const preview = content.slice(0, FULL_PROMPT_LOG_PREVIEW_CHARS);
  logDebug(`${label} (preview)`, {
    preview,
    truncated: content.length > FULL_PROMPT_LOG_PREVIEW_CHARS,
    chars: content.length,
    fullLogEnvFlag: FULL_PROMPT_LOG_ENV_FLAG,
  });
}

/**
 * Defines the `logResponsePreview` function shape (function logResponsePreview(label: string, content: string): void).

 * Purpose: Supports maintainability by documenting why `logResponsePreview` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function logResponsePreview(label: string, content: string): void {
  const fullResponseLoggingEnabled = isFullLogEnvEnabled(FULL_RESPONSE_LOG_ENV_FLAG);
  if (fullResponseLoggingEnabled) {
    const absPath = writeFullLogArtifact('debug-last-openrouter-response-body.txt', content);
    logDebug(`${label} (full)`, { chars: content.length, writtenTo: absPath ?? '(write failed)' });
    return;
  }
  const preview = content.slice(0, FULL_RESPONSE_LOG_PREVIEW_CHARS);
  logDebug(`${label} (preview)`, {
    preview,
    truncated: content.length > FULL_RESPONSE_LOG_PREVIEW_CHARS,
    chars: content.length,
    fullLogEnvFlag: FULL_RESPONSE_LOG_ENV_FLAG,
  });
}

/**
 * Documents the `RequestOrdersFlowDeps` interface as a named contract surface (interface RequestOrdersFlowDeps).

 * Purpose: Supports maintainability by documenting why `RequestOrdersFlowDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface RequestOrdersFlowDeps {
    /**
   * Specifies the contract for the `loadKey` member (loadKey: () => string;).

   * Contract: Describes stable behavior for callers of `loadKey` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
loadKey: () => string;
    /**
   * Specifies the contract for the `getToolFlags` member (getToolFlags: (enabledToolNames: string[] | undefined) => { planningEnabled: boolean; assessmentEnabled: boolean; estimationEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `getToolFlags` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getToolFlags: (enabledToolNames: string[] | undefined) => {
    planningEnabled: boolean;
    assessmentEnabled: boolean;
    estimationEnabled: boolean;
    ordersEnabled: boolean;
    memoryEnabled: boolean;
    productionEnabled: boolean;
    fallbackMovementEnabled: boolean;
  };
    /**
   * Specifies the contract for the `toolGroupRegistry` member (toolGroupRegistry: { id: string; toolNames: readonly string[] }[];).

   * Contract: Describes stable behavior for callers of `toolGroupRegistry` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
toolGroupRegistry: { id: string; toolNames: readonly string[] }[];
    /**
   * Specifies the contract for the `buildSystemPromptForTools` member (buildSystemPromptForTools: ( state: GameStateSnapshot, coordMap: { latLngByH3: Map<string, [number, number]>; format: (h3: string) => st).

   * Contract: Describes stable behavior for callers of `buildSystemPromptForTools` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
buildSystemPromptForTools: (
    state: GameStateSnapshot,
    coordMap: {
      latLngByH3: Map<string, [number, number]>;
      format: (h3: string) => string;
      resolveToH3: (lat: number, lng: number) => string | undefined;
    },
    enabledToolNames?: string[],
    briefingOverride?: string
  ) => string;
    /**
   * Specifies the contract for the `buildToolDefinitions` member (buildToolDefinitions: (enabledToolNames?: string[]) => Array<{ type: 'function'; function: { name: string; description: string; parameters: { type: 'o).

   * Contract: Describes stable behavior for callers of `buildToolDefinitions` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
buildToolDefinitions: (enabledToolNames?: string[]) => Array<{
    type: 'function';
    function: { name: string; description: string; parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] } };
  }>;
    /**
   * Specifies the contract for the `postOpenRouterChatWithTimeoutAndRetry` member (postOpenRouterChatWithTimeoutAndRetry: (payload: { key: string; body: Record<string, unknown>; signal?: AbortSignal; onLog?: (line: string,).

   * Contract: Describes stable behavior for callers of `postOpenRouterChatWithTimeoutAndRetry` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
postOpenRouterChatWithTimeoutAndRetry: (payload: {
    key: string;
    body: Record<string, unknown>;
    signal?: AbortSignal;
    onLog?: (line: string, isError?: boolean) => void;
    requestLabel: string;
  }) => Promise<{ ok: true; status: number; headers: Record<string, string>; bodyText: string } | { ok: false; error: string }>;
    /**
   * Specifies the contract for the `getGroupIdForToolName` member (getGroupIdForToolName: (toolName: string) => string | undefined;).

   * Contract: Describes stable behavior for callers of `getGroupIdForToolName` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getGroupIdForToolName: (toolName: string) => string | undefined;
    /**
   * Specifies the contract for the `validateAiOrder` member (validateAiOrder: (order: { unitId: string; toH3Index: string }, state: GameStateSnapshot) => { valid: true } | { valid: false; reason: string };).

   * Contract: Describes stable behavior for callers of `validateAiOrder` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
validateAiOrder: (order: { unitId: string; toH3Index: string }, state: GameStateSnapshot) => { valid: true } | { valid: false; reason: string };
    /**
   * Specifies the contract for the `validateAiRangedOrder` member (validateAiRangedOrder: ( order: { unitId: string; targetH3Index: string }, state: GameStateSnapshot ) => { valid: true } | { valid: false; reason:).

   * Contract: Describes stable behavior for callers of `validateAiRangedOrder` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
validateAiRangedOrder: (
    order: { unitId: string; targetH3Index: string },
    state: GameStateSnapshot
  ) => { valid: true } | { valid: false; reason: string };
    /**
   * Specifies the contract for the `formatLatLng` member (formatLatLng: (ll: [number, number]) => string;).

   * Contract: Describes stable behavior for callers of `formatLatLng` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
formatLatLng: (ll: [number, number]) => string;
}

/**
 * Defines the `dedupeByUnitKeepLast` function shape (function dedupeByUnitKeepLast<T extends).

 * Purpose: Supports maintainability by documenting why `dedupeByUnitKeepLast` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function dedupeByUnitKeepLast<T extends { unitId: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const keptReversed: T[] = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    if (seen.has(row.unitId)) continue;
    seen.add(row.unitId);
    keptReversed.push(row);
  }
  keptReversed.reverse();
  return keptReversed;
}

/**
 * Defines the `requestOrdersFlow` function shape (export async function requestOrdersFlow( deps: RequestOrdersFlowDeps, state: GameStateSnapshot, modelId: string, options?: RequestOrdersOptions ):).

 * Purpose: Supports maintainability by documenting why `requestOrdersFlow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function requestOrdersFlow(
  deps: RequestOrdersFlowDeps,
  state: GameStateSnapshot,
  modelId: string,
  options?: RequestOrdersOptions
): Promise<RequestOrdersResult | RequestOrdersError> {
  const {
    loadKey,
    getToolFlags,
    toolGroupRegistry,
    buildSystemPromptForTools,
    buildToolDefinitions,
    postOpenRouterChatWithTimeoutAndRetry,
    getGroupIdForToolName,
    validateAiOrder,
    validateAiRangedOrder,
    formatLatLng,
  } = deps;

  const tacticalBattle = options?.tacticalAiBattle;
  const requestedToolNames = options?.enabledToolNames;
  const signal = options?.signal;
  const onLog = options?.onLog;
  const usePrecomputation = tacticalBattle ? false : options?.usePrecomputation === true;
  const precomputationExcluded = new Set<string>([...TOOL2_NAMES, ...TOOL3_NAMES]);
  let enabledToolNames: string[] | undefined =
    usePrecomputation && requestedToolNames !== undefined
      ? requestedToolNames.filter((n) => !precomputationExcluded.has(n))
      : usePrecomputation && requestedToolNames === undefined
        ? toolGroupRegistry.flatMap((g) => [...g.toolNames]).filter((n) => !precomputationExcluded.has(n))
        : requestedToolNames;
  if (tacticalBattle) {
    const stripStrategicOnlyTools = (names: string[]): string[] =>
      names.filter((n) => {
        const g = getGroupIdForToolName(n);
        return g !== 'memory' && g !== 'production';
      });
    enabledToolNames =
      enabledToolNames !== undefined
        ? stripStrategicOnlyTools(enabledToolNames)
        : stripStrategicOnlyTools(toolGroupRegistry.flatMap((g) => [...g.toolNames]));
    logDebug('openRouter requestOrders tactical tool filter applied', {
      battleId: tacticalBattle.battleId,
      enabledToolCount: enabledToolNames.length,
    });
  }
  const planState = tacticalBattle ? buildTacticalAiPlanState(state, tacticalBattle) : state;
  if (onLog) onLog('Requesting AI orders…');
  logDebug('openRouter requestOrders', {
    modelId,
    turnNumber: state.turnNumber,
    enabledToolsRequested: requestedToolNames === undefined ? 'all' : requestedToolNames.length,
    enabledToolsEffective: enabledToolNames === undefined ? 'all' : enabledToolNames.length,
    usePrecomputation,
    filteredForPrecomputation: usePrecomputation,
    tacticalAiBattle: tacticalBattle ? tacticalBattle.battleId : null,
  });
  const key = loadKey();
  const failRequest = (error: string): RequestOrdersError => {
    return { success: false, error };
  };
  if (!key) {
    logError('openRouter requestOrders: no API key');
    if (onLog) onLog('No API key set.', true);
    return failRequest('No API key set');
  }
  if (!modelId.trim()) {
    logError('openRouter requestOrders: no model selected');
    if (onLog) onLog('No model selected.', true);
    return failRequest('No model selected');
  }

  const opponentUnits = planState.units.filter((u) => u.player === 'opponent');
  if (opponentUnits.length === 0) {
    logDebug('openRouter requestOrders: no opponent units remain, skipping LLM call');
    if (onLog) onLog('No opponent units remain.');
    return { success: true, orders: [] };
  }

  const hexList = planState.hexes.map((h) => h.h3Index);
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
  const coordMap = {
    latLngByH3,
    resolveToH3,
    format: (h3: string) => {
      const ll = latLngByH3.get(h3);
      if (ll) return formatLatLng(ll);
      const [lat, lng] = cellToLatLng(h3);
      return formatLatLng([lat, lng]);
    },
  };
  let aiPlanningPathfindingSession: ReturnType<typeof createPathfindingSession> | null = null;
  const aiPathfindingSessionMetrics: AiPathfindingSessionMetrics = {
    created: 0,
    reused: 0,
    planRouteToolCalls: 0,
    checkDistanceToolCalls: 0,
    totalToolCalls: 0,
  };
  const getOrCreateAiPlanningPathfindingSession = (): ReturnType<typeof createPathfindingSession> => {
    if (aiPlanningPathfindingSession) {
      aiPathfindingSessionMetrics.reused += 1;
      return aiPlanningPathfindingSession;
    }
    aiPlanningPathfindingSession = createPathfindingSession(planState, latLngByH3, resolveToH3);
    aiPathfindingSessionMetrics.created += 1;
    return aiPlanningPathfindingSession;
  };
  const aiTurnAggregateMetrics = getAiPathfindingTurnAggregateMetrics(state.turnNumber);

  const flags = getToolFlags(enabledToolNames);
  const enabledToolNameSet =
    enabledToolNames === undefined
      ? new Set(toolGroupRegistry.flatMap((g) => [...g.toolNames]))
      : new Set(enabledToolNames);
  if (flags.ordersEnabled && !flags.planningEnabled) {
    logDebug(
      'openRouter requestOrders: Orders enabled but Planning disabled; AI may be unable to produce movement orders. Enable Planning alongside Orders.'
    );
  }

  const toolInvocationCounts: Record<string, number> = {};
  for (const g of toolGroupRegistry) toolInvocationCounts[g.id] = 0;
  const lossesSinceLastConsultation = getAiLossEventsSinceConsultation('opponent');

  let briefingOverride: string | undefined;
  if (usePrecomputation) {
    const precomputed = runPrecomputation(state, { latLngByH3, resolveToH3 });
    toolInvocationCounts['precomputation'] =
      precomputed.unitAssessments.length + precomputed.hexAssessments.length;
    const standingOrderText = getStandingOrderInjectionText('opponent', state);
    const memoryText = getInjectionText('opponent', state.turnNumber);
    const subscriptions = getSubscriptions('opponent');
    const productionBriefing = getToolFlags(enabledToolNames).productionEnabled
      ? buildProductionBriefingBlock({
          productionEnabled: getToolFlags(enabledToolNames).productionEnabled,
          state,
          latLngByH3,
          resolveToH3,
          formatLatLng,
        })
      : '';
    briefingOverride = formatBriefing(
      state,
      precomputed,
      standingOrderText,
      memoryText,
      subscriptions,
      lossesSinceLastConsultation,
      productionBriefing
    );
    logDebug('openRouter requestOrders: pre-computation ran', {
      briefingLength: briefingOverride.length,
      unitAssessments: precomputed.unitAssessments.length,
      precomputationCount: toolInvocationCounts['precomputation'],
    });
  }
  let systemPrompt = buildSystemPromptForTools(planState, coordMap, enabledToolNames, briefingOverride);
  if (tacticalBattle) {
    systemPrompt = `${buildTacticalAiOrdersContextBlock(tacticalBattle)}\n\n${systemPrompt}`;
  }
  const userMessage = getInitialUserMessage(flags, briefingOverride != null && briefingOverride.length > 0);

  const tools = buildToolDefinitions(enabledToolNames);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  logDebug('openRouter requestOrders: system prompt prepared', { chars: systemPrompt.length });
  logDebug('openRouter requestOrders: user message prepared', { chars: userMessage.length });
  logPromptPreview('openRouter requestOrders: system prompt', systemPrompt);
  logPromptPreview('openRouter requestOrders: user message', userMessage);
  logDebug('openRouter requestOrders: starting tool loop', { turnNumber: state.turnNumber });

  const wallClockStart = Date.now();
  let requestCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const markSuccessfulConsultation = (): void => {
    setAiLastConsultationTurn(state.turnNumber);
    clearAiLossEventsSinceConsultation('opponent');
  };
  try {
    let iteration = 0;
    let parseRepairAttempted = false;
    while (iteration < 50) {
      if (Date.now() - wallClockStart > REQUEST_ORDERS_MAX_WALL_CLOCK_MS) {
        const timeoutMsg = 'AI planning took too long and was cancelled. Please try again.';
        if (onLog) onLog(timeoutMsg, true);
        logError('openRouter requestOrders: wall-clock budget exceeded', {
          maxWallClockMs: REQUEST_ORDERS_MAX_WALL_CLOCK_MS,
          iteration,
          turnNumber: state.turnNumber,
        });
        return failRequest(timeoutMsg);
      }
      iteration++;
      const body: Record<string, unknown> = {
        model: modelId,
        messages,
        max_tokens: 2048,
        tools,
        tool_choice: 'auto',
      };

      const chatResponse = await postOpenRouterChatWithTimeoutAndRetry({
        key,
        body,
        signal,
        onLog,
        requestLabel: 'requestOrders',
      });
      if (!chatResponse.ok) {
        if (onLog && chatResponse.error !== 'Cancelled') onLog(chatResponse.error, true);
        return failRequest(chatResponse.error);
      }
      logResponsePreview('openRouter requestOrders: raw response body', chatResponse.bodyText);
      let json: {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
          };
        }>;
        usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
      };
      try {
        const responseText = chatResponse.bodyText;
        json = JSON.parse(responseText) as {
          choices?: Array<{
            message?: {
              content?: string | null;
              tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
            };
          }>;
          usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
        };
      } catch {
        const errorMessage = 'AI response was not valid JSON. Please try again.';
        if (onLog) onLog(errorMessage, true);
        return failRequest(errorMessage);
      }
      requestCost += json.usage?.cost ?? 0;
      totalInputTokens += json.usage?.prompt_tokens ?? 0;
      totalOutputTokens += json.usage?.completion_tokens ?? 0;
      const assistantMessage = json.choices?.[0]?.message;
      if (!assistantMessage) return failRequest('Invalid response: no message');

      const toolCalls = assistantMessage.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: assistantMessage.content ?? null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        });
        for (const tc of toolCalls) {
          const toolName = tc.function.name;
          if (!enabledToolNameSet.has(toolName)) {
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify({ status: 'error', error: `Tool ${toolName} is disabled.` }),
            });
            continue;
          }
          let args: unknown;
          try {
            args = JSON.parse(tc.function.arguments || '{}');
          } catch {
            args = {};
          }
          const isPathfindingTool = toolName === 'plan_route' || toolName === 'check_distance';
          if (toolName === 'plan_route') aiPathfindingSessionMetrics.planRouteToolCalls += 1;
          if (toolName === 'check_distance') aiPathfindingSessionMetrics.checkDistanceToolCalls += 1;
          aiPathfindingSessionMetrics.totalToolCalls += 1;
          const toolState = tacticalBattle ? planState : state;
          const result = (toolName.includes('order') || toolName.includes('standing'))
            ? executeTool5(toolName, args, toolState, latLngByH3, resolveToH3)
            : (toolName.includes('build') || toolName.includes('production') || toolName.includes('query_production'))
              ? executeTool6(toolName, args, toolState, latLngByH3, resolveToH3)
              : toolName.includes('memory')
                ? executeTool4(toolName, args, toolState, latLngByH3, resolveToH3)
                : toolName.includes('estimate')
                  ? executeTool3(toolName, args, toolState, latLngByH3, resolveToH3)
                  : toolName.includes('assess')
                    ? executeTool2(toolName, args, toolState, latLngByH3, resolveToH3)
                    : executeTool1(
                        toolName,
                        args,
                        toolState,
                        latLngByH3,
                        resolveToH3,
                        isPathfindingTool ? getOrCreateAiPlanningPathfindingSession() : undefined
                      );
          const resultStr = JSON.stringify(result);
          messages.push({ role: 'tool', tool_call_id: tc.id, content: resultStr });
          const groupId = getGroupIdForToolName(toolName);
          if (groupId !== undefined) toolInvocationCounts[groupId] = (toolInvocationCounts[groupId] ?? 0) + 1;
        }
        continue;
      }

      const content = assistantMessage.content;
      if (typeof content !== 'string' || !content.trim()) {
        return failRequest('Invalid response: no content');
      }
      const productionEnabledForParse = tacticalBattle ? false : flags.productionEnabled;
      let parsed = parseOrdersResponse(content, resolveToH3, planState, latLngByH3, productionEnabledForParse);
      if (!parsed && !parseRepairAttempted) {
        parseRepairAttempted = true;
        const repairMessages: ChatMessage[] = [
          ...messages,
          { role: 'assistant', content },
          {
            role: 'user',
            content:
              `Your previous response was not parseable JSON. Reply now with JSON only (no prose, no markdown, no code fences) using exactly this top-level object schema (orders[] only; no movementOrders/rangedAttacks; never a top-level array): ${buildJsonAssistantRepairSchema(productionEnabledForParse)}. Omit optional arrays when empty.`,
          },
        ];
        const repairResponse = await postOpenRouterChatWithTimeoutAndRetry({
          key,
          body: { model: modelId, messages: repairMessages, max_tokens: 1024, tool_choice: 'none' },
          signal,
          onLog,
          requestLabel: 'requestOrders repair',
        });
        if (repairResponse.ok) {
          const repairText = repairResponse.bodyText;
          logResponsePreview('openRouter requestOrders repair: raw response body', repairText);
          const repairJson = JSON.parse(repairText) as {
            choices?: Array<{ message?: { content?: string | null } }>;
            usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
          };
          requestCost += repairJson.usage?.cost ?? 0;
          totalInputTokens += repairJson.usage?.prompt_tokens ?? 0;
          totalOutputTokens += repairJson.usage?.completion_tokens ?? 0;
          const repairContent = repairJson.choices?.[0]?.message?.content;
          if (typeof repairContent === 'string' && repairContent.trim()) {
            parsed = parseOrdersResponse(repairContent, resolveToH3, planState, latLngByH3, productionEnabledForParse);
          }
        }
      }
      if (!parsed) return failRequest('Invalid response: could not parse orders');

      if (parsed.callbacks?.length) replaceSubscriptions('opponent', parsed.callbacks, state.turnNumber);
      toolInvocationCounts['events'] = parsed.callbacks?.length ?? 0;

      const { movementOrders: standingOrderMovement, rangedAttacks: standingOrderRanged } =
        flags.ordersEnabled && !tacticalBattle
          ? generateOrdersForStandingOrders('opponent', state, latLngByH3, resolveToH3)
          : { movementOrders: [] as { unitId: string; toH3Index: string }[], rangedAttacks: [] as { unitId: string; targetH3Index: string }[] };
      const llmMovementOrders = dedupeByUnitKeepLast(parsed.movementOrders ?? []);
      const llmRangedOrders = dedupeByUnitKeepLast(parsed.rangedAttacks ?? []);
      const llmAirStrikes = dedupeByUnitKeepLast(parsed.airStrikes ?? []);
      const llmFerryOrders = dedupeByUnitKeepLast(parsed.ferryOrders ?? []);
      const llmEmbarkOrders = dedupeByUnitKeepLast(parsed.embarkOrders ?? []);
      const llmMovementByUnit = new Map(llmMovementOrders.map((o) => [o.unitId, o.toH3Index]));
      const llmMovementUnitIds = new Set(llmMovementOrders.map((o) => o.unitId));
      const mergedMovement = [...standingOrderMovement.filter((o) => !llmMovementUnitIds.has(o.unitId)), ...llmMovementOrders];
      const llmRangedUnitIds = new Set(llmRangedOrders.map((r) => r.unitId));
      const mergedRanged = [...standingOrderRanged.filter((o) => !llmRangedUnitIds.has(o.unitId)), ...llmRangedOrders];

      const validated: { unitId: string; toH3Index: string }[] = [];
      const dropReasons: string[] = [...(parsed.dropReasons ?? [])];
      const invalidStandingMovementUnits = new Set<string>();
      const seenUnits = new Set<string>();
      for (const order of mergedMovement) {
        if (seenUnits.has(order.unitId)) {
          dropReasons.push(`Duplicate order for ${order.unitId}`);
          continue;
        }
        const result = validateAiOrder(order, planState);
        if (result.valid) {
          validated.push(order);
          seenUnits.add(order.unitId);
        } else {
          const sourceIsLlmOverride = llmMovementUnitIds.has(order.unitId);
          const hasStandingForUnit = standingOrderMovement.some((o) => o.unitId === order.unitId);
          if (!sourceIsLlmOverride && hasStandingForUnit && result.reason === 'Invalid distance') {
            invalidStandingMovementUnits.add(order.unitId);
            continue;
          }
          dropReasons.push(`${order.unitId} -> ${order.toH3Index}: ${result.reason}`);
        }
      }
      if (flags.ordersEnabled && invalidStandingMovementUnits.size > 0 && !tacticalBattle) {
        for (const unitId of invalidStandingMovementUnits) {
          executeTool5('cancel_order', { unitId }, state, latLngByH3, resolveToH3);
        }
      }

      const planAfterMove =
        tacticalBattle && validated.length > 0
          ? applyMovementOrdersToPlanState(planState, validated)
          : planState;

      const validatedRanged: { unitId: string; targetH3Index: string }[] = [];
      const seenRanged = new Set<string>();
      const rangedState = tacticalBattle ? planAfterMove : planState;
      for (const r of mergedRanged) {
        if (seenRanged.has(r.unitId)) {
          dropReasons.push(`Duplicate ranged for ${r.unitId}`);
          continue;
        }
        const result = validateAiRangedOrder(r, rangedState);
        if (result.valid) {
          validatedRanged.push(r);
          seenRanged.add(r.unitId);
        } else {
          if (!tacticalBattle && result.reason === 'Target out of range') {
            const movedTo = llmMovementByUnit.get(r.unitId);
            if (movedTo && movedTo === r.targetH3Index) continue;
          }
          dropReasons.push(`Ranged ${r.unitId} -> ${r.targetH3Index}: ${result.reason}`);
        }
      }

      let outAir = llmAirStrikes;
      let outFerry = llmFerryOrders;
      let outEmbark = llmEmbarkOrders;
      if (tacticalBattle) {
        const movementProjected =
          validated.length > 0
            ? projectTacticalSnapshotAfterOpponentMovementOrders(tacticalBattle, validated)
            : tacticalBattle;
        const validatedAir: AirStrikeOrder[] = [];
        const seenStrike = new Set<string>();
        for (const s of llmAirStrikes) {
          if (seenStrike.has(s.unitId)) {
            dropReasons.push(`Duplicate air strike for ${s.unitId}`);
            continue;
          }
          const vr = validateTacticalOpponentAirStrikeOrder(s, planAfterMove);
          if (vr.valid) {
            validatedAir.push(s);
            seenStrike.add(s.unitId);
          } else {
            dropReasons.push(`Air strike ${s.unitId}: ${vr.reason}`);
          }
        }
        const strikeIds = new Set(validatedAir.map((s) => s.unitId));
        const validatedFerry: FerryOrder[] = [];
        const seenFerry = new Set<string>();
        for (const f of llmFerryOrders) {
          if (seenFerry.has(f.unitId)) {
            dropReasons.push(`Duplicate ferry for ${f.unitId}`);
            continue;
          }
          if (strikeIds.has(f.unitId)) {
            dropReasons.push(`Air unit ${f.unitId} cannot strike and ferry in the same tactical turn`);
            continue;
          }
          const fr = validateTacticalOpponentFerryOrder(f, planAfterMove);
          if (fr.valid) {
            validatedFerry.push(f);
            seenFerry.add(f.unitId);
          } else {
            dropReasons.push(`Ferry ${f.unitId}: ${fr.reason}`);
          }
        }
        const validatedEmb: EmbarkOrder[] = [];
        const seenEmbarkLand = new Set<string>();
        for (const e of llmEmbarkOrders) {
          if (seenEmbarkLand.has(e.unitId)) {
            dropReasons.push(`Duplicate embark for ${e.unitId}`);
            continue;
          }
          const er = validateTacticalOpponentEmbarkOrder(e, movementProjected.subUnits);
          if (er.valid) {
            validatedEmb.push(e);
            seenEmbarkLand.add(e.unitId);
          } else {
            dropReasons.push(`Embark ${e.unitId}: ${er.reason}`);
          }
        }
        outAir = validatedAir;
        outFerry = validatedFerry;
        outEmbark = validatedEmb;
      }

      markSuccessfulConsultation();
      return {
        success: true,
        orders: validated,
        rangedAttacks: validatedRanged.length > 0 ? validatedRanged : undefined,
        airStrikes: outAir.length > 0 ? outAir : undefined,
        ferryOrders: outFerry.length > 0 ? outFerry : undefined,
        embarkOrders: outEmbark.length > 0 ? outEmbark : undefined,
        strategy: parsed.strategy,
        dropped: dropReasons.length,
        dropReasons: dropReasons.length > 0 ? dropReasons : undefined,
        toolInvocationCounts,
        cost: requestCost > 0 ? requestCost : undefined,
        wallClockMs: Date.now() - wallClockStart,
        inputTokens: totalInputTokens > 0 ? totalInputTokens : undefined,
        outputTokens: totalOutputTokens > 0 ? totalOutputTokens : undefined,
      };
    }
    setAiToolLimitExceededLastTurn();
    markSuccessfulConsultation();
    return {
      success: true,
      orders: [],
      dropped: 0,
      toolInvocationCounts,
      cost: requestCost > 0 ? requestCost : undefined,
      wallClockMs: Date.now() - wallClockStart,
      inputTokens: totalInputTokens > 0 ? totalInputTokens : undefined,
      outputTokens: totalOutputTokens > 0 ? totalOutputTokens : undefined,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      if (onLog) onLog('Cancelled.');
      return failRequest('Cancelled');
    }
    logError('openRouter requestOrders: exception', err);
    if (onLog) onLog(String(err), true);
    return failRequest(String(err));
  } finally {
    aiTurnAggregateMetrics.requestCount += 1;
    aiTurnAggregateMetrics.created += aiPathfindingSessionMetrics.created;
    aiTurnAggregateMetrics.reused += aiPathfindingSessionMetrics.reused;
    aiTurnAggregateMetrics.planRouteToolCalls += aiPathfindingSessionMetrics.planRouteToolCalls;
    aiTurnAggregateMetrics.checkDistanceToolCalls += aiPathfindingSessionMetrics.checkDistanceToolCalls;
    aiTurnAggregateMetrics.totalToolCalls += aiPathfindingSessionMetrics.totalToolCalls;
    logDebug('openRouter requestOrders: pathfinding session metrics', {
      turnNumber: state.turnNumber,
      modelId,
      requestMetrics: aiPathfindingSessionMetrics,
      turnAggregateMetrics: {
        turnNumber: aiTurnAggregateMetrics.turnNumber,
        requestCount: aiTurnAggregateMetrics.requestCount,
        created: aiTurnAggregateMetrics.created,
        reused: aiTurnAggregateMetrics.reused,
        planRouteToolCalls: aiTurnAggregateMetrics.planRouteToolCalls,
        checkDistanceToolCalls: aiTurnAggregateMetrics.checkDistanceToolCalls,
        totalToolCalls: aiTurnAggregateMetrics.totalToolCalls,
      },
    });
  }
}
