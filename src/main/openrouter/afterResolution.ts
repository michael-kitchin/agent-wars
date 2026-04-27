/**
 * After-resolution callback evaluation and conditional consultation (Milestone 0.7).
 * Runs when event-driven mode is on: evaluates mandatory overrides and subscription events,
 * and if any fire, invokes the LLM and stores pending orders for the next turn.
 * Call synchronously after ready() returns so pending orders are set before the next Ready.
 */

import { logDebug, logError, logTrace } from '../logger';
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
import {
  evaluateMandatoryOverrides,
  evaluateSubscriptionEvents,
  evaluateTacticalMandatoryOverrides,
  type ResolutionContext,
} from '../callbackEvaluation';
import type { ReadyResult, RequestAiOrdersResult, TacticalCommitResolutionPlayback } from '../../shared/ipcTypes';
import type { TacticalOpponentPlanPayload } from '../../shared/ipc/readyTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';

/**
 * Strategic `ReadyResult` slice used to detect opponent activity during the resolved turn (march, ferry, strikes, combat).
 *
 * Purpose: Keeps `opponentHadStrategicResolutionUnitActions` aligned with fields present on completed Ready / melee-intercept results.
 * When to use: Only as the argument type for `opponentHadStrategicResolutionUnitActions` and the `afterResolution` participant pick.
 * Expected outcome: All listed keys are optional on wire payloads except where finalize always sets booleans.
 * Exceptions: None.
 */
type StrategicResolutionOpponentActivitySlice = Pick<
  ReadyResult,
  | 'opponentCombatParticipantUnitIds'
  | 'resolvedFerryMoves'
  | 'airStrikeMoves'
  | 'opponentHadStrategicMarchResolution'
>;

/**
 * Documents the `ReadyResultWithParticipants` type alias (type ReadyResultWithParticipants).

 * Purpose: Supports maintainability by documenting why `ReadyResultWithParticipants` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Includes combat and animation slices so idle-opponent consultation can see march, ferry, and air-strike participation.
 * Exceptions: None.
 */
type ReadyResultWithParticipants = Pick<
  ReadyResult,
  | 'success'
  | 'reason'
  | 'removedUnitIds'
  | 'removedOpponentUnitIds'
  | 'opponentCombatParticipantUnitIds'
  | 'infrastructureDestroyedEvents'
  | 'resolvedFerryMoves'
  | 'airStrikeMoves'
  | 'opponentHadStrategicMarchResolution'
>;

/**
 * Returns true when the opponent had any unit-level outcome during strategic turn resolution (movement, ferry, strike, or combat participation).
 *
 * Purpose: Drives the “idle opponent” branch so event-driven mode still calls the LLM after quiet turns when no callback events fired.
 * When to use: `afterResolution` after mandatory/subscription evaluation.
 * Expected outcome: False only when the opponent neither marched (including air), ferried, struck, nor appeared in combat participant lists this turn.
 * Exceptions: None.
 */
export function opponentHadStrategicResolutionUnitActions(r: StrategicResolutionOpponentActivitySlice): boolean {
  logTrace('opponentHadStrategicResolutionUnitActions', {});
  if (r.opponentHadStrategicMarchResolution === true) return true;
  if ((r.opponentCombatParticipantUnitIds?.length ?? 0) > 0) return true;
  if (r.resolvedFerryMoves?.some((m) => m.player === 'opponent')) return true;
  if (r.airStrikeMoves?.some((m) => m.player === 'opponent')) return true;
  return false;
}

/**
 * Returns true when opponent sub-units moved, ferried (via march playback), or dealt damage on this tactical beat.
 *
 * Purpose: Mirrors strategic idle detection for res4 post-beat consultation.
 * When to use: `afterTacticalBeatResolution` alongside tactical mandatory rules.
 * Expected outcome: False when `opponentMoves` is empty and no kill edge lists an opponent sub-unit as killer.
 * Exceptions: None.
 */
