/**
 * Shared mapping from successful strategic `ready` / `resolveMeleeIntercept` results into renderer IPC payloads.
 *
 * Purpose: Keeps combat-resolution field mirroring in one place so `handleGameReady` and `handleResolveMeleeIntercept`
 * cannot drift when `ReadyResult` evolves.
 * When to use: From strategic Ready and from melee-intercept resolve when building success responses after `deps.ready` or `resolveMeleeIntercept`.
 * Expected outcome: Identical field wiring as the previous inline spreads; no DB or game-rule side effects.
 * Exceptions: None; callers must only pass successful resolution objects.
 */

import { AI_SEAT_IDS, isAiSeatId, isNeutralOwnerId, type AiSeatId } from '../../shared/seatIds';
import { activeAiSeatIds } from '../../shared/seatRoster';
import { commanderModelId, getGameStateForPlayer, getSeatRoster, type GameStateSnapshot } from '../gameDb';
import { logDebug, logError, logTrace } from '../logger';
import { afterResolution, afterTacticalBeatResolution, type AfterResolutionResult, type AfterTacticalBeatResolutionResult } from '../openRouter/afterResolution';
import { launchCommanderConsult, waitForSeatsSettled, type CommanderConsultRunner } from '../openRouter/commanderPool';
import { emptyConsultOutcome } from '../openRouter/commanderPoolSupport';
import type {
  ReadyResult,
  RangedAttackOrder,
  RequestAiOrdersResult,
  TacticalCommitResolutionPlayback,
} from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { TacticalPostBeatConsultFields, TacticalPostBeatConsultMergeSource } from '../../shared/ipc/consultationPushTypes';

/**
 * Spreads optional `aiMessage` / `aiStrategy` IPC fields when the trimmed text is non-empty.
 *
 * Purpose: One omit-empty rule so Ready, melee-resolve, and tactical post-beat payloads cannot drift.
 * When to use: Mapping consultation `message`/`strategy` onto renderer-facing IPC.
 * Expected outcome: Empty or whitespace values are omitted entirely.
 * Exceptions: None.
 */
function optionalConsultToastFields(message?: string, strategy?: string): { aiMessage?: string; aiStrategy?: string } {
  const msg = message?.trim() ?? '';
  const strat = strategy?.trim() ?? '';
  return {
    ...(strat ? { aiStrategy: strat } : {}),
    ...(msg ? { aiMessage: msg } : {}),
  };
}

/**
 * Fields shared by a strategic Ready consult and a tactical beat consult.
 *
 * Purpose: The two runners wait, log, and call a model the same way. Each runner adds its own resolution payload.
 * When to use: The base of `StrategicConsultArgs` and `TacticalBeatConsultArgs`.
 * Expected outcome: Enough to decide whether to consult, which model to fall back to, and how long to wait.
 * Exceptions: None.
 */
export interface PostResolutionConsultArgs {
  /**
   * Whether this match consults after resolution.
   *
   * Contract: False skips the runner and returns an empty result.
   * When to use: The Events choice from the Ready or commit payload.
   * Expected outcome: The runner returns immediately when this is false.
   * Exceptions: None.
   */
  readonly useEventDrivenConsultation: boolean;
  /**
   * Whether Run is on for this consult.
   *
   * Contract: False skips the runner even when consultation is enabled.
   * When to use: The Run choice from the same payload.
   * Expected outcome: The runner returns immediately when this is false.
   * Exceptions: None.
   */
  readonly aiPlanningRunEnabled: boolean;
  /**
   * The model used when a seat has no commander row.
   *
   * Contract: A stored commander model always wins, including a stored empty string. This value is only the fallback `modelIdForSeat` uses when `commanderModelId` returns null.
   * When to use: Built by `fallbackConsultModelId`.
   * Expected outcome: A string. `''` means a seat with no model of its own is not called.
   * Exceptions: None.
   */
  readonly modelId: string;
  /**
   * Tool names the consult may call.
   *
   * Contract: The names enabled for this Ready or commit.
   * When to use: Passed through to `requestOrders`.
   * Expected outcome: The consult uses this list and no other tools.
   * Exceptions: None.
   */
  readonly enabledToolNames: string[];
  /**
   * Whether an API key is configured.
   *
   * Contract: A function, not a boolean captured earlier.
   * When to use: The consult reads it when it is about to call the model.
   * Expected outcome: True when a key is present at call time.
   * Exceptions: None.
   */
  readonly hasKey: () => boolean;
  /**
   * How long the pool waits for the seats it started.
   *
   * Contract: Milliseconds. Strategic Ready and melee use their own constants.
   * When to use: The pool runner's wait.
   * Expected outcome: A seat that is still planning when this elapses is settled as a timeout.
   * Exceptions: None.
   */
  readonly timeoutMs: number;
  /**
   * The message logged when a seat's consult throws.
   *
   * Contract: Names the handler that started the consult.
   * When to use: The `catch` in the runner.
   * Expected outcome: `logError` records this text with the thrown value. The runner does not rethrow.
   * Exceptions: None.
   */
  readonly errorLogMessage: string;
}

