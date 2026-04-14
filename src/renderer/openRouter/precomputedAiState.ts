import type { RequestAiOrdersResult } from '../../shared/ipcTypes';
import { rendererSharedState as S } from '../core/state';

/**
 * Documents the `PrecomputedResetMode` type alias (type PrecomputedResetMode).

 * Purpose: Supports maintainability by documenting why `PrecomputedResetMode` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type PrecomputedResetMode = 'null' | 'empty';

/**
 * Defines the `resetPrecomputedAiState` function shape (export function resetPrecomputedAiState(mode: PrecomputedResetMode): void).

 * Purpose: Supports maintainability by documenting why `resetPrecomputedAiState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resetPrecomputedAiState(mode: PrecomputedResetMode): void {
  if (mode === 'empty') {
    S.precomputedAiOrders = [];
    S.precomputedAiRangedOrders = [];
    S.precomputedAiEmbarkOrders = [];
  } else {
    S.precomputedAiOrders = null;
    S.precomputedAiRangedOrders = null;
    S.precomputedAiEmbarkOrders = null;
  }
  S.precomputedAiStrategy = null;
  S.precomputedToolInvocationCounts = null;
}

/**
 * Defines the `applySuccessfulPrecomputedAiResult` function shape (export function applySuccessfulPrecomputedAiResult(result: Extract<RequestAiOrdersResult,).

 * Purpose: Supports maintainability by documenting why `applySuccessfulPrecomputedAiResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function applySuccessfulPrecomputedAiResult(result: Extract<RequestAiOrdersResult, { success: true }>): void {
  S.precomputedAiOrders = result.orders;
  S.precomputedAiRangedOrders = result.rangedAttacks ?? [];
  S.precomputedAiEmbarkOrders = result.embarkOrders ?? [];
  S.precomputedAiStrategy = result.strategy ?? null;
  if (result.tacticalBattle) {
    S.tacticalBattleSnapshot = result.tacticalBattle;
  }
  if (result.tacticalOpponentPlan) {
    const replacedPriorDraft = S.tacticalOpponentDraft !== null;
    if (replacedPriorDraft) {
      console.debug('[agent-wars] tactical opponent draft replaced by newer AI plan (D5)', {
        movementCount: result.tacticalOpponentPlan.movementOrders.length,
        rangedCount: result.tacticalOpponentPlan.rangedAttacks.length,
        airCount: result.tacticalOpponentPlan.airStrikes.length,
      });
    }
    S.tacticalOpponentDraft = result.tacticalOpponentPlan;
  }
}
