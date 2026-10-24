/**
 * Pure helpers to project movement onto a GameStateSnapshot clone for tactical AI order validation.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';

/**
 * Returns a snapshot copy whose unit rows reflect applied march orders and embarked-cargo hex sync.
 *
 * Contract: Only updates `units[].h3Index`; opponent embarked cargo auto-debarks when moving independently.
 * When to use: After movement orders pass validation in tactical AI flow, before ranged/air/ferry/embark checks.
 * Expected outcome: Carriers move first by list order; remaining cargo with `embarkedOnSubUnitId` snaps to carrier cells.
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
  const byId = new Map(units.map((u) => [u.id, u] as const));
  for (const u of units) {
    const embark = u.embarkedOnSubUnitId;
    if (!embark) continue;
    const naval = byId.get(embark);
    if (naval && naval.unitType === 'naval') {
      byId.set(u.id, { ...u, h3Index: naval.h3Index });
    }
  }
  return { ...state, units: [...byId.values()] };
}
