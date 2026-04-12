/**
 * Pure projection of opponent tactical march orders onto a tactical battle snapshot (milestone 2.1).
 */

import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { tacticalLogQuery } from './tacticalLogging';
import { tacticalComputeMovementOrderOutcome } from './tacticalSnapshotGuards';

/**
 * Returns a new tactical snapshot with opponent sub-unit positions updated from validated movement orders.
 *
 * Contract: Only `player === 'opponent'` sub-units move; destinations must lie in `battle.res4ChildH3Indexes`; range uses `MOVEMENT_RANGE_BY_UNIT_TYPE` as inclusive res4 grid steps.
 * When to use: After `requestOrders` returns movement orders for tactical AI, before mutating `activeTacticalBattle` in the main process.
 * Expected outcome: Immutable copy of `battle` with at most one position change per matched order (later duplicate `unitId` entries in `orders` overwrite earlier ones).
 * Exceptions: None; unknown unit ids or invalid destinations are skipped with trace logs.
 */
export function projectTacticalSnapshotAfterOpponentMovementOrders(
  battle: TacticalBattleSnapshot,
  orders: readonly { unitId: string; toH3Index: string }[]
): TacticalBattleSnapshot {
  tacticalLogQuery('projectTacticalSnapshotAfterOpponentMovementOrders', {
    battleId: battle.battleId,
    orderCount: orders.length,
  });
  const res4Set = new Set(battle.res4ChildH3Indexes);
  const sub: TacticalSubUnitSnapshot[] = battle.subUnits.map((u) => ({ ...u }));
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  for (const o of orders) {
    const outcome = tacticalComputeMovementOrderOutcome({ byId, sub, order: o, res4Set });
    if (!outcome.ok) {
      tacticalLogQuery('projectTacticalSnapshotAfterOpponentMovementOrders skip', {
        reason: outcome.reason,
        ...outcome.context,
      });
      continue;
    }
    const idx = outcome.idx;
    const u = sub[idx]!;
    const disembarks =
      !!u.embarkedOnSubUnitId &&
      (u.unitType === 'infantry' || u.unitType === 'armor') &&
      o.toH3Index !== u.h3Index;
    sub[idx] = disembarks
      ? { ...u, h3Index: o.toH3Index, embarkedOnSubUnitId: undefined }
      : { ...u, h3Index: o.toH3Index };
  }
  const idToUnit = new Map(sub.map((u) => [u.id, u] as const));
  for (let i = 0; i < sub.length; i++) {
    const u = sub[i]!;
    const embark = u.embarkedOnSubUnitId;
    if (!embark) continue;
    const naval = idToUnit.get(embark);
    if (naval && naval.unitType === 'naval') {
      sub[i] = { ...u, h3Index: naval.h3Index };
    }
  }
  return { ...battle, subUnits: sub };
}