export function opponentHadTacticalBeatResolutionActions(
  playback: TacticalCommitResolutionPlayback,
  tacticalBattle: TacticalBattleSnapshot
): boolean {
  logTrace('opponentHadTacticalBeatResolutionActions', {});
  if ((playback.opponentMoves?.length ?? 0) > 0) return true;
  const opponentSubIds = new Set(tacticalBattle.subUnits.filter((s) => s.player === 'opponent').map((s) => s.id));
  const buckets: ReadonlyArray<ReadonlyArray<{ victimId: string; killerIds: string[] }> | undefined> = [
    playback.killsByDirectFire,
    playback.killsByAirStrike,
    playback.killsByReturnFire,
    playback.killsByMelee,
  ];
  for (const bucket of buckets) {
    for (const edge of bucket ?? []) {
      if (edge.killerIds.some((id) => opponentSubIds.has(id))) return true;
    }
  }
  return false;
}

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

  const opponentHadUnitActions = opponentHadStrategicResolutionUnitActions(resolutionResult);
  const consultBecauseOpponentIdle = !opponentHadUnitActions;
  const shouldConsult =
    mandatoryFired.length > 0 || subscriptionFired.length > 0 || consultBecauseOpponentIdle;

  if (shouldConsult && consultBecauseOpponentIdle && mandatoryFired.length === 0 && subscriptionFired.length === 0) {
    logDebug('afterResolution: opponent had no resolution-time unit actions; invoking LLM', { turnNumber: state.turnNumber });
  }

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
    logDebug('afterResolution: skipping LLM (callback events absent and opponent had resolution-time unit actions)', {
      turnNumber: state.turnNumber,
    });
    return { consulted: false };
  }
}

/**
 * Builds the callback evaluation slice for a completed tactical beat from deterministic playback metadata.
 *
 * Purpose: Feeds `evaluateTacticalMandatoryOverrides` / `evaluateSubscriptionEvents` without a full strategic `ReadyResult`.
 * When to use: Only from `afterTacticalBeatResolution` after `commitHumanTacticalDraftOrders` succeeds.
 * Expected outcome: `opponentCombatParticipantUnitIds` lists opponent sub-units that moved this beat or were removed (combat-adjacent signal).
 * Exceptions: None.
 */
export function buildTacticalBeatResolutionReadyParticipants(
  playback: TacticalCommitResolutionPlayback,
  tacticalBattle: TacticalBattleSnapshot
): ReadyResultWithParticipants {
  const removedCombined = [...(playback.rangedRemovedUnits ?? []), ...(playback.meleeRemovedUnits ?? [])];
  const removedUnitIds = removedCombined.map((u) => u.id);
  const removedOpponentUnitIds = removedCombined.filter((u) => u.player === 'opponent').map((u) => u.id);
  const oppCombat = new Set<string>();
  for (const m of playback.opponentMoves ?? []) {
    if (tacticalBattle.subUnits.some((u) => u.id === m.unitId && u.player === 'opponent')) {
      oppCombat.add(m.unitId);
    }
  }
  for (const id of removedOpponentUnitIds) {
    oppCombat.add(id);
  }
  return {
    success: true,
    removedUnitIds: removedUnitIds.length > 0 ? removedUnitIds : undefined,
    removedOpponentUnitIds: removedOpponentUnitIds.length > 0 ? removedOpponentUnitIds : undefined,
    opponentCombatParticipantUnitIds: [...oppCombat],
    infrastructureDestroyedEvents: playback.infrastructureDestroyedEvents,
  };
}

/**
 * Documents the `AfterTacticalBeatResolutionDeps` interface as a named contract surface (export interface AfterTacticalBeatResolutionDeps).

 * Purpose: Same injection surface as strategic `afterResolution`, but `requestOrders` may pass `tacticalAiBattle`.
 * When to use: `runEventDrivenAfterTacticalBeatConsultation` from the tactical commit IPC path.
 * Expected outcome: Successful tactical consultations return `tacticalOpponentPlan` for the renderer buffer; the LLM runs when tactical mandatory rules or subscription events fire, or when the opponent had no beat-time unit actions (strategic-style cadence plus idle-opponent parity).
 * Exceptions: None.
 */
