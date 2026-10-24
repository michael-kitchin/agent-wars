/**
 * After-resolution callback evaluation and conditional consultation.
 * Runs when event-driven mode is on: evaluates mandatory overrides and subscription events,
 * and consults when those fire, when the opponent had no resolution-time unit actions, or when the human had observable resolution outcomes.
 * Call synchronously after ready() returns so pending orders are set before the next Ready.
 */

import { isLikelyAbortError } from '../../shared/abortError';
import { AI_SEAT_IDS, isAiSeatId, isNeutralOwnerId, type AiSeatId } from '../../shared/seatIds';
import { logDebug, logError } from '../logger';
import type { GameStateSnapshot } from '../gameDb';
import {
  getAiLastConsultationTurn,
  setAiLastConsultationTurn,
  getCombatSinceConsultation,
  consumeFogNewContactsForPlayer,
  addCombatSinceConsultation,
  clearCombatSinceConsultation,
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
import type { RequestAiOrdersResult, TacticalCommitResolutionPlayback } from '../../shared/ipcTypes';
import type { TacticalOpponentPlanPayload } from '../../shared/ipc/consultationPushTypes';
import { tacticalOpponentPlanFromRequestOrdersSuccess } from '../../shared/ipc/tacticalOpponentPlanMerge';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { getTacticalAnnihilationOutcome } from '../../shared/tacticalAnnihilation';
import {
  computePostResolutionConsultTriggers,
  enemyHadStrategicResolutionObservableActions,
  enemyHadTacticalBeatResolutionActions,
  seatHadStrategicResolutionUnitActions,
  seatHadTacticalBeatResolutionActions,
  type ReadyResultWithParticipants,
} from './consultationPolicy';

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
    options: { seatId: AiSeatId; enabledToolNames: string[]; usePrecomputation: boolean; signal?: AbortSignal }
  ) => Promise<RequestAiOrdersResult>;
  /**
   * Aborts this consult when the player stops opponent planning or the waiter gives up.
   *
   * Contract: When aborted, or when `requestOrders` returns `Cancelled`, pending orders are left as they were.
   * When to use: The post-resolution runner passes the attempt signal.
   * Expected outcome: A cancel returns `{ consulted: false }` without `clearAiPendingOrders`.
   * Exceptions: None.
   */
  signal?: AbortSignal;
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
   * One-line in-character taunt or threat from the consultation, when provided.

   * Contract: Opaque prose for the player-facing toast and later prompts; not parsed for mechanics.
   * When to use: Map onto Ready IPC `aiMessage` after post-resolution consultation.
   * Expected outcome: Undefined when the model did not emit a message.
   * Exceptions: None.
   */
message?: string;
    /**
   * Specifies the contract for the `toolInvocationCounts` member (toolInvocationCounts?: Record<string, number>;).

   * Contract: Describes stable behavior for callers of `toolInvocationCounts` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
toolInvocationCounts?: Record<string, number>;
    /**
   * Dollar cost of the successful post-resolution consultation, when the model call reported one.
   *
   * Contract: Optional non-negative dollar amount; set only when the consultation succeeded and reported a cost.
   * When to use: Copy onto the Ready result or the deferred consult push so the match readout can add it.
   * Expected outcome: A finite number when `requestOrders` returned one; omitted otherwise. Never `NaN`.
   * Exceptions: None.
   */
cost?: number;
}

/**
 * Defines the `afterResolution` function shape (export async function afterResolution( state: GameStateSnapshot, resolutionResult: ReadyResultWithParticipants, deps: AfterResolutionDeps ): Promise<A).

 * Purpose: Supports maintainability by documenting why `afterResolution` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: When consultation runs, pending opponent orders are stored (including empty movement lists) and `strategy` / `toolInvocationCounts` are returned for Ready IPC telemetry—same success gate as `afterTacticalBeatResolution`.
 * Exceptions: None.
 */
