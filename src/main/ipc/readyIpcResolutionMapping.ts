/**
 * Shared mapping from successful strategic `ready` / `resolveMeleeIntercept` results into renderer IPC payloads.
 *
 * Purpose: Keeps combat-resolution field mirroring in one place so `handleGameReady` and `handleResolveMeleeIntercept`
 * cannot drift when `ReadyResult` evolves.
 * When to use: Only from `gameIpcHandlers` when building success responses after `deps.ready` or `resolveMeleeIntercept`.
 * Expected outcome: Identical field wiring as the previous inline spreads; no DB or game-rule side effects.
 * Exceptions: None; callers must only pass successful resolution objects.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logError, logTrace } from '../logger';
import { afterResolution, afterTacticalBeatResolution } from '../openrouter/afterResolution';
import type {
  ReadyResult,
  RangedAttackOrder,
  RequestAiOrdersResult,
  TacticalCommitResolutionPlayback,
} from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { TacticalPostBeatConsultFields, TacticalPostBeatConsultMergeSource } from '../../shared/ipc/readyTypes';

/**
 * Maps runner merge source plus `battleId` into the renderer-facing tactical post-beat consultation IPC fields.
 *
 * Purpose: Single attach/`tacticalOpponentPlan`/`aiStrategy`/`toolInvocationCounts` wiring for `commitHumanTacticalDraftOrders` so `main.ts` and `runEventDrivenAfterTacticalBeatConsultation` cannot drift.
 * When to use: After `runEventDrivenAfterTacticalBeatConsultation` resolves, or whenever converting an `afterTacticalBeatResolution`-shaped merge source into `TacticalPostBeatConsultFields`.
 * Expected outcome: `kind` and `battleId` always set; `strategy` from the merge source is exposed as `aiStrategy` when present.
 * Exceptions: None; pure data transform.
 */
export function toTacticalPostBeatConsultFields(
  battleId: string,
  post: TacticalPostBeatConsultMergeSource
): TacticalPostBeatConsultFields {
  const attach = post.attachTacticalOpponentPlanToIpc === true;
  logDebug('ipc toTacticalPostBeatConsultFields', {
    battleId,
    attachTacticalOpponentPlanToIpc: attach,
    hasStrategy: Boolean(post.aiStrategy ?? post.strategy),
    hasToolInvocationCounts: Boolean(post.toolInvocationCounts),
  });
  const strategyText = post.aiStrategy ?? post.strategy;
  return {
    kind: 'tactical',
    battleId,
    attachTacticalOpponentPlanToIpc: attach,
    ...(attach ? { tacticalOpponentPlan: post.tacticalOpponentPlan ?? null } : {}),
    ...(strategyText ? { aiStrategy: strategyText } : {}),
    ...(post.toolInvocationCounts ? { toolInvocationCounts: post.toolInvocationCounts } : {}),
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
  | 'opponentDeploymentCapReachedUnitTypes'
  | 'humanHexesLostCount'
  | 'controlLossLightningHexes'
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
  logTrace('pickReadyResolutionIpcMirrorFields', {});
  return {
    combatHexes: source.combatHexes,
    removedUnitIds: source.removedUnitIds,
    casualtyHexes: source.casualtyHexes,
    removedUnits: source.removedUnits,
    rangedCombatHexes: source.rangedCombatHexes,
    rangedCasualtyHexes: source.rangedCasualtyHexes,
    rangedRemovedUnits: source.rangedRemovedUnits,
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
    opponentDeploymentCapReachedUnitTypes: source.opponentDeploymentCapReachedUnitTypes,
    humanHexesLostCount: source.humanHexesLostCount,
    controlLossLightningHexes: source.controlLossLightningHexes,
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
    options: { enabledToolNames: string[]; usePrecomputation?: boolean }
  ) => Promise<RequestAiOrdersResult>;
  timeoutMs: number;
  errorLogMessage: string;
}): Promise<{ aiStrategy?: string; toolInvocationCounts?: Record<string, number> }> {
  if (!args.useEventDrivenConsultation || !args.resolutionSuccess || !args.aiPlanningRunEnabled) {
    return {};
  }
  logDebug('runEventDrivenAfterResolutionConsultation', { timeoutMs: args.timeoutMs });
  try {
    const postResolution = await Promise.race([
      afterResolution(args.opponentState, args.resolution, {
        modelId: args.modelId ?? '',
        enabledToolNames: args.enabledToolNames,
        hasKey: args.hasKey,
        requestOrders: args.requestOrders,
      }),
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error(`afterResolution consultation timed out after ${args.timeoutMs}ms`)),
          args.timeoutMs
        );
      }),
    ]);
    return {
      ...(postResolution.strategy ? { aiStrategy: postResolution.strategy } : {}),
      ...(postResolution.toolInvocationCounts ? { toolInvocationCounts: postResolution.toolInvocationCounts } : {}),
    };
  } catch (err) {
    logError(args.errorLogMessage, err);
    return {};
  }
}

/**
 * Post–tactical-beat event-driven consultation with the same timeout envelope as strategic Ready follow-up.
 *
 * Purpose: Lets the opponent LLM re-plan inside an active tactical session when callbacks or tactical mandatory rules fire.
 * When to use: After tactical beat resolution succeeds: from Electron `game:commitHumanTacticalDraftOrders` (handler awaits this helper before resolving the invoke, mirroring strategic “resolution then consult” ordering) or from tests that call this helper directly.
 * Expected outcome: Optional `tacticalOpponentPlan` (and `attachTacticalOpponentPlanToIpc`) when evaluation invoked the LLM; otherwise empty merge so IPC can preserve the renderer draft.
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
      enabledToolNames: string[];
      usePrecomputation?: boolean;
      tacticalAiBattle?: TacticalBattleSnapshot;
    }
  ) => Promise<RequestAiOrdersResult>;
  timeoutMs: number;
  errorLogMessage: string;
}): Promise<TacticalPostBeatConsultMergeSource> {
  if (!args.useEventDrivenConsultation || !args.aiPlanningRunEnabled) {
    return {};
  }
  logDebug('runEventDrivenAfterTacticalBeatConsultation', { timeoutMs: args.timeoutMs });
  try {
    const post = await Promise.race([
      afterTacticalBeatResolution(args.opponentState, args.tacticalBattle, args.tacticalResolutionPlayback, {
        modelId: args.modelId ?? '',
        enabledToolNames: args.enabledToolNames,
        hasKey: args.hasKey,
        requestOrders: args.requestOrders,
      }),
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error(`afterTacticalBeatResolution timed out after ${args.timeoutMs}ms`)),
          args.timeoutMs
        );
      }),
    ]);
    return {
      attachTacticalOpponentPlanToIpc: post.attachTacticalOpponentPlanToIpc,
      tacticalOpponentPlan: post.tacticalOpponentPlan,
      strategy: post.strategy,
      toolInvocationCounts: post.toolInvocationCounts,
    };
  } catch (err) {
    logError(args.errorLogMessage, err);
    return {};
  }
}