export interface AfterTacticalBeatResolutionDeps {
  /**
   * OpenRouter (or adapter) model id used for the tactical consultation call.
   *
   * Contract: Non-empty model identifier understood by the shared `requestOrders` path.
   * When to use: Passed through to `requestOrders` alongside tactical battle context.
   * Expected outcome: Same model selection semantics as strategic after-resolution flows.
   * Exceptions: None at this boundary; invalid ids fail inside `requestOrders`.
   */
  modelId: string;
  /**
   * Tool names enabled for the tactical consultation request.
   *
   * Contract: Subset of tools the engine allows for tactical AI planning in this build.
   * When to use: Mirroring the tool allowlist used for strategic orders when reusing `requestOrders`.
   * Expected outcome: `buildToolDefinitions` receives a consistent list for the tactical prompt.
   * Exceptions: None.
   */
  enabledToolNames: string[];
  /**
   * Predicate indicating whether an API key is available for outbound LLM calls.
   *
   * Contract: When false, consultation must skip network without throwing from this module.
   * When to use: Gate optional LLM invocation after mandatory tactical rules run.
   * Expected outcome: Caller observes `consulted: false` when key is missing.
   * Exceptions: None.
   */
  hasKey: () => boolean;
  /**
   * Shared AI order request entry point reused with tactical options.
   *
   * Contract: Must accept `tacticalAiBattle` in `options` when provided and return the same `RequestAiOrdersResult` shape as strategic callers.
   * When to use: Injected to avoid a circular dependency on the concrete OpenRouter client.
   * Expected outcome: Buffered tactical rows when the model returns a valid tactical plan payload.
   * Exceptions: Propagates only when the adapter surfaces structured failures; otherwise swallowed by caller policy.
   */
  requestOrders: (
    state: GameStateSnapshot,
    modelId: string,
    options: {
      enabledToolNames: string[];
      usePrecomputation?: boolean;
      tacticalAiBattle?: TacticalBattleSnapshot;
    }
  ) => Promise<RequestAiOrdersResult>;
}

/**
 * Documents the `AfterTacticalBeatResolutionResult` interface as a named contract surface (export interface AfterTacticalBeatResolutionResult).

 * Purpose: Returns buffered opponent tactical rows when event-driven consultation fires after a tactical beat.
 * When to use: Consumed by `game:commitHumanTacticalDraftOrders` IPC to hydrate `S.tacticalOpponentDraft` without a second round-trip.
 * Expected outcome: `tacticalOpponentPlan` when the model returned a valid plan; `attachTacticalOpponentPlanToIpc` tells main whether to merge any plan field at all.
 * Exceptions: None.
 */
export interface AfterTacticalBeatResolutionResult {
  /**
   * Whether an LLM-backed tactical consultation was attempted and completed successfully.
   *
   * Contract: True only when the optional model call ran to completion without being skipped for missing key or policy.
   * When to use: Renderer and IPC layers decide whether to trust `tacticalOpponentPlan` as fresh.
   * Expected outcome: False when skipped, failed softly, or keyless short-circuit after mandatory work.
   * Exceptions: None.
   */
  consulted: boolean;
  /**
   * Opponent tactical plan rows for renderer buffering when consultation succeeded.
   *
   * Contract: When present, payload is validated tactical-only opponent rows compatible with `tacticalOpponentDraft` hydration.
   * When to use: After `afterTacticalBeatResolution` returns with a model-produced plan.
   * Expected outcome: Undefined when not consulted or model returned no tactical plan.
   * Exceptions: None.
   */
  tacticalOpponentPlan?: TacticalOpponentPlanPayload;
  /**
   * Optional short natural-language strategy summary from the tactical consultation.
   *
   * Contract: Opaque diagnostic text for logs or UI; not authoritative for game rules.
   * When to use: When the adapter exposes strategy text alongside tool results.
   * Expected outcome: Undefined when the model did not emit strategy content.
   * Exceptions: None.
   */
  strategy?: string;
  /**
   * Tool invocation counts for the tactical consultation pass, when collected.
   *
   * Contract: Map of tool name to non-negative invocation count for that single pass.
   * When to use: Debugging parity with strategic `afterResolution` telemetry.
   * Expected outcome: Undefined when consultation did not run tools or counts were not captured.
   * Exceptions: None.
   */
  toolInvocationCounts?: Record<string, number>;
  /**
   * When true, the tactical commit IPC layer must set `tacticalOpponentPlan` (payload or explicit null) so the renderer can replace or clear its buffer.
   *
   * Contract: True only after mandatory/subscription evaluation decided to invoke `requestOrders` (including failed or empty model responses); false when the beat was skipped before any LLM call (same idea as strategic omitting draft updates when no consultation ran).
   * When to use: `runEventDrivenAfterTacticalBeatConsultation` and `main` merge logic branch on this instead of always sending a plan field.
   * Expected outcome: False preserves the prior `tacticalOpponentDraft` client-side when no events fired; true with no payload clears the draft.
   * Exceptions: None.
   */
  attachTacticalOpponentPlanToIpc?: boolean;
}

