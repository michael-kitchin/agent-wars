/**
 * Testable IPC handler logic for game:ready and melee intercept resolution.
 * Main process registers IPC that delegates to these functions with real dependencies; tests call with mocks.
 * No Electron imports so tests can run under Node.
 */

import { commanderModelId, getAiPendingOrders, type GameStateSnapshot } from './gameDb';
import { AI_SEAT_IDS, isAiSeatId, type AiSeatId, type SeatId, HUMAN_SEAT_ID } from '../shared/seatIds';
import { type OwnerTurnOrders, type TurnOrdersByOwner } from './gameActions/ownerTurnOrders';
import { gatherCommanderOrdersForReady } from './openRouter/commanderReadyGather';
import {
  hasDeferredPlaybackConsultPending,
  setPendingStrategicReadyConsult,
} from './ipc/deferredResolutionPlaybackConsult';
import {
  buildDistinctAiMovesFromPlanningOrders,
  computeAiRangedByTypeCounts,
  pickReadyResolutionIpcMirrorFields,
  runEventDrivenAfterResolutionConsultation,
} from './ipc/readyIpcResolutionMapping';
import { logHybridPipelineBoundary } from './hybridTurnPipeline';
import { logDebug } from './logger';
import { getMatchGeneration } from './matchGeneration';
import type {
  GameReadyIpcPayload,
  RequestAiOrdersResult,
  ReadyResult,
} from '../shared/ipcTypes';
import { AI_CONSULTATION_WAIT_TIMEOUT_MS } from '../shared/aiConsultationLimits';
import { buildStrategicUnitDisplayLabelResolver } from '../shared/unitDisplayNames';
export type { RequestAiOrdersResult } from '../shared/ipcTypes';
export {
  handleResolveMeleeIntercept,
  type ResolveMeleeInterceptDeps,
} from './ipc/meleeInterceptResolveIpc';

/**
 * Documents the module-scope binding `POST_RESOLUTION_CONSULT_TIMEOUT_MS` (POST_RESOLUTION_CONSULT_TIMEOUT_MS).

 * Purpose: Local name for `AI_CONSULTATION_WAIT_TIMEOUT_MS`. A shorter race would abandon the post-resolution consult while the tool loop was still allowed to run.
 * When to use: `runEventDrivenAfterResolutionConsultation` and `runEventDrivenAfterTacticalBeatConsultation`.
 * Expected outcome: The waiter lasts as long as one legal consultation, including the in-flight round and the repair call.
 * Exceptions: None.
 */
export const POST_RESOLUTION_CONSULT_TIMEOUT_MS = AI_CONSULTATION_WAIT_TIMEOUT_MS;

/**
 * Collects movement and ranged orders for every AI seat.
 *
 * Purpose: Ready playback and counts include later commanders, not only the first AI seat.
 * When to use: After `gatherCommanderOrdersForReady`.
 * Expected outcome: Orders in seat order. A seat with no entry contributes nothing.
 * Exceptions: None.
 */
function aiPlanningOrders(ordersByOwner: TurnOrdersByOwner): {
  movementOrders: OwnerTurnOrders['movementOrders'][number][];
  rangedOrders: OwnerTurnOrders['rangedOrders'][number][];
} {
  logDebug('gameIpcHandlers aiPlanningOrders', { ownerCount: ordersByOwner.size });
  return {
    movementOrders: [...AI_SEAT_IDS.flatMap((seatId) => ordersByOwner.get(seatId)?.movementOrders ?? [])],
    rangedOrders: [...AI_SEAT_IDS.flatMap((seatId) => ordersByOwner.get(seatId)?.rangedOrders ?? [])],
  };
}

