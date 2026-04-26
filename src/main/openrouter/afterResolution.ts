/**
 * After-resolution callback evaluation and conditional consultation (Milestone 0.7).
 * Runs when event-driven mode is on: evaluates mandatory overrides and subscription events,
 * and if any fire, invokes the LLM and stores pending orders for the next turn.
 * Call synchronously after ready() returns so pending orders are set before the next Ready.
 */

import { logDebug, logError } from '../logger';
import type { GameStateSnapshot } from '../gameDb';
import {
  getAiLastConsultationTurn,
  setAiLastConsultationTurn,
  getOpponentUnitsInCombatSinceConsultation,
  consumeFogNewContactsForPlayer,
  addOpponentCombatParticipants,
  clearOpponentCombatSinceConsultation,
  setAiPendingOrders,
  clearAiPendingOrders,
} from '../gameDb';
import { getSubscriptions } from '../callbackSubscriptions';
import {
  evaluateMandatoryOverrides,
  evaluateSubscriptionEvents,
  evaluateTacticalMandatoryOverrides,
  type ResolutionContext,
} from '../callbackEvaluation';
import type { ReadyResult, RequestAiOrdersResult, TacticalCommitResolutionPlayback } from '../../shared/ipcTypes';
import type { TacticalOpponentPlanPayload } from '../../shared/ipc/readyTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';

/**
 * Documents the `ReadyResultWithParticipants` type alias (type ReadyResultWithParticipants).

 * Purpose: Supports maintainability by documenting why `ReadyResultWithParticipants` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type ReadyResultWithParticipants = Pick<
  ReadyResult,
  'success' | 'reason' | 'removedUnitIds' | 'removedOpponentUnitIds' | 'opponentCombatParticipantUnitIds' | 'infrastructureDestroyedEvents'
>;

/**
 * Documents the `AfterResolutionDeps` interface as a named contract surface (export interface AfterResolutionDeps).

 * Purpose: Supports maintainability by documenting why `AfterResolutionDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface AfterResolutionDeps {
    /**
   * Specifies the contract for the `modelId` member (modelId: string;).

   * Contract: Describes stable behavior for callers of `modelId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
modelId: string;
    /**
   * Specifies the contract for the `enabledToolNames` member (enabledToolNames: string[];).

   * Contract: Describes stable behavior for callers of `enabledToolNames` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
enabledToolNames: string[];
    /**
   * Specifies the contract for the `hasKey` member (hasKey: () => boolean;).

   * Contract: Describes stable behavior for callers of `hasKey` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hasKey: () => boolean;
    /**
   * Specifies the contract for the `requestOrders` member (requestOrders: ( state: GameStateSnapshot, modelId: string, options: { enabledToolNames: string[]; usePrecomputation: boolean } ) => Promise<R).

   * Contract: Describes stable behavior for callers of `requestOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
requestOrders: (
    state: GameStateSnapshot,
    modelId: string,
    options: { enabledToolNames: string[]; usePrecomputation: boolean }
  ) => Promise<RequestAiOrdersResult>;
}

/**
 * Documents the `AfterResolutionResult` interface as a named contract surface (export interface AfterResolutionResult).

 * Purpose: Supports maintainability by documenting why `AfterResolutionResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface AfterResolutionResult {
    /**
   * Specifies the contract for the `consulted` member (consulted: boolean;).

   * Contract: Describes stable behavior for callers of `consulted` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
consulted: boolean;
    /**
   * Specifies the contract for the `strategy` member (strategy?: string;).

   * Contract: Describes stable behavior for callers of `strategy` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
strategy?: string;
    /**
   * Specifies the contract for the `toolInvocationCounts` member (toolInvocationCounts?: Record<string, number>;).

   * Contract: Describes stable behavior for callers of `toolInvocationCounts` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
toolInvocationCounts?: Record<string, number>;
}

/**
 * Defines the `afterResolution` function shape (export async function afterResolution( state: GameStateSnapshot, resolutionResult: ReadyResultWithParticipants, deps: AfterResolutionDeps ): Promise<A).

 * Purpose: Supports maintainability by documenting why `afterResolution` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function afterResolution(
  state: GameStateSnapshot,
  resolutionResult: ReadyResultWithParticipants,
  deps: AfterResolutionDeps
): Promise<AfterResolutionResult> {
  if (!resolutionResult.success || !deps.modelId?.trim() || !deps.hasKey()) {
    logDebug('afterResolution: skip (no success, no model, or no key)');
    return { consulted: false };
  }

  const opponentCombatants = resolutionResult.opponentCombatParticipantUnitIds ?? [];
  const removedUnitIds = resolutionResult.removedUnitIds ?? [];
  const removedOpponentUnitIds = resolutionResult.removedOpponentUnitIds ?? [];

  const combatSince = getOpponentUnitsInCombatSinceConsultation();
  const lastConsultationTurn = getAiLastConsultationTurn();

  const mandatoryFired = evaluateMandatoryOverrides(
    state,
    lastConsultationTurn,
    combatSince,
    opponentCombatants,
    removedOpponentUnitIds,
    consumeFogNewContactsForPlayer('opponent')
  );

  addOpponentCombatParticipants(opponentCombatants);

  const ctx: ResolutionContext = {
    opponentCombatParticipantUnitIds: opponentCombatants,
    removedUnitIds,
    removedOpponentUnitIds,
    infrastructureDestroyedEvents: resolutionResult.infrastructureDestroyedEvents,
  };
  const subscriptions = getSubscriptions('opponent');
  const subscriptionFired = evaluateSubscriptionEvents(state, subscriptions, ctx);

  const shouldConsult = mandatoryFired.length > 0 || subscriptionFired.length > 0;

  if (shouldConsult) {
    try {
      const result = await deps.requestOrders(state, deps.modelId, {
        enabledToolNames: deps.enabledToolNames,
        usePrecomputation: true,
      });
      if (result.success && result.orders) {
        setAiPendingOrders(
          'opponent',
          result.orders,
          result.rangedAttacks ?? [],
          result.airStrikes ?? [],
          result.ferryOrders ?? [],
          result.embarkOrders ?? []
        );
        setAiLastConsultationTurn(state.turnNumber);
        clearOpponentCombatSinceConsultation();
        logDebug('afterResolution: consultation completed, pending orders stored', { turnNumber: state.turnNumber });
        return {
          consulted: true,
          strategy: result.strategy,
          toolInvocationCounts: result.toolInvocationCounts,
        };
      } else {
        logDebug('afterResolution: requestOrders failed or returned no orders', result.success ? 'no orders' : (result as { error?: string }).error);
        clearAiPendingOrders('opponent');
        return { consulted: false };
      }
    } catch (err) {
      logError('afterResolution: requestOrders exception', err);
      clearAiPendingOrders('opponent');
      return { consulted: false };
    }
  } else {
    clearAiPendingOrders('opponent');
    logDebug('afterResolution: no event fired, pending orders cleared');
    return { consulted: false };
  }
}

/**
 * Builds the callback evaluation slice for a completed tactical beat from deterministic playback metadata.
 *
 * Purpose: Feeds `evaluateTacticalMandatoryOverrides` / `evaluateSubscriptionEvents` without a full strategic `ReadyResult`.
 * When to use: Only from `afterTacticalBeatResolution` after `commitHumanTacticalDraftOrders` succeeds.
 * Expected outcome: `opponentCombatParticipantUnitIds` lists opponent sub-units that moved this beat or were removed (combat-adjacent signal).
 * Exceptions: None.
 */
