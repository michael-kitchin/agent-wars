/**
 * Pure projection of opponent tactical march orders onto a tactical battle snapshot (milestone 2.1).
 */

import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { tacticalLogQuery } from './tacticalLogging';
import {
  tacticalComputeHumanMovementOrderOutcome,
  tacticalComputeMovementOrderOutcome,
} from './tacticalSnapshotGuards';

/**
 * Returns a new tactical snapshot with opponent sub-unit positions updated from validated movement orders.
 *
 * Contract: Only `player === 'opponent'` sub-units move; destinations must lie in `battle.res4ChildH3Indexes`; reachability uses §12.4 terrain-weighted paths and terrain-adjusted movement-point budgets from `tacticalTerrainCombatModifiers`.
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
    const outcome = tacticalComputeMovementOrderOutcome({ byId, sub, order: o, res4Set, battle });
    if (!outcome.ok) {
      tacticalLogQuery('projectTacticalSnapshotAfterOpponentMovementOrders skip', {
        reason: outcome.reason,
        ...outcome.context,
      });
      continue;
    }
    const idx = outcome.idx;
    const u = sub[idx]!;
    const applied = outcome.appliedToH3Index;
    const disembarks =
      !!u.embarkedOnSubUnitId &&
      (u.unitType === 'infantry' || u.unitType === 'armor') &&
      applied !== u.h3Index;
    sub[idx] = disembarks
      ? { ...u, h3Index: applied, embarkedOnSubUnitId: undefined }
      : { ...u, h3Index: applied };
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

/**
 * Returns a new tactical snapshot with human sub-unit positions updated from validated movement orders.
 *
 * Purpose: Applies human-only march deltas with the same res4 footprint and range rules as opponent projection.
 * When to use: After the main process validates human tactical march IPC, before mutating `activeTacticalBattle`.
 * Expected outcome: Immutable copy of `battle` with at most one position change per matched order (later duplicate `unitId` entries overwrite earlier ones).
 * Exceptions: None; unknown unit ids or invalid destinations are skipped with trace logs.
 */
export function projectTacticalSnapshotAfterHumanMovementOrders(
  battle: TacticalBattleSnapshot,
  orders: readonly { unitId: string; toH3Index: string }[]
): TacticalBattleSnapshot {
  tacticalLogQuery('projectTacticalSnapshotAfterHumanMovementOrders', {
    battleId: battle.battleId,
    orderCount: orders.length,
  });
  const res4Set = new Set(battle.res4ChildH3Indexes);
  const sub: TacticalSubUnitSnapshot[] = battle.subUnits.map((u) => ({ ...u }));
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  for (const o of orders) {
    const outcome = tacticalComputeHumanMovementOrderOutcome({ byId, sub, order: o, res4Set, battle });
    if (!outcome.ok) {
      tacticalLogQuery('projectTacticalSnapshotAfterHumanMovementOrders skip', {
        reason: outcome.reason,
        ...outcome.context,
      });
      continue;
    }
    const idx = outcome.idx;
    const u = sub[idx]!;
    const applied = outcome.appliedToH3Index;
    const disembarks =
      !!u.embarkedOnSubUnitId &&
      (u.unitType === 'infantry' || u.unitType === 'armor') &&
      applied !== u.h3Index;
    sub[idx] = disembarks
      ? { ...u, h3Index: applied, embarkedOnSubUnitId: undefined }
      : { ...u, h3Index: applied };
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
