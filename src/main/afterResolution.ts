/**
 * After-resolution callback evaluation and conditional consultation (Milestone 0.7).
 * Runs when event-driven mode is on: evaluates mandatory overrides and subscription events,
 * and if any fire, invokes the LLM and stores pending orders for the next turn.
 * Call synchronously after ready() returns so pending orders are set before the next Ready.
 */

import { logDebug, logError } from './logger';
import type { GameStateSnapshot } from './gameDb';
import {
  getAiLastConsultationTurn,
  setAiLastConsultationTurn,
  getOpponentUnitsInCombatSinceConsultation,
  addOpponentCombatParticipants,
  clearOpponentCombatSinceConsultation,
  setAiPendingOrders,
  clearAiPendingOrders,
} from './gameDb';
import { getSubscriptions } from './callbackSubscriptions';
import { evaluateMandatoryOverrides, evaluateSubscriptionEvents, type ResolutionContext } from './callbackEvaluation';
export interface ReadyResultWithParticipants {
  success: boolean;
  reason?: string;
  removedUnitIds?: string[];
  removedOpponentUnitIds?: string[];
  opponentCombatParticipantUnitIds?: string[];
}

export interface AfterResolutionDeps {
  modelId: string;
  enabledToolNames: string[];
  hasKey: () => boolean;
  requestOrders: (
    state: GameStateSnapshot,
    modelId: string,
    options: { enabledToolNames: string[]; usePrecomputation: boolean }
  ) => Promise<{
    success: true;
    orders: { unitId: string; toH3Index: string }[];
    rangedAttacks?: { unitId: string; targetH3Index: string }[];
    strategy?: string;
    toolInvocationCounts?: Record<string, number>;
  } | { success: false; error: string }>;
}

export interface AfterResolutionResult {
  consulted: boolean;
  strategy?: string;
  toolInvocationCounts?: Record<string, number>;
}

/**
 * Evaluates callbacks after resolution and optionally runs the LLM. When any event fires,
 * calls requestOrders, then stores pending orders and updates last-consultation state.
 * When no event fires, clears pending orders so the next Ready uses standing-order-only.
 * Call only when event-driven consultation is enabled and resolution succeeded.
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
    removedOpponentUnitIds
  );

  addOpponentCombatParticipants(opponentCombatants);

  const ctx: ResolutionContext = {
    opponentCombatParticipantUnitIds: opponentCombatants,
    removedUnitIds,
    removedOpponentUnitIds,
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
        setAiPendingOrders('opponent', result.orders, result.rangedAttacks ?? []);
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
