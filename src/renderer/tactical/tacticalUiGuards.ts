/**
 * Renderer-side tactical mode guards shared by map interactions, ready-button gating, and IPC orchestration.
 */

import { cellToParent, getResolution } from 'h3-js';
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
 * Returns true when the renderer holds an active tactical battle snapshot (res4 session).
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
 * When to use: Any strategic-only gesture that must not fire while tactical res4 mode is active.
 * Expected outcome: True whenever tactical battle snapshot is non-null.
 * Exceptions: None.
 */
export function tacticalRendererShouldBlockStrategicMapOrders(state: TacticalRendererGateState): boolean {
  return tacticalRendererIsBattleActive(state);
}

/**
 * Returns true when a hit-tested strategic or res4 hex lies inside the active tactical footprint.
 *
 * Contract: Accepts enclosing res1, any listed res4 child, or any res4 cell whose parent res1 matches the enclosure.
 * The null-hit rule lives in `tacticalHitIsInsideBattle`.
 * When to use: Main-map click routing to reject out-of-footprint clicks during tactical sessions.
 * Expected outcome: True when no tactical session exists. During a battle, false for a null hit and for a hex outside the footprint.
 * Exceptions: During a battle, a malformed hit string yields false when the resolution check throws. With no battle, the hit is not inspected.
 */
export function tacticalRendererHitInsideBattleFootprint(hit: string | null, tb: TacticalBattleSnapshot | null): boolean {
  let footprintSaysInside = false;
  if (typeof hit === 'string' && tb) {
    if (hit === tb.enclosingRes1H3Index || tb.res4ChildH3Indexes.includes(hit)) {
      footprintSaysInside = true;
    } else {
      try {
        if (getResolution(hit) === 4) {
          footprintSaysInside = cellToParent(hit, 1) === tb.enclosingRes1H3Index;
        }
      } catch {
        footprintSaysInside = false;
      }
    }
  }
  return tacticalHitIsInsideBattle(tb != null, hit, footprintSaysInside);
}
