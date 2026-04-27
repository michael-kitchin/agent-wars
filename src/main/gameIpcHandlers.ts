/**
 * Testable IPC handler logic for game:requestAiOrders, game:cancelRequestAiOrders, and game:ready.
 * Main process registers IPC that delegates to these functions with real dependencies; tests call with mocks.
 * No Electron imports so tests can run under Node.
 */

import type { GameStateSnapshot } from './gameDb';
import {
  getAiPendingOrders,
  clearAiPendingOrders,
  setAiLastConsultationTurn,
  clearOpponentCombatSinceConsultation,
} from './gameDb';
import { buildLatLngCoordinateMap } from './mapData';
import { generateOrdersForStandingOrders } from './tools/tool5StandingOrders';
import { shouldEndTacticalBattleForAnnihilation } from '../shared/tacticalAnnihilation';
import { getActiveTacticalBattleSnapshot } from './tacticalBattle/tacticalBattleSession';
import {
  buildDistinctAiMovesFromPlanningOrders,
  computeAiRangedByTypeCounts,
  pickReadyResolutionIpcMirrorFields,
  runEventDrivenAfterResolutionConsultation,
} from './ipc/readyIpcResolutionMapping';
import { tacticalLogMutate } from './tacticalBattle/tacticalLogging';
import { logHybridPipelineBoundary } from './hybridTurnPipeline';
import { logDebug } from './logger';
import type { TacticalBattleSnapshot } from '../shared/tacticalBattleTypes';
import type {
  GameReadyIpcPayload,
  RequestAiOrdersResult,
  RangedAttackOrder,
  AirStrikeOrder,
  EmbarkOrder,
  FerryOrder,
  ReadyResult,
  ResolveMeleeInterceptIpcPayload,
  TacticalOpponentPlanPayload,
} from '../shared/ipcTypes';
import { buildStrategicUnitDisplayLabelResolver } from '../shared/unitDisplayNames';
export type { RequestAiOrdersResult } from '../shared/ipcTypes';

