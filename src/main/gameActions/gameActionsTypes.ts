import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { TacticalCommitResolutionPlayback, TacticalOpponentPlanPayload } from '../../shared/ipcTypes';

/**
 * Documents the `SubmitOrdersResult` interface as a named contract surface (export interface SubmitOrdersResult).

 * Purpose: Supports maintainability by documenting why `SubmitOrdersResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface SubmitOrdersResult {
    /**
   * Specifies the contract for the `success` member (success: boolean;).

   * Contract: Describes stable behavior for callers of `success` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
success: boolean;
    /**
   * Specifies the contract for the `reason` member (reason?: string;).

   * Contract: Describes stable behavior for callers of `reason` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
reason?: string;
  /**
   * Specifies the contract for the `tacticalBattle` member (tacticalBattle?: TacticalBattleSnapshot;).

   * Contract: Present only after a successful tactical human march mutation so the renderer can refresh res4 state without an extra round-trip.
   * When to use: Consumers of `commitHumanTacticalDraftOrders` after tactical Ready; not used for draft validation IPC.
   * Expected outcome: Deep snapshot suitable for JSON IPC when set.
   * Exceptions: None.
   */
  tacticalBattle?: TacticalBattleSnapshot;
  /**
   * Specifies the contract for the `tacticalResolutionPlayback` member (tacticalResolutionPlayback?: TacticalCommitResolutionPlayback;).

   * Contract: Present after successful tactical Ready commit when the renderer should play movement/combat overlays before the next interaction frame.
   * When to use: `commitHumanTacticalDraftOrders` success only; ignored for other `SubmitOrdersResult` producers.
   * Expected outcome: Structured deltas compatible with `S.resolutionMoveAnimation` population in the renderer.
   * Exceptions: None.
   */
  tacticalResolutionPlayback?: TacticalCommitResolutionPlayback;
  /**
   * Specifies the contract for the `tacticalMarchContinuations` member (tacticalMarchContinuations?: { subUnitId: string; destinationH3Index: string }[];).

   * Contract: Present when human march drafts were truncated to per-turn range; renderer re-queues these as pending marches for later tactical turns. Rows are limited to sub-units still on the post-beat roster (combat removals in the same beat are omitted).
   * When to use: Successful `commitHumanTacticalDraftOrders` only, alongside `tacticalBattle` refresh.
   * Expected outcome: Each row is a living human sub-unit id plus the original ordered destination still to reach.
   * Exceptions: None; omit when every march completed in one apply step or every continuing marcher was removed.
   */
  tacticalMarchContinuations?: { subUnitId: string; destinationH3Index: string }[];
  /**
   * Buffered opponent tactical rows produced after an event-driven post-beat consultation.
   *
   * Contract: When present, matches the tactical-only plan shape returned by `afterTacticalBeatResolution` for renderer-side draft hydration.
   * When to use: `commitHumanTacticalDraftOrders` success path after main attached post-beat consultation results.
   * Expected outcome: Renderer can populate `tacticalOpponentDraft` without a second model round-trip.
   * Exceptions: Omitted when no post-beat consultation ran; explicit `null` after consultation when the model returned no tactical plan (renderer clears buffer).
   */
  tacticalOpponentPlan?: TacticalOpponentPlanPayload | null;
  /**
   * Per-tool call counts from the tactical consultation pass that produced `tacticalOpponentPlan`, if any.
   *
   * Contract: Keys are tool names; values are non-negative integers counting invocations in that pass only.
   * When to use: Telemetry and debugging for tactical AI tool usage alongside `tacticalOpponentPlan`.
   * Expected outcome: Undefined when no tactical consultation ran or counts were not collected.
   * Exceptions: None.
   */
  toolInvocationCounts?: Record<string, number>;
  /**
   * Free-text opponent strategy from the post–tactical-beat LLM pass (IPC merge only).
   *
   * Contract: Populated by `game:commitHumanTacticalDraftOrders` in the main process after `runEventDrivenAfterTacticalBeatConsultation` when event-driven Run mode is on; never set by `commitHumanTacticalDraftOrders` inside `gameActions`.
   * When to use: Renderer shows the AI strategy toast after a tactical Ready beat, mirroring strategic `ReadyResult.aiStrategy`.
   * Expected outcome: Omitted when consultation is skipped or the model returns no strategy field.
   * Exceptions: None.
   */
  aiStrategy?: string;
  /**
   * Player-facing taunt/threat from the post–tactical-beat LLM pass (IPC merge only).
   *
   * Contract: Populated by `game:commitHumanTacticalDraftOrders` in the main process after consultation, mirroring `aiStrategy`.
   * When to use: Renderer Message toast section after a tactical Ready beat.
   * Expected outcome: Omitted when consultation is skipped or the model returns no message field.
   * Exceptions: None.
   */
  aiMessage?: string;
  /**
   * Sentinel that the incoming opponent tactical draft was consumed on this Ready.
   *
   * Contract: Present only when the renderer sent `opponentTacticalDraft`; always `null` after consume so the renderer does not resend the same marches next beat.
   * When to use: Renderer clears `S.tacticalOpponentDraft` when no fresh `tacticalOpponentPlan` merge runs (post-beat consult may refill afterward).
   * Expected outcome: Omitted when there was no incoming opponent draft; never echoes applied/sanitized rows back into the buffer.
   * Exceptions: None.
   */
  committedOpponentTacticalDraft?: TacticalOpponentPlanPayload | null;
}

/**
 * Documents the `HumanStandingOrderView` interface as a named contract surface (export interface HumanStandingOrderView).

 * Purpose: Supports maintainability by documenting why `HumanStandingOrderView` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HumanStandingOrderView {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `status` member (status: string;).

   * Contract: Describes stable behavior for callers of `status` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
status: string;
    /**
   * Specifies the contract for the `destinationH3Index` member (destinationH3Index: string | null;).

   * Contract: Describes stable behavior for callers of `destinationH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
destinationH3Index: string | null;
    /**
   * Specifies the contract for the `turnsRemaining` member (turnsRemaining: number;).

   * Contract: Describes stable behavior for callers of `turnsRemaining` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnsRemaining: number;
    /**
   * Specifies the contract for the `nextMoveH3Index` member (nextMoveH3Index: string | null;).

   * Contract: Describes stable behavior for callers of `nextMoveH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
nextMoveH3Index: string | null;
    /**
   * Specifies the contract for the `routeSegments` member (routeSegments?: { turn: number; hexes: [number, number][] }[];).

   * Contract: Describes stable behavior for callers of `routeSegments` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
routeSegments?: { turn: number; hexes: [number, number][] }[];
}
