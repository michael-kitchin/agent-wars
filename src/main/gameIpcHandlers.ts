/**
 * Testable IPC handler logic for game:ready and melee intercept resolution.
 * Main process registers IPC that delegates to these functions with real dependencies; tests call with mocks.
 * No Electron imports so tests can run under Node.
 */

import { getAiPendingOrders, type GameStateSnapshot } from './gameDb';
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
  fallbackConsultModelId,
  pickReadyResolutionIpcMirrorFields,
  runEventDrivenAfterResolutionConsultation,
  type StrategicConsultArgs,
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
 * How long a post-resolution consult may run.

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
 * The Ready result this handler returns to the renderer.
 *
 * Purpose: Callers and tests name the IPC result without repeating the full resolution type.
 * When to use: The return of `handleGameReady` and `handleResolveMeleeIntercept`.
 * Expected outcome: The same fields as `ReadyResult`.
 * Exceptions: None.
 */
export type ReadyResultMinimal = ReadyResult;

/**
 * The game and model operations Ready needs from the process that owns the database.
 *
 * Purpose: Tests pass fakes. The Electron process passes the real database and model calls.
 * When to use: The second argument of `handleGameReady`. Melee resolve reuses every field except `ready`.
 * Expected outcome: One object can resolve a turn and, when Events and Run are on, consult the commanders.
 * Exceptions: None. Members may throw the errors of the database or the model call they wrap.
 */
export interface ReadyDeps {
    /**
   * The current match, without a seat's fog mask.
   *
   * Contract: The snapshot Ready reads before it gathers orders.
   * When to use: Turn number, phase, and unit labels.
   * Expected outcome: The match as stored, including every seat's units.
   * Exceptions: Throws when the database is not open.
   */
getGameState: () => GameStateSnapshot;
    /**
   * One seat's view of the match.
   *
   * Contract: The human view may hide unexplored terrain. An AI view does not.
   * When to use: A consult that plans for `playerId`.
   * Expected outcome: That seat's snapshot.
   * Exceptions: Throws when the database is not open or the id is not a seat.
   */
getGameStateForPlayer: (playerId: SeatId) => GameStateSnapshot;
    /**
   * The app-wide model, used when a seat has no commander row.
   *
   * Contract: A function, so a consult sees the selection at call time.
   * When to use: `fallbackConsultModelId`.
   * Expected outcome: The selected model id, or `''` when none is selected.
   * Exceptions: None.
   */
getSelectedModel: () => string;
    /**
   * Whether an API key is configured.
   *
   * Contract: A function, so a consult sees the key at call time.
   * When to use: Before a model call.
   * Expected outcome: True when a key is present.
   * Exceptions: None.
   */
hasKey: () => boolean;
    /**
   * Tool names for the groups the player left on.
   *
   * Contract: Unknown group ids contribute no names.
   * When to use: The consult's `enabledToolNames`.
   * Expected outcome: The names those groups expose.
   * Exceptions: None.
   */
getToolNamesForEnabledGroups: (groupIds: string[]) => string[];
    /**
   * Tool groups used when the payload names none.
   *
   * Contract: The ids of the groups the app enables by default.
   * When to use: A Ready payload with an empty or missing group list.
   * Expected outcome: Those ids, in registry order.
   * Exceptions: None.
   */
defaultGroupIds: string[];
    /**
   * Asks one seat's model for orders.
   *
   * Contract: `options.seatId` is the seat being consulted. The function does not pick a seat on its own.
   * When to use: The post-resolution runner.
   * Expected outcome: That seat's order result, or a rejection the runner logs.
   * Exceptions: May reject. The runner catches that rejection.
   */
requestOrders: (
    state: GameStateSnapshot,
    modelId: string,
    options: { seatId: AiSeatId; enabledToolNames: string[]; usePrecomputation?: boolean; signal?: AbortSignal }
  ) => Promise<RequestAiOrdersResult>;
    /**
   * Resolves the turn from the orders gathered for every owner.
   *
   * Contract: Does not consult. Consultation happens after this returns success.
   * When to use: Once the handler has an order map and the match generation is unchanged.
   * Expected outcome: A success result, a failure reason, or a pause for a melee decision.
   * Exceptions: Throws when resolution itself throws.
   */
ready: (ordersByOwner: TurnOrdersByOwner) => ReadyResult;
}

/**
 * Resolves one strategic turn and, when Events and Run are on, consults the commanders afterward.
 *
 * Purpose: `game:ready` stays testable without Electron. The process registers this function with the real dependencies.
 * When to use: The Ready IPC handler, and tests that pass fakes.
 * Expected outcome: A failure reason when a consult is still pending, the match changed, or resolution failed. A melee pause returns the decision token and candidates. Otherwise the turn result, with a consult either stored for playback or already merged into the strategy, message, tool counts, and cost.
 * Exceptions: Does not throw for a pending consult, a changed match, or a failed resolution. Database and model errors propagate from `deps`.
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
  const modelId = fallbackConsultModelId(deps.getSelectedModel);
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

  const consultArgs: StrategicConsultArgs = {
    useEventDrivenConsultation,
    resolutionSuccess: readyResult.success,
    aiPlanningRunEnabled,
    resolution: readyResult,
    modelId,
    enabledToolNames,
    hasKey: deps.hasKey,
    requestOrders: deps.requestOrders,
    timeoutMs: POST_RESOLUTION_CONSULT_TIMEOUT_MS,
    errorLogMessage: 'handleGameReady: afterResolution failed or timed out',
  };
  if (shouldDeferPostResolutionConsult) {
    setPendingStrategicReadyConsult(planningTurnNumberAfterResolution, consultArgs);
  } else {
    const postConsult = await runEventDrivenAfterResolutionConsultation(consultArgs);
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
