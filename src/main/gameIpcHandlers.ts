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
import { afterResolution } from './afterResolution';
import { logError } from './logger';
import { logHybridPipelineBoundary } from './hybridTurnPipeline';
import type {
  GameReadyIpcPayload,
  RequestAiOrdersResult,
  RangedAttackOrder,
} from '../shared/ipcTypes';
export type { RequestAiOrdersResult } from '../shared/ipcTypes';

const POST_RESOLUTION_CONSULT_TIMEOUT_MS = 120_000;

/** Minimal ReadyResult shape returned by handleGameReady. */
export interface ReadyResultMinimal {
  success: boolean;
  reason?: string;
  aiSkipped?: boolean;
  aiSkipReason?: string;
  aiOrderCount?: number;
  aiRangedByType?: { armor?: number; naval?: number };
  aiDropped?: number;
  aiDropReasons?: string[];
  aiMovesLog?: string[];
  aiMoves?: { unitId: string; fromH3Index: string; toH3Index: string }[];
  humanMoves?: { unitId: string; fromH3Index: string; toH3Index: string }[];
  combatHexes?: string[];
  removedUnitIds?: string[];
  casualtyHexes?: string[];
  removedUnits?: { id: string; player: string; unitType: string; h3Index: string }[];
  rangedCombatHexes?: string[];
  rangedCasualtyHexes?: string[];
  rangedRemovedUnits?: { id: string; player: string; unitType: string; h3Index: string }[];
  meleeCombatHexes?: string[];
  meleeCasualtyHexes?: string[];
  meleeRemovedUnits?: { id: string; player: string; unitType: string; h3Index: string }[];
  kills?: { victimId: string; killerIds: string[] }[];
  killsByDirectFire?: { victimId: string; killerIds: string[] }[];
  killsByReturnFire?: { victimId: string; killerIds: string[] }[];
  deployedUnitsByType?: { armor?: number; infantry?: number; naval?: number };
  humanHexesLostCount?: number;
  controlLossLightningHexes?: string[];
  aiStrategy?: string;
  toolInvocationCounts?: Record<string, number>;
  /** Cost in dollars for this turn's LLM call (when requestOrders was used). */
  cost?: number;
  /** Wall-clock time in ms for the AI turn (when requestOrders was used). */
  wallClockMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Opponent unit IDs that participated in combat this resolution (0.7 event-driven). */
  opponentCombatParticipantUnitIds?: string[];
  /** Opponent unit IDs removed this resolution (0.7 event-driven). */
  removedOpponentUnitIds?: string[];
  /** When event-driven: true if orders came from pending (consultation ran); false if standing-order-only. */
  aiConsulted?: boolean;
}

export interface RequestAiOrdersDeps {
  getGameState: () => GameStateSnapshot;
  getSelectedModel: () => string;
  hasKey: () => boolean;
  getToolNamesForEnabledGroups: (groupIds: string[]) => string[];
  defaultGroupIds: string[];
  requestOrders: (
    state: GameStateSnapshot,
    modelId: string,
    options: { enabledToolNames: string[]; signal?: AbortSignal; usePrecomputation?: boolean }
  ) => Promise<RequestAiOrdersResult>;
  controllerRef: { current: AbortController | null };
}

/**
 * Logic for game:requestAiOrders. Returns AI orders without resolving the turn; supports cancellation via controllerRef.
 * Caller must wire cancelRequestAiOrders to the same controllerRef so the user can abort in-flight requests.
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
 * Aborts the in-flight request for the given controller ref. Call when user toggles Run off.
 */
export function cancelRequestAiOrders(controllerRef: { current: AbortController | null }): void {
  if (controllerRef.current) {
    controllerRef.current.abort();
    controllerRef.current = null;
  }
}

