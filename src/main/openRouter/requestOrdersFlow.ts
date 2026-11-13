import { cellToLatLng } from 'h3-js';
import { isLikelyAbortError } from '../../shared/abortError';
import { emptyRosterAbsenceReason } from '../../shared/commanderStatus';
import { ONLY_MISSILES_REMAIN_IN_BATTLE_MESSAGE, isMissileUnitType } from '../../shared/missileRules';
import { AI_SEAT_IDS, aiIndexForSeatId } from '../../shared/seatIds';
import { readSeatApiKey } from './commanderKeyMemory';
import { buildLatLngCoordinateMap } from '../mapData';
import { logDebug, logError } from '../logger';
import { createConsultTelemetry, logConsultTelemetrySummary } from './consultTelemetry';
import {
  markSuccessfulConsultation as recordSuccessfulConsultation,
  settleConsultFailure,
} from './requestOrdersConsultationMarks';
import { parseOrdersResponse } from './orderResponseParsing';
import { type EnvelopeGates } from './promptSpec/envelopeContract';
import { createPathfindingSession } from '../tools/pathfinding';
import { expireAndUpdateStatus } from '../tools/standingOrders';
import { campaignPlanForState, resolveCampaignObjectiveForSeat } from './campaignObjectiveFlow';
import type { CampaignPlan } from './campaignRules';
import { runPrecomputation } from '../precomputation';
import { formatBriefing } from '../briefingFormatter';
import { formatTacticalBriefing } from './formatTacticalBriefing';
import { resetHexControllerParityCheckDedupForTurn } from '../snapshotDbParity';
import { buildPossibleActionsIndexedState } from './possibleUnitActions';
import { getSubscriptions } from '../callbackSubscriptions';
import { setAiToolLimitExceededLastTurn } from '../gameDb';
import type { GameStateSnapshot } from '../gameDb';
import { buildStatusInjectionTexts } from './requestOrdersInjection';
import {
  SECTION_TITLE_OPERATIONAL_MAP,
  subHeading,
} from './promptSpec/sectionHeadings';
import { buildConsultPromptParts } from './consultPromptParts';
import { buildConsultMessages } from './consultPromptMessages';
import { resolveEffectiveOpenRouterCompletionMaxTokens } from './openRouterCreditLimits';
import { BASELINE_ORDERS_REQUEST_PROFILE } from './ordersRequestProfile';
import {
  isSituationMessagesJoinedForModel,
  isStructuredOutputsRejectedForModel,
  recordNoToolCallingNoticeForModel,
} from './openRouterModelCapabilities';
import type { OrdersChatRequestSettings } from './ordersChatRequestHelpers';
import { buildOrdersEnvelopeResponseFormat } from './promptSpec/envelopeJsonSchema';
import { buildTacticalAiPlanState } from '../tacticalBattle/buildTacticalAiPlanState';
import { buildStrategicOperationalMapSectionMarkdown } from '../briefing/map/briefingMapSection';
import { coordinateContextForConsultation, type CoordinateContext } from '../briefing/map/coordinateContext';
import { ensureStrategicCoordinateRegistryInitialized, initTacticalCoordinateRegistry } from '../briefing/map/hexCoordinates';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
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
  REQUEST_ORDERS_WALL_CLOCK_ERROR,
  getAiPathfindingTurnAggregateMetrics,
  isAgentWarsFullPromptLoggingEnabled,
  logPromptPreview,
  type AiPathfindingSessionMetrics,
} from './requestOrdersFlowSupport';
import { maybeApplyTacticalLightPrecomputeToolAllowlist } from './tacticalLightPrecompute';
import { resolveConsultToolNames } from './openRouterToolGroups';

export type { RequestOrdersError, RequestOrdersOptions, RequestOrdersResult } from './requestOrdersFlowTypes';