/**
 * Event-driven tactical post-beat consultation: subscriptions + tactical-only mandatory rules, then optional LLM call.
 *
 * Purpose: Mirrors strategic `afterResolution` for res4 battles without writing strategic `setAiPendingOrders`.
 * When to use: After a successful `commitHumanTacticalDraftOrders` when the renderer sent event-driven flags.
 * Expected outcome: Buffered `tacticalOpponentPlan` when subscriptions, tactical mandatory rules, or idle-opponent policy demand a consultation pass.
 * Exceptions: Swallows LLM failures after logging; clears strategic pending orders when skipping or failing.
 */
export async function afterTacticalBeatResolution(
  state: GameStateSnapshot,
  tacticalBattle: TacticalBattleSnapshot,
  playback: TacticalCommitResolutionPlayback,
  deps: AfterTacticalBeatResolutionDeps
): Promise<AfterTacticalBeatResolutionResult> {
  if (!deps.modelId?.trim() || !deps.hasKey()) {
    logDebug('afterTacticalBeatResolution: skip (no model or no key)');
    return { consulted: false, attachTacticalOpponentPlanToIpc: false };
  }
  const resolutionSlice = buildTacticalBeatResolutionReadyParticipants(playback, tacticalBattle);
  const removedUnitIds = resolutionSlice.removedUnitIds ?? [];
  const removedOpponentUnitIds = resolutionSlice.removedOpponentUnitIds ?? [];
  const opponentCombatants = resolutionSlice.opponentCombatParticipantUnitIds ?? [];
  const ctx: ResolutionContext = {
    opponentCombatParticipantUnitIds: opponentCombatants,
    removedUnitIds,
    removedOpponentUnitIds,
    infrastructureDestroyedEvents: resolutionSlice.infrastructureDestroyedEvents,
  };
  const mandatoryFired = evaluateTacticalMandatoryOverrides(ctx);
  const subscriptions = getSubscriptions('opponent');
  const subscriptionFired = evaluateSubscriptionEvents(state, subscriptions, ctx);
  const hadOpponentBeatActions = opponentHadTacticalBeatResolutionActions(playback, tacticalBattle);
  const consultBecauseOpponentIdle = !hadOpponentBeatActions;
  const shouldConsult =
    mandatoryFired.length > 0 || subscriptionFired.length > 0 || consultBecauseOpponentIdle;
  if (!shouldConsult) {
    clearAiPendingOrders('opponent');
    logDebug('afterTacticalBeatResolution: skipping tactical LLM', {
      reason: 'no_callback_events_and_opponent_had_beat_resolution_actions',
      turnNumber: state.turnNumber,
    });
    return { consulted: false, attachTacticalOpponentPlanToIpc: false };
  }
  if (consultBecauseOpponentIdle && mandatoryFired.length === 0 && subscriptionFired.length === 0) {
    logDebug('afterTacticalBeatResolution: opponent had no beat-time unit actions; invoking LLM', {
      turnNumber: state.turnNumber,
    });
  }
  try {
    const result = await deps.requestOrders(state, deps.modelId, {
      enabledToolNames: deps.enabledToolNames,
      usePrecomputation: false,
      tacticalAiBattle: tacticalBattle,
    });
    if (result.success === true && result.tacticalOpponentPlan) {
      setAiLastConsultationTurn(state.turnNumber);
      clearOpponentCombatSinceConsultation();
      logDebug('afterTacticalBeatResolution: tactical consultation completed', {
        movementCount: result.tacticalOpponentPlan.movementOrders.length,
      });
      return {
        consulted: true,
        tacticalOpponentPlan: result.tacticalOpponentPlan,
        strategy: result.strategy,
        toolInvocationCounts: result.toolInvocationCounts,
        attachTacticalOpponentPlanToIpc: true,
      };
    }
    logDebug('afterTacticalBeatResolution: requestOrders missing tactical plan', { success: result.success });
    clearAiPendingOrders('opponent');
    return { consulted: false, attachTacticalOpponentPlanToIpc: true };
  } catch (err) {
    logError('afterTacticalBeatResolution: requestOrders exception', err);
    clearAiPendingOrders('opponent');
    return { consulted: false, attachTacticalOpponentPlanToIpc: true };
  }
}