/**
 * Arguments for the strategic post-resolution consult.
 *
 * Purpose: Ready and melee resolve share one runner, and the deferred-playback mutex stores this same object until notify replays it.
 * When to use: `runEventDrivenAfterResolutionConsultation`, `setPendingStrategicReadyConsult`, and `setPendingMeleeResolveConsult`.
 * Expected outcome: The runner can finish the consult without reading the turn again.
 * Exceptions: None.
 */
export interface StrategicConsultArgs extends PostResolutionConsultArgs {
  /**
   * Whether the turn resolution succeeded.
   *
   * Contract: False skips the consult.
   * When to use: `readyResult.success` or `resolveResult.success`.
   * Expected outcome: A failed resolution does not call the model.
   * Exceptions: None.
   */
  readonly resolutionSuccess: boolean;
  /**
   * The finished strategic resolution.
   *
   * Contract: The object `afterResolution` reads. Callers pass it only after success.
   * When to use: The runner and the deferred replay.
   * Expected outcome: Loss and order fields match the turn that just resolved.
   * Exceptions: None.
   */
  readonly resolution: ReadyResult;
  /**
   * Starts one strategic order request for a seat.
   *
   * Contract: No tactical battle argument. The seat and the tool list travel in `options`.
   * When to use: The runner, after it has built that seat's state.
   * Expected outcome: The order result for that seat, or a rejection the runner logs.
   * Exceptions: May reject. The runner catches that rejection.
   */
  readonly requestOrders: (
    state: GameStateSnapshot,
    modelId: string,
    options: { seatId: AiSeatId; enabledToolNames: string[]; usePrecomputation?: boolean; signal?: AbortSignal }
  ) => Promise<RequestAiOrdersResult>;
}

/**
 * Arguments for the consult after one tactical beat.
 *
 * Purpose: The tactical commit handler stores this object while playback runs, and notify passes it to the tactical runner.
 * When to use: `runEventDrivenAfterTacticalBeatConsultation` and `setPendingTacticalBeatConsult`.
 * Expected outcome: The runner can re-plan the opposing seat without rebuilding the battle snapshot.
 * Exceptions: None.
 */
