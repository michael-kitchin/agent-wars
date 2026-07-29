import { cellToLatLng } from 'h3-js';
import { isLikelyAbortError } from '../../shared/abortError';
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
import { formatTacticalBriefing } from './formatTacticalBriefing';
import { resetHexControllerParityCheckDedupForTurn } from '../snapshotDbParity';
import { buildPossibleActionsIndexedState } from './possibleUnitActions';
import { getSubscriptions } from '../callbackSubscriptions';
import { applyParsedOpponentCallbackSubscriptions } from './applyParsedOpponentCallbacks';
import {
  clearAiLossEventsSinceConsultation,
  setAiLastConsultationTurn,
  setAiToolLimitExceededLastTurn,
  upsertTurnStrategyNote,
} from '../gameDb';
import type { GameStateSnapshot } from '../gameDb';
import { buildProductionBriefingBlock } from './briefingSections';
import { getInitialUserMessage } from './promptText';
import {
  OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS,
  resolveEffectiveOpenRouterCompletionMaxTokens,
} from './openRouterCreditLimits';
import { TOOL2_NAMES } from '../tools/tool2Assessment';
import { TOOL3_NAMES } from '../tools/tool3CombatEstimation';
import { buildTacticalAiPlanState } from '../tacticalBattle/buildTacticalAiPlanState';
import { applyMovementOrdersToPlanState } from '../tacticalBattle/tacticalPlanStateMovement';
import { projectTacticalSnapshotAfterOpponentMovementOrders } from '../tacticalBattle/tacticalMovementApply';
import {
  validateTacticalOpponentAirStrikeOrder,
  validateTacticalOpponentEmbarkOrder,
  validateTacticalOpponentFerryOrder,
} from '../tacticalBattle/tacticalOpponentOrderValidation';
import { tacticalComputeMovementOrderOutcome } from '../tacticalBattle/tacticalSnapshotGuards';
import { buildStrategicOperationalMapSectionMarkdown } from '../briefing/map/briefing-map-section';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { ensureStrategicCoordinateRegistryInitialized, initTacticalCoordinateRegistry } from '../briefing/map/hex-coordinates';
import { decodeOpenRouterToolArgsForExecution } from './openRouterToolArgsHex';
import { encodeOpenRouterToolResultForLlm } from './openRouterToolResultHex';
import { h3ToCode } from '../briefing/map/hex-code-translator';
import { buildStrategicUnitDisplayLabelResolver, tacticalSubUnitLabelForUserMessage } from '../../shared/unitDisplayNames';
import type { RequestOrdersFlowDeps } from './requestOrdersFlowDepsTypes';
import type { RequestOrdersError, RequestOrdersOptions, RequestOrdersResult } from './requestOrdersFlowTypes';
import {
  REQUEST_ORDERS_MAX_WALL_CLOCK_MS,
  dedupeByUnitKeepLast,
  finalizeRequestOrdersPathfindingMetrics,
  getAiPathfindingTurnAggregateMetrics,
  isAgentWarsFullPromptLoggingEnabled,
  logPromptPreview,
  logResponsePreview,
  type AiPathfindingSessionMetrics,
} from './requestOrdersFlowSupport';
import { maybeApplyTacticalLightPrecomputeToolAllowlist } from './tacticalLightPrecompute';

export type { RequestOrdersError, RequestOrdersOptions, RequestOrdersResult } from './requestOrdersFlowTypes';

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
 * Builds a concise comma-separated tool-name list for the OpenRouter sidebar log.
 *
 * Purpose: Keeps per-round log lines readable when the model issues many parallel tool calls.
 * When to use: After each assistant message in `requestOrdersFlow` that includes `tool_calls`.
 * Expected outcome: Single-line fragment; truncates with a count suffix when the list exceeds `maxNames`.
 * Exceptions: None.
 */