/**
 * Documents the `ReadyResultMinimal` type alias (export type ReadyResultMinimal).

 * Purpose: Supports maintainability by documenting why `ReadyResultMinimal` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type ReadyResultMinimal = ReadyResult;

/**
 * Documents the `ReadyDeps` interface as a named contract surface (export interface ReadyDeps).

 * Purpose: Supports maintainability by documenting why `ReadyDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ReadyDeps {
    /**
   * Specifies the contract for the `getGameState` member (getGameState: () => GameStateSnapshot;).

   * Contract: Describes stable behavior for callers of `getGameState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getGameState: () => GameStateSnapshot;
    /**
   * Specifies the contract for the `getGameStateForPlayer` member (getGameStateForPlayer: (playerId: SeatId) => GameStateSnapshot;).

   * Contract: Describes stable behavior for callers of `getGameStateForPlayer` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getGameStateForPlayer: (playerId: SeatId) => GameStateSnapshot;
    /**
   * Specifies the contract for the `getSelectedModel` member (getSelectedModel: () => string;).

   * Contract: Describes stable behavior for callers of `getSelectedModel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getSelectedModel: () => string;
    /**
   * Specifies the contract for the `hasKey` member (hasKey: () => boolean;).

   * Contract: Describes stable behavior for callers of `hasKey` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hasKey: () => boolean;
    /**
   * Specifies the contract for the `getToolNamesForEnabledGroups` member (getToolNamesForEnabledGroups: (groupIds: string[]) => string[];).

   * Contract: Describes stable behavior for callers of `getToolNamesForEnabledGroups` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getToolNamesForEnabledGroups: (groupIds: string[]) => string[];
    /**
   * Specifies the contract for the `defaultGroupIds` member (defaultGroupIds: string[];).

   * Contract: Describes stable behavior for callers of `defaultGroupIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
defaultGroupIds: string[];
    /**
   * Specifies the contract for the `requestOrders` member (requestOrders: ( state: GameStateSnapshot, modelId: string, options: { enabledToolNames: string[]; usePrecomputation?: boolean } ) => Promise<).

   * Contract: Describes stable behavior for callers of `requestOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
requestOrders: (
    state: GameStateSnapshot,
    modelId: string,
    options: { seatId: AiSeatId; enabledToolNames: string[]; usePrecomputation?: boolean; signal?: AbortSignal }
  ) => Promise<RequestAiOrdersResult>;
    /**
   * Specifies the contract for the `ready` member (ready: ( aiOrders: { unitId: string; toH3Index: string }[], aiRangedOrders: RangedAttackOrder[], aiAirStrikeOrders?: AirStrikeOrder[], aiFer).

   * Contract: Describes stable behavior for callers of `ready` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ready: (ordersByOwner: TurnOrdersByOwner) => ReadyResult;
}

/**
 * Defines the `handleGameReady` function shape (export async function handleGameReady().

 * Purpose: Supports maintainability by documenting why `handleGameReady` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function handleGameReady(
  payload: GameReadyIpcPayload | undefined,
  deps: ReadyDeps
): Promise<ReadyResultMinimal> {
  logDebug('handleGameReady', { hasPayload: payload !== undefined });
  const generationAtStart = getMatchGeneration();
  if (hasDeferredPlaybackConsultPending()) {
    logDebug('handleGameReady blocked: deferred playback consult pending', {});
    return { success: false, reason: 'Resolution playback consultation is still in progress.' };
  }
  const state = deps.getGameState();
  const opponentUnitDisplayLabel = buildStrategicUnitDisplayLabelResolver(state.units);
  const formatAiMoveLogLine = (o: { unitId: string; toH3Index: string }) =>
    `${opponentUnitDisplayLabel(o.unitId)} → ${o.toH3Index}`;
  logHybridPipelineBoundary('handleGameReady', { turnNumber: state.turnNumber, phase: state.phase });
  const fromSeat = commanderModelId(AI_SEAT_IDS[0]);
  const modelId = fromSeat === null ? deps.getSelectedModel() : fromSeat;
  const enabledGroupIds =
    payload?.enabledToolGroups && payload.enabledToolGroups.length > 0
      ? payload.enabledToolGroups
      : deps.defaultGroupIds;
  const enabledToolNames = deps.getToolNamesForEnabledGroups(enabledGroupIds);
  const useEventDrivenConsultation = payload?.useEventDrivenConsultation === true;
  const aiPlanningRunEnabled = payload?.aiPlanningRunEnabled === true;

  // A stored row is a consultation. Standing orders leave no row. Read before gather clears the rows.
  const seatsWithStoredPlan = new Set(AI_SEAT_IDS.filter((seatId) => getAiPendingOrders(seatId) != null));
  const ordersByOwner = await gatherCommanderOrdersForReady({
    useEventDriven: useEventDrivenConsultation,
    turnNumber: state.turnNumber,
    aiPlanningRunEnabled,
    hasKey: deps.hasKey(),
    getGameStateForPlayer: (seatId) => deps.getGameStateForPlayer(seatId),
  });
  const planned = aiPlanningOrders(ordersByOwner);
  const aiOrders = planned.movementOrders;
  const aiRangedOrders = planned.rangedOrders;
  const consultedSeatIds = AI_SEAT_IDS.filter(
    (seatId) => ordersByOwner.has(seatId) && seatsWithStoredPlan.has(seatId)
  );
  const aiSkipped = false;
  const aiDropped = undefined;
  const aiDropReasons = undefined;
  let toolInvocationCounts: Record<string, number> | undefined;
  let turnCost: number | undefined;
  const turnWallClockMs = undefined;
  const turnInputTokens = undefined;
  const turnOutputTokens = undefined;
  const aiSkipReason = undefined;
  let aiStrategy: string | undefined;
  let aiMessage: string | undefined;
  const aiConsulted = useEventDrivenConsultation ? consultedSeatIds.length > 0 : undefined;
  logDebug('handleGameReady consultation source', {
    useEventDrivenConsultation,
    consultedSeatIds,
    aiConsulted: aiConsulted ?? null,
  });

  const aiMoves = buildDistinctAiMovesFromPlanningOrders(state, aiOrders);

  if (getMatchGeneration() !== generationAtStart) {
    logDebug('handleGameReady: match generation changed before resolution', { generationAtStart });
    return { success: false, reason: 'A new game started before this turn finished.' };
  }
  const readyResult = deps.ready(ordersByOwner);
  if (!readyResult.success) {
    return { success: false, reason: readyResult.reason };
  }
  if (readyResult.awaitingMeleeDecision) {
    const aiRangedByTypeAwait = computeAiRangedByTypeCounts(state, aiRangedOrders);
    const aiMovesAwait = buildDistinctAiMovesFromPlanningOrders(state, aiOrders);
    const aiMovesLogAwait = aiOrders.length > 0 ? aiOrders.map(formatAiMoveLogLine) : undefined;
    logHybridPipelineBoundary('handleGameReady awaitingMeleeDecision', { turnNumber: state.turnNumber });
    return {
      success: true,
      awaitingMeleeDecision: true,
      meleeDecisionToken: readyResult.meleeDecisionToken,
      meleeInterceptCandidates: readyResult.meleeInterceptCandidates,
      aiSkipped: aiSkipped && aiOrders.length === 0,
      aiSkipReason,
      aiOrderCount: aiOrders.length,
      aiRangedByType: aiRangedByTypeAwait,
      aiDropped,
      aiDropReasons,
      aiMovesLog: aiMovesLogAwait,
      aiMoves: aiMovesAwait.length > 0 ? aiMovesAwait : undefined,
      aiConsulted: useEventDrivenConsultation ? aiConsulted : undefined,
      aiStrategy,
      aiMessage,
      toolInvocationCounts,
      cost: turnCost,
      wallClockMs: turnWallClockMs,
      inputTokens: turnInputTokens,
      outputTokens: turnOutputTokens,
    };
  }
  const resolvedFerryMoves = readyResult.resolvedFerryMoves ?? [];
  const humanFerryMoves = resolvedFerryMoves
    .filter((move) => move.player === HUMAN_SEAT_ID)
    .map((move) => ({ unitId: move.unitId, fromH3Index: move.fromH3Index, toH3Index: move.toH3Index }));
  const opponentFerryMoves = resolvedFerryMoves
    .filter((move) => isAiSeatId(move.player))
    .map((move) => ({ unitId: move.unitId, fromH3Index: move.fromH3Index, toH3Index: move.toH3Index }));
  const allAiMoves = [...aiMoves, ...opponentFerryMoves];
  const allHumanMoves = [...(readyResult.humanMoves ?? []), ...humanFerryMoves];

  const shouldDeferPostResolutionConsult = useEventDrivenConsultation && aiPlanningRunEnabled;
  const planningTurnNumberAfterResolution = deps.getGameState().turnNumber;

  if (shouldDeferPostResolutionConsult) {
    setPendingStrategicReadyConsult(planningTurnNumberAfterResolution, {
      useEventDrivenConsultation,
      resolutionSuccess: readyResult.success,
      aiPlanningRunEnabled,
      opponentState: deps.getGameStateForPlayer(AI_SEAT_IDS[0]),
      resolution: readyResult,
      modelId: modelId ?? '',
      enabledToolNames,
      hasKey: deps.hasKey,
      requestOrders: deps.requestOrders,
      timeoutMs: POST_RESOLUTION_CONSULT_TIMEOUT_MS,
      errorLogMessage: 'handleGameReady: afterResolution failed or timed out',
    });
  } else {
    const postConsult = await runEventDrivenAfterResolutionConsultation({
      useEventDrivenConsultation,
      resolutionSuccess: readyResult.success,
      aiPlanningRunEnabled,
      opponentState: deps.getGameStateForPlayer(AI_SEAT_IDS[0]),
      resolution: readyResult,
      modelId: modelId ?? '',
      enabledToolNames,
      hasKey: deps.hasKey,
      requestOrders: deps.requestOrders,
      timeoutMs: POST_RESOLUTION_CONSULT_TIMEOUT_MS,
      errorLogMessage: 'handleGameReady: afterResolution failed or timed out',
    });
    if (postConsult.aiStrategy) {
      aiStrategy = postConsult.aiStrategy;
    }
    if (postConsult.aiMessage) {
      aiMessage = postConsult.aiMessage;
    }
    if (postConsult.toolInvocationCounts) {
      toolInvocationCounts = postConsult.toolInvocationCounts;
    }
    if (typeof postConsult.cost === 'number' && Number.isFinite(postConsult.cost)) {
      turnCost = (turnCost ?? 0) + postConsult.cost;
    }
  }

  const aiRangedByType = computeAiRangedByTypeCounts(state, aiRangedOrders);
  const aiMovesLog = aiOrders.length > 0 ? aiOrders.map(formatAiMoveLogLine) : undefined;

  return {
    success: true,
    aiSkipped: aiSkipped && aiOrders.length === 0,
    aiSkipReason,
    aiOrderCount: aiOrders.length,
    aiRangedByType,
    aiDropped,
    aiDropReasons,
    aiMovesLog,
    aiMoves: allAiMoves.length > 0 ? allAiMoves : undefined,
    humanMoves: allHumanMoves.length > 0 ? allHumanMoves : undefined,
    aiConsulted: useEventDrivenConsultation ? aiConsulted : undefined,
    ...pickReadyResolutionIpcMirrorFields(readyResult),
    aiStrategy,
    aiMessage,
    toolInvocationCounts,
    cost: turnCost,
    wallClockMs: turnWallClockMs,
    inputTokens: turnInputTokens,
    outputTokens: turnOutputTokens,
    tacticalAutoStartH3Index: readyResult.tacticalAutoStartH3Index,
    ...(shouldDeferPostResolutionConsult
      ? {
          postResolutionConsultDeferred: true,
          deferredResolutionPlanningTurnNumber: planningTurnNumberAfterResolution,
        }
      : {}),
  };
}
