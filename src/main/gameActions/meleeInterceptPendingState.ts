/**
 * In-memory snapshot for pausing strategic ready between movement and melee until the human resolves intercept UI.
 */

import { randomUUID } from 'node:crypto';
import type { CombatUnit } from '../combatUnitTypes';
import type { CombatResolutionResult } from '../combatResolution';
import type { FerryAnimationMove, GameStateSnapshot, MeleeCandidateRow, RangedAttackOrder } from '../../shared/ipcTypes';
import type { AirStrikePhaseResult } from './airStrikeResolution';
import { logDebug, logTrace } from '../logger';

/**
 * Holds every value required to resume `ready` after the player chooses Fight or Ignore on the melee intercept modal.
 *
 * Purpose: Avoids duplicating air/ranged/movement work while keeping RNG alignment via `rngInvocationsBeforeMelee`.
 * When to use: Stored when ready pauses with candidates; consumed exactly once on resolve.
 * Expected outcome: Token match authorizes a single resume for the same turn number.
 * Exceptions: None.
 */
export interface MeleeInterceptReadyPauseSnapshot {
    /**
   * Specifies the contract for the `decisionToken` member (decisionToken: string;).

   * Contract: Random UUID issued to the renderer for idempotent resolve.
   * When to use: Compared on `resolveMeleeIntercept`.
   * Expected outcome: Single-use per pause.
   * Exceptions: None.
   */
decisionToken: string;
    /**
   * Specifies the contract for the `turnNumber` member (turnNumber: number;).

   * Contract: Strategic turn being resolved when pause occurred.
   * When to use: Validates DB `turn_state` still matches before resume.
   * Expected outcome: Mismatch aborts resolve with a clear reason.
   * Exceptions: None.
   */
turnNumber: number;
    /**
   * Specifies the contract for the `combatSeed` member (combatSeed: number;).

   * Contract: Same seed passed to `createCombatRng` for this ready invocation.
   * When to use: Rebuild RNG stream before melee on resume.
   * Expected outcome: Matches uninterrupted ready dice.
   * Exceptions: None.
   */
combatSeed: number;
    /**
   * Specifies the contract for the `rngInvocationsBeforeMelee` member (rngInvocationsBeforeMelee: number;).

   * Contract: Count of `next()` draws consumed by air + ranged phases before melee.
   * When to use: Advance a fresh PRNG by this many draws before `runMeleePhase`.
   * Expected outcome: Keeps melee rolls aligned with non-intercept turns.
   * Exceptions: None.
   */
rngInvocationsBeforeMelee: number;
    /**
   * Specifies the contract for the `hexList` member (hexList: string[];).

   * Contract: Ordered strategic hex list used for combat iteration.
   * When to use: Passed back into `runMeleePhase`.
   * Expected outcome: Same ordering as pause-time ready.
   * Exceptions: None.
   */
hexList: string[];
    /**
   * Specifies the contract for the `combatUnitsAfter` member (combatUnitsAfter: CombatUnit[];).

   * Contract: Units participating in melee input state after movement and ranged removals.
   * When to use: `runMeleePhase` input and participant attribution.
   * Expected outcome: Frozen copy from pause instant.
   * Exceptions: None.
   */
combatUnitsAfter: CombatUnit[];
    /**
   * Specifies the contract for the `combatUnitsBefore` member (combatUnitsBefore: CombatUnit[];).

   * Contract: Pre-move combat snapshots for ranged defender attribution.
   * When to use: Finalize opponent participant ids.
   * Expected outcome: Frozen copy from pause instant.
   * Exceptions: None.
   */
combatUnitsBefore: CombatUnit[];
    /**
   * Specifies the contract for the `rangedResult` member (rangedResult: CombatResolutionResult;).

   * Contract: Completed ranged phase outcome before pause.
   * When to use: Merge into final ready result after melee.
   * Expected outcome: Same object ready would have used without pause.
   * Exceptions: None.
   */
rangedResult: CombatResolutionResult;
    /**
   * Specifies the contract for the `airStrikeResult` member (airStrikeResult: AirStrikePhaseResult;).

   * Contract: Completed air strike phase outcome before pause.
   * When to use: Merge into final ready result after melee.
   * Expected outcome: Same object ready would have used without pause.
   * Exceptions: None.
   */
airStrikeResult: AirStrikePhaseResult;
    /**
   * Specifies the contract for the `airStrikeTransportLosses` member (airStrikeTransportLosses: CombatUnit[];).

   * Contract: Transport-derived removals from air strike phase.
   * When to use: Aggregate reporting in finalize.
   * Expected outcome: May be empty.
   * Exceptions: None.
   */
airStrikeTransportLosses: CombatUnit[];
    /**
   * Specifies the contract for the `rangedTransportLosses` member (rangedTransportLosses: CombatUnit[];).

   * Contract: Transport-derived removals from ranged phase.
   * When to use: Aggregate reporting in finalize.
   * Expected outcome: May be empty.
   * Exceptions: None.
   */
rangedTransportLosses: CombatUnit[];
    /**
   * Specifies the contract for the `humanMoves` member (humanMoves: { unitId: string; fromH3Index: string; toH3Index: string }[];).

   * Contract: Human march animations for this turn.
   * When to use: Finalize `humanMoves` payload.
   * Expected outcome: May be empty.
   * Exceptions: None.
   */
humanMoves: { unitId: string; fromH3Index: string; toH3Index: string }[];
    /**
   * Specifies the contract for the `embarkedFollowMoves` member (embarkedFollowMoves: { unitId: string; fromH3Index: string; toH3Index: string }[];).

   * Contract: Embarked units that moved with naval transports.
   * When to use: Finalize merged human move list.
   * Expected outcome: May be empty.
   * Exceptions: None.
   */
embarkedFollowMoves: { unitId: string; fromH3Index: string; toH3Index: string }[];
    /**
   * Specifies the contract for the `resolvedFerryMoves` member (resolvedFerryMoves: FerryAnimationMove[];).

   * Contract: Successful ferry resolutions for animation.
   * When to use: Finalize payload.
   * Expected outcome: May be empty.
   * Exceptions: None.
   */
resolvedFerryMoves: FerryAnimationMove[];
    /**
   * Specifies the contract for the `traversedHexesByPlayer` member (traversedHexesByPlayer: Record<'human' | 'opponent', Set<string>>).

   * Contract: Fog refresh traversal sets after movement (same shape as `collectTraversedHexesByPlayer`).
   * When to use: Control resolution and fog refresh in finalize.
   * Expected outcome: Cloned sets so later mutations cannot affect the paused snapshot.
   * Exceptions: None.
   */
traversedHexesByPlayer: Record<'human' | 'opponent', Set<string>>;
    /**
   * Whether any opponent unit had a resolving march leg this turn before melee pause (mirrors `ReadyResult.opponentHadStrategicMarchResolution`).
   *
   * Contract: Frozen at pause time from the same predicate used when calling `finalizeReadyTurnAfterMelee` without pause.
   * When to use: Post–melee-intercept `afterResolution` idle-opponent detection across the full turn.
   * Expected outcome: True when opponent `pending_orders` produced a position change, including air marches not represented in `traversedHexesByPlayer.opponent`.
   * Exceptions: None.
   */
opponentHadStrategicMarchResolution: boolean;
    /**
   * Specifies the contract for the `allRanged` member (allRanged: RangedAttackOrder[];).

   * Contract: Human+AI ranged declarations for the turn.
   * When to use: Defender hex coverage in finalize.
   * Expected outcome: Same composition as pause-time ready.
   * Exceptions: None.
   */
allRanged: RangedAttackOrder[];
    /**
   * Specifies the contract for the `aiRangedOrders` member (aiRangedOrders: RangedAttackOrder[];).

   * Contract: Opponent ranged orders only.
   * When to use: Opponent attacker attribution in finalize.
   * Expected outcome: Same array passed into ready.
   * Exceptions: None.
   */
aiRangedOrders: RangedAttackOrder[];
    /**
   * Specifies the contract for the `candidateHexes` member (candidateHexes: string[];).

   * Contract: Hexes where melee would occur on Ignore; used to validate Fight selection.
   * When to use: Fight path must pick one of these ids.
   * Expected outcome: Non-empty at pause time.
   * Exceptions: None.
   */
candidateHexes: string[];
    /**
   * Specifies the contract for the `meleeInterceptCandidates` member (meleeInterceptCandidates: MeleeCandidateRow[];).

   * Contract: Row data returned to renderer with the pause result.
   * When to use: Fight validation against selected hex.
   * Expected outcome: Same length and order as `candidateHexes`.
   * Exceptions: None.
   */
meleeInterceptCandidates: MeleeCandidateRow[];
}

