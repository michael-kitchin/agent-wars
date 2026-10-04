/**
 * Mutex + pending payloads for deferred event-driven LLM consultation after resolution canvas playback completes.
 *
 * Purpose: Lets main return mechanical resolution immediately while preserving the invariant that opponent pending-order
 * DB writes from `afterResolution` / `afterTacticalBeatResolution` finish before the next mutating IPC (`game:ready`,
 * melee resolve, tactical commit) runs again.
 * When to use: Only from `gameIpcHandlers`, `main.ts` tactical commit, `notifyResolutionPlaybackComplete`, `newGame`,
 * and `endTacticalBattle`.
 * Expected outcome: At most one pending deferred consult; notify validates ids, runs the deferred runner, pushes results
 * to the renderer, then clears pending.
 * Exceptions: Mismatched or invalid notifies abandon pending (clear mutex, push `abandoned`, log to OpenRouter) so Ready
 * cannot hang; leftover tactical notifies are also dropped in the renderer queue before they fire.
 */

import type { WebContents } from 'electron';
import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logError, logTrace } from '../logger';
import { IPC_GAME, IPC_OPENROUTER } from '../../shared/ipc/channels';
import { DEFERRED_PLAYBACK_CONSULT_ABANDONED_LOG } from '../../shared/ipc/deferredPlaybackConsultAbandoned';
import type { RequestAiOrdersResult } from '../../shared/ipc/openRouterTypes';
import type { ReadyResult } from '../../shared/ipc/readyTypes';
import type { TacticalCommitResolutionPlayback } from '../../shared/ipc/tacticalPlaybackTypes';
import type {
  NotifyResolutionPlaybackCompletePayload,
  PostResolutionConsultationPushPayload,
  TacticalPostBeatConsultFields,
  TacticalPostBeatConsultMergeSource,
} from '../../shared/ipc/consultationPushTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import {
  runEventDrivenAfterResolutionConsultation,
  runEventDrivenAfterTacticalBeatConsultation,
  toTacticalPostBeatConsultFields,
} from './readyIpcResolutionMapping';

/**
 * Captured arguments for `runEventDrivenAfterResolutionConsultation`, aligned with its parameter object.
 *
 * Purpose: Stored while playback runs so notify can invoke the same runner without re-simulating the turn.
 * When to use: Only inside pending strategic/melee records.
 * Expected outcome: Satisfies `runEventDrivenAfterResolutionConsultation` at notify time.
 * Exceptions: None.
 */
export type DeferredStrategicResolutionConsultArgs = {
  useEventDrivenConsultation: boolean;
  resolutionSuccess: boolean;
  aiPlanningRunEnabled: boolean;
  opponentState: GameStateSnapshot;
  resolution: ReadyResult;
  modelId: string;
  enabledToolNames: string[];
  hasKey: () => boolean;
  requestOrders: (
    state: GameStateSnapshot,
    modelId: string,
    options: { enabledToolNames: string[]; usePrecomputation?: boolean }
  ) => Promise<RequestAiOrdersResult>;
  timeoutMs: number;
  errorLogMessage: string;
};

/**
 * Captured arguments for `runEventDrivenAfterTacticalBeatConsultation`.
 *
 * Purpose: Stored while tactical resolution playback runs so notify can finish post-beat opponent LLM work later.
 * When to use: Only inside pending tactical-beat records.
 * Expected outcome: Satisfies `runEventDrivenAfterTacticalBeatConsultation` at notify time.
 * Exceptions: None.
 */
export type DeferredTacticalBeatConsultArgs = {
  useEventDrivenConsultation: boolean;
  aiPlanningRunEnabled: boolean;
  opponentState: GameStateSnapshot;
  tacticalBattle: TacticalBattleSnapshot;
  tacticalResolutionPlayback: TacticalCommitResolutionPlayback;
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
  timeoutMs: number;
  errorLogMessage: string;
};

type PendingPlaybackConsult =
  | { tag: 'strategic-ready'; planningTurnNumber: number; consultArgs: DeferredStrategicResolutionConsultArgs }
  | { tag: 'melee-resolve'; planningTurnNumber: number; consultArgs: DeferredStrategicResolutionConsultArgs }
  | { tag: 'tactical-beat'; battleId: string; consultArgs: DeferredTacticalBeatConsultArgs };

let pendingPlaybackConsult: PendingPlaybackConsult | null = null;

/**
 * True while main holds a deferred consultation mutex (playback not yet acknowledged or consult still running).
 *
 * Purpose: Lets `game:ready`, melee resolve, and tactical commit reject overlapping mutators until notify completes.
 * When to use: Start of IPC handlers that must not race deferred DB writes.
 * Expected outcome: False when no deferred work is outstanding.
 * Exceptions: None.
 */
export function hasDeferredPlaybackConsultPending(): boolean {
  logTrace('hasDeferredPlaybackConsultPending', { pending: pendingPlaybackConsult !== null });
  return pendingPlaybackConsult !== null;
}

