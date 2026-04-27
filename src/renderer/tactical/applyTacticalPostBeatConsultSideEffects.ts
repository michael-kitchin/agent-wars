import type { TacticalPostBeatConsultFields } from '../../shared/ipc/readyTypes';
import { nextTacticalOpponentDraftAfterPostBeatPlan } from '../../shared/ipc/tacticalOpponentPlanMerge';
import { rendererSharedState as S } from '../core/state';

/**
 * Renderer dependencies for applying tactical post-beat consultation fields after commit IPC returns.
 *
 * Purpose: Keeps `readyHandler` wiring explicit while sharing the same contract the removed preload listener used.
 * When to use: Passed from tactical Ready success handling when `isTacticalPostBeatConsultOnCommit` is true.
 * Expected outcome: Opponent draft, prefetch, strategy toast, tool counts, redraw, and Ready gating stay aligned with main.
 * Exceptions: None.
 */
export type TacticalPostBeatConsultSideEffectDeps = {
  startBackgroundRequestIfAllowed: () => void;
  showAiStrategyToast: (content: string) => void;
  hideAiStrategyToast: () => void;
  updateOpenRouterToolCountLabels: () => void;
  appendOpenRouterLog: (line: string, isError?: boolean) => void;
  redraw: () => void;
  updateReadyButtonState: () => void;
};

/**
 * True when `commitHumanTacticalDraftOrders` merged tactical post-beat consultation fields onto its return value.
 *
 * Purpose: Main only attaches these fields after awaiting consultation on the event-driven Run path.
 * When to use: Tactical Ready handler to decide whether to run `applyTacticalPostBeatConsultSideEffects`.
 * Expected outcome: False for legacy builds or fast-return commits without consultation.
 * Exceptions: None.
 */
export function isTacticalPostBeatConsultOnCommit(obj: unknown): obj is TacticalPostBeatConsultFields {
  if (typeof obj !== 'object' || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    r.kind === 'tactical' &&
    typeof r.battleId === 'string' &&
    typeof r.attachTacticalOpponentPlanToIpc === 'boolean'
  );
}

/**
 * Applies `TacticalPostBeatConsultFields` from the commit IPC result (same behavior as the former push listener).
 *
 * Purpose: Hydrates `S.tacticalOpponentDraft`, optional prefetch, strategy toast, and tool telemetry once main finishes
 * post-beat consultation inside the same invoke round-trip.
 * When to use: After a successful tactical commit when `isTacticalPostBeatConsultOnCommit` is true and `battleId` matches.
 * Expected outcome: Renderer state matches main’s consultation outcome for the active tactical session.
 * Exceptions: None.
 */
export function applyTacticalPostBeatConsultSideEffects(
  payload: TacticalPostBeatConsultFields,
  deps: TacticalPostBeatConsultSideEffectDeps
): void {
  if (payload.kind !== 'tactical') return;
  if (payload.battleId !== S.tacticalBattleSnapshot?.battleId) return;
  if (payload.attachTacticalOpponentPlanToIpc) {
    const { draft, startBackgroundPrefetch } = nextTacticalOpponentDraftAfterPostBeatPlan(payload.tacticalOpponentPlan);
    S.tacticalOpponentDraft = draft;
    if (startBackgroundPrefetch) deps.startBackgroundRequestIfAllowed();
  } else {
    const oppAlive = S.tacticalBattleSnapshot?.subUnits.some((u) => u.player === 'opponent') ?? false;
    if (S.runButtonOn && oppAlive && S.tacticalOpponentDraft === null) {
      deps.startBackgroundRequestIfAllowed();
    }
  }
  if (payload.aiStrategy) deps.showAiStrategyToast(payload.aiStrategy);
  else deps.hideAiStrategyToast();
  if (payload.toolInvocationCounts) {
    S.toolInvocationCounts = { ...S.toolInvocationCounts, ...payload.toolInvocationCounts };
    deps.updateOpenRouterToolCountLabels();
  }
  deps.appendOpenRouterLog('Tactical post-beat consultation applied.', false);
  deps.redraw();
  deps.updateReadyButtonState();
}