function summarizeToolCallNamesForAiLog(
  toolCalls: ReadonlyArray<{ function: { name: string } }>,
  maxNames: number
): string {
  const names = toolCalls.map((tc) => tc.function.name);
  if (names.length <= maxNames) return names.join(', ');
  return `${names.slice(0, maxNames).join(', ')} (+${names.length - maxNames} more)`;
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
    const assessmentToolNames = new Set<string>([...TOOL2_NAMES, ...TOOL3_NAMES]);
    const stripTacticalDisallowedTools = (names: string[]): string[] =>
      names.filter((n) => {
        if (assessmentToolNames.has(n)) return false;
        const g = getGroupIdForToolName(n);
        return g !== 'memory' && g !== 'production' && g !== 'orders';
      });
    enabledToolNames =
      enabledToolNames !== undefined
        ? stripTacticalDisallowedTools(enabledToolNames)
        : stripTacticalDisallowedTools(toolGroupRegistry.flatMap((g) => [...g.toolNames]));
    enabledToolNames = maybeApplyTacticalLightPrecomputeToolAllowlist(tacticalBattle.battleId, enabledToolNames);
    logDebug('openRouter requestOrders tactical tool filter applied', {
      battleId: tacticalBattle.battleId,
      enabledToolCount: enabledToolNames?.length ?? 0,
    });
  }
  const planState = tacticalBattle ? buildTacticalAiPlanState(state, tacticalBattle) : state;
  resetHexControllerParityCheckDedupForTurn();
  const aiOrderUnitLabel = (unitId: string) =>
    tacticalBattle
      ? tacticalSubUnitLabelForUserMessage(tacticalBattle.subUnits, unitId)
      : buildStrategicUnitDisplayLabelResolver(planState.units)(unitId);
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
  const coordinateContext: CoordinateContext = tacticalBattle
    ? {
        mode: 'tactical',
        battleId: tacticalBattle.battleId,
        tacticalTurnNumber: tacticalBattle.tacticalTurnNumber,
      }
    : { mode: 'strategic' };
  ensureStrategicCoordinateRegistryInitialized();
  if (tacticalBattle) {
    initTacticalCoordinateRegistry(tacticalBattle.battleId, tacticalBattle.enclosingRes1H3Index);
  }
  const coordMap = {
    latLngByH3,
    resolveToH3,
    format: (h3: string) => {
      try {
        return h3ToCode(h3, coordinateContext);
      } catch {
        const ll = latLngByH3.get(h3);
        if (ll) return formatLatLng(ll);
        const [lat, lng] = cellToLatLng(h3);
        return formatLatLng([lat, lng]);
      }
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

  let briefingOverride: string | undefined;
  if (!tacticalBattle) {
    // Map-first contract: strategic prompts always include the Commander briefing with operational map.
    const precomputed = runPrecomputation(state, { latLngByH3, resolveToH3 });
    if (usePrecomputation) {
      toolInvocationCounts['precomputation'] =
        precomputed.unitAssessments.length + precomputed.hexAssessments.length;
    }
    const standingOrderText = flags.ordersEnabled
      ? getStandingOrderInjectionText('opponent', state, { mode: 'strategic' })
      : '';
    const memoryText = flags.memoryEnabled ? getInjectionText('opponent', state.turnNumber) : '';
    const subscriptions = getSubscriptions('opponent');
    const productionBriefing = getToolFlags(enabledToolNames).productionEnabled
      ? buildProductionBriefingBlock({
          productionEnabled: getToolFlags(enabledToolNames).productionEnabled,
          state,
          latLngByH3,
          resolveToH3,
          formatHexLabel: (ll) => {
            const h3 = resolveToH3(ll[0], ll[1]);
            return h3 ? coordMap.format(h3) : formatLatLng(ll);
          },
        })
      : '';
    const possibleActionsIndexed = buildPossibleActionsIndexedState(state);
    briefingOverride = formatBriefing(
      state,
      precomputed,
      standingOrderText,
      memoryText,
      subscriptions,
      productionBriefing,
      { latLngByH3, indexedState: possibleActionsIndexed }
    );
    if (!briefingOverride.includes('# Operational Map')) {
      logError('openRouter requestOrders: strategic map generation missing from briefing');
      return failRequest('Operational map generation failed for strategic prompt.');
    }
    logDebug('openRouter requestOrders: strategic briefing prepared', {
      briefingLength: briefingOverride.length,
      unitAssessments: precomputed.unitAssessments.length,
      hexAssessments: precomputed.hexAssessments.length,
      precomputationCount: toolInvocationCounts['precomputation'] ?? 0,
    });
  }
  if (tacticalBattle) {
    const tacticalBrief = formatTacticalBriefing({
      planState,
      latLngByH3,
      tacticalBattle,
    });
    if (tacticalBrief.trim().length === 0 || !tacticalBrief.includes('Operational Map')) {
      logError('openRouter requestOrders: tactical briefing generation failed', {
        battleId: tacticalBattle.battleId,
      });
      return failRequest('Operational map generation failed for tactical prompt.');
    }
    briefingOverride = tacticalBrief;
    logDebug('openRouter requestOrders: tactical briefing prepared', {
      battleId: tacticalBattle.battleId,
      tacticalBriefChars: tacticalBrief.length,
    });
  }
  if (!briefingOverride || !briefingOverride.includes('Operational Map')) {
    logError('openRouter requestOrders: map-first prompt contract violated', {
      tacticalBattleId: tacticalBattle?.battleId ?? null,
      hasBriefingOverride: Boolean(briefingOverride?.length),
    });
    return failRequest('Operational map is required for AI prompting and was not generated.');
  }
  const systemPrompt = buildSystemPromptForTools(planState, coordMap, enabledToolNames, briefingOverride, coordinateContext);
  const userMessage = getInitialUserMessage(
    flags,
    briefingOverride != null && briefingOverride.length > 0,
    tacticalBattle ? 'tactical' : 'strategic'
  );

  const tools = buildToolDefinitions(enabledToolNames);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  logDebug('openRouter requestOrders: system prompt prepared', { chars: systemPrompt.length });
  logDebug('openRouter requestOrders: user message prepared', { chars: userMessage.length });
  let fullLogOperationalMapSupplement: string | undefined;
  if (
    isAgentWarsFullPromptLoggingEnabled() &&
    !tacticalBattle &&
    !systemPrompt.includes('Operational Map')
  ) {
    try {
      fullLogOperationalMapSupplement = buildStrategicOperationalMapSectionMarkdown({
        state: planState,
        latLngByH3,
      });
      logDebug('openRouter requestOrders: full-prompt disk log will include operational map supplement', {
        supplementChars: fullLogOperationalMapSupplement.length,
      });
    } catch (err) {
      logError('openRouter requestOrders: failed to build operational map for full-prompt disk log', err);
    }
  }
  logPromptPreview('openRouter requestOrders: system prompt', systemPrompt, fullLogOperationalMapSupplement);
  logPromptPreview('openRouter requestOrders: user message', userMessage);
  logDebug('openRouter requestOrders: starting tool loop', { turnNumber: state.turnNumber });

  /**
   * Both tactical and strategic final-json passes can emit large `orders[]` (many units + subscriptions + production).
   * Prefer a high completion budget, but clamp to any session affordable cap learned from OpenRouter 402s.
   */
  const resolveOrderFlowMaxTokens = (): number =>
    resolveEffectiveOpenRouterCompletionMaxTokens(OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS);
  logDebug('openRouter requestOrders: completion token budgets', {
    tacticalAiBattle: tacticalBattle?.battleId ?? null,
    preferredCompletionMaxTokens: OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS,
    completionMaxTokens: resolveOrderFlowMaxTokens(),
    repairMaxTokens: resolveOrderFlowMaxTokens(),
  });

  const wallClockStart = Date.now();
  let requestCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const markSuccessfulConsultation = (strategyText?: string | null): void => {
    setAiLastConsultationTurn(state.turnNumber);
    clearAiLossEventsSinceConsultation('opponent');
    if (tacticalBattle) {
      upsertTurnStrategyNote('tactical', tacticalBattle.battleId, tacticalBattle.tacticalTurnNumber, strategyText);
    } else {
      upsertTurnStrategyNote('strategic', '', state.turnNumber, strategyText);
    }
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
      if (onLog) {
        onLog(
          `AI round ${iteration}: calling model with ${messages.length} message(s) in context` +
            (tacticalBattle ? ' (tactical).' : '.')
        );
      }
      const completionMaxTokens = resolveOrderFlowMaxTokens();
      const body: Record<string, unknown> = {
        model: modelId,
        messages,
        max_tokens: completionMaxTokens,
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
      const head = json.choices?.[0] as { finish_reason?: string; native_finish_reason?: string } | undefined;
      const finishReason = head?.finish_reason;
      const nativeFinish = head?.native_finish_reason;
      if (finishReason === 'length' || nativeFinish === 'MAX_TOKENS') {
        logError('openRouter requestOrders: model output truncated at max_tokens (final JSON may be incomplete)', {
          iteration,
          tacticalAiBattle: tacticalBattle?.battleId ?? null,
          completionMaxTokens,
          finishReason,
          nativeFinish,
        });
      }
      const assistantMessage = json.choices?.[0]?.message;
      if (!assistantMessage) {
        if (onLog) onLog('Invalid response: no assistant message from model.', true);
        return failRequest('Invalid response: no message');
      }

      const usageIn = json.usage?.prompt_tokens;
      const usageOut = json.usage?.completion_tokens;
      const usageFrag =
        usageIn != null && usageOut != null ? ` (+${usageIn} / ${usageOut} tokens this call)` : '';

      const toolCalls = assistantMessage.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        if (onLog) {
          onLog(
            `AI round ${iteration}: model requested ${toolCalls.length} tool call(s)${usageFrag}: ${summarizeToolCallNamesForAiLog(toolCalls, 24)}.`
          );
        }
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
          let execArgs: unknown = args;
          try {
            execArgs = decodeOpenRouterToolArgsForExecution(toolName, args, coordinateContext);
          } catch (err) {
            logError('openRouter requestOrders: tool args hex decode failed', err);
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify({ status: 'error', error: 'Invalid briefing hex code in tool arguments.' }),
            });
            const groupId = getGroupIdForToolName(toolName);
            if (groupId !== undefined) toolInvocationCounts[groupId] = (toolInvocationCounts[groupId] ?? 0) + 1;
            continue;
          }
          const isPathfindingTool = toolName === 'plan_route' || toolName === 'check_distance';
          if (toolName === 'plan_route') aiPathfindingSessionMetrics.planRouteToolCalls += 1;
          if (toolName === 'check_distance') aiPathfindingSessionMetrics.checkDistanceToolCalls += 1;
          aiPathfindingSessionMetrics.totalToolCalls += 1;
          const toolState = tacticalBattle ? planState : state;
          const result = (toolName.includes('order') || toolName.includes('standing'))
            ? executeTool5(toolName, execArgs, toolState, latLngByH3, resolveToH3)
            : (toolName.includes('build') || toolName.includes('production') || toolName.includes('query_production'))
              ? executeTool6(toolName, execArgs, toolState, latLngByH3, resolveToH3)
              : toolName.includes('memory')
                ? executeTool4(toolName, execArgs, toolState, latLngByH3, resolveToH3)
                : toolName.includes('estimate')
                  ? executeTool3(toolName, execArgs, toolState, latLngByH3, resolveToH3)
                  : toolName.includes('assess')
                    ? executeTool2(toolName, execArgs, toolState, latLngByH3, resolveToH3)
                    : executeTool1(
                        toolName,
                        execArgs,
                        toolState,
                        latLngByH3,
                        resolveToH3,
                        isPathfindingTool && !tacticalBattle
                          ? getOrCreateAiPlanningPathfindingSession()
                          : undefined,
                        tacticalBattle
                      );
          const encoded =
            typeof result === 'object' && result !== null && !Array.isArray(result)
              ? encodeOpenRouterToolResultForLlm(toolName, result as Record<string, unknown>, coordinateContext, resolveToH3)
              : (result as Record<string, unknown>);
          const resultStr = JSON.stringify(encoded);
          messages.push({ role: 'tool', tool_call_id: tc.id, content: resultStr });
          const groupId = getGroupIdForToolName(toolName);
          if (groupId !== undefined) toolInvocationCounts[groupId] = (toolInvocationCounts[groupId] ?? 0) + 1;
        }
        if (onLog) {
          onLog(
            `AI round ${iteration}: recorded ${toolCalls.length} tool result(s); conversation now has ${messages.length} message(s).`
          );
        }
        continue;
      }

      const content = assistantMessage.content;
      if (typeof content !== 'string' || !content.trim()) {
        if (onLog) onLog('Invalid response: assistant returned no text content (expected JSON orders).', true);
        return failRequest('Invalid response: no content');
      }
      if (onLog) {
        onLog(`AI round ${iteration}: model returned final text (${content.length} chars)${usageFrag}; parsing orders…`);
      }
      const productionEnabledForParse = tacticalBattle ? false : flags.productionEnabled;
      let parsed = parseOrdersResponse(content, resolveToH3, planState, latLngByH3, productionEnabledForParse, coordinateContext);
      if (!parsed && !parseRepairAttempted) {
        parseRepairAttempted = true;
        if (onLog) onLog('Orders JSON was not parseable; sending one repair user message (no tools, separate API call).');
        const repairMessages: ChatMessage[] = [
          ...messages,
          { role: 'assistant', content },
          {
            role: 'user',
            content:
              `Your previous response was not parseable JSON. Reply now with JSON only (no prose, no markdown, no code fences) using exactly this top-level object schema (orders[] only; no movementOrders/rangedAttacks; never a top-level array): ${buildJsonAssistantRepairSchema(productionEnabledForParse)}. Omit optional arrays when empty.`,
          },
        ];
        const repairMaxTokens = resolveOrderFlowMaxTokens();
        const repairResponse = await postOpenRouterChatWithTimeoutAndRetry({
          key,
          body: { model: modelId, messages: repairMessages, max_tokens: repairMaxTokens, tool_choice: 'none' },
          signal,
          onLog,
          requestLabel: 'requestOrders repair',
        });
        if (repairResponse.ok) {
          const repairText = repairResponse.bodyText;
          if (onLog) onLog('Repair API call completed; parsing repair JSON…');
          logResponsePreview('openRouter requestOrders repair: raw response body', repairText);
          const repairJson = JSON.parse(repairText) as {
            choices?: Array<{ message?: { content?: string | null } }>;
            usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
          };
          const repairHead = repairJson.choices?.[0] as { finish_reason?: string; native_finish_reason?: string } | undefined;
          if (repairHead?.finish_reason === 'length' || repairHead?.native_finish_reason === 'MAX_TOKENS') {
            logError('openRouter requestOrders repair: model output truncated at max_tokens (repair JSON may be incomplete)', {
              tacticalAiBattle: tacticalBattle?.battleId ?? null,
              repairMaxTokens,
              finishReason: repairHead.finish_reason,
              nativeFinish: repairHead.native_finish_reason,
            });
          }
          requestCost += repairJson.usage?.cost ?? 0;
          totalInputTokens += repairJson.usage?.prompt_tokens ?? 0;
          totalOutputTokens += repairJson.usage?.completion_tokens ?? 0;
          const repairContent = repairJson.choices?.[0]?.message?.content;
          if (typeof repairContent === 'string' && repairContent.trim()) {
            if (onLog) onLog(`Repair assistant text received (${repairContent.length} chars); parsing orders…`);
            parsed = parseOrdersResponse(
              repairContent,
              resolveToH3,
              planState,
              latLngByH3,
              productionEnabledForParse,
              coordinateContext
            );
          }
        } else if (onLog && repairResponse.error) {
          onLog(`Repair request failed: ${repairResponse.error}`, true);
        }
      }
      if (!parsed) {
        if (onLog) onLog('Invalid response: could not parse orders JSON after normal and repair attempts.', true);
        return failRequest('Invalid response: could not parse orders');
      }

      toolInvocationCounts['events'] = applyParsedOpponentCallbackSubscriptions({
        callbacks: parsed.callbacks,
        turnNumber: state.turnNumber,
        battleSubUnitIds: tacticalBattle ? new Set(tacticalBattle.subUnits.map((u) => u.id)) : null,
        battleId: tacticalBattle?.battleId,
      });

      // Tactical beats omit strategic standing-order expansion: assign_order/cancel_order are blocked for sub-unit ids,
      // so auto-generated pursue/march from parents must not substitute for explicit_move this beat.
      const standingGenerated =
        flags.ordersEnabled && !tacticalBattle
          ? generateOrdersForStandingOrders('opponent', state, latLngByH3, resolveToH3, {
              mutateProgress: true,
              pathfindingSession: getOrCreateAiPlanningPathfindingSession(),
            })
          : {
              movementOrders: [] as { unitId: string; toH3Index: string }[],
              rangedAttacks: [] as { unitId: string; targetH3Index: string }[],
              airStrikes: [] as {
                unitId: string;
                targetH3Index: string;
                targetType: 'units' | 'urban' | 'airport' | 'seaport';
              }[],
            };
      if (tacticalBattle && flags.ordersEnabled) {
        logDebug('openRouter requestOrdersFlow skipping standing-order generation for tactical opponent', {
          battleId: tacticalBattle.battleId,
        });
      }
      const standingOrderMovement = standingGenerated.movementOrders;
      const standingOrderRanged = standingGenerated.rangedAttacks;
      const standingOrderAirExpanded = standingGenerated.airStrikes;
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
      const llmAirUnitIds = new Set(llmAirStrikes.map((s) => s.unitId));
      const mergedAirStrikes = [...standingOrderAirExpanded.filter((s) => !llmAirUnitIds.has(s.unitId)), ...llmAirStrikes];

      const validated: { unitId: string; toH3Index: string }[] = [];
      const dropReasons: string[] = [...(parsed.dropReasons ?? [])];
      const invalidStandingMovementUnits = new Set<string>();
      const seenUnits = new Set<string>();
      for (const order of mergedMovement) {
        if (seenUnits.has(order.unitId)) {
          dropReasons.push(`Duplicate order for ${aiOrderUnitLabel(order.unitId)}`);
          continue;
        }
        if (tacticalBattle) {
          const res4Set = new Set(tacticalBattle.res4ChildH3Indexes);
          const sub = [...tacticalBattle.subUnits];
          const byId = new Map(sub.map((u, i) => [u.id, i] as const));
          const tacticalOutcome = tacticalComputeMovementOrderOutcome({
            byId,
            sub,
            order,
            res4Set,
            battle: tacticalBattle,
          });
          if (!tacticalOutcome.ok) {
            const plannerReason =
              tacticalOutcome.reason === 'out_of_range' &&
              tacticalOutcome.context &&
              typeof (tacticalOutcome.context as { plannerReason?: unknown }).plannerReason === 'string'
                ? (tacticalOutcome.context as { plannerReason: string }).plannerReason
                : '';
            const suffix = plannerReason ? ` (${plannerReason})` : '';
            dropReasons.push(
              `Tactical march ${aiOrderUnitLabel(order.unitId)} -> ${order.toH3Index}: ${tacticalOutcome.reason}${suffix}`
            );
            continue;
          }
          const appliedTo = tacticalOutcome.appliedToH3Index;
          const unitRow = sub[tacticalOutcome.idx]!;
          if (appliedTo === unitRow.h3Index) {
            if (order.toH3Index !== unitRow.h3Index) {
              dropReasons.push(
                `Tactical march ${aiOrderUnitLabel(order.unitId)} -> ${order.toH3Index}: out_of_range (no_progress)`
              );
            }
            seenUnits.add(order.unitId);
            continue;
          }
          if (appliedTo !== order.toH3Index) {
            dropReasons.push(
              `Tactical march ${aiOrderUnitLabel(order.unitId)}: clamped explicit_move destination to first leg this beat (${order.toH3Index} → ${appliedTo})`
            );
          }
          validated.push({ unitId: order.unitId, toH3Index: appliedTo });
          seenUnits.add(order.unitId);
          continue;
        }
        const result = validateAiOrder(order, planState, { labelForUnitId: aiOrderUnitLabel });
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
          dropReasons.push(`${aiOrderUnitLabel(order.unitId)} -> ${order.toH3Index}: ${result.reason}`);
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
          dropReasons.push(`Duplicate ranged for ${aiOrderUnitLabel(r.unitId)}`);
          continue;
        }
        const result = validateAiRangedOrder(r, rangedState, {
          labelForUnitId: aiOrderUnitLabel,
          tacticalBattle: tacticalBattle ?? undefined,
        });
        if (result.valid) {
          validatedRanged.push(r);
          seenRanged.add(r.unitId);
        } else {
          if (!tacticalBattle && result.reason === 'Target out of range') {
            const movedTo = llmMovementByUnit.get(r.unitId);
            if (movedTo && movedTo === r.targetH3Index) continue;
          }
          dropReasons.push(`Ranged ${aiOrderUnitLabel(r.unitId)} -> ${r.targetH3Index}: ${result.reason}`);
        }
      }

      let outAir = mergedAirStrikes;
      let outFerry = llmFerryOrders;
      let outEmbark = llmEmbarkOrders;
      if (tacticalBattle) {
        const movementProjected =
          validated.length > 0
            ? projectTacticalSnapshotAfterOpponentMovementOrders(tacticalBattle, validated)
            : tacticalBattle;
        const validatedAir: AirStrikeOrder[] = [];
        const seenStrike = new Set<string>();
        for (const s of mergedAirStrikes) {
          if (seenStrike.has(s.unitId)) {
            dropReasons.push(`Duplicate air strike for ${aiOrderUnitLabel(s.unitId)}`);
            continue;
          }
          const vr = validateTacticalOpponentAirStrikeOrder(s, planAfterMove, aiOrderUnitLabel);
          if (vr.valid) {
            validatedAir.push(s);
            seenStrike.add(s.unitId);
          } else {
            dropReasons.push(`Air strike ${aiOrderUnitLabel(s.unitId)}: ${vr.reason}`);
          }
        }
        const strikeIds = new Set(validatedAir.map((s) => s.unitId));
        const validatedFerry: FerryOrder[] = [];
        const seenFerry = new Set<string>();
        for (const f of llmFerryOrders) {
          if (seenFerry.has(f.unitId)) {
            dropReasons.push(`Duplicate ferry for ${aiOrderUnitLabel(f.unitId)}`);
            continue;
          }
          if (strikeIds.has(f.unitId)) {
            dropReasons.push(`Air unit ${aiOrderUnitLabel(f.unitId)} cannot strike and ferry in the same tactical turn`);
            continue;
          }
          const fr = validateTacticalOpponentFerryOrder(f, planAfterMove, aiOrderUnitLabel);
          if (fr.valid) {
            validatedFerry.push(f);
            seenFerry.add(f.unitId);
          } else {
            dropReasons.push(`Ferry ${aiOrderUnitLabel(f.unitId)}: ${fr.reason}`);
          }
        }
        const validatedEmb: EmbarkOrder[] = [];
        const seenEmbarkLand = new Set<string>();
        for (const e of llmEmbarkOrders) {
          if (seenEmbarkLand.has(e.unitId)) {
            dropReasons.push(`Duplicate embark for ${aiOrderUnitLabel(e.unitId)}`);
            continue;
          }
          const er = validateTacticalOpponentEmbarkOrder(e, movementProjected.subUnits);
          if (er.valid) {
            validatedEmb.push(e);
            seenEmbarkLand.add(e.unitId);
          } else {
            dropReasons.push(`Embark ${aiOrderUnitLabel(e.unitId)}: ${er.reason}`);
          }
        }
        outAir = validatedAir;
        outFerry = validatedFerry;
        outEmbark = validatedEmb;
      }

      markSuccessfulConsultation(parsed.strategy);
      if (onLog) {
        const ms = Date.now() - wallClockStart;
        const bits: string[] = [
          `${validated.length} movement`,
          `${validatedRanged.length} ranged`,
        ];
        if (tacticalBattle) {
          bits.push(`${outAir.length} air strike(s)`);
          bits.push(`${outFerry.length} ferry`);
          bits.push(`${outEmbark.length} embark`);
        }
        const dropNote = dropReasons.length > 0 ? `; ${dropReasons.length} validation note(s)` : '';
        const tokNote =
          totalInputTokens > 0 || totalOutputTokens > 0
            ? `; session tokens in/out ${totalInputTokens}/${totalOutputTokens}`
            : '';
        onLog(`AI planning complete in ${ms} ms: ${bits.join(', ')}${dropNote}${tokNote}.`);
      }
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
    markSuccessfulConsultation(null);
    if (onLog) {
      onLog(
        `AI planning stopped after ${iteration} round(s) without a completed order JSON (max tool rounds or empty final reply). Returning no movement orders.`,
        true
      );
    }
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
    if (isLikelyAbortError(err)) {
      if (onLog) onLog('Cancelled.');
      return failRequest('Cancelled');
    }
    logError('openRouter requestOrders: exception', err);
    if (onLog) onLog(String(err), true);
    return failRequest(String(err));
  } finally {
    finalizeRequestOrdersPathfindingMetrics({
      turnNumber: state.turnNumber,
      modelId,
      wallClockStart,
      requestMetrics: aiPathfindingSessionMetrics,
      turnAggregateMetrics: aiTurnAggregateMetrics,
      tacticalBattleId: tacticalBattle?.battleId ?? null,
    });
  }
}
