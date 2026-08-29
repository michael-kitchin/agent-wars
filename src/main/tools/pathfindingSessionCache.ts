/**
 * Planning-phase pathfinding session reuse for human preview and opponent assign_order batches.
 * Human and opponent snapshots must not share a session: fog and blocked-enemy sets differ by perspective.
 * Land-mass test overrides skip this cache so fixtures stay isolated from production terrain data.
 */

import type { GameStateSnapshot } from '../../shared/ipc/gameStateTypes';
import { logDebug } from '../logger';

/**
 * Cached planning-phase session plus the snapshot signature it was built from.
 *
 * Purpose: One slot per player perspective so a human preview and an opponent order batch can coexist.
 * When to use: Only through `reusePlanningPhaseSession` / `rememberPlanningPhaseSession`.
 * Expected outcome: Same object is returned while the signature matches; a mismatch replaces the slot.
 * Exceptions: None.
 */
interface PlanningPhaseSessionCache<T> {
  /**
   * Snapshot signature from `buildPlanningPhaseSessionKey`.
   *
   * Contract: Must match before a cached session is returned.
   * When to use: Compare against the current `createPathfindingSession` call.
   * Expected outcome: Equality means unit positions, hex set, fog, and perspective are unchanged.
   * Exceptions: None.
   */
  key: string;
  /**
   * Session to reuse for further planning-phase path queries.
   *
   * Contract: Holds the first matching snapshot's maps and stateful dead-state cache.
   * When to use: Return this object instead of rebuilding hex/terrain maps.
   * Expected outcome: Callers see the same `hexSet` / `statefulCache` across assign_order / plan_route calls.
   * Exceptions: None.
   */
  session: T;
}

/**
 * One cached session per planning-phase perspective (`human` or `opponent`).
 *
 * Purpose: Opponent `assign_order` was creating a new session per unit while the human slot already reused.
 * When to use: Mutated only by the reuse/remember helpers in this module.
 * Expected outcome: At most two live sessions per turn; cleared when the turn number changes.
 * Exceptions: None.
 */
const planningPhaseSessionByPerspective = new Map<string, PlanningPhaseSessionCache<object>>();

/**
 * Created/reused counts for the current turn's planning-phase session cache.
 *
 * Purpose: Debug logs for Ready-phase telemetry; not a gameplay contract.
 * When to use: Reset when `turnNumber` changes; increment from reuse/remember.
 * Expected outcome: `created` is 1 per perspective per stable snapshot; further calls increment `reused`.
 * Exceptions: None.
 */
const planningPhaseSessionMetrics = {
  turnNumber: -1,
  created: 0,
  reused: 0,
};

/**
 * Clears cached sessions when play moves to a new turn.
 *
 * Purpose: Unit positions change at resolution, so a previous turn's maps are invalid.
 * When to use: Before reuse/remember on every `createPathfindingSession` that participates in the cache.
 * Expected outcome: Same-turn calls keep the Map; a new turn starts at created=0, reused=0, empty Map.
 * Exceptions: None.
 */
function resetPlanningPhaseSessionMetricsForTurn(turnNumber: number): void {
  if (planningPhaseSessionMetrics.turnNumber === turnNumber) return;
  planningPhaseSessionMetrics.turnNumber = turnNumber;
  planningPhaseSessionMetrics.created = 0;
  planningPhaseSessionMetrics.reused = 0;
  planningPhaseSessionByPerspective.clear();
}

/**
 * Snapshot of this turn's planning-phase session cache counters.
 *
 * Purpose: Include in debug logs without exposing the mutable metrics object.
 * When to use: After incrementing created or reused.
 * Expected outcome: Plain `{ turnNumber, created, reused }` copy.
 * Exceptions: None.
 */
function getPlanningPhaseSessionMetrics(): { turnNumber: number; created: number; reused: number } {
  return {
    turnNumber: planningPhaseSessionMetrics.turnNumber,
    created: planningPhaseSessionMetrics.created,
    reused: planningPhaseSessionMetrics.reused,
  };
}

/**
 * True when this snapshot may share a pathfinding session for the rest of planning.
 *
 * Purpose: Standing orders and human march preview do not move units until resolution, so maps stay valid.
 * When to use: Gate reuse in `createPathfindingSession` when no land-mass override is supplied.
 * Expected outcome: True only in `planning` for `human` or `opponent` perspective.
 * Exceptions: None.
 */