export async function afterResolution(
  state: GameStateSnapshot,
  resolutionResult: ReadyResultWithParticipants,
  deps: AfterResolutionDeps,
  seatId: AiSeatId = AI_SEAT_IDS[0]
): Promise<AfterResolutionResult> {
  if (!resolutionResult.success || !deps.modelId?.trim() || !deps.hasKey()) {
    logDebug('afterResolution: skip (no success, no model, or no key)');
    return { consulted: false };
  }

  const opponentCombatants = [...(resolutionResult.combatParticipantUnitIdsBySeat?.[seatId] ?? [])];
  const removedUnitIds = resolutionResult.removedUnitIds ?? [];
  const removedOpponentUnitIds = [...(resolutionResult.removedUnitIdsBySeat?.[seatId] ?? [])];

  const combatSince = getCombatSinceConsultation(seatId);
  const lastConsultationTurn = getAiLastConsultationTurn(seatId);

  const mandatoryFired = evaluateMandatoryOverrides(
    seatId,
    state,
    lastConsultationTurn,
    combatSince,
    opponentCombatants,
    removedOpponentUnitIds,
    consumeFogNewContactsForPlayer(seatId)
  );

  addCombatSinceConsultation(seatId, opponentCombatants);

  const ctx: ResolutionContext = {
    opponentCombatParticipantUnitIds: opponentCombatants,
    removedUnitIds,
    removedOpponentUnitIds,
    infrastructureDestroyedEvents: resolutionResult.infrastructureDestroyedEvents,
  };
  const subscriptions = getSubscriptions(seatId);
  const subscriptionFired = evaluateSubscriptionEvents(seatId, state, subscriptions, ctx);

  const opponentHadUnitActions = seatHadStrategicResolutionUnitActions(resolutionResult, seatId);
  const consultBecauseOpponentIdle = !opponentHadUnitActions;
  const humanHadObservableActions = enemyHadStrategicResolutionObservableActions(resolutionResult, state, seatId);
  const { shouldConsult, policyOnlyConsult } = computePostResolutionConsultTriggers({
    mandatoryCount: mandatoryFired.length,
    subscriptionCount: subscriptionFired.length,
    seatIdle: consultBecauseOpponentIdle,
    enemyObservable: humanHadObservableActions,
  });

  if (shouldConsult && policyOnlyConsult) {
    logDebug('afterResolution: invoking LLM from post-resolution policy', {
      turnNumber: state.turnNumber,
      opponentIdle: consultBecauseOpponentIdle,
      humanObservableResolution: humanHadObservableActions,
    });
  }

  if (shouldConsult) {
    try {
      const result = await deps.requestOrders(state, deps.modelId, {
        seatId,
        enabledToolNames: deps.enabledToolNames,
        usePrecomputation: true,
        signal: deps.signal,
      });
      if (deps.signal?.aborted || ('error' in result && result.error === 'Cancelled')) {
        logDebug('afterResolution: consultation cancelled', { turnNumber: state.turnNumber });
        return { consulted: false };
      }
      if (result.success === true) {
        setAiPendingOrders(
          seatId,
          result.orders,
          result.rangedAttacks ?? [],
          result.airStrikes ?? [],
          result.ferryOrders ?? [],
          result.embarkOrders ?? []
        );
        setAiLastConsultationTurn(seatId, state.turnNumber);
        clearCombatSinceConsultation(seatId);
        logDebug('afterResolution: consultation completed, pending orders stored', {
          turnNumber: state.turnNumber,
          movementCount: result.orders.length,
          hasToolInvocationCounts: Boolean(result.toolInvocationCounts),
          hasMessage: Boolean(result.message?.trim()),
          cost: typeof result.cost === 'number' && Number.isFinite(result.cost) ? result.cost : undefined,
        });
        return {
          consulted: true,
          strategy: result.strategy,
          message: result.message,
          toolInvocationCounts: result.toolInvocationCounts,
          ...(typeof result.cost === 'number' && Number.isFinite(result.cost) ? { cost: result.cost } : {}),
        };
      }
      logDebug('afterResolution: requestOrders failed', {
        error: (result as { error?: string }).error,
      });
      clearAiPendingOrders(seatId);
      return { consulted: false };
    } catch (err) {
      if (deps.signal?.aborted || isLikelyAbortError(err)) {
        logDebug('afterResolution: consultation cancelled', { turnNumber: state.turnNumber });
        return { consulted: false };
      }
      logError('afterResolution: requestOrders exception', err);
      clearAiPendingOrders(seatId);
      return { consulted: false };
    }
  } else {
    clearAiPendingOrders(seatId);
    logDebug('afterResolution: skipping LLM (no callback events; opponent had resolution actions; human had no observable resolution actions)', {
      turnNumber: state.turnNumber,
      opponentHadUnitActions,
      humanHadObservableActions,
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
  const party = tacticalBattle.opposingPartyId;
  const removedForParty = party
    ? removedCombined.filter((unit) => unit.player === party).map((unit) => unit.id)
    : [];
  const oppCombat = new Set<string>();
  for (const move of playback.opponentMoves ?? []) {
    if (party && tacticalBattle.subUnits.some((unit) => unit.id === move.unitId && unit.player === party)) {
      oppCombat.add(move.unitId);
    }
  }
  for (const id of removedForParty) oppCombat.add(id);
  return {
    success: true,
    removedUnitIds: removedUnitIds.length > 0 ? removedUnitIds : undefined,
    removedUnitIdsBySeat: party ? { [party]: removedForParty } : undefined,
    combatParticipantUnitIdsBySeat: party ? { [party]: [...oppCombat] } : undefined,
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
      seatId: AiSeatId;
      enabledToolNames: string[];
      usePrecomputation?: boolean;
      tacticalAiBattle?: TacticalBattleSnapshot;
      signal?: AbortSignal;
    }
  ) => Promise<RequestAiOrdersResult>;
  /**
   * Aborts this post-beat consult when the player stops tactical planning or the waiter gives up.
   *
   * Contract: A cancel does not clear strategic pending orders and does not attach a tactical plan.
   * When to use: The post-beat runner passes the attempt signal.
   * Expected outcome: `{ consulted: false, attachTacticalOpponentPlanToIpc: false }`.
   * Exceptions: None.
   */
  signal?: AbortSignal;
}

/**
 * Documents the `AfterTacticalBeatResolutionResult` interface as a named contract surface (export interface AfterTacticalBeatResolutionResult).

 * Purpose: Returns buffered opponent tactical rows when event-driven consultation fires after a tactical beat.
 * When to use: Consumed by `game:commitHumanTacticalDraftOrders` IPC (main awaits consultation, then merges fields onto the invoke result for the renderer).
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
   * Contract: When present, payload is validated tactical-only opponent rows for the commander pool.
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
   * One-line in-character taunt or threat from the tactical consultation, when provided.
   *
   * Contract: Opaque prose for the player-facing toast and later prompts; not authoritative for game rules.
   * When to use: Map onto tactical IPC `aiMessage` after post-beat consultation.
   * Expected outcome: Undefined when the model did not emit a message.
   * Exceptions: None.
   */
  message?: string;
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
   * Dollar cost of the successful tactical post-beat consultation, when the model call reported one.
   *
   * Contract: Optional non-negative dollar amount; set only when the consultation succeeded and reported a cost.
   * When to use: Copy onto the tactical consult merge so the match readout can add it once.
   * Expected outcome: A finite number when `requestOrders` returned one; omitted otherwise. Never `NaN`.
   * Exceptions: None.
   */
  cost?: number;
  /**
   * When true, the tactical commit result includes `tacticalOpponentPlan` so the screen can start another battle consult when that plan is empty.
   *
   * Contract: True only after mandatory/subscription evaluation decided to invoke `requestOrders` (including failed or empty model responses); false when the beat was skipped before any LLM call (same idea as strategic omitting draft updates when no consultation ran).
   * When to use: `runEventDrivenAfterTacticalBeatConsultation` and `main` merge logic branch on this instead of always sending a plan field.
   * Expected outcome: False leaves the pool's stored plan alone when no consultation ran. True with no plan means this beat stored nothing new.
   * Exceptions: None.
   */
  attachTacticalOpponentPlanToIpc?: boolean;
}

/**
 * Event-driven tactical post-beat consultation: subscriptions + tactical-only mandatory rules, then optional LLM call.
 *
 * Purpose: Mirrors strategic `afterResolution` for tactical battles without writing strategic `setAiPendingOrders`.
 * When to use: After a successful `commitHumanTacticalDraftOrders` when the renderer sent event-driven flags.
 * Expected outcome: Buffered `tacticalOpponentPlan` when subscriptions, tactical mandatory rules, idle-opponent policy, or observable human beat actions demand a consultation pass. Successful `requestOrders` results without a prebuilt `tacticalOpponentPlan` are normalized from `orders` arrays so tool counts and strategy still reach IPC.
 * Exceptions: Swallows LLM failures after logging. Skip and failure paths leave strategic pending orders in place.
 * Annihilation: When `getTacticalAnnihilationOutcome(tacticalBattle.subUnits)` is non-null, skips immediately so no LLM runs while the renderer shows the tactical game-over modal.
 */
export async function afterTacticalBeatResolution(
  state: GameStateSnapshot,
  tacticalBattle: TacticalBattleSnapshot,
  playback: TacticalCommitResolutionPlayback,
  deps: AfterTacticalBeatResolutionDeps,
  requestedSeatId: AiSeatId = AI_SEAT_IDS[0]
): Promise<AfterTacticalBeatResolutionResult> {
  if (!deps.modelId?.trim() || !deps.hasKey()) {
    logDebug('afterTacticalBeatResolution: skip tactical LLM', {
      reason: 'skip_no_model_or_key',
      turnNumber: state.turnNumber,
      battleId: tacticalBattle.battleId,
      hasModel: Boolean(deps.modelId?.trim()),
      hasKey: deps.hasKey(),
    });
    return { consulted: false, attachTacticalOpponentPlanToIpc: false };
  }
  if (getTacticalAnnihilationOutcome(tacticalBattle.subUnits) !== null) {
    logDebug('afterTacticalBeatResolution: skip tactical LLM', {
      reason: 'skip_annihilation_roster',
      turnNumber: state.turnNumber,
      battleId: tacticalBattle.battleId,
    });
    return { consulted: false, attachTacticalOpponentPlanToIpc: false };
  }
  if (tacticalBattle.opposingPartyId !== undefined && isNeutralOwnerId(tacticalBattle.opposingPartyId)) {
    logDebug('afterTacticalBeatResolution: skip tactical LLM', {
      reason: 'skip_neutral_party',
      turnNumber: state.turnNumber,
      battleId: tacticalBattle.battleId,
    });
    return { consulted: false, attachTacticalOpponentPlanToIpc: false };
  }
  const seatId =
    tacticalBattle.opposingPartyId !== undefined && isAiSeatId(tacticalBattle.opposingPartyId)
      ? tacticalBattle.opposingPartyId
      : requestedSeatId;
  const resolutionSlice = buildTacticalBeatResolutionReadyParticipants(playback, tacticalBattle);
  const removedUnitIds = resolutionSlice.removedUnitIds ?? [];
  const removedOpponentUnitIds = [...(resolutionSlice.removedUnitIdsBySeat?.[seatId] ?? [])];
  const opponentCombatants = [...(resolutionSlice.combatParticipantUnitIdsBySeat?.[seatId] ?? [])];
  const ctx: ResolutionContext = {
    opponentCombatParticipantUnitIds: opponentCombatants,
    removedUnitIds,
    removedOpponentUnitIds,
    infrastructureDestroyedEvents: resolutionSlice.infrastructureDestroyedEvents,
  };
  const mandatoryFired = evaluateTacticalMandatoryOverrides(ctx);
  const subscriptions = getSubscriptions(seatId);
  const subscriptionFired = evaluateSubscriptionEvents(seatId, state, subscriptions, ctx);
  const hadOpponentBeatActions = seatHadTacticalBeatResolutionActions(playback, tacticalBattle, seatId);
  const consultBecauseOpponentIdle = !hadOpponentBeatActions;
  const humanHadObservableBeatActions = enemyHadTacticalBeatResolutionActions(playback, tacticalBattle, seatId);
  const { shouldConsult, policyOnlyConsult } = computePostResolutionConsultTriggers({
    mandatoryCount: mandatoryFired.length,
    subscriptionCount: subscriptionFired.length,
    seatIdle: consultBecauseOpponentIdle,
    enemyObservable: humanHadObservableBeatActions,
  });
  if (!shouldConsult) {
    logDebug('afterTacticalBeatResolution: skip tactical LLM', {
      reason: 'skip_should_consult_false',
      turnNumber: state.turnNumber,
      battleId: tacticalBattle.battleId,
      mandatoryCount: mandatoryFired.length,
      subscriptionCount: subscriptionFired.length,
      hadOpponentBeatActions,
      humanHadObservableBeatActions,
      opponentIdle: consultBecauseOpponentIdle,
    });
    return { consulted: false, attachTacticalOpponentPlanToIpc: false };
  }
  if (policyOnlyConsult) {
    logDebug('afterTacticalBeatResolution: invoking LLM from post-beat policy', {
      turnNumber: state.turnNumber,
      opponentIdle: consultBecauseOpponentIdle,
      humanObservableResolution: humanHadObservableBeatActions,
    });
  }
  try {
    const result = await deps.requestOrders(state, deps.modelId, {
      seatId,
      enabledToolNames: deps.enabledToolNames,
      usePrecomputation: false,
      tacticalAiBattle: tacticalBattle,
      signal: deps.signal,
    });
    if (deps.signal?.aborted || ('error' in result && result.error === 'Cancelled')) {
      logDebug('afterTacticalBeatResolution: consultation cancelled', { turnNumber: state.turnNumber });
      return { consulted: false, attachTacticalOpponentPlanToIpc: false };
    }
    if (result.success === true) {
      const tacticalOpponentPlan =
        result.tacticalOpponentPlan ?? tacticalOpponentPlanFromRequestOrdersSuccess(result);
      setAiLastConsultationTurn(seatId, state.turnNumber);
      clearCombatSinceConsultation(seatId);
      logDebug('afterTacticalBeatResolution: tactical consultation completed', {
        movementCount: tacticalOpponentPlan.movementOrders.length,
        rangedCount: tacticalOpponentPlan.rangedAttacks.length,
        hasToolInvocationCounts: Boolean(result.toolInvocationCounts),
        hasMessage: Boolean(result.message?.trim()),
        cost: typeof result.cost === 'number' && Number.isFinite(result.cost) ? result.cost : undefined,
      });
      return {
        consulted: true,
        tacticalOpponentPlan,
        strategy: result.strategy,
        message: result.message,
        toolInvocationCounts: result.toolInvocationCounts,
        attachTacticalOpponentPlanToIpc: true,
        ...(typeof result.cost === 'number' && Number.isFinite(result.cost) ? { cost: result.cost } : {}),
      };
    }
    logDebug('afterTacticalBeatResolution: requestOrders failed', { success: result.success });
    return { consulted: false, attachTacticalOpponentPlanToIpc: true };
  } catch (err) {
    if (deps.signal?.aborted || isLikelyAbortError(err)) {
      logDebug('afterTacticalBeatResolution: consultation cancelled', { turnNumber: state.turnNumber });
      return { consulted: false, attachTacticalOpponentPlanToIpc: false };
    }
    logError('afterTacticalBeatResolution: requestOrders exception', err);
    return { consulted: false, attachTacticalOpponentPlanToIpc: true };
  }
}

export {
  seatHadStrategicResolutionUnitActions,
  enemyHadStrategicResolutionObservableActions,
  seatHadTacticalBeatResolutionActions,
  enemyHadTacticalBeatResolutionActions,
} from './consultationPolicy';
export type {
  ReadyResultWithParticipants,
  StrategicResolutionHumanActivitySlice,
  StrategicResolutionOpponentActivitySlice,
} from './consultationPolicy';