/**
 * Documents the module-scope binding `POST_RESOLUTION_CONSULT_TIMEOUT_MS` (POST_RESOLUTION_CONSULT_TIMEOUT_MS).

 * Purpose: Supports maintainability by documenting why `POST_RESOLUTION_CONSULT_TIMEOUT_MS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const POST_RESOLUTION_CONSULT_TIMEOUT_MS = 120_000;

/**
 * Documents the `ReadyResultMinimal` type alias (export type ReadyResultMinimal).

 * Purpose: Supports maintainability by documenting why `ReadyResultMinimal` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type ReadyResultMinimal = ReadyResult;

/**
 * Documents the `RequestAiOrdersDeps` interface as a named contract surface (export interface RequestAiOrdersDeps).

 * Purpose: Supports maintainability by documenting why `RequestAiOrdersDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface RequestAiOrdersDeps {
    /**
   * Specifies the contract for the `getGameState` member (getGameState: () => GameStateSnapshot;).

   * Contract: Describes stable behavior for callers of `getGameState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getGameState: () => GameStateSnapshot;
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
   * Specifies the contract for the `requestOrders` member (requestOrders: ( state: GameStateSnapshot, modelId: string, options: { enabledToolNames: string[]; signal?: AbortSignal; usePrecomputation?: bool).

   * Contract: Describes stable behavior for callers of `requestOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
requestOrders: (
    state: GameStateSnapshot,
    modelId: string,
    options: {
      enabledToolNames: string[];
      signal?: AbortSignal;
      usePrecomputation?: boolean;
      tacticalAiBattle?: import('../shared/tacticalBattleTypes').TacticalBattleSnapshot;
    }
  ) => Promise<RequestAiOrdersResult>;
    /**
   * Specifies the contract for the `controllerRef` member (controllerRef: { current: AbortController | null };).

   * Contract: Describes stable behavior for callers of `controllerRef` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
controllerRef: { current: AbortController | null };
}

/**
 * Defines the `handleRequestAiOrders` function shape (export async function handleRequestAiOrders( payload: { enabledToolGroups?: string[] } | undefined, deps: RequestAiOrdersDeps ): Promise<RequestAiOrdersR).

 * Purpose: Supports maintainability by documenting why `handleRequestAiOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function handleRequestAiOrders(
  payload: { enabledToolGroups?: string[] } | undefined,
  deps: RequestAiOrdersDeps
): Promise<RequestAiOrdersResult> {
  const state = deps.getGameState();
  const activeTactical = getActiveTacticalBattleSnapshot();
  if (
    activeTactical &&
    shouldEndTacticalBattleForAnnihilation(activeTactical.subUnits)
  ) {
    logDebug('handleRequestAiOrders skipping; tactical roster is terminal (annihilation)', {
      battleId: activeTactical.battleId,
      turnNumber: state.turnNumber,
    });
    return {
      success: false,
      error: 'Tactical battle ended; exit to the strategic map before requesting new AI orders.',
    };
  }
  if (state.phase !== 'planning') {
    const tacticalDuringResolution = !!activeTactical && state.phase === 'resolution';
    if (!tacticalDuringResolution) {
      return { success: false, error: 'Not in planning phase' };
    }
    logDebug('handleRequestAiOrders allowing tactical opponent consultation during strategic resolution', {
      battleId: activeTactical!.battleId,
      turnNumber: state.turnNumber,
    });
  }
  const enabledGroupIds =
    payload?.enabledToolGroups && payload.enabledToolGroups.length > 0
      ? payload.enabledToolGroups
      : deps.defaultGroupIds;
  const enabledToolNames = deps.getToolNamesForEnabledGroups(enabledGroupIds);
  const usePrecomputation = enabledGroupIds.includes('precomputation');
  const modelId = deps.getSelectedModel();
  if (!modelId?.trim() || !deps.hasKey()) {
    return { success: false, error: !deps.hasKey() ? 'No API key set' : 'No model selected' };
  }
  if (deps.controllerRef.current) {
    deps.controllerRef.current.abort();
  }
  deps.controllerRef.current = new AbortController();
  const signal = deps.controllerRef.current.signal;
  try {
    const raw = await deps.requestOrders(state, modelId, {
      enabledToolNames,
      signal,
      usePrecomputation: activeTactical ? false : usePrecomputation,
      tacticalAiBattle: activeTactical ?? undefined,
    });
    if (activeTactical && raw.success === true) {
      const tacticalOpponentPlan: TacticalOpponentPlanPayload = {
        movementOrders: [...raw.orders],
        rangedAttacks: [...(raw.rangedAttacks ?? [])],
        airStrikes: [...(raw.airStrikes ?? [])],
        ferryOrders: [...(raw.ferryOrders ?? [])],
        embarkOrders: [...(raw.embarkOrders ?? [])],
      };
      logDebug('handleRequestAiOrders tactical opponent plan buffered', {
        movementCount: tacticalOpponentPlan.movementOrders.length,
        rangedCount: tacticalOpponentPlan.rangedAttacks.length,
        airCount: tacticalOpponentPlan.airStrikes.length,
        ferryCount: tacticalOpponentPlan.ferryOrders.length,
        embarkCount: tacticalOpponentPlan.embarkOrders.length,
      });
      tacticalLogMutate('handleRequestAiOrders tactical consultation completed', {
        strippedMovementOrders: raw.orders.length,
        strippedRanged: raw.rangedAttacks?.length ?? 0,
        strippedAir: raw.airStrikes?.length ?? 0,
        tacticalSnapshotReturned: true,
      });
      const tacticalNote =
        '(tactical) Opponent orders are buffered until Ready; they are not queued as strategic actions.';
      return {
        ...raw,
        orders: [],
        rangedAttacks: undefined,
        airStrikes: undefined,
        ferryOrders: undefined,
        embarkOrders: undefined,
        dropReasons: [...(raw.dropReasons ?? []), tacticalNote],
        tacticalBattle: activeTactical,
        tacticalOpponentPlan,
      };
    }
    return raw;
  } finally {
    if (deps.controllerRef.current?.signal === signal) {
      deps.controllerRef.current = null;
    }
  }
}

/**
 * Defines the `cancelRequestAiOrders` function shape (export function cancelRequestAiOrders(controllerRef:).

 * Purpose: Supports maintainability by documenting why `cancelRequestAiOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function cancelRequestAiOrders(controllerRef: { current: AbortController | null }): void {
  if (controllerRef.current) {
    controllerRef.current.abort();
    controllerRef.current = null;
  }
}

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
   * Specifies the contract for the `getGameStateForPlayer` member (getGameStateForPlayer: (playerId: 'human' | 'opponent') => GameStateSnapshot;).

   * Contract: Describes stable behavior for callers of `getGameStateForPlayer` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getGameStateForPlayer: (playerId: 'human' | 'opponent') => GameStateSnapshot;
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
    options: { enabledToolNames: string[]; usePrecomputation?: boolean }
  ) => Promise<RequestAiOrdersResult>;
    /**
   * Specifies the contract for the `ready` member (ready: ( aiOrders: { unitId: string; toH3Index: string }[], aiRangedOrders: RangedAttackOrder[], aiAirStrikeOrders?: AirStrikeOrder[], aiFer).

   * Contract: Describes stable behavior for callers of `ready` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ready: (
    aiOrders: { unitId: string; toH3Index: string }[],
    aiRangedOrders: RangedAttackOrder[],
    aiAirStrikeOrders?: AirStrikeOrder[],
    aiFerryOrders?: FerryOrder[],
    aiEmbarkOrders?: EmbarkOrder[]
  ) => ReadyResult;
}

/**
 * Documents the `ResolveMeleeInterceptDeps` type alias (export type ResolveMeleeInterceptDeps).

 * Purpose: Reuses ready IPC dependencies while swapping the game-action entry point to melee-intercept resolve.
 * When to use: `handleResolveMeleeIntercept` wiring from `main.ts`.
 * Expected outcome: Same consultation hooks as `ReadyDeps` except `ready` is replaced by `resolveMeleeIntercept`.
 * Exceptions: None.
 */
