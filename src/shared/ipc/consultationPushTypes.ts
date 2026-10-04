import type { AirStrikeOrder, EmbarkOrder, FerryOrder, MovementOrder, RangedAttackOrder } from './ordersTypes';

/**
 * Normalized opponent tactical orders buffered in the renderer until tactical Ready; mirrors strategic “AI orders held until ready” scheduling.
 *
 * Purpose: Single IPC shape for `tacticalOpponentPlan` on `requestAiOrders` and optional `opponentTacticalDraft` on tactical commit payloads.
 * When to use: Renderer state after a successful tactical AI consultation; echoed back on `commitHumanTacticalDraftOrders` for the combined beat.
 * Expected outcome: Arrays are always present (possibly empty); movement uses tactical sub-unit ids.
 * Exceptions: None.
 */
export type TacticalOpponentPlanPayload = {
  movementOrders: MovementOrder[];
  rangedAttacks: RangedAttackOrder[];
  airStrikes: AirStrikeOrder[];
  ferryOrders: FerryOrder[];
  embarkOrders: EmbarkOrder[];
};

/**
 * Post–beat tactical consultation fields merged on the commit IPC result (or historically via a renderer push).
 *
 * Purpose: Single shape for opponent draft refresh, optional strategy toast, and tool-count telemetry after `afterTacticalBeatResolution`.
 * When to use: Main attaches to successful `commitHumanTacticalDraftOrders` when event-driven Run consult completes; renderer matches `battleId` to `S.tacticalBattleSnapshot`.
 * Expected outcome: When `attachTacticalOpponentPlanToIpc` is true, `tacticalOpponentPlan` may be null or empty to clear draft and trigger prefetch; when false, the consumed Ready draft is cleared and prefetch may refill for the next beat.
 * Exceptions: None.
 */
export type TacticalPostBeatConsultFields = {
  kind: 'tactical';
  battleId: string;
  attachTacticalOpponentPlanToIpc: boolean;
  tacticalOpponentPlan?: TacticalOpponentPlanPayload | null;
  aiStrategy?: string;
  /**
   * Player-facing taunt/threat from the same consultation as `aiStrategy`.
   *
   * Contract: Optional; omit when empty after trim.
   * When to use: Renderer strategy toast Message section after a tactical beat consult.
   * Expected outcome: Independent of `aiStrategy` so message-only consults still display.
   * Exceptions: None.
   */
  aiMessage?: string;
  toolInvocationCounts?: Record<string, number>;
  /**
   * Dollar cost of this tactical post-beat consultation.
   *
   * Contract: Present only when the consult returned a finite number. A missing field is not zero.
   * When to use: Renderer adds it once to the match cost readout when applying these fields.
   * Expected outcome: Omitted when the consult did not report a finite cost.
   * Exceptions: None.
   */
  cost?: number;
  /**
   * True when main abandoned this consult because playback notify metadata did not match.
   *
   * Contract: Omit on successful consultation; renderer must unlatch and resume planning without applying a plan.
   * When to use: `notifyResolutionPlaybackComplete` mismatch or invalid payload while a tactical consult is pending.
   * Expected outcome: Latch cleared, opponent draft dropped, prefetch may restart; AI log comes from `openRouter:log`.
   * Exceptions: None.
   */
  abandoned?: boolean;
};

/**
 * Partial post-beat consultation payload before `kind` and `battleId` are attached for the tactical commit IPC surface.
 *
 * Purpose: Lets `runEventDrivenAfterTacticalBeatConsultation` return the same intermediate shape `afterTacticalBeatResolution` uses (`strategy` name) while `toTacticalPostBeatConsultFields` maps to `TacticalPostBeatConsultFields` (`aiStrategy`) in one place.
 * When to use: As the resolve type of `runEventDrivenAfterTacticalBeatConsultation` and as input to `toTacticalPostBeatConsultFields` from `main.ts`.
 * Expected outcome: Empty object when consultation is skipped or fails; otherwise optional attach flag, plan, strategy/message text, and tool counts.
 * Exceptions: None.
 */
