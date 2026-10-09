/**
 * Renderer-side tactical mode guards shared by map interactions, ready-button gating, and IPC orchestration.
 */

import { tacticalHitIsInsideBattle } from '../../shared/mapOrderGestureGate';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';

/**
 * Minimal renderer slice consulted for tactical-vs-strategic interaction gating.
 *
 * Contract: Any object exposing `tacticalBattleSnapshot` with the same null semantics as `rendererSharedState`.
 * When to use: Pass `rendererSharedState` (or a test double) into tactical guard helpers without importing the full renderer graph.
 * Expected outcome: Callers branch on tactical presence without duplicating `!!S.tacticalBattleSnapshot` checks.
 * Exceptions: None.
 */
export type TacticalRendererGateState = {
  tacticalBattleSnapshot: TacticalBattleSnapshot | null;
};

/**
 * Returns true when the renderer holds an active tactical battle snapshot (tactical session).
 *
 * Contract: Pure; identical to `!!state.tacticalBattleSnapshot`.
 * When to use: Ready button disabling, map interaction blocking, and sidebar suppression checks.
 * Expected outcome: True during tactical play until snapshot is cleared.
 * Exceptions: None.
 */
export function tacticalRendererIsBattleActive(state: TacticalRendererGateState): boolean {
  return !!state.tacticalBattleSnapshot;
}

/**
 * Returns true when strategic human orders should be blocked because tactical mode owns the map.
 *
 * Contract: Currently identical to battle-active; kept as a named hook for future divergences (e.g. transitional states).
 * When to use: Any strategic-only gesture that must not fire while tactical mode is active.
 * Expected outcome: True whenever tactical battle snapshot is non-null.
 * Exceptions: None.
 */
export function tacticalRendererShouldBlockStrategicMapOrders(state: TacticalRendererGateState): boolean {
  return tacticalRendererIsBattleActive(state);
}

/**
 * Returns true when a hit-tested strategic or tactical hex lies inside the active tactical footprint.
 *
 * Contract: Accepts the enclosing strategic hex or a cell in `tacticalChildH3Indexes`. A cell one ring past that list is outside.
 * The null-hit rule lives in `tacticalHitIsInsideBattle`.
 * When to use: Main-map click routing to reject out-of-footprint clicks during tactical sessions.
 * Expected outcome: True when no tactical session exists. During a battle, false for a null hit and for a hex outside the footprint.
 * Exceptions: None. With no battle, the hit is not inspected.
 */
export function tacticalRendererHitInsideBattleFootprint(hit: string | null, tb: TacticalBattleSnapshot | null): boolean {
  let footprintSaysInside = false;
  if (typeof hit === 'string' && tb) {
    footprintSaysInside = hit === tb.enclosingStrategicH3Index || tb.tacticalChildH3Indexes.includes(hit);
  }
  return tacticalHitIsInsideBattle(tb != null, hit, footprintSaysInside);
}
