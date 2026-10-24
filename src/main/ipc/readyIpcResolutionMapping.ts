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
export async function runEventDrivenAfterResolutionConsultation(args: {
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
    options: { seatId: AiSeatId; enabledToolNames: string[]; usePrecomputation?: boolean; signal?: AbortSignal }
  ) => Promise<RequestAiOrdersResult>;
  timeoutMs: number;
  errorLogMessage: string;
}): Promise<{ aiStrategy?: string; aiMessage?: string; toolInvocationCounts?: Record<string, number>; cost?: number }> {
  if (!args.useEventDrivenConsultation || !args.resolutionSuccess || !args.aiPlanningRunEnabled) {
    return {};
  }
  const seatIds = activeAiSeatIds();
  logDebug('runEventDrivenAfterResolutionConsultation', { timeoutMs: args.timeoutMs, seatCount: seatIds.length });
  const results = new Map<AiSeatId, AfterResolutionResult>();
  await consultSeatsThroughPool(seatIds, 'strategic', null, args.timeoutMs, async (request) => {
    const modelId = modelIdForSeat(request.seatId, args.modelId);
    if (!modelId) return emptyConsultOutcome();
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
export async function runEventDrivenAfterTacticalBeatConsultation(args: {
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
      seatId: AiSeatId;
      enabledToolNames: string[];
      usePrecomputation?: boolean;
      tacticalAiBattle?: TacticalBattleSnapshot;
      signal?: AbortSignal;
    }
  ) => Promise<RequestAiOrdersResult>;
  timeoutMs: number;
  errorLogMessage: string;
}): Promise<TacticalPostBeatConsultMergeSource> {
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
  const seatId = opposingParty !== undefined && isAiSeatId(opposingParty) ? opposingParty : activeAiSeatIds()[0];
  if (seatId === undefined) return {};
  logDebug('runEventDrivenAfterTacticalBeatConsultation', { timeoutMs: args.timeoutMs, seatId });
  let post: AfterTacticalBeatResolutionResult | undefined;
  await consultSeatsThroughPool([seatId], 'tactical', args.tacticalBattle, args.timeoutMs, async (request) => {
    const modelId = modelIdForSeat(request.seatId, args.modelId);
    if (!modelId) return emptyConsultOutcome();
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
        return emptyConsultOutcome({ costUsd: finiteCost(post.cost), modelId });
      }
      return emptyConsultOutcome({
        finished: true,
        tacticalPlan: post.tacticalOpponentPlan,
        costUsd: finiteCost(post.cost),
        modelId,
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
 * Active AI seats, in seat order.
 *
 * Purpose: Post-resolution consults every commander that is still in the match.
 * When to use: Before launching those consults.
 * Expected outcome: Seat ids whose kind is AI and whose knockout turn is null.
 * Exceptions: None.
 */
function activeAiSeatIds(): AiSeatId[] {
  const seatIds = getSeatRoster()
    .filter((seat) => seat.kind === 'ai' && seat.outTurn === null && isAiSeatId(seat.seatId))
    .map((seat) => seat.seatId);
  logTrace('readyIpcResolutionMapping activeAiSeatIds', { seatCount: seatIds.length });
  return seatIds.filter((seatId): seatId is AiSeatId => isAiSeatId(seatId));
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
 * Purpose: A two-sided match still returns one strategy and one message. Extra seats add their cost.
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
