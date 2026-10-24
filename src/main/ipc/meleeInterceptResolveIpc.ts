/**
 * IPC handler for a paused pre-melee intercept after the player picks Fight or Ignore.
 *
 * Purpose: Keeps consultation and cost accounting aligned with strategic Ready without re-running movement, and
 * keeps that handler out of the strategic Ready module.
 * When to use: `game:resolveMeleeIntercept` from `main.ts`. Tests call it with mocks.
 * Expected outcome: A completed turn's `ReadyResult` fields, including `tacticalAutoStartH3Index` when the turn starts a battle.
 * Exceptions: Invalid payloads and a still-pending deferred consult return `success: false` without resolving the intercept.
 */

import { AI_CONSULTATION_WAIT_TIMEOUT_MS } from '../../shared/aiConsultationLimits';
import type { ReadyResult, ResolveMeleeInterceptIpcPayload } from '../../shared/ipcTypes';
import type { ReadyDeps, ReadyResultMinimal } from '../gameIpcHandlers';
import { logHybridPipelineBoundary } from '../hybridTurnPipeline';
import { logDebug } from '../logger';
import {
  hasDeferredPlaybackConsultPending,
  setPendingMeleeResolveConsult,
} from './deferredResolutionPlaybackConsult';
import {
  fallbackConsultModelId,
  pickReadyResolutionIpcMirrorFields,
  runEventDrivenAfterResolutionConsultation,
  type StrategicConsultArgs,
} from './readyIpcResolutionMapping';

/**
 * Reuses ready IPC dependencies while swapping the game-action entry point to melee-intercept resolve.
 *
 * Purpose: The intercept path needs the same consultation hooks as strategic Ready, with `resolveMeleeIntercept` in place of `ready`.
 * When to use: Wiring `handleResolveMeleeIntercept` from `main.ts`.
 * Expected outcome: Callers pass the shared ready consultation deps plus the intercept resolver.
 * Exceptions: None.
 */
export type ResolveMeleeInterceptDeps = Omit<ReadyDeps, 'ready'> & {
  /**
   * Completes paused strategic resolution after the player submits the melee dialog.
   *
   * Contract: Invoked once per pending intercept and returns the same completion shape as `ready` for a finished turn.
   * When to use: After the payload's decision token and Fight/Ignore choice have been checked.
   * Expected outcome: A `ReadyResult` for the remainder of the paused turn.
   * Exceptions: None. Failure reasons come back on the result.
   */
  resolveMeleeIntercept: (payload: ResolveMeleeInterceptIpcPayload) => ReadyResult;
};

/**
 * Handles renderer submission after a paused pre-melee intercept, including optional post-resolution AI consultation.
 *
 * Purpose: Finishes the paused turn and, when Events and Run are on, either stores a deferred consult or runs one now.
 * When to use: IPC `game:resolveMeleeIntercept` from the renderer modal.
 * Expected outcome: Full `ReadyResult` fields for a completed turn, plus `tacticalAutoStartH3Index` when the turn starts a battle.
 * The deferred-consult waiter uses `AI_CONSULTATION_WAIT_TIMEOUT_MS`, the same limit strategic Ready uses.
 * Exceptions: Delegates failure reasons to `resolveMeleeIntercept`. A missing token, a decision other than Fight or Ignore,
 * or a deferred consult that is still pending returns `success: false` and does not resolve the intercept.
 */
export async function handleResolveMeleeIntercept(
  payload: ResolveMeleeInterceptIpcPayload | undefined,
  deps: ResolveMeleeInterceptDeps
): Promise<ReadyResultMinimal> {
  logDebug('handleResolveMeleeIntercept', { hasPayload: payload !== undefined });
  if (hasDeferredPlaybackConsultPending()) {
    logDebug('handleResolveMeleeIntercept blocked: deferred playback consult pending', {});
    return { success: false, reason: 'Resolution playback consultation is still in progress.' };
  }
  const state = deps.getGameState();
  logHybridPipelineBoundary('handleResolveMeleeIntercept', { turnNumber: state.turnNumber, phase: state.phase });
  const modelId = fallbackConsultModelId(deps.getSelectedModel);
  const enabledGroupIds =
    payload?.enabledToolGroups && payload.enabledToolGroups.length > 0
      ? payload.enabledToolGroups
      : deps.defaultGroupIds;
  const enabledToolNames = deps.getToolNamesForEnabledGroups(enabledGroupIds);
  const useEventDrivenConsultation = payload?.useEventDrivenConsultation === true;
  const aiPlanningRunEnabled = payload?.aiPlanningRunEnabled === true;

  let aiStrategy: string | undefined;
  let aiMessage: string | undefined;
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

  const shouldDeferPostResolutionConsult = useEventDrivenConsultation && aiPlanningRunEnabled;
  const planningTurnNumberAfterResolution = deps.getGameState().turnNumber;

  const consultArgs: StrategicConsultArgs = {
    useEventDrivenConsultation,
    resolutionSuccess: resolveResult.success,
    aiPlanningRunEnabled,
    resolution: resolveResult,
    modelId,
    enabledToolNames,
    hasKey: deps.hasKey,
    requestOrders: deps.requestOrders,
    timeoutMs: AI_CONSULTATION_WAIT_TIMEOUT_MS,
    errorLogMessage: 'handleResolveMeleeIntercept: afterResolution failed or timed out',
  };
  if (shouldDeferPostResolutionConsult) {
    setPendingMeleeResolveConsult(planningTurnNumberAfterResolution, consultArgs);
  } else {
    const resolvePostConsult = await runEventDrivenAfterResolutionConsultation(consultArgs);
    if (resolvePostConsult.aiStrategy) {
      aiStrategy = resolvePostConsult.aiStrategy;
    }
    if (resolvePostConsult.aiMessage) {
      aiMessage = resolvePostConsult.aiMessage;
    }
    if (resolvePostConsult.toolInvocationCounts) {
      toolInvocationCounts = resolvePostConsult.toolInvocationCounts;
    }
    if (typeof resolvePostConsult.cost === 'number' && Number.isFinite(resolvePostConsult.cost)) {
      turnCost = resolvePostConsult.cost;
    }
  }

  return {
    success: true,
    ...pickReadyResolutionIpcMirrorFields(resolveResult),
    humanMoves: resolveResult.humanMoves,
    combatParticipantUnitIdsBySeat: resolveResult.combatParticipantUnitIdsBySeat,
    removedUnitIdsBySeat: resolveResult.removedUnitIdsBySeat,
    tacticalAutoStartH3Index: resolveResult.tacticalAutoStartH3Index,
    aiStrategy,
    aiMessage,
    toolInvocationCounts,
    cost: turnCost,
    wallClockMs: turnWallClockMs,
    inputTokens: turnInputTokens,
    outputTokens: turnOutputTokens,
    ...(shouldDeferPostResolutionConsult
      ? {
          postResolutionConsultDeferred: true,
          deferredResolutionPlanningTurnNumber: planningTurnNumberAfterResolution,
        }
      : {}),
  };
}