export type TacticalPostBeatConsultMergeSource = {
  attachTacticalOpponentPlanToIpc?: boolean;
  tacticalOpponentPlan?: TacticalOpponentPlanPayload | null;
  strategy?: string;
  aiStrategy?: string;
  /**
   * Player-facing taunt/threat from the merge source (`message` from afterResolution, or already-mapped `aiMessage`).
   *
   * Contract: Optional; mapper prefers `message` then `aiMessage`.
   * When to use: `toTacticalPostBeatConsultFields`.
   * Expected outcome: Exposed as `aiMessage` on the IPC fields when non-empty.
   * Exceptions: None.
   */
  message?: string;
  aiMessage?: string;
  toolInvocationCounts?: Record<string, number>;
  /**
   * Dollar cost from the tactical post-beat consult, before IPC mapping.
   *
   * Contract: Copied onto `TacticalPostBeatConsultFields` only when it is a finite number.
   * When to use: `toTacticalPostBeatConsultFields`.
   * Expected outcome: Omitted from the IPC fields when missing or not finite, including `NaN`.
   * Exceptions: None.
   */
  cost?: number;
};

/**
 * Renderer tells main that resolution canvas playback finished so deferred LLM consultation may run.
 *
 * Purpose: Typed `game:notifyResolutionPlaybackComplete` body discriminating strategic Ready vs melee resolve vs tactical beat.
 * When to use: Preload bridge and main notify handler validation.
 * Expected outcome: `planningTurnNumber` aligns with `ReadyResult.deferredResolutionPlanningTurnNumber` for strategic/melee.
 * Exceptions: Invalid payloads clear pending mutex on main (logged).
 */
export type NotifyResolutionPlaybackCompletePayload =
  | { kind: 'strategic'; planningTurnNumber: number }
  | { kind: 'melee'; planningTurnNumber: number }
  | { kind: 'tactical'; battleId: string };

/**
 * Main pushes merged strategy telemetry after deferred `runEventDrivenAfterResolutionConsultation` completes.
 *
 * Purpose: Separates mechanical Ready IPC from post-resolution consultation results when deferring LLM work.
 * When to use: `webContents.send` on `IPC_GAME.postResolutionConsultation`.
 * Expected outcome: Renderer merges strategy toast + tool counts once `planningTurnNumber` matches `gameState.turnNumber`.
 * Exceptions: `abandoned` skips toast/tool merge and resumes planning after a notify mismatch.
 */
export type PostResolutionConsultationPushPayload = {
  planningTurnNumber: number;
  aiStrategy?: string;
  /**
   * Player-facing taunt/threat from the deferred post-resolution consultation.
   *
   * Contract: Optional; omit when empty after trim.
   * When to use: Renderer post-resolution consultation listener.
   * Expected outcome: Shown in the Message toast section independently of `aiStrategy`.
   * Exceptions: None.
   */
  aiMessage?: string;
  toolInvocationCounts?: Record<string, number>;
  /**
   * Dollar cost of the deferred strategic or melee post-resolution consultation.
   *
   * Contract: Present only when the consult returned a finite number. A missing field is not zero.
   * When to use: Renderer adds it once when this push is applied. Inline consults put the same cost on the Ready result instead.
   * Expected outcome: Omitted when the consult did not report a finite cost.
   * Exceptions: None.
   */
  cost?: number;
  /**
   * True when main abandoned this consult because playback notify metadata did not match.
   *
   * Contract: Omit on successful consultation; renderer must unlatch and resume planning without applying strategy.
   * When to use: `notifyResolutionPlaybackComplete` mismatch or invalid payload while a strategic/melee consult is pending.
   * Expected outcome: Latch cleared and Run prefetch may restart; AI log comes from `openRouter:log`.
   * Exceptions: None.
   */
  abandoned?: boolean;
};
