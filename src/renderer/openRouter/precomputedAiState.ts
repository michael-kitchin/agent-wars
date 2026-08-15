import type { TacticalOpponentPlanPayload } from '../../shared/ipc/readyTypes';
import type { RequestAiOrdersResult } from '../../shared/ipcTypes';
import { rendererSharedState as S } from '../core/state';

/**
 * Builds a new empty tactical opponent plan with fresh array instances (safe to mutate without affecting shared constants).
 *
 * Purpose: Single source for empty-plan shape used by failure unblock, deferred-consult placeholders, and exports.
 * When to use: Internal to this module and via `getEmptyTacticalOpponentPlanPayload` when callers need their own copy.
 * Expected outcome: Object matching `TacticalOpponentPlanPayload` with all lists empty.
 * Exceptions: None.
 */
function createEmptyTacticalOpponentDraft(): TacticalOpponentPlanPayload {
  return {
    movementOrders: [],
    rangedAttacks: [],
    airStrikes: [],
    ferryOrders: [],
    embarkOrders: [],
  };
}

/**
 * Valid empty opponent plan used only to leave the “waiting for tactical AI” state after a failed background request.
 *
 * Purpose: `isWaitingForPrecomputedAiOrders` treats `tacticalOpponentDraft === null` as still waiting; a typed empty payload is truthy for commit spread yet carries no opponent rows.
 * When to use: Only from `unblockPrecomputedAiPlanningAfterBackgroundFailure` after `requestAiOrders` returns `success: false` or throws while in tactical planning with a live opponent.
 * Expected outcome: Ready unlocks; the player may commit the human beat with no opponent draft or retry after the next successful fetch repopulates the draft.
 * Exceptions: None.
 */
const EMPTY_TACTICAL_OPPONENT_DRAFT: TacticalOpponentPlanPayload = createEmptyTacticalOpponentDraft();

/**
 * Returns a fresh empty tactical opponent plan object for Run-mode latch bookkeeping.
 *
 * Purpose: `isWaitingForPrecomputedAiOrders` treats `tacticalOpponentDraft === null` as “still waiting”; after a tactical
 * commit while event-driven Run is on, main may return an empty placeholder until post-beat consultation fields merge on the same IPC result.
 * When to use: Tactical Ready success path with event-driven + Run, and post-beat merge helpers that must not restore `null`.
 * Expected outcome: Same shape as a failed-background unblock; commit may still omit `opponentTacticalDraft` when empty.
 * Exceptions: None.
 */
export function getEmptyTacticalOpponentPlanPayload(): TacticalOpponentPlanPayload {
  return createEmptyTacticalOpponentDraft();
}

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
  S.precomputedAiMessage = null;
  S.precomputedToolInvocationCounts = null;
}

/**
 * Clears the “waiting for Run-mode AI” latch after a failed or rejected background `requestAiOrders` so Ready is usable again.
 *
 * Purpose: `isWaitingForPrecomputedAiOrders` stays true while strategic `precomputedAiOrders === null` or tactical `tacticalOpponentDraft === null`; leaving null after an error would disable Ready with the AI timer forever.
 * When to use: Renderer background `requestAiOrders` failure paths only (not successful Ready teardown, which uses `resetPrecomputedAiState('null')`).
 * Expected outcome: Strategic precompute fields become empty arrays (not null); tactical planning sets `tacticalOpponentDraft` to an empty plan when a battle snapshot is active.
 * Exceptions: None.
 */
export function unblockPrecomputedAiPlanningAfterBackgroundFailure(): void {
  resetPrecomputedAiState('empty');
  if (S.tacticalBattleSnapshot && S.tacticalPhasePlanning) {
    S.tacticalOpponentDraft = EMPTY_TACTICAL_OPPONENT_DRAFT;
  }
}

/**
 * Defines the `applySuccessfulPrecomputedAiResult` function shape (export function applySuccessfulPrecomputedAiResult(result: Extract<RequestAiOrdersResult,).

 * Purpose: Supports maintainability by documenting why `applySuccessfulPrecomputedAiResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function applySuccessfulPrecomputedAiResult(result: Extract<RequestAiOrdersResult, { success: true }>): void {
  if (result.tacticalOpponentPlan) {
    // Tactical IPC clears movement orders; keep precomputed null so the next tactical beat can re-enter the AI wait state.
    S.precomputedAiOrders = null;
    S.precomputedAiRangedOrders = [];
    S.precomputedAiEmbarkOrders = [];
  } else {
    S.precomputedAiOrders = result.orders;
    S.precomputedAiRangedOrders = result.rangedAttacks ?? [];
    S.precomputedAiEmbarkOrders = result.embarkOrders ?? [];
  }
  S.precomputedAiStrategy = result.strategy ?? null;
  S.precomputedAiMessage = result.message ?? null;
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
