import * as fs from 'fs';
import * as path from 'path';
import { cellToLatLng } from 'h3-js';
import type { AirStrikeOrder, EmbarkOrder, FerryOrder } from '../../shared/ipcTypes';
import { buildLatLngCoordinateMap, LATLNG_DECIMAL_PLACES } from '../mapData';
import { logDebug, logError, logTrace } from '../logger';
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
  getAndClearAiToolLimitExceededLastTurn,
  setAiLastConsultationTurn,
  setAiToolLimitExceededLastTurn,
} from '../gameDb';
import type { GameStateSnapshot } from '../gameDb';
import { buildProductionBriefingBlock } from './briefingSections';
import { getInitialUserMessage } from './promptText';
import { TOOL2_NAMES } from '../tools/tool2Assessment';
import { TOOL3_NAMES } from '../tools/tool3CombatEstimation';

type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface RequestOrdersResult {
  success: true;
  orders: { unitId: string; toH3Index: string }[];
  rangedAttacks?: { unitId: string; targetH3Index: string }[];
  airStrikes?: AirStrikeOrder[];
  ferryOrders?: FerryOrder[];
  embarkOrders?: EmbarkOrder[];
  strategy?: string;
  dropped?: number;
  dropReasons?: string[];
  toolInvocationCounts?: Record<string, number>;
  cost?: number;
  wallClockMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface RequestOrdersError {
  success: false;
  error: string;
}

export interface RequestOrdersOptions {
  enabledToolNames?: string[];
  signal?: AbortSignal;
  onLog?: (line: string, isError?: boolean) => void;
  usePrecomputation?: boolean;
}

const FULL_PROMPT_LOG_PREVIEW_CHARS = 1200;
const FULL_PROMPT_LOG_ENV_FLAG = 'AGENT_WARS_LOG_FULL_PROMPTS';
const FULL_RESPONSE_LOG_PREVIEW_CHARS = 1200;
const FULL_RESPONSE_LOG_ENV_FLAG = 'AGENT_WARS_LOG_FULL_RESPONSES';
const REQUEST_ORDERS_MAX_WALL_CLOCK_MS = 90_000;

interface AiPathfindingSessionMetrics {
  created: number;
  reused: number;
  planRouteToolCalls: number;
  checkDistanceToolCalls: number;
  totalToolCalls: number;
}

interface AiPathfindingTurnAggregateMetrics extends AiPathfindingSessionMetrics {
  turnNumber: number;
  requestCount: number;
}

const aiPathfindingTurnAggregateMetrics: AiPathfindingTurnAggregateMetrics = {
  turnNumber: -1,
  requestCount: 0,
  created: 0,
  reused: 0,
  planRouteToolCalls: 0,
  checkDistanceToolCalls: 0,
  totalToolCalls: 0,
};

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
 * True when env is set to a common affirmative (1, true, yes, on); case-insensitive.
 * Strips optional surrounding quotes so .env lines like AGENT_WARS_LOG_FULL_PROMPTS="1" work.
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

interface RequestOrdersFlowDeps {
  loadKey: () => string;
  getToolFlags: (enabledToolNames: string[] | undefined) => {
    planningEnabled: boolean;
    assessmentEnabled: boolean;
    estimationEnabled: boolean;
    ordersEnabled: boolean;
    memoryEnabled: boolean;
    productionEnabled: boolean;
    fallbackMovementEnabled: boolean;
  };
  toolGroupRegistry: { id: string; toolNames: readonly string[] }[];
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
  buildToolDefinitions: (enabledToolNames?: string[]) => Array<{
    type: 'function';
    function: { name: string; description: string; parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] } };
  }>;
  postOpenRouterChatWithTimeoutAndRetry: (payload: {
    key: string;
    body: Record<string, unknown>;
    signal?: AbortSignal;
    onLog?: (line: string, isError?: boolean) => void;
    requestLabel: string;
  }) => Promise<{ ok: true; status: number; headers: Record<string, string>; bodyText: string } | { ok: false; error: string }>;
  getGroupIdForToolName: (toolName: string) => string | undefined;
  validateAiOrder: (order: { unitId: string; toH3Index: string }, state: GameStateSnapshot) => { valid: true } | { valid: false; reason: string };
  validateAiRangedOrder: (
    order: { unitId: string; targetH3Index: string },
    state: GameStateSnapshot
  ) => { valid: true } | { valid: false; reason: string };
  formatLatLng: (ll: [number, number]) => string;
}

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

  const requestedToolNames = options?.enabledToolNames;
  const signal = options?.signal;
  const onLog = options?.onLog;
  const usePrecomputation = options?.usePrecomputation === true;
  const precomputationExcluded = new Set<string>([...TOOL2_NAMES, ...TOOL3_NAMES]);
  const enabledToolNames =
    usePrecomputation && requestedToolNames !== undefined
      ? requestedToolNames.filter((n) => !precomputationExcluded.has(n))
      : usePrecomputation && requestedToolNames === undefined
        ? toolGroupRegistry.flatMap((g) => [...g.toolNames]).filter((n) => !precomputationExcluded.has(n))
        : requestedToolNames;
  if (onLog) onLog('Requesting AI orders…');
  logDebug('openRouter requestOrders', {
    modelId,
    turnNumber: state.turnNumber,
    enabledToolsRequested: requestedToolNames === undefined ? 'all' : requestedToolNames.length,
    enabledToolsEffective: enabledToolNames === undefined ? 'all' : enabledToolNames.length,
    usePrecomputation,
    filteredForPrecomputation: usePrecomputation,
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

  const opponentUnits = state.units.filter((u) => u.player === 'opponent');
  if (opponentUnits.length === 0) {
    logDebug('openRouter requestOrders: no opponent units remain, skipping LLM call');
    if (onLog) onLog('No opponent units remain.');
    return { success: true, orders: [] };
  }

  const hexList = state.hexes.map((h) => h.h3Index);
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
    aiPlanningPathfindingSession = createPathfindingSession(state, latLngByH3, resolveToH3);
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
  const systemPrompt = buildSystemPromptForTools(state, coordMap, enabledToolNames, briefingOverride);
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
        for (const [toolCallIndex, tc] of toolCalls.entries()) {
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
          const result = (toolName.includes('order') || toolName.includes('standing'))
            ? executeTool5(toolName, args, state, latLngByH3, resolveToH3)
            : (toolName.includes('build') || toolName.includes('production') || toolName.includes('query_production'))
              ? executeTool6(toolName, args, state, latLngByH3, resolveToH3)
              : toolName.includes('memory')
                ? executeTool4(toolName, args, state, latLngByH3, resolveToH3)
                : toolName.includes('estimate')
                  ? executeTool3(toolName, args, state, latLngByH3, resolveToH3)
                  : toolName.includes('assess')
                    ? executeTool2(toolName, args, state, latLngByH3, resolveToH3)
                    : executeTool1(
                        toolName,
                        args,
                        state,
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
      let parsed = parseOrdersResponse(content, resolveToH3, state, latLngByH3, flags.productionEnabled);
      if (!parsed && !parseRepairAttempted) {
        parseRepairAttempted = true;
        const repairMessages: ChatMessage[] = [
          ...messages,
          { role: 'assistant', content },
          {
            role: 'user',
            content:
              `Your previous response was not parseable JSON. Reply now with JSON only (no prose, no markdown, no code fences) using exactly this top-level object schema (orders[] only; no movementOrders/rangedAttacks; never a top-level array): ${buildJsonAssistantRepairSchema(flags.productionEnabled)}. Omit optional arrays when empty.`,
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
            parsed = parseOrdersResponse(repairContent, resolveToH3, state, latLngByH3, flags.productionEnabled);
          }
        }
      }
      if (!parsed) return failRequest('Invalid response: could not parse orders');

      if (parsed.callbacks?.length) replaceSubscriptions('opponent', parsed.callbacks, state.turnNumber);
      toolInvocationCounts['events'] = parsed.callbacks?.length ?? 0;

      const { movementOrders: standingOrderMovement, rangedAttacks: standingOrderRanged } = flags.ordersEnabled
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
        const result = validateAiOrder(order, state);
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
      if (flags.ordersEnabled && invalidStandingMovementUnits.size > 0) {
        for (const unitId of invalidStandingMovementUnits) {
          executeTool5('cancel_order', { unitId }, state, latLngByH3, resolveToH3);
        }
      }

      const validatedRanged: { unitId: string; targetH3Index: string }[] = [];
      const seenRanged = new Set<string>();
      for (const r of mergedRanged) {
        if (seenRanged.has(r.unitId)) {
          dropReasons.push(`Duplicate ranged for ${r.unitId}`);
          continue;
        }
        const result = validateAiRangedOrder(r, state);
        if (result.valid) {
          validatedRanged.push(r);
          seenRanged.add(r.unitId);
        } else {
          if (result.reason === 'Target out of range') {
            const movedTo = llmMovementByUnit.get(r.unitId);
            if (movedTo && movedTo === r.targetH3Index) continue;
          }
          dropReasons.push(`Ranged ${r.unitId} -> ${r.targetH3Index}: ${result.reason}`);
        }
      }

      markSuccessfulConsultation();
      return {
        success: true,
        orders: validated,
        rangedAttacks: validatedRanged.length > 0 ? validatedRanged : undefined,
        airStrikes: llmAirStrikes.length > 0 ? llmAirStrikes : undefined,
        ferryOrders: llmFerryOrders.length > 0 ? llmFerryOrders : undefined,
        embarkOrders: llmEmbarkOrders.length > 0 ? llmEmbarkOrders : undefined,
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
