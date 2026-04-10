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
import { evaluateMandatoryOverrides, evaluateSubscriptionEvents, type ResolutionContext } from '../callbackEvaluation';
import type { ReadyResult, RequestAiOrdersResult } from '../../shared/ipcTypes';

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