export interface TacticalBeatConsultArgs extends PostResolutionConsultArgs {
  /**
   * The battle the beat just resolved.
   *
   * Contract: Includes the opposing party and the battle id the runner logs.
   * When to use: Choosing the seat and passing the battle into the pool.
   * Expected outcome: A neutral opposing party skips the consult.
   * Exceptions: None.
   */
  readonly tacticalBattle: TacticalBattleSnapshot;
  /**
   * The playback the renderer is showing for this beat.
   *
   * Contract: The commit result's playback payload, stored unchanged until notify.
   * When to use: The tactical runner's call to `afterTacticalBeatResolution`.
   * Expected outcome: The consult sees the same playback the player is watching.
   * Exceptions: None.
   */
  readonly tacticalResolutionPlayback: TacticalCommitResolutionPlayback;
  /**
   * Starts one order request that may include the tactical battle.
   *
   * Contract: `tacticalAiBattle` is optional. Strategic Ready's order function does not have this field, so the two request types stay separate.
   * When to use: The tactical runner, after it has built that seat's state.
   * Expected outcome: The order result for that seat, or a rejection the runner logs.
   * Exceptions: May reject. The runner catches that rejection.
   */
  readonly requestOrders: (
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
}

/**
 * Maps runner merge source plus `battleId` into the renderer-facing tactical post-beat consultation IPC fields.
 *
 * Purpose: Single attach/`tacticalOpponentPlan`/`aiStrategy`/`aiMessage`/`toolInvocationCounts` wiring for `commitHumanTacticalDraftOrders` so `main.ts` and `runEventDrivenAfterTacticalBeatConsultation` cannot drift.
 * When to use: After `runEventDrivenAfterTacticalBeatConsultation` resolves, or whenever converting an `afterTacticalBeatResolution`-shaped merge source into `TacticalPostBeatConsultFields`.
 * Expected outcome: `kind` and `battleId` always set; strategy/message from the merge source are exposed as `aiStrategy`/`aiMessage` when present.
 * Exceptions: None; pure data transform.
 */
export function toTacticalPostBeatConsultFields(
  battleId: string,
  post: TacticalPostBeatConsultMergeSource
): TacticalPostBeatConsultFields {
  const attach = post.attachTacticalOpponentPlanToIpc === true;
  const strategyText = post.aiStrategy ?? post.strategy;
  const messageText = post.message ?? post.aiMessage;
  logDebug('ipc toTacticalPostBeatConsultFields', {
    battleId,
    attachTacticalOpponentPlanToIpc: attach,
    hasStrategy: Boolean(strategyText?.trim()),
    hasMessage: Boolean(messageText?.trim()),
    hasToolInvocationCounts: Boolean(post.toolInvocationCounts),
    cost: typeof post.cost === 'number' && Number.isFinite(post.cost) ? post.cost : undefined,
  });
  return {
    kind: 'tactical',
    battleId,
    attachTacticalOpponentPlanToIpc: attach,
    ...(attach ? { tacticalOpponentPlan: post.tacticalOpponentPlan ?? null } : {}),
    ...optionalConsultToastFields(messageText, strategyText),
    ...(post.toolInvocationCounts ? { toolInvocationCounts: post.toolInvocationCounts } : {}),
    ...(typeof post.cost === 'number' && Number.isFinite(post.cost) ? { cost: post.cost } : {}),
  };
}

/**
 * Subset of `ReadyResult` fields copied verbatim into completed-turn IPC payloads.
 *
 * Purpose: Documents the exact mirror surface shared by Ready and melee-resolve handlers.
 * When to use: As the argument type for `pickReadyResolutionIpcMirrorFields`.
 * Expected outcome: Structural typing against `ReadyResult` without optional success/meta fields.
 * Exceptions: None.
 */
export type ReadyResolutionIpcMirrorSource = Pick<
  ReadyResult,
  | 'combatHexes'
  | 'removedUnitIds'
  | 'casualtyHexes'
  | 'removedUnits'
  | 'rangedCombatHexes'
  | 'rangedCasualtyHexes'
  | 'rangedRemovedUnits'
  | 'rangedResolutionShotLines'
  | 'airStrikeHexes'
  | 'airStrikeCasualtyHexes'
  | 'airStrikeRemovedUnits'
  | 'missileLaunches'
  | 'missileStrikeRemovedUnits'
  | 'airStrikeMoves'
  | 'airStrikeAttemptCount'
  | 'airStrikeSuccessfulCount'
  | 'airStrikeFailedCount'
  | 'airStrikeAttackerLossCount'
  | 'baseInvalidAirLossCount'
  | 'infrastructureDestroyedEvents'
  | 'resolvedFerryMoves'
  | 'meleeCombatHexes'
  | 'meleeCasualtyHexes'
  | 'meleeRemovedUnits'
  | 'kills'
  | 'killsByDirectFire'
  | 'killsByReturnFire'
  | 'deployedUnitsByType'
  | 'humanDeploymentCapReachedUnitTypes'
  | 'humanFortificationsBuilt'
  | 'humanCreditsAdded'
  | 'humanBuildPausedHexes'
  | 'humanMercenariesHired'
  | 'humanUnitsDeserted'
  | 'humanHireOrdersUnfilled'
  | 'humanFortificationQueuePausedHexes'
  | 'fortificationReports'
  | 'deploymentCapReachedUnitTypesBySeat'
  | 'humanHexesLostCount'
  | 'controlTransitions'
  | 'controlLossLightningHexes'
  | 'killLabelUnits'
  | 'airStrikeDiceRolls'
  | 'rangedDiceRolls'
  | 'meleeDiceRolls'
  | 'knockouts'
>;

/**
 * Copies combat and resolution outcome fields from a game-action result into the IPC-ready object shape.
 *
 * Purpose: Single implementation of the large repeated spread in Ready IPC handlers.
 * When to use: After a successful `ready()` or `resolveMeleeIntercept()` when emitting the standard completion payload.
 * Expected outcome: Plain object suitable for spreading into `ReadyResultMinimal`.
 * Exceptions: None.
 */
export function pickReadyResolutionIpcMirrorFields(source: ReadyResolutionIpcMirrorSource): ReadyResolutionIpcMirrorSource {
  logTrace('pickReadyResolutionIpcMirrorFields', {
    airStrikeDiceRollCount: source.airStrikeDiceRolls?.length ?? 0,
    rangedDiceRollCount: source.rangedDiceRolls?.length ?? 0,
    meleeDiceRollCount: source.meleeDiceRolls?.length ?? 0,
  });
  return {
    combatHexes: source.combatHexes,
    removedUnitIds: source.removedUnitIds,
    casualtyHexes: source.casualtyHexes,
    removedUnits: source.removedUnits,
    rangedCombatHexes: source.rangedCombatHexes,
    rangedCasualtyHexes: source.rangedCasualtyHexes,
    rangedRemovedUnits: source.rangedRemovedUnits,
    rangedResolutionShotLines: source.rangedResolutionShotLines,
    airStrikeHexes: source.airStrikeHexes,
    airStrikeCasualtyHexes: source.airStrikeCasualtyHexes,
    airStrikeRemovedUnits: source.airStrikeRemovedUnits,
    missileLaunches: source.missileLaunches,
    missileStrikeRemovedUnits: source.missileStrikeRemovedUnits,
    airStrikeMoves: source.airStrikeMoves,
    airStrikeAttemptCount: source.airStrikeAttemptCount,
    airStrikeSuccessfulCount: source.airStrikeSuccessfulCount,
    airStrikeFailedCount: source.airStrikeFailedCount,
    airStrikeAttackerLossCount: source.airStrikeAttackerLossCount,
    baseInvalidAirLossCount: source.baseInvalidAirLossCount,
    infrastructureDestroyedEvents: source.infrastructureDestroyedEvents,
    resolvedFerryMoves: source.resolvedFerryMoves,
    meleeCombatHexes: source.meleeCombatHexes,
    meleeCasualtyHexes: source.meleeCasualtyHexes,
    meleeRemovedUnits: source.meleeRemovedUnits,
    kills: source.kills,
    killsByDirectFire: source.killsByDirectFire,
    killsByReturnFire: source.killsByReturnFire,
    deployedUnitsByType: source.deployedUnitsByType,
    humanDeploymentCapReachedUnitTypes: source.humanDeploymentCapReachedUnitTypes,
    humanFortificationsBuilt: source.humanFortificationsBuilt,
    humanCreditsAdded: source.humanCreditsAdded,
    humanBuildPausedHexes: source.humanBuildPausedHexes,
    humanMercenariesHired: source.humanMercenariesHired,
    humanUnitsDeserted: source.humanUnitsDeserted,
    humanHireOrdersUnfilled: source.humanHireOrdersUnfilled,
    humanFortificationQueuePausedHexes: source.humanFortificationQueuePausedHexes,
    fortificationReports: source.fortificationReports,
    deploymentCapReachedUnitTypesBySeat: source.deploymentCapReachedUnitTypesBySeat,
    humanHexesLostCount: source.humanHexesLostCount,
    controlTransitions: source.controlTransitions,
    controlLossLightningHexes: source.controlLossLightningHexes,
    killLabelUnits: source.killLabelUnits,
    airStrikeDiceRolls: source.airStrikeDiceRolls,
    rangedDiceRolls: source.rangedDiceRolls,
    meleeDiceRolls: source.meleeDiceRolls,
    knockouts: source.knockouts,
  };
}

/**
 * Counts AI ranged orders by unit type (armor / naval / air) for IPC telemetry.
 *
 * Purpose: Deduplicates the loop used for both awaiting-melee and completed Ready responses.
 * When to use: From `handleGameReady` whenever `aiRangedOrders` should be summarized for the renderer.
 * Expected outcome: Undefined when no ranged orders map to those types; otherwise a small count record.
 * Exceptions: None.
 */
export function computeAiRangedByTypeCounts(
  state: GameStateSnapshot,
  aiRangedOrders: RangedAttackOrder[]
): { armor?: number; naval?: number; air?: number } | undefined {
  logTrace('computeAiRangedByTypeCounts', { rangedOrderCount: aiRangedOrders.length });
  const aiRangedByType: { armor?: number; naval?: number; air?: number } = {};
  for (const r of aiRangedOrders) {
    const u = state.units.find((unit) => unit.id === r.unitId);
    if (u && (u.unitType === 'armor' || u.unitType === 'naval' || u.unitType === 'air')) {
      aiRangedByType[u.unitType] = (aiRangedByType[u.unitType] ?? 0) + 1;
    }
  }
  return Object.keys(aiRangedByType).length > 0 ? aiRangedByType : undefined;
}

/**
 * Builds non-idle AI move segments (excluding no-op or same-hex orders) for IPC move previews.
 *
 * Purpose: Shared helper for the duplicated move list construction in `handleGameReady`.
 * When to use: When mapping planning `aiOrders` to `aiMoves` / `aiMoves` awaiting-melee payloads.
 * Expected outcome: Array of `{ unitId, fromH3Index, toH3Index }` for units that actually change hex.
 * Exceptions: None.
 */
export function buildDistinctAiMovesFromPlanningOrders(
  state: GameStateSnapshot,
  aiOrders: { unitId: string; toH3Index: string }[]
): { unitId: string; fromH3Index: string; toH3Index: string }[] {
  logTrace('buildDistinctAiMovesFromPlanningOrders', { orderCount: aiOrders.length });
  if (aiOrders.length === 0) return [];
  return aiOrders
    .map((o) => {
      const from = state.units.find((u) => u.id === o.unitId)?.h3Index;
      if (!from || from === o.toH3Index) return null;
      return { unitId: o.unitId, fromH3Index: from, toH3Index: o.toH3Index };
    })
    .filter((m): m is { unitId: string; fromH3Index: string; toH3Index: string } => m !== null);
}

/**
 * Optional post-turn AI consultation (event-driven mode), with the same timeout and logging policy as Ready IPC.
 *
 * Purpose: Consolidates the duplicated `Promise.race` + `afterResolution` try/catch in Ready vs melee-resolve handlers.
 * When to use: When `useEventDrivenConsultation && resolution.success && aiPlanningRunEnabled` after a finished turn.
 * Expected outcome: Partial strategy/tool-count updates, or empty object on skip/timeout/failure (errors logged).
 * Contract: Callers **must** either await this inline before resolving IPC when deferral does not apply **or** arm
 * `setPendingStrategicReadyConsult` / `setPendingMeleeResolveConsult` when playback deferral is active; notify completes
 * the mutex (`game:notifyResolutionPlaybackComplete`). Tactical beat consult uses `setPendingTacticalBeatConsult` likewise.
 * Exceptions: Does not throw; failures are logged at error and swallowed.
 */
export async function runEventDrivenAfterResolutionConsultation(
  args: StrategicConsultArgs
): Promise<{ aiStrategy?: string; aiMessage?: string; toolInvocationCounts?: Record<string, number>; cost?: number }> {
  if (!args.useEventDrivenConsultation || !args.resolutionSuccess || !args.aiPlanningRunEnabled) {
    return {};
  }
  const seatIds = activeAiSeatIds(getSeatRoster());
  logDebug('runEventDrivenAfterResolutionConsultation', { timeoutMs: args.timeoutMs, seatCount: seatIds.length });
  const results = new Map<AiSeatId, AfterResolutionResult>();
  await consultSeatsThroughPool(seatIds, 'strategic', null, args.timeoutMs, async (request) => {
    const modelId = modelIdForSeat(request.seatId, args.modelId);
    if (!modelId) return emptyConsultOutcome({ absenceReason: 'consult_failed' });
    try {
      const state = getGameStateForPlayer(request.seatId, { maskUnexploredTerrain: false });
      const result = await afterResolution(
        state,
        args.resolution,
        {
          modelId,
          enabledToolNames: args.enabledToolNames,
          hasKey: args.hasKey,
          signal: request.signal,
          requestOrders: (orderState, orderModelId, options) =>
            args.requestOrders(orderState, orderModelId, { ...options, signal: request.signal }),
        },
        request.seatId
      );
      results.set(request.seatId, result);
      return emptyConsultOutcome({
        costUsd: finiteCost(result.cost),
        message: result.message ?? null,
        strategy: result.strategy ?? null,
        modelId,
        absenceReason: result.consulted ? null : (result.absenceReason ?? null),
      });
    } catch (err) {
      logError(args.errorLogMessage, err);
      return emptyConsultOutcome({ errorMessage: err instanceof Error ? err.message : String(err) });
    }
  });
  return strategicConsultFields(results);
}

/**
 * Post–tactical-beat event-driven consultation with the same timeout envelope as strategic Ready follow-up.
 *
 * Purpose: Lets the opponent LLM re-plan inside an active tactical session when callbacks or tactical mandatory rules fire.
 * When to use: After tactical beat resolution succeeds: from Electron `game:commitHumanTacticalDraftOrders` (handler awaits this helper before resolving the invoke, mirroring strategic “resolution then consult” ordering) or from tests that call this helper directly.
 * Expected outcome: Optional `tacticalOpponentPlan` (and `attachTacticalOpponentPlanToIpc`) when evaluation invoked the LLM; otherwise an empty merge and the pool keeps the plan it already stored.
 * Exceptions: Does not throw; failures are logged at error and swallowed.
 */
export async function runEventDrivenAfterTacticalBeatConsultation(
  args: TacticalBeatConsultArgs
): Promise<TacticalPostBeatConsultMergeSource> {
  if (!args.useEventDrivenConsultation || !args.aiPlanningRunEnabled) {
    return {};
  }
  const opposingParty = args.tacticalBattle.opposingPartyId;
  if (opposingParty !== undefined && isNeutralOwnerId(opposingParty)) {
    logDebug('runEventDrivenAfterTacticalBeatConsultation: skip neutral party', {
      battleId: args.tacticalBattle.battleId,
    });
    return {};
  }
  const seatId = opposingParty !== undefined && isAiSeatId(opposingParty) ? opposingParty : activeAiSeatIds(getSeatRoster())[0];
  if (seatId === undefined) return {};
  logDebug('runEventDrivenAfterTacticalBeatConsultation', { timeoutMs: args.timeoutMs, seatId });
  let post: AfterTacticalBeatResolutionResult | undefined;
  await consultSeatsThroughPool([seatId], 'tactical', args.tacticalBattle, args.timeoutMs, async (request) => {
    const modelId = modelIdForSeat(request.seatId, args.modelId);
    if (!modelId) return emptyConsultOutcome({ absenceReason: 'consult_failed' });
    try {
      const state = getGameStateForPlayer(request.seatId, { maskUnexploredTerrain: false });
      post = await afterTacticalBeatResolution(
        state,
        args.tacticalBattle,
        args.tacticalResolutionPlayback,
        {
          modelId,
          enabledToolNames: args.enabledToolNames,
          hasKey: args.hasKey,
          signal: request.signal,
          requestOrders: (orderState, orderModelId, options) =>
            args.requestOrders(orderState, orderModelId, { ...options, signal: request.signal }),
        },
        request.seatId
      );
      if (!post.tacticalOpponentPlan) {
        return emptyConsultOutcome({
          costUsd: finiteCost(post.cost),
          modelId,
          message: post.message ?? null,
          strategy: post.strategy ?? null,
          absenceReason: post.consulted ? null : (post.absenceReason ?? null),
        });
      }
      return emptyConsultOutcome({
        finished: true,
        tacticalPlan: post.tacticalOpponentPlan,
        costUsd: finiteCost(post.cost),
        modelId,
        message: post.message ?? null,
        strategy: post.strategy ?? null,
        absenceReason: null,
      });
    } catch (err) {
      logError(args.errorLogMessage, err);
      return emptyConsultOutcome({ errorMessage: err instanceof Error ? err.message : String(err) });
    }
  });
  if (!post) return {};
  return {
    attachTacticalOpponentPlanToIpc: post.attachTacticalOpponentPlanToIpc,
    tacticalOpponentPlan: post.tacticalOpponentPlan,
    strategy: post.strategy,
    message: post.message,
    toolInvocationCounts: post.toolInvocationCounts,
    ...(typeof post.cost === 'number' && Number.isFinite(post.cost) ? { cost: post.cost } : {}),
  };
}

/**
 * The model a consult uses when a seat has no commander row.
 *
 * Purpose: Ready, melee resolve, and tactical commit were each reading the first AI seat's stored model the same way.
 * When to use: Before building `StrategicConsultArgs` or `TacticalBeatConsultArgs`. Pass `getSelectedModel` itself, not its result.
 * Expected outcome: The first AI seat's stored model when `commanderModelId` returns a string, including `''`. The app-wide selection only when it returns null. `modelIdForSeat` still prefers each seat's own model.
 * Exceptions: None.
 */
export function fallbackConsultModelId(getSelectedModel: () => string): string {
  const stored = commanderModelId(AI_SEAT_IDS[0]);
  const modelId = stored === null ? getSelectedModel() : stored;
  logTrace('readyIpcResolutionMapping fallbackConsultModelId', { hasStoredModel: stored !== null });
  return modelId;
}

/**
 * The model a seat consult should call.
 *
 * Purpose: A stored model wins. A missing roster row keeps the caller's fallback.
 * When to use: Inside a pool runner.
 * Expected outcome: A non-blank model id, or `''` when this seat must not be called.
 * Exceptions: None.
 */
function modelIdForSeat(seatId: AiSeatId, fallback: string): string {
  const stored = commanderModelId(seatId);
  const modelId = stored && stored.trim() ? stored : stored === null ? fallback.trim() : '';
  logTrace('readyIpcResolutionMapping modelIdForSeat', { seatId, hasModel: modelId.length > 0 });
  return modelId;
}

/**
 * A finite dollar amount, or zero.
 *
 * Purpose: The pool records only a real cost.
 * When to use: Copying a consult result onto the outcome.
 * Expected outcome: The number when it is finite. Otherwise zero.
 * Exceptions: None.
 */
function finiteCost(cost: number | undefined): number {
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : 0;
}

/**
 * Starts every listed seat before waiting for any of them.
 *
 * Purpose: The pool's own timers are the deadline. This wait does not start a second, shorter race.
 * When to use: Post-resolution and post-beat consults.
 * Expected outcome: Resolves when each launched seat has left `planning`, or when `timeoutMs` elapses.
 * Exceptions: Does not throw. A seat that cannot launch is omitted from the wait.
 */
async function consultSeatsThroughPool(
  seatIds: readonly AiSeatId[],
  theater: 'strategic' | 'tactical',
  battle: TacticalBattleSnapshot | null,
  timeoutMs: number,
  runner: CommanderConsultRunner
): Promise<void> {
  const launched: AiSeatId[] = [];
  for (const seatId of seatIds) {
    if (launchCommanderConsult(seatId, theater, battle, runner)) launched.push(seatId);
  }
  logDebug('readyIpcResolutionMapping consultSeatsThroughPool', { theater, launchedCount: launched.length, timeoutMs });
  if (launched.length === 0) return;
  await waitForSeatsSettled(launched, timeoutMs);
}

/**
 * Toast fields from the first seat that consulted, plus the sum of reported costs.
 *
 * Purpose: The Ready result still carries the first seat's message for callers that read the IPC payload. The message dialog reads the pool, not this field.
 * When to use: After every post-resolution runner has stored its result.
 * Expected outcome: Omitted prose stays omitted. Cost is present only when at least one consult reported a finite cost.
 * Exceptions: None.
 */
function strategicConsultFields(
  results: ReadonlyMap<AiSeatId, AfterResolutionResult>
): { aiStrategy?: string; aiMessage?: string; toolInvocationCounts?: Record<string, number>; cost?: number } {
  let first: AfterResolutionResult | undefined;
  let cost = 0;
  let sawCost = false;
  for (const seatId of AI_SEAT_IDS) {
    const result = results.get(seatId);
    if (!result) continue;
    if (!first && result.consulted) first = result;
    if (typeof result.cost === 'number' && Number.isFinite(result.cost)) {
      cost += result.cost;
      sawCost = true;
    }
  }
  logTrace('readyIpcResolutionMapping strategicConsultFields', { consulted: Boolean(first), sawCost });
  if (!first) return sawCost ? { cost } : {};
  return {
    ...optionalConsultToastFields(first.message, first.strategy),
    ...(first.toolInvocationCounts ? { toolInvocationCounts: first.toolInvocationCounts } : {}),
    ...(sawCost ? { cost } : {}),
  };
}