let pendingMeleeIntercept: MeleeInterceptReadyPauseSnapshot | null = null;

/**
 * Returns the current pause snapshot if any, without clearing it.
 *
 * Purpose: Lets tests and diagnostics inspect pending intercept state.
 * When to use: Read-only introspection only.
 * Expected outcome: Null when no pause is active.
 * Exceptions: None.
 */
export function peekMeleeInterceptPendingSnapshot(): MeleeInterceptReadyPauseSnapshot | null {
  logTrace('peekMeleeInterceptPendingSnapshot');
  return pendingMeleeIntercept;
}

/**
 * Expands human fog snapshot lists so every pending melee-intercept candidate hex is visible and explored for UI.
 *
 * Purpose: Satisfies the execution-plan visibility contract so modal rows can reuse hex-popup formatters that gate on explored/visible state.
 * When to use: `getGameStateForPlayer('human', …)` after fog filtering and before returning to the renderer during a pause.
 * Expected outcome: `candidateHexes` from `peekMeleeInterceptPendingSnapshot` are unioned into `visibleHexes` and `exploredHexes`; `staleHexes` is recomputed from those sets.
 * Exceptions: None; no-op when no pause snapshot exists.
 */
export function mergeMeleeCandidateHexesIntoHumanFogSnapshot(base: GameStateSnapshot): GameStateSnapshot {
  const pending = peekMeleeInterceptPendingSnapshot();
  if (!pending?.candidateHexes.length) return base;
  logDebug('mergeMeleeCandidateHexesIntoHumanFogSnapshot', { candidateCount: pending.candidateHexes.length });
  const mergedVisible = new Set([...(base.visibleHexes ?? []), ...pending.candidateHexes]);
  const mergedExplored = new Set([...(base.exploredHexes ?? []), ...pending.candidateHexes]);
  const mergedStale = [...mergedExplored].filter((h3) => !mergedVisible.has(h3));
  return {
    ...base,
    visibleHexes: Array.from(mergedVisible),
    exploredHexes: Array.from(mergedExplored),
    staleHexes: mergedStale,
  };
}