function shouldReusePlanningPhaseSession(state: GameStateSnapshot): boolean {
  return (
    state.phase === 'planning' &&
    (state.playerPerspective === 'human' || state.playerPerspective === 'opponent')
  );
}

/**
 * Builds a signature that invalidates the cache when units, hexes, fog, or perspective change.
 *
 * Purpose: Reuse is only safe while the board the session indexed is unchanged.
 * When to use: Compare against the slot stored for this perspective.
 * Expected outcome: Stable string for a given snapshot; changes when any listed field changes.
 * Exceptions: None.
 */
function buildPlanningPhaseSessionKey(state: GameStateSnapshot): string {
  const unitsSignature = state.units
    .map((u) => `${u.id}:${u.h3Index}`)
    .sort()
    .join('|');
  const hexSignature = state.hexes.map((h) => h.h3Index).join('|');
  return [
    `turn:${state.turnNumber}`,
    `phase:${state.phase}`,
    `perspective:${state.playerPerspective ?? 'none'}`,
    `fog:${state.fogOfWarEnabled === true ? '1' : '0'}`,
    `units:${unitsSignature}`,
    `hexes:${hexSignature}`,
  ].join('||');
}

/**
 * Returns the cached planning-phase session when this snapshot still matches, otherwise null.
 *
 * Purpose: Avoid rebuilding 800+ hex maps on every opponent `assign_order` / human preview hop.
 * When to use: From `createPathfindingSession` before allocating a new session.
 * Expected outcome: Same session object on hit; null when perspective is ineligible or the signature changed.
 * Exceptions: None.
 */
export function reusePlanningPhaseSession<T extends object>(state: GameStateSnapshot): T | null {
  if (!shouldReusePlanningPhaseSession(state)) return null;
  resetPlanningPhaseSessionMetricsForTurn(state.turnNumber);
  const key = buildPlanningPhaseSessionKey(state);
  const perspective = state.playerPerspective ?? 'none';
  const slot = planningPhaseSessionByPerspective.get(perspective);
  if (slot?.key !== key) return null;
  planningPhaseSessionMetrics.reused += 1;
  logDebug('pathfinding createPathfindingSession: reused planning-phase session', {
    turnNumber: state.turnNumber,
    phase: state.phase,
    playerPerspective: state.playerPerspective ?? null,
    metrics: getPlanningPhaseSessionMetrics(),
  });
  return slot.session as T;
}

/**
 * Stores a newly built session for later planning-phase calls with the same snapshot signature.
 *
 * Purpose: First `createPathfindingSession` in a human preview or opponent order batch pays the map cost once.
 * When to use: From `createPathfindingSession` after building a session that is eligible for reuse.
 * Expected outcome: Subsequent matching calls hit `reusePlanningPhaseSession`; other perspectives keep their own slot.
 * Exceptions: None.
 */
export function rememberPlanningPhaseSession(state: GameStateSnapshot, session: object): void {
  if (!shouldReusePlanningPhaseSession(state)) return;
  resetPlanningPhaseSessionMetricsForTurn(state.turnNumber);
  planningPhaseSessionMetrics.created += 1;
  const perspective = state.playerPerspective ?? 'none';
  planningPhaseSessionByPerspective.set(perspective, {
    key: buildPlanningPhaseSessionKey(state),
    session,
  });
  logDebug('pathfinding createPathfindingSession: cached planning-phase session', {
    turnNumber: state.turnNumber,
    phase: state.phase,
    playerPerspective: state.playerPerspective ?? null,
    metrics: getPlanningPhaseSessionMetrics(),
  });
}

/**
 * Clears planning-phase pathfinding sessions so tests do not share dead-state maps.
 *
 * Purpose: Matches `resetTacticalMovementPlanningCacheForTests` for the strategic session cache.
 * When to use: Start of pathfinding / standing-order tests that create planning-phase sessions without a land-mass override.
 * Expected outcome: Next `createPathfindingSession` builds a new session even when turn and units match a prior test.
 * Exceptions: None.
 */
export function resetPlanningPhaseSessionCacheForTests(): void {
  logDebug('pathfinding resetPlanningPhaseSessionCacheForTests');
  planningPhaseSessionMetrics.turnNumber = -1;
  planningPhaseSessionMetrics.created = 0;
  planningPhaseSessionMetrics.reused = 0;
  planningPhaseSessionByPerspective.clear();
}
