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
import { buildTacticalAiPlanState } from '../tacticalBattle/buildTacticalAiPlanState';
import { applyMovementOrdersToPlanState } from '../tacticalBattle/tacticalPlanStateMovement';
import { projectTacticalSnapshotAfterOpponentMovementOrders } from '../tacticalBattle/tacticalMovementApply';
import {
  validateTacticalOpponentAirStrikeOrder,
  validateTacticalOpponentEmbarkOrder,
  validateTacticalOpponentFerryOrder,
} from '../tacticalBattle/tacticalOpponentOrderValidation';
import { buildPossibleUnitActionsMarkdown } from './possibleUnitActions';
import { buildTacticalAiOrdersContextBlock } from './tacticalPromptProjection';
import { buildStrategicUnitDisplayLabelResolver, tacticalSubUnitLabelForUserMessage } from '../../shared/unitDisplayNames';
import type { RequestOrdersFlowDeps } from './requestOrdersFlowDepsTypes';
import type { RequestOrdersError, RequestOrdersOptions, RequestOrdersResult } from './requestOrdersFlowTypes';
import {
  REQUEST_ORDERS_MAX_WALL_CLOCK_MS,
  dedupeByUnitKeepLast,
  getAiPathfindingTurnAggregateMetrics,
  logPromptPreview,
  logResponsePreview,
  type AiPathfindingSessionMetrics,
} from './requestOrdersFlowSupport';

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
  if (tacticalBattle) {
    const tHexIds = planState.hexes.map((h) => h.h3Index);
    const { latLngByH3: latLngTactical } = buildLatLngCoordinateMap(tHexIds);
    const tacticalActionsMd = buildPossibleUnitActionsMarkdown({
      state: planState,
      latLngByH3: latLngTactical,
      formatLatLng,
      tacticalBattle,
    });
    if (tacticalActionsMd.trim().length > 0) {
      const tacticalBlock = `## Tactical res4 — Possible Unit Actions\n\n${tacticalActionsMd.trim()}`;
      briefingOverride =
        briefingOverride && briefingOverride.trim().length > 0
          ? `${briefingOverride}\n\n${tacticalBlock}`
          : tacticalBlock;
      logDebug('openRouter requestOrders: tactical possible-actions briefing appended', {
        battleId: tacticalBattle.battleId,
        tacticalBriefChars: tacticalBlock.length,
      });
    }
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
          dropReasons.push(`Duplicate order for ${aiOrderUnitLabel(order.unitId)}`);
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
        const result = validateAiRangedOrder(r, rangedState, { labelForUnitId: aiOrderUnitLabel });
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
