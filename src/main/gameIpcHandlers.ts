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
import { afterResolution } from './openrouter/afterResolution';
import { logError } from './logger';
import { logHybridPipelineBoundary } from './hybridTurnPipeline';
import type {
  GameReadyIpcPayload,
  RequestAiOrdersResult,
  RangedAttackOrder,
  AirStrikeOrder,
  EmbarkOrder,
  FerryOrder,
  ReadyResult,
} from '../shared/ipcTypes';
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
    options: { enabledToolNames: string[]; signal?: AbortSignal; usePrecomputation?: boolean }
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
  if (state.phase !== 'planning') {
    return { success: false, error: 'Not in planning phase' };
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
    const result = await deps.requestOrders(state, modelId, {
      enabledToolNames,
      signal,
      usePrecomputation,
    });
    return result;
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
  // Milestone 0.7 behavior preserved here: event-driven vs every-turn toggle, precomputation groups, Ready flow,
  // afterResolution consultation and POST_RESOLUTION_CONSULT_TIMEOUT_MS — unchanged by 1.1 DB/LLM contract work.
  const state = deps.getGameState();
  const aiState = deps.getGameStateForPlayer('opponent');
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

  const aiMoves =
    aiOrders.length > 0
      ? aiOrders
          .map((o) => {
            const from = state.units.find((u) => u.id === o.unitId)?.h3Index;
            if (!from || from === o.toH3Index) return null;
            return { unitId: o.unitId, fromH3Index: from, toH3Index: o.toH3Index };
          })
          .filter((m): m is { unitId: string; fromH3Index: string; toH3Index: string } => m !== null)
      : [];

  const readyResult = deps.ready(aiOrders, aiRangedOrders, aiAirStrikeOrders, aiFerryOrders, aiEmbarkOrders);
  if (!readyResult.success) {
    return { success: false, reason: readyResult.reason };
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

  if (useEventDrivenConsultation && readyResult.success && aiPlanningRunEnabled) {
    try {
      const postResolution = await Promise.race([
        afterResolution(deps.getGameStateForPlayer('opponent'), readyResult, {
          modelId: modelId ?? '',
          enabledToolNames,
          hasKey: deps.hasKey,
          requestOrders: deps.requestOrders,
        }),
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () => reject(new Error(`afterResolution consultation timed out after ${POST_RESOLUTION_CONSULT_TIMEOUT_MS}ms`)),
            POST_RESOLUTION_CONSULT_TIMEOUT_MS
          );
        }),
      ]);
      if (postResolution.strategy) {
        aiStrategy = postResolution.strategy;
      }
      if (postResolution.toolInvocationCounts) {
        toolInvocationCounts = postResolution.toolInvocationCounts;
      }
    } catch (err) {
      // Do not block Ready indefinitely if post-resolution consultation hangs/fails.
      logError('handleGameReady: afterResolution failed or timed out', err);
    }
  }

  const aiRangedByType: { armor?: number; naval?: number; air?: number } = {};
  for (const r of aiRangedOrders) {
    const u = state.units.find((unit) => unit.id === r.unitId);
    if (u && (u.unitType === 'armor' || u.unitType === 'naval' || u.unitType === 'air')) {
      aiRangedByType[u.unitType] = (aiRangedByType[u.unitType] ?? 0) + 1;
    }
  }
  const aiMovesLog =
    aiOrders.length > 0 ? aiOrders.map((o) => `${o.unitId} → ${o.toH3Index}`) : undefined;

  return {
    success: true,
    aiSkipped: aiSkipped && aiOrders.length === 0,
    aiSkipReason,
    aiOrderCount: aiOrders.length,
    aiRangedByType: Object.keys(aiRangedByType).length > 0 ? aiRangedByType : undefined,
    aiDropped,
    aiDropReasons,
    aiMovesLog,
    aiMoves: allAiMoves.length > 0 ? allAiMoves : undefined,
    humanMoves: allHumanMoves.length > 0 ? allHumanMoves : undefined,
    aiConsulted: useEventDrivenConsultation ? aiConsulted : undefined,
    combatHexes: readyResult.combatHexes,
    removedUnitIds: readyResult.removedUnitIds,
    casualtyHexes: readyResult.casualtyHexes,
    removedUnits: readyResult.removedUnits,
    rangedCombatHexes: readyResult.rangedCombatHexes,
    rangedCasualtyHexes: readyResult.rangedCasualtyHexes,
    rangedRemovedUnits: readyResult.rangedRemovedUnits,
    airStrikeHexes: readyResult.airStrikeHexes,
    airStrikeCasualtyHexes: readyResult.airStrikeCasualtyHexes,
    airStrikeRemovedUnits: readyResult.airStrikeRemovedUnits,
    airStrikeMoves: readyResult.airStrikeMoves,
    airStrikeAttemptCount: readyResult.airStrikeAttemptCount,
    airStrikeSuccessfulCount: readyResult.airStrikeSuccessfulCount,
    airStrikeFailedCount: readyResult.airStrikeFailedCount,
    airStrikeAttackerLossCount: readyResult.airStrikeAttackerLossCount,
    baseInvalidAirLossCount: readyResult.baseInvalidAirLossCount,
    infrastructureDestroyedEvents: readyResult.infrastructureDestroyedEvents,
    resolvedFerryMoves: readyResult.resolvedFerryMoves,
    meleeCombatHexes: readyResult.meleeCombatHexes,
    meleeCasualtyHexes: readyResult.meleeCasualtyHexes,
    meleeRemovedUnits: readyResult.meleeRemovedUnits,
    kills: readyResult.kills,
    killsByDirectFire: readyResult.killsByDirectFire,
    killsByReturnFire: readyResult.killsByReturnFire,
    deployedUnitsByType: readyResult.deployedUnitsByType,
    humanDeploymentCapReachedUnitTypes: readyResult.humanDeploymentCapReachedUnitTypes,
    opponentDeploymentCapReachedUnitTypes: readyResult.opponentDeploymentCapReachedUnitTypes,
    humanHexesLostCount: readyResult.humanHexesLostCount,
    controlLossLightningHexes: readyResult.controlLossLightningHexes,
    aiStrategy,
    toolInvocationCounts,
    cost: turnCost,
    wallClockMs: turnWallClockMs,
    inputTokens: turnInputTokens,
    outputTokens: turnOutputTokens,
  };
}