export type ResolveMeleeInterceptDeps = Omit<ReadyDeps, 'ready'> & {
    /**
   * Specifies the contract for the `resolveMeleeIntercept` member (resolveMeleeIntercept: (payload: ResolveMeleeInterceptIpcPayload) => ReadyResult;).

   * Contract: Completes paused strategic resolution after modal submission.
   * When to use: Invoked once per pending intercept.
   * Expected outcome: Returns the same completion shape as `ready` for a finished turn.
   * Exceptions: None.
   */
resolveMeleeIntercept: (payload: ResolveMeleeInterceptIpcPayload) => ReadyResult;
};

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
  // Milestone 0.7 behavior preserved here: event-driven vs every-turn toggle, precomputation groups, Ready flow,
  // afterResolution consultation and POST_RESOLUTION_CONSULT_TIMEOUT_MS — unchanged by 1.1 DB/LLM contract work.
  const state = deps.getGameState();
  const aiState = deps.getGameStateForPlayer('opponent');
  const opponentUnitDisplayLabel = buildStrategicUnitDisplayLabelResolver(aiState.units);
  const formatAiMoveLogLine = (o: { unitId: string; toH3Index: string }) =>
    `${opponentUnitDisplayLabel(o.unitId)} → ${o.toH3Index}`;
  logHybridPipelineBoundary('handleGameReady', { turnNumber: state.turnNumber, phase: state.phase });
  const modelId = deps.getSelectedModel();
  const enabledGroupIds =
    payload?.enabledToolGroups && payload.enabledToolGroups.length > 0
      ? payload.enabledToolGroups
      : deps.defaultGroupIds;
  const enabledToolNames = deps.getToolNamesForEnabledGroups(enabledGroupIds);
  const usePrecomputation = enabledGroupIds.includes('precomputation');
  const useEventDrivenConsultation = payload?.useEventDrivenConsultation === true;
  const aiPlanningRunEnabled = payload?.aiPlanningRunEnabled === true;

  let aiOrders: { unitId: string; toH3Index: string }[] = [];
  let aiRangedOrders: RangedAttackOrder[] = [];
  let aiAirStrikeOrders: AirStrikeOrder[] = [];
  let aiFerryOrders: FerryOrder[] = [];
  let aiEmbarkOrders: EmbarkOrder[] = [];
  let aiSkipped = false;
  let aiDropped: number | undefined;
  let aiDropReasons: string[] | undefined;
  let toolInvocationCounts: Record<string, number> | undefined;
  let turnCost: number | undefined;
  let turnWallClockMs: number | undefined;
  let turnInputTokens: number | undefined;
  let turnOutputTokens: number | undefined;
  let aiSkipReason: string | undefined;
  let aiStrategy: string | undefined;
  const applyPrecomputedOrdersFromPayload = (precomputedPayload: GameReadyIpcPayload | undefined): void => {
    aiOrders = precomputedPayload?.precomputedAiOrders ?? [];
    aiRangedOrders = precomputedPayload?.precomputedAiRangedOrders ?? [];
    aiAirStrikeOrders = precomputedPayload?.precomputedAiAirStrikeOrders ?? [];
    aiFerryOrders = precomputedPayload?.precomputedAiFerryOrders ?? [];
    aiEmbarkOrders = precomputedPayload?.precomputedAiEmbarkOrders ?? [];
    aiStrategy = precomputedPayload?.precomputedAiStrategy;
  };

  const usePrecomputed =
    payload?.precomputedAiOrders !== undefined && payload?.precomputedAiRangedOrders !== undefined;
  let aiConsulted: boolean | undefined;
  if (useEventDrivenConsultation) {
    if (usePrecomputed) {
      applyPrecomputedOrdersFromPayload(payload);
      aiConsulted = true;
      // Initial event-driven consultation can happen before the first Ready; record it so
      // first_consultation does not fire again on the immediate after-resolution evaluation.
      setAiLastConsultationTurn(state.turnNumber);
      clearOpponentCombatSinceConsultation();
    } else {
      const pending = getAiPendingOrders('opponent');
      if (pending) {
        aiOrders = pending.movementOrders;
        aiRangedOrders = pending.rangedOrders;
        aiAirStrikeOrders = pending.airStrikeOrders;
        aiFerryOrders = pending.ferryOrders;
        aiEmbarkOrders = pending.embarkOrders ?? [];
        clearAiPendingOrders('opponent');
        aiConsulted = true;
      } else {
        const hexList = aiState.hexes.map((h) => h.h3Index);
        const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
        const generated = generateOrdersForStandingOrders('opponent', aiState, latLngByH3, resolveToH3);
        aiOrders = generated.movementOrders;
        aiRangedOrders = generated.rangedAttacks;
        aiConsulted = false;
      }
    }
  } else {
  if (usePrecomputed) {
    applyPrecomputedOrdersFromPayload(payload);
  } else if (aiPlanningRunEnabled && modelId && deps.hasKey()) {
    const result = await deps.requestOrders(aiState, modelId, {
      enabledToolNames,
      usePrecomputation,
    });
    if (result.success) {
      aiOrders = result.orders;
      aiRangedOrders = result.rangedAttacks ?? [];
      aiAirStrikeOrders = result.airStrikes ?? [];
      aiFerryOrders = result.ferryOrders ?? [];
      aiEmbarkOrders = result.embarkOrders ?? [];
      aiStrategy = result.strategy;
      aiDropped = result.dropped;
      aiDropReasons = result.dropReasons?.length ? result.dropReasons : undefined;
      toolInvocationCounts = result.toolInvocationCounts;
      if (result.cost !== undefined) turnCost = result.cost;
      turnWallClockMs = result.wallClockMs;
      turnInputTokens = result.inputTokens;
      turnOutputTokens = result.outputTokens;
    } else {
      aiSkipped = true;
      aiSkipReason = result.error;
    }
  } else {
    const hexList = aiState.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    const generated = generateOrdersForStandingOrders('opponent', aiState, latLngByH3, resolveToH3);
    aiOrders = generated.movementOrders;
    aiRangedOrders = generated.rangedAttacks;
    if (aiPlanningRunEnabled) {
      aiSkipped = true;
      aiSkipReason = !deps.hasKey()
        ? 'Set your OpenRouter API key in the panel on the right.'
        : 'Select an AI model from the dropdown.';
    }
  }
  }

  const aiMoves = buildDistinctAiMovesFromPlanningOrders(state, aiOrders);

  const readyResult = deps.ready(aiOrders, aiRangedOrders, aiAirStrikeOrders, aiFerryOrders, aiEmbarkOrders);
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
      toolInvocationCounts,
      cost: turnCost,
      wallClockMs: turnWallClockMs,
      inputTokens: turnInputTokens,
      outputTokens: turnOutputTokens,
    };
  }
  const resolvedFerryMoves = readyResult.resolvedFerryMoves ?? [];
  const humanFerryMoves = resolvedFerryMoves
    .filter((move) => move.player === 'human')
    .map((move) => ({ unitId: move.unitId, fromH3Index: move.fromH3Index, toH3Index: move.toH3Index }));
  const opponentFerryMoves = resolvedFerryMoves
    .filter((move) => move.player === 'opponent')
    .map((move) => ({ unitId: move.unitId, fromH3Index: move.fromH3Index, toH3Index: move.toH3Index }));
  const allAiMoves = [...aiMoves, ...opponentFerryMoves];
  const allHumanMoves = [...(readyResult.humanMoves ?? []), ...humanFerryMoves];

  // Must await post-resolution consultation before returning: `afterResolution` writes opponent pending orders
  // to the DB; a fast second Ready must not run until those rows exist (same ordering contract as melee resolve).
  // Renderer parity: tactical `commitHumanTacticalDraftOrders` cannot await here (returns snapshot first), so it uses
  // `postResolutionConsultPush` + `S.tacticalDeferredPostBeatConsultPending` instead—do not switch strategic Ready to a
  // fire-and-forget consult without adding an equivalent strategic latch on the renderer.
  const postConsult = await runEventDrivenAfterResolutionConsultation({
    useEventDrivenConsultation,
    resolutionSuccess: readyResult.success,
    aiPlanningRunEnabled,
    opponentState: deps.getGameStateForPlayer('opponent'),
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
  if (postConsult.toolInvocationCounts) {
    toolInvocationCounts = postConsult.toolInvocationCounts;
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
    toolInvocationCounts,
    cost: turnCost,
    wallClockMs: turnWallClockMs,
    inputTokens: turnInputTokens,
    outputTokens: turnOutputTokens,
    tacticalAutoStartRes1H3Index: readyResult.tacticalAutoStartRes1H3Index,
  };
}

/**
 * Handles renderer submission after a paused pre-melee intercept, including optional post-resolution AI consultation.
 *
 * Purpose: Keeps consultation and cost accounting aligned with `handleGameReady` without re-running movement.
 * When to use: IPC `game:resolveMeleeIntercept` from the renderer modal.
 * Expected outcome: Full `ReadyResult` fields for a completed turn plus `tacticalAutoStartRes1H3Index` when applicable.
 * Exceptions: Delegates failure reasons to `resolveMeleeIntercept` in the main process.
 */
export async function handleResolveMeleeIntercept(
  payload: ResolveMeleeInterceptIpcPayload | undefined,
  deps: ResolveMeleeInterceptDeps
): Promise<ReadyResultMinimal> {
  logDebug('handleResolveMeleeIntercept', { hasPayload: payload !== undefined });
  const state = deps.getGameState();
  logHybridPipelineBoundary('handleResolveMeleeIntercept', { turnNumber: state.turnNumber, phase: state.phase });
  const modelId = deps.getSelectedModel();
  const enabledGroupIds =
    payload?.enabledToolGroups && payload.enabledToolGroups.length > 0
      ? payload.enabledToolGroups
      : deps.defaultGroupIds;
  const enabledToolNames = deps.getToolNamesForEnabledGroups(enabledGroupIds);
  const useEventDrivenConsultation = payload?.useEventDrivenConsultation === true;
  const aiPlanningRunEnabled = payload?.aiPlanningRunEnabled === true;

  let aiStrategy: string | undefined;
  let toolInvocationCounts: Record<string, number> | undefined;
  let turnCost: number | undefined;
  let turnWallClockMs: number | undefined;
  let turnInputTokens: number | undefined;
  let turnOutputTokens: number | undefined;

  if (!payload?.meleeDecisionToken || (payload.decision !== 'fight' && payload.decision !== 'ignore')) {
    return { success: false, reason: 'Invalid melee intercept payload.' };
  }

  const resolveResult = deps.resolveMeleeIntercept(payload);
  if (!resolveResult.success) {
    return { success: false, reason: resolveResult.reason };
  }

  // Same await contract as `handleGameReady`: pending opponent orders must land before the renderer can Ready again.
  const resolvePostConsult = await runEventDrivenAfterResolutionConsultation({
    useEventDrivenConsultation,
    resolutionSuccess: resolveResult.success,
    aiPlanningRunEnabled,
    opponentState: deps.getGameStateForPlayer('opponent'),
    resolution: resolveResult,
    modelId: modelId ?? '',
    enabledToolNames,
    hasKey: deps.hasKey,
    requestOrders: deps.requestOrders,
    timeoutMs: POST_RESOLUTION_CONSULT_TIMEOUT_MS,
    errorLogMessage: 'handleResolveMeleeIntercept: afterResolution failed or timed out',
  });
  if (resolvePostConsult.aiStrategy) {
    aiStrategy = resolvePostConsult.aiStrategy;
  }
  if (resolvePostConsult.toolInvocationCounts) {
    toolInvocationCounts = resolvePostConsult.toolInvocationCounts;
  }

  return {
    success: true,
    ...pickReadyResolutionIpcMirrorFields(resolveResult),
    humanMoves: resolveResult.humanMoves,
    opponentCombatParticipantUnitIds: resolveResult.opponentCombatParticipantUnitIds,
    removedOpponentUnitIds: resolveResult.removedOpponentUnitIds,
    tacticalAutoStartRes1H3Index: resolveResult.tacticalAutoStartRes1H3Index,
    aiStrategy,
    toolInvocationCounts,
    cost: turnCost,
    wallClockMs: turnWallClockMs,
    inputTokens: turnInputTokens,
    outputTokens: turnOutputTokens,
  };
}