export function buildTacticalBeatResolutionReadyParticipants(
  playback: TacticalCommitResolutionPlayback,
  tacticalBattle: TacticalBattleSnapshot
): ReadyResultWithParticipants {
  const removedCombined = [...(playback.rangedRemovedUnits ?? []), ...(playback.meleeRemovedUnits ?? [])];
  const removedUnitIds = removedCombined.map((u) => u.id);
  const removedOpponentUnitIds = removedCombined.filter((u) => u.player === 'opponent').map((u) => u.id);
  const oppCombat = new Set<string>();
  for (const m of playback.opponentMoves ?? []) {
    if (tacticalBattle.subUnits.some((u) => u.id === m.unitId && u.player === 'opponent')) {
      oppCombat.add(m.unitId);
    }
  }
  for (const id of removedOpponentUnitIds) {
    oppCombat.add(id);
  }
  return {
    success: true,
    removedUnitIds: removedUnitIds.length > 0 ? removedUnitIds : undefined,
    removedOpponentUnitIds: removedOpponentUnitIds.length > 0 ? removedOpponentUnitIds : undefined,
    opponentCombatParticipantUnitIds: [...oppCombat],
    infrastructureDestroyedEvents: playback.infrastructureDestroyedEvents,
  };
}

/**
 * Documents the `AfterTacticalBeatResolutionDeps` interface as a named contract surface (export interface AfterTacticalBeatResolutionDeps).

 * Purpose: Same injection surface as strategic `afterResolution`, but `requestOrders` may pass `tacticalAiBattle`.
 * When to use: `runEventDrivenAfterTacticalBeatConsultation` from the tactical commit IPC path.
 * Expected outcome: Successful tactical consultations return `tacticalOpponentPlan` for the renderer buffer.
 * Exceptions: None.
 */