/**
 * Asks the selected model for this turn's opponent orders.
 *
 * Purpose: Runs one AI consultation: builds the prompt, runs the tool loop, parses (with one repair), and applies the
 * orders.
 * When to use: Called by `requestOrders` with production deps, or by tests with fakes.
 * Expected outcome: A success result with orders and telemetry, or a failure result. A model without tool support is
 * consulted as if every tool group were off.
 * Exceptions: None; failures and cancellation resolve as `{ success: false }`.
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
    buildToolDefinitions,
    postOpenRouterChatWithTimeoutAndRetry,
    resolveOrdersRequestProfile,
    getGroupIdForToolName,
    validateAiOrder,
    validateAiRangedOrder,
    formatLatLng,
  } = deps;

  const seatId = options?.seatId ?? AI_SEAT_IDS[0];
  const resolvedAiIndex = aiIndexForSeatId(seatId);
  if (resolvedAiIndex === null) {
    logError('openRouter requestOrders: seat has no opponent index; prompt logs use opponent 1', { seatId });
  }
  const aiIndex = resolvedAiIndex ?? 1;
  const tacticalBattle = options?.tacticalAiBattle;
  const requestedToolNames = options?.enabledToolNames;
  const signal = options?.signal;
  const onLog = options?.onLog;
  const usePrecomputation = tacticalBattle ? false : options?.usePrecomputation === true;
  const allToolNames = toolGroupRegistry.flatMap((group) => [...group.toolNames]);
  let enabledToolNames = resolveConsultToolNames({
    requested: requestedToolNames,
    usePrecomputation,
    tactical: Boolean(tacticalBattle),
    allToolNames,
    groupIdForToolName: getGroupIdForToolName,
  });
  if (tacticalBattle) {
    enabledToolNames = maybeApplyTacticalLightPrecomputeToolAllowlist(tacticalBattle.battleId, enabledToolNames) ?? enabledToolNames;
    logDebug('openRouter requestOrders tactical tool filter applied', {
      battleId: tacticalBattle.battleId,
      enabledToolCount: enabledToolNames?.length ?? 0,
    });
  }
  const planState = tacticalBattle
    ? buildTacticalAiPlanState(state, tacticalBattle, seatId)
    : { ...state, playerPerspective: seatId };
  resetHexControllerParityCheckDedupForTurn();
  const aiOrderUnitLabel = (unitId: string) =>
    tacticalBattle
      ? tacticalSubUnitLabelForUserMessage(tacticalBattle.subUnits, unitId)
      : buildStrategicUnitDisplayLabelResolver(planState.units)(unitId);
  if (onLog) onLog('Requesting AI orders…');
  logDebug('openRouter requestOrders', {
    modelId,
    aiIndex,
    turnNumber: state.turnNumber,
    enabledToolsRequested: requestedToolNames === undefined ? 'all' : requestedToolNames.length,
    enabledToolsEffective: enabledToolNames === undefined ? 'all' : enabledToolNames.length,
    usePrecomputation,
    filteredForPrecomputation: usePrecomputation,
    tacticalAiBattle: tacticalBattle ? tacticalBattle.battleId : null,
  });
  const key = readSeatApiKey(seatId, loadKey());
  /**
   * Returns a failed order request, keeping tool counts when the consult already recorded some.
   *
   * Purpose: A parse failure or cancel can happen after tools have run, and the consult total includes those uses.
   * When to use: Any return that does not produce orders. Pass `counts` only after that map exists.
   * Expected outcome: `{ success: false, error }`, plus `toolInvocationCounts` when `counts` is passed.
   * Exceptions: None.
   */
  const failRequest = (error: string, counts?: Readonly<Record<string, number>>): RequestOrdersError => {
    logDebug('openRouter requestOrders failRequest', { error, hasCounts: counts != null });
    return counts ? { success: false, error, toolInvocationCounts: counts } : { success: false, error };
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

  const opponentUnits = planState.units.filter((u) => u.player === seatId);
  const actionableCount = tacticalBattle
    ? opponentUnits.filter((unit) => !isMissileUnitType(unit.unitType)).length
    : opponentUnits.length;
  const rosterAbsence = emptyRosterAbsenceReason(Boolean(tacticalBattle), actionableCount);
  if (rosterAbsence) {
    const onlyMissiles = Boolean(tacticalBattle) && opponentUnits.length > 0;
    logDebug('openRouter requestOrders: no units remain in this battle', { seatId, absenceReason: rosterAbsence, onlyMissiles });
    if (onLog) onLog(onlyMissiles ? ONLY_MISSILES_REMAIN_IN_BATTLE_MESSAGE : 'No units remain in this battle.');
    return { success: true, orders: [], absenceReason: rosterAbsence };
  }

  const requestProfile = resolveOrdersRequestProfile?.(modelId, seatId) ?? BASELINE_ORDERS_REQUEST_PROFILE;
  if (!requestProfile.toolCalling && (enabledToolNames === undefined || enabledToolNames.length > 0)) {
    logDebug('openRouter requestOrders: model does not support tool calls; consulting without tools', {
      modelId,
      droppedToolCount: enabledToolNames === undefined ? 'all' : enabledToolNames.length,
    });
    if (onLog && recordNoToolCallingNoticeForModel(modelId)) {
      onLog('This model does not support tool calls; planning without tools.');
    }
    enabledToolNames = [];
  }

  const hexList = planState.hexes.map((h) => h.h3Index);
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
  const coordinateContext: CoordinateContext = coordinateContextForConsultation({ seatId, tacticalBattle });
  ensureStrategicCoordinateRegistryInitialized();
  if (tacticalBattle) {
    initTacticalCoordinateRegistry(tacticalBattle.battleId, tacticalBattle.enclosingStrategicH3Index);
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
  let productionAttention: string | null = null;
  let pausedProductionAttention: string | null = null;
  let campaignPlan: CampaignPlan | null = null;
  let campaignAttention: string | null = null;
  if (!tacticalBattle) {
    expireAndUpdateStatus(seatId, planState);
    if (flags.ordersEnabled) {
      resolveCampaignObjectiveForSeat(planState);
      campaignPlan = campaignPlanForState(planState);
    }
    // Map-first contract: strategic prompts always include the Commander briefing with operational map.
    const precomputed = runPrecomputation(planState, { latLngByH3, resolveToH3 });
    if (usePrecomputation) {
      toolInvocationCounts['precomputation'] =
        precomputed.unitAssessments.length + precomputed.hexAssessments.length;
    }
    const injection = buildStatusInjectionTexts({
      memoryEnabled: flags.memoryEnabled,
      ordersEnabled: flags.ordersEnabled,
      productionEnabled: flags.productionEnabled,
      state: planState,
      seatId,
      latLngByH3,
      resolveToH3,
      formatHexLabel: (ll) => {
        const h3 = resolveToH3(ll[0], ll[1]);
        return h3 ? coordMap.format(h3) : formatLatLng(ll);
      },
      coordinateContext: { mode: 'strategic' },
      campaignPlan,
    });
    const standingOrderText = injection.standingOrderText;
    const memoryText = injection.memoryText;
    const subscriptions = getSubscriptions(seatId);
    const productionBriefing = injection.productionText;
    productionAttention = injection.productionAttention;
    pausedProductionAttention = injection.pausedProductionAttention;
    campaignAttention = injection.campaignAttention;
    const possibleActionsIndexed = buildPossibleActionsIndexedState(planState);
    briefingOverride = formatBriefing(
      planState,
      precomputed,
      standingOrderText,
      memoryText,
      subscriptions,
      productionBriefing,
      {
        latLngByH3,
        indexedState: possibleActionsIndexed,
        includeProductionSection: flags.productionEnabled,
        productionAttention,
        pausedProductionAttention,
        mentionGetMap: enabledToolNames.includes('get_map'),
        campaignPlan,
        campaignText: injection.campaignText,
        campaignAttention: injection.campaignAttention,
        additionalAttention: injection.additionalAttention,
      }
    );
    if (!briefingOverride.includes(subHeading(SECTION_TITLE_OPERATIONAL_MAP))) {
      logError('openRouter requestOrders: strategic map generation missing from briefing');
      return failRequest('Operational map generation failed for strategic prompt.', toolInvocationCounts);
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
      mentionGetMap: enabledToolNames.includes('get_map'),
    });
    if (tacticalBrief.trim().length === 0 || !tacticalBrief.includes('Operational Map')) {
      logError('openRouter requestOrders: tactical briefing generation failed', {
        battleId: tacticalBattle.battleId,
      });
      return failRequest('Operational map generation failed for tactical prompt.', toolInvocationCounts);
    }
    briefingOverride = tacticalBrief;
    logDebug('openRouter requestOrders: tactical briefing prepared', {
      battleId: tacticalBattle.battleId,
      tacticalBriefChars: tacticalBrief.length,
    });
  }
  if (!briefingOverride || !briefingOverride.includes(SECTION_TITLE_OPERATIONAL_MAP)) {
    logError('openRouter requestOrders: map-first prompt contract violated', {
      tacticalBattleId: tacticalBattle?.battleId ?? null,
      hasBriefingOverride: Boolean(briefingOverride?.length),
    });
    return failRequest('Operational map is required for AI prompting and was not generated.', toolInvocationCounts);
  }
  const includeExitBattle = tacticalBattle?.leadPartyId != null;
  const promptParts = buildConsultPromptParts({
    state: planState,
    coordMap,
    enabledToolNames,
    briefingOverride,
    coordinateContext,
    includeExitBattle,
    tacticalBattle: tacticalBattle ?? null,
    structuredOutputs: requestProfile.structuredOutputs && !isStructuredOutputsRejectedForModel(modelId),
    productionAttention,
    campaignPlan,
    campaignAttention,
  });
  const messages: RequestOrdersChatMessage[] = buildConsultMessages(
    promptParts,
    isSituationMessagesJoinedForModel(modelId)
  );

  logDebug('openRouter requestOrders: system prompt prepared', { chars: promptParts.staticSystemText.length });
  logDebug('openRouter requestOrders: user message prepared', { chars: promptParts.situationText.length });
  let fullLogOperationalMapSupplement: string | undefined;
  if (
    isAgentWarsFullPromptLoggingEnabled() &&
    !tacticalBattle &&
    !promptParts.situationText.includes('Operational Map')
  ) {
    try {
      fullLogOperationalMapSupplement = buildStrategicOperationalMapSectionMarkdown({
        state: planState,
        latLngByH3,
        mentionGetMap: enabledToolNames.includes('get_map'),
      });
      logDebug('openRouter requestOrders: full-prompt disk log will include operational map supplement', {
        supplementChars: fullLogOperationalMapSupplement.length,
      });
    } catch (err) {
      logError('openRouter requestOrders: failed to build operational map for full-prompt disk log', err);
    }
  }
  const tools = buildToolDefinitions(enabledToolNames);
  logPromptPreview('openRouter requestOrders: system prompt', promptParts.staticSystemText, {
    artifactKind: coordinateContext.mode,
    aiIndex,
    supplementalDiskOnlyBody: fullLogOperationalMapSupplement,
  });
  logPromptPreview('openRouter requestOrders: user message', promptParts.situationText, {
    artifactKind: 'user',
    aiIndex,
  });
  logDebug('openRouter requestOrders: starting tool loop', { turnNumber: state.turnNumber });

  /**
   * Both tactical and strategic final-json passes can emit large `orders[]` (many units + subscriptions + production).
   * The profile budget is the model's advertised output limit, or the order-flow base when that limit is missing,
   * then clamped to any session affordable cap learned from OpenRouter 402s.
   */
  const resolveOrderFlowMaxTokens = (): number =>
    resolveEffectiveOpenRouterCompletionMaxTokens(requestProfile.preferredCompletionMaxTokens);
  logDebug('openRouter requestOrders: completion token budgets', {
    tacticalAiBattle: tacticalBattle?.battleId ?? null,
    reasoningEffort: requestProfile.effectiveReasoningEffort,
    preferredCompletionMaxTokens: requestProfile.preferredCompletionMaxTokens,
    completionMaxTokens: resolveOrderFlowMaxTokens(),
    repairMaxTokens: resolveOrderFlowMaxTokens(),
  });
  /**
   * JSON envelope gates shared by the structured-output schema and the repair prompt.
   *
   * Purpose: The schema sent on schema-eligible rounds and the repair schema text must describe the same fields.
   * When to use: Building `requestSettings` and the repair exchange.
   * Expected outcome: Matches the system prompt's final JSON contract for this consultation.
   */
  const envelopeGates: EnvelopeGates = {
    coordinateMode: coordinateContext.mode,
    includeAirActions: planState.units.some((u) => u.player === seatId && u.unitType === 'air'),
    includeNavalActions: planState.units.some((u) => u.player === seatId && u.unitType === 'naval'),
    includeMissileActions: !tacticalBattle && planState.units.some((u) => u.player === seatId && isMissileUnitType(u.unitType)),
    includeMemoryUpdates: flags.memoryEnabled,
    includeProductionOrders: flags.productionEnabled,
    includeStandingOrderActions: flags.ordersEnabled && !tacticalBattle,
    includeCampaignTarget: !tacticalBattle && flags.ordersEnabled && planState.scenarioId === 'region_vs_region',
    includeExitBattle,
  };
  const wallClockStart = Date.now();
  const usage: RequestOrdersUsageTotals = { requestCost: 0, totalInputTokens: 0, totalOutputTokens: 0 };
  const telemetry = createConsultTelemetry({ seatId, turnNumber: state.turnNumber, theater: tacticalBattle ? 'tactical' : 'strategic', battleId: tacticalBattle?.battleId ?? null, modelId, providerSort: requestProfile.providerSort, usage });
  /**
   * Optional request parameters shared by every tool-loop round and the repair call.
   *
   * Purpose: Resolves reasoning effort and structured outputs once per consultation; the tool loop decides per round
   * whether the schema is attached.
   * When to use: Passed to the tool loop and the repair exchange.
   * Expected outcome: Baseline settings for models missing from the capability cache.
   * Exceptions: None.
   */
  const requestSettings: OrdersChatRequestSettings = {
    profile: requestProfile,
    responseFormat: requestProfile.structuredOutputs ? buildOrdersEnvelopeResponseFormat(envelopeGates) : null,
    telemetry,
  };
  const markSuccessfulConsultation = (strategyText?: string | null, messageText?: string | null): void =>
    recordSuccessfulConsultation({ seatId, turnNumber: state.turnNumber, tacticalBattle, strategyText, messageText });
  const failSettled = (error: string): RequestOrdersError =>
    settleConsultFailure(telemetry, error, REQUEST_ORDERS_WALL_CLOCK_ERROR, (failure) => failRequest(failure, toolInvocationCounts));
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
      requestSettings,
      getOrCreateAiPlanningPathfindingSession,
      aiPathfindingSessionMetrics,
    });
    if (loopResult.kind === 'fail') return failSettled(loopResult.error);
    // A stop that arrived with the last reply must not warn or record an empty success.
    if (signal?.aborted) return failSettled('Cancelled');
    if (loopResult.kind === 'budgetExceeded') {
      telemetry.setOutcome('budgetExceeded');
      setAiToolLimitExceededLastTurn(seatId);
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
    const capReached = loopResult.afterRoundCap;
    const content = loopResult.content;
    const productionEnabledForParse = tacticalBattle ? false : flags.productionEnabled;
    /**
     * Asks the model once to replace assistant text that did not yield usable actor rows.
     *
     * Purpose: Unparseable JSON and an all-dropped actor envelope share one repair call.
     * When to use: After the first parse fails, or after a parse whose actor rows were all dropped and production was not applied.
     * Expected outcome: The repair assistant text, or null when the repair call fails or returns empty.
     * Exceptions: None. Transport failures come back as null from `runParseRepairExchange`.
     */
    const repairAssistantText = (): Promise<string | null> =>
      runParseRepairExchange({
        messages,
        unparseableContent: content,
        repairGates: envelopeGates,
        key,
        modelId,
        signal,
        onLog,
        tacticalBattleId: tacticalBattle?.battleId ?? null,
        aiIndex,
        usage,
        postOpenRouterChatWithTimeoutAndRetry,
        resolveOrderFlowMaxTokens,
        requestSettings,
        toolsOffered: tools.length > 0,
      });
    /**
     * Parses one assistant text with the same state this consultation already built.
     *
     * Purpose: The first reply and the repair reply must be read by the same parser.
     * When to use: The original content and, at most once, the repair text.
     * Expected outcome: The parsed envelope, or null when the text is not an envelope.
     * Exceptions: None. `parseOrdersResponse` returns null instead of throwing for bad JSON.
     */
    const parseContent = (assistantText: string): ReturnType<typeof parseOrdersResponse> =>
      parseOrdersResponse(
        assistantText,
        resolveToH3,
        planState,
        latLngByH3,
        productionEnabledForParse,
        coordinateContext
      );
    let parsed = parseContent(content);
    if (!parsed) {
      const repairContent = await repairAssistantText();
      if (repairContent) parsed = parseContent(repairContent);
    } else if (parsed.everyActorRowDropped && !(parsed.productionAppliedCount && parsed.productionAppliedCount > 0)) {
      logDebug('openRouter requestOrders: every actor row dropped', {
        turnNumber: state.turnNumber,
        expandedActorRowCount: parsed.expandedActorRowCount,
      });
      const repairContent = await repairAssistantText();
      if (repairContent) {
        const repaired = parseContent(repairContent);
        if (repaired) parsed = repaired;
      }
    }
    // A stop during the repair must not apply the earlier text or set the warning.
    if (signal?.aborted) return failSettled('Cancelled');
    if (!parsed) {
      if (capReached) setAiToolLimitExceededLastTurn(seatId);
      if (onLog) onLog('Invalid response: could not parse orders JSON after normal and repair attempts.', true);
      return failSettled('Invalid response: could not parse orders');
    }

    if (capReached) setAiToolLimitExceededLastTurn(seatId);
    telemetry.setOutcome('finished');
    return applyParsedRequestOrders({
      parsed,
      ordersEnabled: flags.ordersEnabled,
      memoryEnabled: flags.memoryEnabled,
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
      seatId,
      markSuccessfulConsultation,
    });
  } catch (err) {
    if (isLikelyAbortError(err)) {
      logDebug('openRouter requestOrders: cancelled', { turnNumber: state.turnNumber });
      return failSettled('Cancelled');
    }
    logError('openRouter requestOrders: exception', err);
    if (onLog) onLog(String(err), true);
    return failSettled(String(err));
  } finally {
    logConsultTelemetrySummary(telemetry.summary());
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