/**
 * Stores a new pause snapshot, replacing any stale pending state.
 *
 * Purpose: Authorizes exactly one in-flight melee decision per main process.
 * When to use: When ready chooses to pause before melee.
 * Expected outcome: Prior pending snapshot is overwritten after logging.
 * Exceptions: None.
 */
export function setMeleeInterceptPendingSnapshot(snapshot: MeleeInterceptReadyPauseSnapshot): void {
  if (pendingMeleeIntercept) {
    logDebug('setMeleeInterceptPendingSnapshot: replacing existing pending snapshot', {
      priorTurn: pendingMeleeIntercept.turnNumber,
      nextTurn: snapshot.turnNumber,
    });
  }
  logDebug('setMeleeInterceptPendingSnapshot', { turnNumber: snapshot.turnNumber, candidateCount: snapshot.candidateHexes.length });
  pendingMeleeIntercept = snapshot;
}

/**
 * Clears any pending snapshot after successful resolve or fatal abandon paths.
 *
 * Purpose: Prevents duplicate resumes and frees memory.
 * When to use: End of `resolveMeleeIntercept` and error handlers that cannot recover the pause.
 * Expected outcome: `peekMeleeInterceptPendingSnapshot` returns null afterward.
 * Exceptions: None.
 */
export function clearMeleeInterceptPendingSnapshot(): void {
  logDebug('clearMeleeInterceptPendingSnapshot', { hadPending: pendingMeleeIntercept !== null });
  pendingMeleeIntercept = null;
}

/**
 * Issues a fresh decision token string suitable for IPC round-trips.
 *
 * Purpose: Centralizes UUID creation for pause snapshots.
 * When to use: Once per pause before returning to renderer.
 * Expected outcome: Non-empty unique string.
 * Exceptions: None.
 */
export function newMeleeDecisionToken(): string {
  logDebug('newMeleeDecisionToken', {});
  return randomUUID();
}
