/**
 * Pure helpers to project movement onto a GameStateSnapshot clone for tactical AI order validation.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { syncEmbarkedLandToNavalHex } from './tacticalEmbarkedCargoSync';

/**
 * Returns a snapshot copy whose unit rows reflect applied march orders and embarked-cargo hex sync.
 *
 * Contract: Only updates `units[].h3Index`; opponent embarked cargo auto-debarks when moving independently.
 * When to use: After movement orders pass validation in tactical AI flow, before ranged/air/ferry/embark checks.
 * Expected outcome: Ordered units move in one pass. Opponent cargo that marches on its own clears `embarkedOnSubUnitId`. Cargo that stays embarked takes its carrier's hex from that same pass.
 * Exceptions: None.
 */
export function applyMovementOrdersToPlanState(
  state: GameStateSnapshot,
  orders: readonly { unitId: string; toH3Index: string }[]
): GameStateSnapshot {
  if (orders.length === 0) return state;
  const orderTo = new Map(orders.map((o) => [o.unitId, o.toH3Index] as const));
  const units = state.units.map((u) => {
    const to = orderTo.get(u.id);
    if (to === undefined) return { ...u };
    const debarkingIndependently =
      u.player !== HUMAN_SEAT_ID &&
      !!u.embarkedOnSubUnitId &&
      (u.unitType === 'infantry' || u.unitType === 'armor') &&
      to !== u.h3Index;
    if (debarkingIndependently) {
      return { ...u, h3Index: to, embarkedOnSubUnitId: undefined };
    }
    return { ...u, h3Index: to };
  });
  return { ...state, units: syncEmbarkedLandToNavalHex(units) };
}
