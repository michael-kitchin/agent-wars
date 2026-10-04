/**
 * Pure policy for when event-driven post-resolution consultation should call the LLM (strategic Ready and tactical beat).
 *
 * Purpose: Centralizes opponent/human activity predicates and `shouldConsult` composition so `afterResolution.ts` stays orchestration-only.
 * When to use: Imported only from `afterResolution.ts` and unit tests; no DB or IPC side effects.
 * Expected outcome: Same boolean decisions as the inlined pre-refactor logic; no `logDebug` here (callers log).
 * Exceptions: None; predicates are total on their inputs.
 */

import { logTrace } from '../logger';
import { unitIdOwnerFromId } from '../../shared/unitIds';
import type { GameStateSnapshot } from '../gameDb';
import type { KillEdge } from '../../shared/ipc/combatResultTypes';
import type { ReadyResult, TacticalCommitResolutionPlayback } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';

/**
 * Strategic `ReadyResult` slice for opponent resolution-time activity (march, ferry, strikes, combat ids).
 *
 * Purpose: Typed input for `opponentHadStrategicResolutionUnitActions`.
 * When to use: `afterResolution` and any test constructing a minimal `ReadyResult` subset.
 * Expected outcome: Aligns with fields written by `finalizeReadyTurnAfterMelee`.
 * Exceptions: None.
 */
export type StrategicResolutionOpponentActivitySlice = Pick<
  ReadyResult,
  | 'opponentCombatParticipantUnitIds'
  | 'resolvedFerryMoves'
  | 'airStrikeMoves'
  | 'opponentHadStrategicMarchResolution'
>;

/**
 * Strategic `ReadyResult` slice for human observable resolution outcomes.
 *
 * Purpose: Typed input for `humanHadStrategicResolutionObservableActions`.
 * When to use: Same as opponent slice for the human policy branch.
 * Expected outcome: Covers march list, ferry/air animations, and kill attribution arrays.
 * Exceptions: None.
 */
export type StrategicResolutionHumanActivitySlice = Pick<
  ReadyResult,
  'humanMoves' | 'resolvedFerryMoves' | 'airStrikeMoves' | 'kills' | 'killsByDirectFire' | 'killsByReturnFire'
>;

/**
 * Minimal `ReadyResult` subset passed into `afterResolution` after strategic Ready or melee intercept.
 *
 * Purpose: Single contract for resolution playback + policy fields used by consultation gating.
 * When to use: `afterResolution` parameter type and `buildTacticalBeatResolutionReadyParticipants` return (tactical slice may omit many keys).
 * Expected outcome: Structural superset of what `evaluateSubscriptionEvents` needs plus policy fields.
 * Exceptions: None.
 */
export type ReadyResultWithParticipants = Pick<
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
  | 'humanMoves'
  | 'kills'
  | 'killsByDirectFire'
  | 'killsByReturnFire'
>;

/**
 * Returns true when any march row changes res cell (excludes no-op `from === to` legs).
 *
 * Purpose: Shared human/opponent tactical march check and strategic human `humanMoves` check.
 * When to use: Policy predicates before scanning kill metadata.
 * Expected outcome: False for undefined or empty arrays, or when every leg is a no-op.
 * Exceptions: None.
 */
export function hasNonNoopMarchMoves(
  moves?: ReadonlyArray<{ fromH3Index: string; toH3Index: string }>
): boolean {
  logTrace('hasNonNoopMarchMoves', {});
  return (moves ?? []).some((m) => m.fromH3Index !== m.toH3Index);
}

/**
 * Returns true when any animation row lists `player` as the acting side (ferry or air strike playback).
 *
 * Purpose: DRY for strategic opponent vs human ferry/strike detection.
 * When to use: `opponentHadStrategicResolutionUnitActions` and `humanHadStrategicResolutionObservableActions`.
 * Expected outcome: False when `rows` is undefined or empty.
 * Exceptions: None.
 */
export function animationRowsIncludePlayer<T extends { player: string }>(
  rows: readonly T[] | undefined,
  playerId: 'human' | 'opponent'
): boolean {
  logTrace('animationRowsIncludePlayer', { playerId });
  return (rows ?? []).some((m) => m.player === playerId);
}

