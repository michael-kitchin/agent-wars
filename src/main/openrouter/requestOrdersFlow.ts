import { cellToLatLng } from 'h3-js';
import { isLikelyAbortError } from '../../shared/abortError';
import { buildLatLngCoordinateMap } from '../mapData';
import { logDebug, logError } from '../logger';
import { parseOrdersResponse } from './orderResponseParsing';
import { type EnvelopeGates } from './promptSpec/envelopeContract';
import { createPathfindingSession } from '../tools/tool1Pathfinding';
import { expireAndUpdateStatus } from '../tools/tool5StandingOrders';
import { runPrecomputation } from '../precomputation';
import { formatBriefing } from '../briefingFormatter';
import { formatTacticalBriefing } from './formatTacticalBriefing';
import { resetHexControllerParityCheckDedupForTurn } from '../snapshotDbParity';
import { buildPossibleActionsIndexedState } from './possibleUnitActions';
import { getSubscriptions } from '../callbackSubscriptions';
import {
  clearAiLossEventsSinceConsultation,
  setAiLastConsultationTurn,
  setAiToolLimitExceededLastTurn,
  upsertTurnStrategyNote,
} from '../gameDb';
import type { GameStateSnapshot } from '../gameDb';
import { buildStatusInjectionTexts } from './requestOrdersInjection';
import { getInitialUserMessage } from './promptText';
import { SECTION_TITLE_BEST_OPTIONS_THIS_TURN } from './promptSpec/sectionHeadings';
import {
  OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS,
  resolveEffectiveOpenRouterCompletionMaxTokens,
} from './openRouterCreditLimits';
import { TOOL2_NAMES } from '../tools/tool2Assessment';
import { TOOL3_NAMES } from '../tools/tool3CombatEstimation';
import { buildTacticalAiPlanState } from '../tacticalBattle/buildTacticalAiPlanState';
import { buildStrategicOperationalMapSectionMarkdown } from '../briefing/map/briefing-map-section';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { ensureStrategicCoordinateRegistryInitialized, initTacticalCoordinateRegistry } from '../briefing/map/hex-coordinates';
import { h3ToCode } from '../briefing/map/hex-code-translator';
import {
  runRequestOrdersToolLoop,
  type RequestOrdersUsageTotals,
} from './requestOrdersToolLoop';
import { runParseRepairExchange } from './requestOrdersRepairExchange';
import { applyParsedRequestOrders } from './requestOrdersApplyParsed';
import { buildStrategicUnitDisplayLabelResolver, tacticalSubUnitLabelForUserMessage } from '../../shared/unitDisplayNames';
import type { RequestOrdersFlowDeps } from './requestOrdersFlowDepsTypes';
import type { RequestOrdersChatMessage, RequestOrdersError, RequestOrdersOptions, RequestOrdersResult } from './requestOrdersFlowTypes';
import {
  finalizeRequestOrdersPathfindingMetrics,
  getAiPathfindingTurnAggregateMetrics,
  isAgentWarsFullPromptLoggingEnabled,
  logPromptPreview,
  type AiPathfindingSessionMetrics,
} from './requestOrdersFlowSupport';
import { maybeApplyTacticalLightPrecomputeToolAllowlist } from './tacticalLightPrecompute';