export interface ReadyDeps {
  getGameState: () => GameStateSnapshot;
  getGameStateForPlayer: (playerId: 'human' | 'opponent') => GameStateSnapshot;
  getSelectedModel: () => string;
  hasKey: () => boolean;
  getToolNamesForEnabledGroups: (groupIds: string[]) => string[];
  defaultGroupIds: string[];
  requestOrders: (
    state: GameStateSnapshot,
    modelId: string,
    options: { enabledToolNames: string[]; usePrecomputation?: boolean }
  ) => Promise<RequestAiOrdersResult>;
  ready: (
    aiOrders: { unitId: string; toH3Index: string }[],
    aiRangedOrders: RangedAttackOrder[]
  ) => ReadyResultMinimal & { success: boolean; reason?: string };
}

/**
 * Logic for game:ready. When useEventDrivenConsultation is true, uses pending AI orders from DB if present,
 * else generates orders from standing orders only (no LLM at Ready); after resolution runs afterResolution.
 * When event-driven is false: if precomputedAiOrders and precomputedAiRangedOrders are present, uses them;
 * otherwise requests orders from the LLM then resolves the turn.
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

  let aiOrders: { unitId: string; toH3Index: string }[] = [];
  let aiRangedOrders: RangedAttackOrder[] = [];
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

  const usePrecomputed =
    payload?.precomputedAiOrders !== undefined && payload?.precomputedAiRangedOrders !== undefined;
  let aiConsulted: boolean | undefined;
  if (useEventDrivenConsultation) {
    if (usePrecomputed) {
      aiOrders = payload.precomputedAiOrders ?? [];
      aiRangedOrders = payload.precomputedAiRangedOrders ?? [];
      aiStrategy = payload.precomputedAiStrategy;
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
    aiOrders = payload.precomputedAiOrders ?? [];
    aiRangedOrders = payload.precomputedAiRangedOrders ?? [];
    aiStrategy = payload.precomputedAiStrategy;
  } else if (modelId && deps.hasKey()) {
    const result = await deps.requestOrders(aiState, modelId, {
      enabledToolNames,
      usePrecomputation,
    });
    if (result.success) {
      aiOrders = result.orders;
      aiRangedOrders = result.rangedAttacks ?? [];
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
    aiSkipped = true;
    aiSkipReason = !deps.hasKey()
      ? 'Set your OpenRouter API key in the panel on the right.'
      : 'Select an AI model from the dropdown.';
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

  const readyResult = deps.ready(aiOrders, aiRangedOrders);
  if (!readyResult.success) {
    return { success: false, reason: readyResult.reason };
  }

  if (useEventDrivenConsultation && readyResult.success) {
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

  const aiRangedByType: { armor?: number; naval?: number } = {};
  for (const r of aiRangedOrders) {
    const u = state.units.find((unit) => unit.id === r.unitId);
    if (u && (u.unitType === 'armor' || u.unitType === 'naval')) {
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
    aiMoves: aiMoves.length > 0 ? aiMoves : undefined,
    humanMoves: readyResult.humanMoves,
    aiConsulted: useEventDrivenConsultation ? aiConsulted : undefined,
    combatHexes: readyResult.combatHexes,
    removedUnitIds: readyResult.removedUnitIds,
    casualtyHexes: readyResult.casualtyHexes,
    removedUnits: readyResult.removedUnits,
    rangedCombatHexes: readyResult.rangedCombatHexes,
    rangedCasualtyHexes: readyResult.rangedCasualtyHexes,
    rangedRemovedUnits: readyResult.rangedRemovedUnits,
    meleeCombatHexes: readyResult.meleeCombatHexes,
    meleeCasualtyHexes: readyResult.meleeCasualtyHexes,
    meleeRemovedUnits: readyResult.meleeRemovedUnits,
    kills: readyResult.kills,
    killsByDirectFire: readyResult.killsByDirectFire,
    killsByReturnFire: readyResult.killsByReturnFire,
    deployedUnitsByType: readyResult.deployedUnitsByType,
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