/**
 * Drops any pending deferred consultation without running LLM work (new match, tactical teardown, recovery).
 *
 * Purpose: Prevents stale mutex records from blocking the next session after abandoning a battle or starting fresh.
 * When to use: `game:newGame`, `game:endTacticalBattle`, and other session teardowns that abandon deferred work.
 * Expected outcome: `hasDeferredPlaybackConsultPending` becomes false; no renderer push.
 * Exceptions: Notify mismatch recovery uses `abandonDeferredPlaybackConsult` instead so the renderer unlatches.
 */
export function clearDeferredPlaybackConsultPending(): void {
  logDebug('clearDeferredPlaybackConsultPending', { hadPending: pendingPlaybackConsult !== null });
  pendingPlaybackConsult = null;
}

/**
 * Records deferred strategic Ready post-resolution consultation inputs until `notifyResolutionPlaybackComplete`.
 *
 * Purpose: Defers `runEventDrivenAfterResolutionConsultation` until the renderer finishes resolution animations.
 * When to use: Successful `handleGameReady` completion path when event-driven Run applies.
 * Expected outcome: Mutex held until notify validates `planningTurnNumber` and runs consultation.
 * Exceptions: Caller must ensure mutex was empty (`handleGameReady` entry already guards duplicate Ready).
 */
export function setPendingStrategicReadyConsult(
  planningTurnNumber: number,
  consultArgs: DeferredStrategicResolutionConsultArgs
): void {
  logDebug('setPendingStrategicReadyConsult', { planningTurnNumber });
  pendingPlaybackConsult = { tag: 'strategic-ready', planningTurnNumber, consultArgs };
}

/**
 * Records deferred melee-intercept finalize consultation inputs until `notifyResolutionPlaybackComplete`.
 *
 * Purpose: Same deferral contract as strategic Ready for the melee-resolve IPC completion path.
 * When to use: After successful `resolveMeleeIntercept` when event-driven Run applies.
 * Expected outcome: Mutex held until notify validates turn id.
 * Exceptions: None.
 */
export function setPendingMeleeResolveConsult(
  planningTurnNumber: number,
  consultArgs: DeferredStrategicResolutionConsultArgs
): void {
  logDebug('setPendingMeleeResolveConsult', { planningTurnNumber });
  pendingPlaybackConsult = { tag: 'melee-resolve', planningTurnNumber, consultArgs };
}

/**
 * Records deferred tactical post-beat consultation until `notifyResolutionPlaybackComplete`.
 *
 * Purpose: Defers `runEventDrivenAfterTacticalBeatConsultation` until tactical resolution playback finishes on canvas.
 * When to use: Successful `commitHumanTacticalDraftOrders` when event-driven Run applies on main.
 * Expected outcome: Mutex held until notify validates `battleId`.
 * Exceptions: None.
 */
export function setPendingTacticalBeatConsult(battleId: string, consultArgs: DeferredTacticalBeatConsultArgs): void {
  logDebug('setPendingTacticalBeatConsult', { battleId });
  pendingPlaybackConsult = { tag: 'tactical-beat', battleId, consultArgs };
}

function strategicPayloadMatchesPending(
  payload: NotifyResolutionPlaybackCompletePayload,
  pending: PendingPlaybackConsult
): pending is { tag: 'strategic-ready'; planningTurnNumber: number; consultArgs: DeferredStrategicResolutionConsultArgs } {
  return (
    pending.tag === 'strategic-ready' &&
    payload.kind === 'strategic' &&
    payload.planningTurnNumber === pending.planningTurnNumber
  );
}

function meleePayloadMatchesPending(
  payload: NotifyResolutionPlaybackCompletePayload,
  pending: PendingPlaybackConsult
): pending is { tag: 'melee-resolve'; planningTurnNumber: number; consultArgs: DeferredStrategicResolutionConsultArgs } {
  return (
    pending.tag === 'melee-resolve' &&
    payload.kind === 'melee' &&
    payload.planningTurnNumber === pending.planningTurnNumber
  );
}

function tacticalPayloadMatchesPending(
  payload: NotifyResolutionPlaybackCompletePayload,
  pending: PendingPlaybackConsult
): pending is { tag: 'tactical-beat'; battleId: string; consultArgs: DeferredTacticalBeatConsultArgs } {
  return pending.tag === 'tactical-beat' && payload.kind === 'tactical' && payload.battleId === pending.battleId;
}

/**
 * Clears pending consultation after a notify mismatch or invalid payload and unlatches the renderer.
 *
 * Purpose: A true metadata mismatch must not leave Ready blocked or the AI-planning latch set; the player should see
 * why consultation was skipped and Run should resume prefetch.
 * When to use: Invalid notify shape or kind/id mismatch while `pendingPlaybackConsult` is set.
 * Expected outcome: Mutex cleared; `openRouter:log` error line; `abandoned` consult push on the pending kind's channel.
 * Exceptions: Does not run LLM consultation or write opponent orders.
 */