/**
 * Returns true when any kill edge in `buckets` lists a killer id in `killerIdSet`, or optional human-owner fallback when the set is empty.
 *
 * Purpose: Single loop for strategic human kill scanning (set + id-owner fallback when roster is masked out).
 * When to use: Only `humanHadStrategicResolutionObservableActions` for direct/return/melee aggregate kills.
 * Expected outcome: False when all buckets empty or no killer matches. Compact `h1-*` and legacy `human-*` both count.
 * Exceptions: None.
 */
export function killBucketsMentionHumanStrategicKillers(
  buckets: ReadonlyArray<ReadonlyArray<{ killerIds: string[] }> | undefined>,
  humanIds: Set<string>
): boolean {
  logTrace('killBucketsMentionHumanStrategicKillers', { humanIdCount: humanIds.size });
  const allowHumanPrefixFallback = humanIds.size === 0;
  for (const bucket of buckets) {
    for (const edge of bucket ?? []) {
      for (const killerId of edge.killerIds) {
        if (humanIds.has(killerId)) return true;
        if (allowHumanPrefixFallback && unitIdOwnerFromId(killerId) === 'human') return true;
      }
    }
  }
  return false;
}

/**
 * Returns true when a tactical sub-unit side had march (opponent only), non–no-op human marches, or any kill edge with that side as killer.
 *
 * Purpose: One implementation for `opponentHadTacticalBeatResolutionActions` / `humanHadTacticalBeatResolutionActions`.
 * When to use: Exported wrappers only; keeps tactical kill-bucket order identical for both players.
 * Expected outcome: Opponent branch treats non-empty `opponentMoves` as activity without per-leg no-op filtering (matches prior behavior).
 * When ranged or air orders were submitted this beat, treats that side as active even if march playback rows are empty or kills omit that side (see `humanBeatHadSubmittedRangedOrAirOrders` / `opponentBeatHadSubmittedRangedOrAirOrders` on playback).
 * Exceptions: None.
 */
function subUnitPlayerHadTacticalBeatResolutionActions(
  playback: TacticalCommitResolutionPlayback,
  tacticalBattle: TacticalBattleSnapshot,
  player: 'human' | 'opponent'
): boolean {
  if (player === 'opponent' && (playback.opponentMoves?.length ?? 0) > 0) return true;
  if (player === 'human' && hasNonNoopMarchMoves(playback.humanMoves)) return true;
  if (player === 'human' && playback.humanBeatHadSubmittedRangedOrAirOrders === true) return true;
  if (player === 'opponent' && playback.opponentBeatHadSubmittedRangedOrAirOrders === true) return true;
  const ids = new Set(tacticalBattle.subUnits.filter((s) => s.player === player).map((s) => s.id));
  const buckets: ReadonlyArray<ReadonlyArray<KillEdge> | undefined> = [
    playback.killsByDirectFire,
    playback.killsByAirStrike,
    playback.killsByReturnFire,
    playback.killsByMelee,
  ];
  for (const bucket of buckets) {
    for (const edge of bucket ?? []) {
      if (edge.killerIds.some((id) => ids.has(id))) return true;
    }
  }
  return false;
}

/**
 * Composes mandatory/subscription counts with idle-opponent and human-observable flags into `shouldConsult` and a policy-only flag for logging.
 *
 * Purpose: Prevents strategic and tactical `afterResolution` paths from drifting on the same boolean algebra.
 * When to use: After `evaluateMandatoryOverrides` / `evaluateSubscriptionEvents` (or tactical equivalents).
 * Expected outcome: `policyOnlyConsult` is true iff consultation is solely due to opponent idle and/or human observable policy (no callback rows fired).
 * Exceptions: None.
 */
