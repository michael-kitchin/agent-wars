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
import { generateOrdersForStandingOrders } from './tools/standingOrders';
import { collectTempoRuleAttacks } from './tools/tempoRuleAttacks';
import type { AirStrikeTargetType } from '../shared/ipcTypes';
import { shouldEndTacticalBattleForAnnihilation } from '../shared/tacticalAnnihilation';
import { getActiveTacticalBattleSnapshot } from './tacticalBattle/tacticalBattleSession';
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
import { tacticalLogMutate } from './tacticalBattle/tacticalLogging';
import { logHybridPipelineBoundary } from './hybridTurnPipeline';
import { logDebug } from './logger';
import { getMatchGeneration } from './matchGeneration';
import { beginModelCall } from './openRouter/modelCallControl';
import type { TacticalBattleSnapshot } from '../shared/tacticalBattleTypes';
import { tacticalOpponentPlanFromRequestOrdersSuccess } from '../shared/ipc/tacticalOpponentPlanMerge';
import type {
  GameReadyIpcPayload,
  RequestAiOrdersResult,
  RangedAttackOrder,
  AirStrikeOrder,
  EmbarkOrder,
  FerryOrder,
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
  const scope = beginModelCall('background requestAiOrders', activeTactical ? 'tactical' : 'strategic');
  deps.controllerRef.current = scope.controller;
  const signal = scope.signal;
  try {
    const raw = await deps.requestOrders(state, modelId, {
      enabledToolNames,
      signal,
      usePrecomputation: activeTactical ? false : usePrecomputation,
      tacticalAiBattle: activeTactical ?? undefined,
    });
    if (activeTactical && raw.success === true) {
      const tacticalOpponentPlan = tacticalOpponentPlanFromRequestOrdersSuccess(raw);
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
    scope.end();
    if (deps.controllerRef.current === scope.controller) {
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
    options: { enabledToolNames: string[]; usePrecomputation?: boolean; signal?: AbortSignal }
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
 * Builds the opponent's unconsulted turn: standing orders plus a tempo sweep over whatever is still idle.
 *
 * Purpose: These are the paths where no model reply exists, so nothing else can supply attacks. Without the sweep an
 * unconsulted turn only fights with its DEFEND units, which makes the opponent's aggression depend on which standing
 * order each unit happens to carry.
 * When to use: The two `handleGameReady` branches that fall back to generated orders; the consulted path applies the
 * same sweep itself after merging the model's orders.
 * Expected outcome: Movement from standing orders, and attacks from standing orders plus the sweep, deduplicated so
 * no unit fires twice.
 * Exceptions: None.
 */
function buildUnconsultedOpponentOrders(aiState: GameStateSnapshot): {
  movementOrders: { unitId: string; toH3Index: string }[];
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  airStrikes: { unitId: string; targetH3Index: string; targetType: AirStrikeTargetType }[];
} {
  const hexList = aiState.hexes.map((h) => h.h3Index);
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
  const generated = generateOrdersForStandingOrders('opponent', aiState, latLngByH3, resolveToH3);
  const tempo = collectTempoRuleAttacks({
    playerId: 'opponent',
    state: aiState,
    alreadyAttackingUnitIds: new Set([
      ...generated.rangedAttacks.map((r) => r.unitId),
      ...generated.airStrikes.map((s) => s.unitId),
    ]),
  });
  return {
    movementOrders: generated.movementOrders,
    rangedAttacks: [...generated.rangedAttacks, ...tempo.rangedAttacks],
    airStrikes: [...generated.airStrikes, ...tempo.airStrikes],
  };
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
  let aiMessage: string | undefined;
  const applyPrecomputedOrdersFromPayload = (precomputedPayload: GameReadyIpcPayload | undefined): void => {
    aiOrders = precomputedPayload?.precomputedAiOrders ?? [];
    aiRangedOrders = precomputedPayload?.precomputedAiRangedOrders ?? [];
    aiAirStrikeOrders = precomputedPayload?.precomputedAiAirStrikeOrders ?? [];
    aiFerryOrders = precomputedPayload?.precomputedAiFerryOrders ?? [];
    aiEmbarkOrders = precomputedPayload?.precomputedAiEmbarkOrders ?? [];
    aiStrategy = precomputedPayload?.precomputedAiStrategy;
    aiMessage = precomputedPayload?.precomputedAiMessage;
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
        const generated = buildUnconsultedOpponentOrders(aiState);
        aiOrders = generated.movementOrders;
        aiRangedOrders = generated.rangedAttacks;
        aiAirStrikeOrders = generated.airStrikes;
        aiConsulted = false;
      }
    }
  } else {
    if (usePrecomputed) {
      applyPrecomputedOrdersFromPayload(payload);
    } else if (aiPlanningRunEnabled && modelId && deps.hasKey()) {
      const scope = beginModelCall('ready inline consult', 'strategic');
      try {
        const result = await deps.requestOrders(aiState, modelId, {
          enabledToolNames,
          usePrecomputation,
          signal: scope.signal,
        });
        if (scope.signal.aborted || ('error' in result && result.error === 'Cancelled')) {
          aiSkipped = true;
          aiSkipReason = 'Cancelled';
        } else if (result.success) {
          aiOrders = result.orders;
          aiRangedOrders = result.rangedAttacks ?? [];
          aiAirStrikeOrders = result.airStrikes ?? [];
          aiFerryOrders = result.ferryOrders ?? [];
          aiEmbarkOrders = result.embarkOrders ?? [];
          aiStrategy = result.strategy;
          aiMessage = result.message;
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
      } finally {
        scope.end();
      }
    } else {
      const generated = buildUnconsultedOpponentOrders(aiState);
      aiOrders = generated.movementOrders;
      aiRangedOrders = generated.rangedAttacks;
      aiAirStrikeOrders = generated.airStrikes;
      if (aiPlanningRunEnabled) {
        aiSkipped = true;
        aiSkipReason = !deps.hasKey()
          ? 'Set your OpenRouter API key in the panel on the right.'
          : 'Select an AI model from the dropdown.';
      }
    }
  }

  const aiMoves = buildDistinctAiMovesFromPlanningOrders(state, aiOrders);

  if (getMatchGeneration() !== generationAtStart) {
    logDebug('handleGameReady: match generation changed before resolution', { generationAtStart });
    return { success: false, reason: 'A new game started before this turn finished.' };
  }
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
    .filter((move) => move.player === 'human')
    .map((move) => ({ unitId: move.unitId, fromH3Index: move.fromH3Index, toH3Index: move.toH3Index }));
  const opponentFerryMoves = resolvedFerryMoves
    .filter((move) => move.player === 'opponent')
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
      opponentState: deps.getGameStateForPlayer('opponent'),
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