function abandonDeferredPlaybackConsult(
  sender: WebContents,
  pending: PendingPlaybackConsult,
  detail: Record<string, unknown>
): void {
  logError('handleNotifyResolutionPlaybackComplete: abandoning deferred consultation', {
    pendingTag: pending.tag,
    ...detail,
  });
  pendingPlaybackConsult = null;
  sender.send(IPC_OPENROUTER.log, {
    line: DEFERRED_PLAYBACK_CONSULT_ABANDONED_LOG,
    isError: true,
  });
  if (pending.tag === 'tactical-beat') {
    const fields: TacticalPostBeatConsultFields = {
      kind: 'tactical',
      battleId: pending.battleId,
      attachTacticalOpponentPlanToIpc: false,
      abandoned: true,
    };
    sender.send(IPC_GAME.postTacticalBeatConsultation, fields);
    return;
  }
  const push: PostResolutionConsultationPushPayload = {
    planningTurnNumber: pending.planningTurnNumber,
    abandoned: true,
  };
  sender.send(IPC_GAME.postResolutionConsultation, push);
}

/**
 * Runs deferred consultation after the renderer finishes resolution playback and validates pending mutex metadata.
 *
 * Purpose: IPC handler body for `game:notifyResolutionPlaybackComplete` — performs LLM consultation + `webContents.send`.
 * When to use: Registered once in `main.ts`; invoked from preload `invoke`.
 * Expected outcome: Resolves `{ ok: true }` after a matching consult push, or `{ ok: false, reason }` when idle or after
 * mismatch recovery.
 * Exceptions: Consult runners swallow LLM errors (logged upstream); matching notifies clear mutex after the consult
 * attempt; mismatched/invalid notifies abandon pending and unlatch the renderer.
 */
export async function handleNotifyResolutionPlaybackComplete(
  sender: WebContents,
  rawPayload: unknown
): Promise<{ ok: boolean; reason?: string }> {
  logDebug('handleNotifyResolutionPlaybackComplete', { rawPayload });
  const payload = rawPayload as NotifyResolutionPlaybackCompletePayload;
  if (!pendingPlaybackConsult) {
    logError('handleNotifyResolutionPlaybackComplete: no pending deferred consultation', { rawPayload });
    return { ok: false, reason: 'No deferred consultation is pending.' };
  }

  const pending = pendingPlaybackConsult;

  if (!payload || typeof payload !== 'object' || !('kind' in payload)) {
    abandonDeferredPlaybackConsult(sender, pending, { reason: 'invalid payload shape', rawPayload });
    return { ok: false, reason: 'Invalid notify payload.' };
  }

  if (strategicPayloadMatchesPending(payload, pending)) {
    const postConsult = await runEventDrivenAfterResolutionConsultation(pending.consultArgs);
    pendingPlaybackConsult = null;
    const push: PostResolutionConsultationPushPayload = {
      planningTurnNumber: pending.planningTurnNumber,
      ...(postConsult.aiStrategy ? { aiStrategy: postConsult.aiStrategy } : {}),
      ...(postConsult.aiMessage ? { aiMessage: postConsult.aiMessage } : {}),
      ...(postConsult.toolInvocationCounts ? { toolInvocationCounts: postConsult.toolInvocationCounts } : {}),
      ...(typeof postConsult.cost === 'number' && Number.isFinite(postConsult.cost) ? { cost: postConsult.cost } : {}),
    };
    sender.send(IPC_GAME.postResolutionConsultation, push);
    return { ok: true };
  }

  if (meleePayloadMatchesPending(payload, pending)) {
    const postConsult = await runEventDrivenAfterResolutionConsultation(pending.consultArgs);
    pendingPlaybackConsult = null;
    const push: PostResolutionConsultationPushPayload = {
      planningTurnNumber: pending.planningTurnNumber,
      ...(postConsult.aiStrategy ? { aiStrategy: postConsult.aiStrategy } : {}),
      ...(postConsult.aiMessage ? { aiMessage: postConsult.aiMessage } : {}),
      ...(postConsult.toolInvocationCounts ? { toolInvocationCounts: postConsult.toolInvocationCounts } : {}),
      ...(typeof postConsult.cost === 'number' && Number.isFinite(postConsult.cost) ? { cost: postConsult.cost } : {}),
    };
    sender.send(IPC_GAME.postResolutionConsultation, push);
    return { ok: true };
  }

  if (tacticalPayloadMatchesPending(payload, pending)) {
    const mergeSource: TacticalPostBeatConsultMergeSource = await runEventDrivenAfterTacticalBeatConsultation(
      pending.consultArgs
    );
    const battleId = pending.battleId;
    pendingPlaybackConsult = null;
    const fields = toTacticalPostBeatConsultFields(battleId, mergeSource);
    sender.send(IPC_GAME.postTacticalBeatConsultation, fields);
    return { ok: true };
  }

  abandonDeferredPlaybackConsult(sender, pending, { reason: 'metadata mismatch', payload });
  return { ok: false, reason: 'Deferred consultation metadata mismatch.' };
}
