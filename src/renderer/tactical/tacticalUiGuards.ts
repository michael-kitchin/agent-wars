/**
 * Renderer-side tactical mode guards shared by map interactions, ready-button gating, and IPC orchestration.
 */

import { tacticalHitIsInsideBattle } from '../../shared/mapOrderGestureGate';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';

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