export function computePostResolutionConsultTriggers(args: {
  mandatoryCount: number;
  subscriptionCount: number;
  opponentIdle: boolean;
  humanObservable: boolean;
}): { shouldConsult: boolean; policyOnlyConsult: boolean } {
  logTrace('computePostResolutionConsultTriggers', {
    mandatoryCount: args.mandatoryCount,
    subscriptionCount: args.subscriptionCount,
  });
  const shouldConsult =
    args.mandatoryCount > 0 ||
    args.subscriptionCount > 0 ||
    args.opponentIdle ||
    args.humanObservable;
  const policyOnlyConsult =
    shouldConsult && args.mandatoryCount === 0 && args.subscriptionCount === 0;
  return { shouldConsult, policyOnlyConsult };
}

/**
 * Returns true when the opponent had strategic resolution-time unit activity (see slice fields).
 *
 * Purpose: Drives the idle-opponent LLM branch when no callback events fired.
 * When to use: `afterResolution` after building `resolutionResult`.
 * Expected outcome: Unchanged contract vs pre-refactor implementation.
 * Exceptions: None.
 */
export function opponentHadStrategicResolutionUnitActions(r: StrategicResolutionOpponentActivitySlice): boolean {
  logTrace('opponentHadStrategicResolutionUnitActions', {});
  if (r.opponentHadStrategicMarchResolution === true) return true;
  if ((r.opponentCombatParticipantUnitIds?.length ?? 0) > 0) return true;
  if (animationRowsIncludePlayer(r.resolvedFerryMoves, 'opponent')) return true;
  if (animationRowsIncludePlayer(r.airStrikeMoves, 'opponent')) return true;
  return false;
}

/**
 * Returns true when human forces had observable strategic resolution outcomes this turn.
 *
 * Purpose: Drives the human-observable LLM branch when the opponent was active and callbacks did not fire.
 * When to use: `afterResolution` with opponent-perspective `GameStateSnapshot`.
 * Expected outcome: Unchanged contract vs pre-refactor implementation.
 * Exceptions: None.
 */
export function humanHadStrategicResolutionObservableActions(
  r: StrategicResolutionHumanActivitySlice,
  state: GameStateSnapshot
): boolean {
  logTrace('humanHadStrategicResolutionObservableActions', {});
  if (hasNonNoopMarchMoves(r.humanMoves)) return true;
  if (animationRowsIncludePlayer(r.resolvedFerryMoves, 'human')) return true;
  if (animationRowsIncludePlayer(r.airStrikeMoves, 'human')) return true;
  const humanIds = new Set(state.units.filter((u) => u.player === 'human').map((u) => u.id));
  const killBuckets: ReadonlyArray<ReadonlyArray<{ killerIds: string[] }> | undefined> = [
    r.killsByDirectFire,
    r.killsByReturnFire,
    r.kills,
  ];
  return killBucketsMentionHumanStrategicKillers(killBuckets, humanIds);
}

/**
 * Returns true when opponent tactical sub-units had march or kill credit on this beat.
 *
 * Purpose: Tactical idle-opponent detection.
 * When to use: `afterTacticalBeatResolution`.
 * Expected outcome: Wrapper over `subUnitPlayerHadTacticalBeatResolutionActions` for `'opponent'`.
 * Exceptions: None.
 */
export function opponentHadTacticalBeatResolutionActions(
  playback: TacticalCommitResolutionPlayback,
  tacticalBattle: TacticalBattleSnapshot
): boolean {
  logTrace('opponentHadTacticalBeatResolutionActions', {});
  return subUnitPlayerHadTacticalBeatResolutionActions(playback, tacticalBattle, 'opponent');
}

/**
 * Returns true when human tactical sub-units had non–no-op march or kill credit on this beat.
 *
 * Purpose: Tactical human-observable detection.
 * When to use: `afterTacticalBeatResolution`.
 * Expected outcome: Wrapper over `subUnitPlayerHadTacticalBeatResolutionActions` for `'human'`.
 * Exceptions: None.
 */
export function humanHadTacticalBeatResolutionActions(
  playback: TacticalCommitResolutionPlayback,
  tacticalBattle: TacticalBattleSnapshot
): boolean {
  logTrace('humanHadTacticalBeatResolutionActions', {});
  return subUnitPlayerHadTacticalBeatResolutionActions(playback, tacticalBattle, 'human');
}