export interface AfterTacticalBeatResolutionDeps {
  modelId: string;
  enabledToolNames: string[];
  hasKey: () => boolean;
  requestOrders: (
    state: GameStateSnapshot,
    modelId: string,
    options: {
      enabledToolNames: string[];
      usePrecomputation?: boolean;
      tacticalAiBattle?: TacticalBattleSnapshot;
    }
  ) => Promise<RequestAiOrdersResult>;
}

/**
 * Documents the `AfterTacticalBeatResolutionResult` interface as a named contract surface (export interface AfterTacticalBeatResolutionResult).

 * Purpose: Returns buffered opponent tactical rows when event-driven consultation fires after a tactical beat.
 * When to use: Consumed by `game:commitHumanTacticalDraftOrders` IPC to hydrate `S.tacticalOpponentDraft` without a second round-trip.
 * Expected outcome: `tacticalOpponentPlan` set only when the model returned a valid buffered plan.
 * Exceptions: None.
 */
export interface AfterTacticalBeatResolutionResult {
  consulted: boolean;
  tacticalOpponentPlan?: TacticalOpponentPlanPayload;
  strategy?: string;
  toolInvocationCounts?: Record<string, number>;
}

/**
 * Event-driven tactical post-beat consultation: subscriptions + tactical-only mandatory rules, then optional LLM call.
 *
 * Purpose: Mirrors strategic `afterResolution` for res4 battles without writing strategic `setAiPendingOrders`.
 * When to use: After a successful `commitHumanTacticalDraftOrders` when the renderer sent event-driven flags.
 * Expected outcome: Buffered `tacticalOpponentPlan` when subscriptions or opponent losses demand re-planning.
 * Exceptions: Swallows LLM failures after logging; clears strategic pending orders when skipping or failing.
 */
export async function afterTacticalBeatResolution(
  state: GameStateSnapshot,
  tacticalBattle: TacticalBattleSnapshot,
  playback: TacticalCommitResolutionPlayback,
  deps: AfterTacticalBeatResolutionDeps
): Promise<AfterTacticalBeatResolutionResult> {
  if (!deps.modelId?.trim() || !deps.hasKey()) {
    logDebug('afterTacticalBeatResolution: skip (no model or no key)');
    return { consulted: false };
  }
  const resolutionSlice = buildTacticalBeatResolutionReadyParticipants(playback, tacticalBattle);
  const removedUnitIds = resolutionSlice.removedUnitIds ?? [];
  const removedOpponentUnitIds = resolutionSlice.removedOpponentUnitIds ?? [];
  const opponentCombatants = resolutionSlice.opponentCombatParticipantUnitIds ?? [];
  const ctx: ResolutionContext = {
    opponentCombatParticipantUnitIds: opponentCombatants,
    removedUnitIds,
    removedOpponentUnitIds,
    infrastructureDestroyedEvents: resolutionSlice.infrastructureDestroyedEvents,
  };
  const mandatoryFired = evaluateTacticalMandatoryOverrides(ctx);
  const subscriptions = getSubscriptions('opponent');
  const subscriptionFired = evaluateSubscriptionEvents(state, subscriptions, ctx);
  const shouldConsult = mandatoryFired.length > 0 || subscriptionFired.length > 0;
  if (!shouldConsult) {
    clearAiPendingOrders('opponent');
    logDebug('afterTacticalBeatResolution: no event fired, skipping tactical LLM');
    return { consulted: false };
  }
  try {
    const result = await deps.requestOrders(state, deps.modelId, {
      enabledToolNames: deps.enabledToolNames,
      usePrecomputation: false,
      tacticalAiBattle: tacticalBattle,
    });
    if (result.success === true && result.tacticalOpponentPlan) {
      setAiLastConsultationTurn(state.turnNumber);
      clearOpponentCombatSinceConsultation();
      logDebug('afterTacticalBeatResolution: tactical consultation completed', {
        movementCount: result.tacticalOpponentPlan.movementOrders.length,
      });
      return {
        consulted: true,
        tacticalOpponentPlan: result.tacticalOpponentPlan,
        strategy: result.strategy,
        toolInvocationCounts: result.toolInvocationCounts,
      };
    }
    logDebug('afterTacticalBeatResolution: requestOrders missing tactical plan', { success: result.success });
    clearAiPendingOrders('opponent');
    return { consulted: false };
  } catch (err) {
    logError('afterTacticalBeatResolution: requestOrders exception', err);
    clearAiPendingOrders('opponent');
    return { consulted: false };
  }
}
