/**
 * Pure helpers to project movement onto a GameStateSnapshot clone for tactical AI order validation.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';

/**
 * Returns a snapshot copy whose unit rows reflect applied march orders and embarked-cargo hex sync.
 *
 * Contract: Only updates `units[].h3Index`; order list is treated as authoritative per unit id.
 * When to use: After movement orders pass validation in tactical AI flow, before ranged/air/ferry/embark checks.
 * Expected outcome: Carriers move first by list order; cargo with `embarkedOnSubUnitId` snaps to carrier cells.
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
    const disembarks =
      !!u.embarkedOnSubUnitId &&
      (u.unitType === 'infantry' || u.unitType === 'armor') &&
      to !== u.h3Index;
    return disembarks ? { ...u, h3Index: to, embarkedOnSubUnitId: undefined } : { ...u, h3Index: to };
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