export type { RequestOrdersError, RequestOrdersOptions, RequestOrdersResult } from './requestOrdersFlowTypes';

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
    expireAndUpdateStatus('opponent', state);
    // Map-first contract: strategic prompts always include the Commander briefing with operational map.
    const precomputed = runPrecomputation(state, { latLngByH3, resolveToH3 });
    if (usePrecomputation) {
      toolInvocationCounts['precomputation'] =
        precomputed.unitAssessments.length + precomputed.hexAssessments.length;
    }
    const injection = buildStatusInjectionTexts({
      memoryEnabled: flags.memoryEnabled,
      ordersEnabled: flags.ordersEnabled,
      productionEnabled: flags.productionEnabled,
      state,
      latLngByH3,
      resolveToH3,
      formatHexLabel: (ll) => {
        const h3 = resolveToH3(ll[0], ll[1]);
        return h3 ? coordMap.format(h3) : formatLatLng(ll);
      },
      coordinateContext: { mode: 'strategic' },
    });
    const standingOrderText = injection.standingOrderText;
    const memoryText = injection.memoryText;
    const subscriptions = getSubscriptions('opponent');
    const productionBriefing = injection.productionText;
    const possibleActionsIndexed = buildPossibleActionsIndexedState(state);
    briefingOverride = formatBriefing(
      state,
      precomputed,
      standingOrderText,
      memoryText,
      subscriptions,
      productionBriefing,
      { latLngByH3, indexedState: possibleActionsIndexed, includeProductionSection: flags.productionEnabled }
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
  const hasBriefing = briefingOverride != null && briefingOverride.length > 0;
  const userMessage = getInitialUserMessage(
    flags,
    hasBriefing,
    tacticalBattle ? 'tactical' : 'strategic',
    {
      hasAirUnits: opponentUnits.some((u) => u.unitType === 'air'),
      hasBestOptionsTable: hasBriefing && briefingOverride.includes(SECTION_TITLE_BEST_OPTIONS_THIS_TURN),
    }
  );

  const tools = buildToolDefinitions(enabledToolNames);

  const messages: RequestOrdersChatMessage[] = [
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
  logPromptPreview('openRouter requestOrders: system prompt', systemPrompt, {
    artifactKind: coordinateContext.mode,
    supplementalDiskOnlyBody: fullLogOperationalMapSupplement,
  });
  logPromptPreview('openRouter requestOrders: user message', userMessage, {
    artifactKind: 'user',
  });
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
  const usage: RequestOrdersUsageTotals = { requestCost: 0, totalInputTokens: 0, totalOutputTokens: 0 };
  const markSuccessfulConsultation = (strategyText?: string | null, messageText?: string | null): void => {
    setAiLastConsultationTurn(state.turnNumber);
    clearAiLossEventsSinceConsultation('opponent');
    if (tacticalBattle) {
      upsertTurnStrategyNote('tactical', tacticalBattle.battleId, tacticalBattle.tacticalTurnNumber, {
        strategyText,
        messageText,
      });
    } else {
      upsertTurnStrategyNote('strategic', '', state.turnNumber, { strategyText, messageText });
    }
  };
  try {
    const loopResult = await runRequestOrdersToolLoop({
      messages,
      tools,
      key,
      modelId,
      signal,
      onLog,
      wallClockStart,
      turnNumber: state.turnNumber,
      tacticalBattle,
      usage,
      enabledToolNameSet,
      getGroupIdForToolName,
      toolInvocationCounts,
      coordinateContext,
      planState,
      state,
      latLngByH3,
      resolveToH3,
      postOpenRouterChatWithTimeoutAndRetry,
      resolveOrderFlowMaxTokens,
      getOrCreateAiPlanningPathfindingSession,
      aiPathfindingSessionMetrics,
    });
    if (loopResult.kind === 'fail') return failRequest(loopResult.error);
    if (loopResult.kind === 'budgetExceeded') {
      setAiToolLimitExceededLastTurn();
      markSuccessfulConsultation(null, null);
      if (onLog) {
        onLog(
          `AI planning stopped after ${loopResult.iteration} round(s) without a completed order JSON (max tool rounds or empty final reply). Returning no movement orders.`,
          true
        );
      }
      return {
        success: true,
        orders: [],
        dropped: 0,
        toolInvocationCounts,
        cost: usage.requestCost > 0 ? usage.requestCost : undefined,
        wallClockMs: Date.now() - wallClockStart,
        inputTokens: usage.totalInputTokens > 0 ? usage.totalInputTokens : undefined,
        outputTokens: usage.totalOutputTokens > 0 ? usage.totalOutputTokens : undefined,
      };
    }
    const content = loopResult.content;
    const productionEnabledForParse = tacticalBattle ? false : flags.productionEnabled;
    const repairGates: EnvelopeGates = {
      coordinateMode: coordinateContext.mode,
      includeAirActions: planState.units.some((u) => u.player === 'opponent' && u.unitType === 'air'),
      includeMemoryUpdates: flags.memoryEnabled,
      includeProductionOrders: flags.productionEnabled,
      includeStandingOrderActions: flags.ordersEnabled && !tacticalBattle,
    };
    let parsed = parseOrdersResponse(content, resolveToH3, planState, latLngByH3, productionEnabledForParse, coordinateContext);
    if (!parsed) {
      const repairContent = await runParseRepairExchange({
        messages,
        unparseableContent: content,
        repairGates,
        key,
        modelId,
        signal,
        onLog,
        tacticalBattleId: tacticalBattle?.battleId ?? null,
        usage,
        postOpenRouterChatWithTimeoutAndRetry,
        resolveOrderFlowMaxTokens,
      });
      if (repairContent) {
        parsed = parseOrdersResponse(
          repairContent,
          resolveToH3,
          planState,
          latLngByH3,
          productionEnabledForParse,
          coordinateContext
        );
      }
    }
    if (!parsed) {
      if (onLog) onLog('Invalid response: could not parse orders JSON after normal and repair attempts.', true);
      return failRequest('Invalid response: could not parse orders');
    }

    return applyParsedRequestOrders({
      parsed,
      ordersEnabled: flags.ordersEnabled,
      tacticalBattle,
      state,
      planState,
      latLngByH3,
      resolveToH3,
      getOrCreateAiPlanningPathfindingSession,
      aiOrderUnitLabel,
      validateAiOrder,
      validateAiRangedOrder,
      toolInvocationCounts,
      usage,
      wallClockStart,
      onLog,
      markSuccessfulConsultation,
    });
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
