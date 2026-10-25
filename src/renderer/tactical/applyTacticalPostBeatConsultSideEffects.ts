import type { TacticalPostBeatConsultFields } from '../../shared/ipc/consultationPushTypes';
import { nextTacticalOpponentDraftAfterPostBeatPlan } from '../../shared/ipc/tacticalOpponentPlanMerge';
import { isAiSeatId } from '../../shared/seatIds';
import { rendererSharedState as S } from '../core/state';
import { readCommanderPoolAndApply, refreshCommanderSeatCosts } from '../openRouter/commanderPoolClient';
import { updateOpenRouterCostLabel } from '../openRouter/openRouterUiHelpers';

/**
 * Renderer dependencies for applying tactical post-beat consultation fields after commit IPC returns.
 *
 * Purpose: Keeps `readyHandler` wiring explicit while sharing the same contract the removed preload listener used.
 * When to use: Passed from tactical Ready success handling when `isTacticalPostBeatConsultOnCommit` is true.
 * Expected outcome: The next battle consult, the message dialog, tool counts, redraw, and Ready stay aligned with main.
 * Exceptions: None.
 */
export type TacticalPostBeatConsultSideEffectDeps = {
  startBackgroundRequestIfAllowed: () => void;
  updateOpenRouterToolCountLabels: () => void;
  appendOpenRouterLog: (line: string, isError?: boolean, seatId?: string) => void;
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
 * Purpose: Starts the next battle consult when this one stored no orders, shows the message dialog, and records cost.
 * When to use: After a successful tactical commit when `isTacticalPostBeatConsultOnCommit` is true and `battleId` matches.
 * Expected outcome: An empty plan starts another battle consult only while an AI side still has a unit. The toast and the seat cost still update.
 * Exceptions: None.
 */
export function applyTacticalPostBeatConsultSideEffects(
  payload: TacticalPostBeatConsultFields,
  deps: TacticalPostBeatConsultSideEffectDeps
): void {
  if (payload.kind !== 'tactical') return;
  if (payload.battleId !== S.tacticalBattleSnapshot?.battleId) return;
  if (payload.attachTacticalOpponentPlanToIpc) {
    const { startBackgroundPrefetch } = nextTacticalOpponentDraftAfterPostBeatPlan(payload.tacticalOpponentPlan);
    if (startBackgroundPrefetch && tacticalBattleHasAiSide()) deps.startBackgroundRequestIfAllowed();
  } else if (S.runButtonOn && tacticalBattleHasAiSide()) {
    deps.startBackgroundRequestIfAllowed();
  }
  void readCommanderPoolAndApply(true);
  if (payload.toolInvocationCounts) {
    S.toolInvocationCounts = { ...S.toolInvocationCounts, ...payload.toolInvocationCounts };
    deps.updateOpenRouterToolCountLabels();
  }
  if (typeof payload.cost === 'number' && Number.isFinite(payload.cost)) {
    void refreshCommanderSeatCosts().then(() => updateOpenRouterCostLabel());
  }
  deps.appendOpenRouterLog('Tactical post-beat consultation applied.', false);
  deps.redraw();
  deps.updateReadyButtonState();
}

/**
 * Whether the open battle still has a unit owned by an AI seat.
 *
 * Purpose: A beat with no AI side has nothing for a commander to plan.
 * When to use: Before starting another battle consult after a commit.
 * Expected outcome: True when any sub-unit's owner is an AI seat id.
 * Exceptions: None. A missing snapshot is false.
 */
export function tacticalBattleHasAiSide(): boolean {
  const units = S.tacticalBattleSnapshot?.subUnits;
  if (!units) return false;
  return units.some((unit) => isAiSeatId(unit.player));
}
