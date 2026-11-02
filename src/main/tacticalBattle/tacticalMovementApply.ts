/**
 * Pure projection of opponent tactical march orders onto a tactical battle snapshot.
 */

import type { OwnerId } from '../../shared/seatIds';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { syncEmbarkedLandToNavalHex } from './tacticalEmbarkedCargoSync';
import { tacticalLogQuery } from './tacticalLogging';
import {
  tacticalComputeHumanMovementOrderOutcome,
  tacticalComputeMovementOrderOutcome,
  tacticalComputeMovementOrderOutcomeForPlayer,
} from './tacticalSnapshotGuards';

/**
 * Applies one march stop, and clears a land unit's carrier when its own order leaves that cell.
 *
 * Purpose: Opponent projection, per-seat projection, and the head-on mover walk share this update.
 * When to use: After a movement outcome names the cell the sub-unit stops on.
 * Expected outcome: `h3Index` is the applied cell. Embarked infantry or armor that moved to a different cell has no `embarkedOnSubUnitId`. A unit that stays, and every other type, keeps its carrier.
 * Exceptions: None.
 */
export function withTacticalMarchStop(unit: TacticalSubUnitSnapshot, appliedToH3Index: string): TacticalSubUnitSnapshot {
  const debarkedIndependently =
    (unit.unitType === 'infantry' || unit.unitType === 'armor')
    && !!unit.embarkedOnSubUnitId
    && appliedToH3Index !== unit.h3Index;
  tacticalLogQuery('withTacticalMarchStop', { unitId: unit.id, appliedToH3Index, debarkedIndependently });
  return {
    ...unit,
    h3Index: appliedToH3Index,
    ...(debarkedIndependently ? { embarkedOnSubUnitId: undefined } : {}),
  };
}

/**
 * Returns a new tactical snapshot with opponent sub-unit positions updated from validated movement orders.
 *
 * Contract: Only the battle's other party moves, and Neutral never does. Destinations must lie in `battle.tacticalChildH3Indexes`. Reachability uses §12.4 terrain-weighted paths and terrain-adjusted movement-point budgets from `tacticalTerrainCombatModifiers`.
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
  const tacticalSet = new Set(battle.tacticalChildH3Indexes);
  const sub: TacticalSubUnitSnapshot[] = battle.subUnits.map((u) => ({ ...u }));
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  for (const o of orders) {
    const outcome = tacticalComputeMovementOrderOutcome({ byId, sub, order: o, tacticalSet, battle });
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
    sub[idx] = withTacticalMarchStop(u, applied);
  }
  return { ...battle, subUnits: syncEmbarkedLandToNavalHex(sub) };
}

/**
 * Returns a new snapshot with one seat's sub-units moved.
 *
 * Purpose: An AI-only beat runs this once per seat so a unit of the other owner is ignored.
 * When to use: After illegal rows for that seat have been dropped.
 * Expected outcome: The same skip-and-apply contract as the opponent projection, for `player` only.
 * Exceptions: None. Unknown units and illegal destinations are skipped.
 */
export function projectTacticalSnapshotAfterPlayerMovementOrders(
  battle: TacticalBattleSnapshot,
  orders: readonly { unitId: string; toH3Index: string }[],
  player: OwnerId,
): TacticalBattleSnapshot {
  tacticalLogQuery('projectTacticalSnapshotAfterPlayerMovementOrders', {
    battleId: battle.battleId,
    player,
    orderCount: orders.length,
  });
  const tacticalSet = new Set(battle.tacticalChildH3Indexes);
  const sub: TacticalSubUnitSnapshot[] = battle.subUnits.map((unit) => ({ ...unit }));
  const byId = new Map(sub.map((unit, index) => [unit.id, index] as const));
  for (const order of orders) {
    const outcome = tacticalComputeMovementOrderOutcomeForPlayer(player, { byId, sub, order, tacticalSet, battle });
    if (!outcome.ok) {
      tacticalLogQuery('projectTacticalSnapshotAfterPlayerMovementOrders skip', {
        reason: outcome.reason,
        ...outcome.context,
      });
      continue;
    }
    const unit = sub[outcome.idx]!;
    const applied = outcome.appliedToH3Index;
    sub[outcome.idx] = withTacticalMarchStop(unit, applied);
  }
  return { ...battle, subUnits: syncEmbarkedLandToNavalHex(sub) };
}

/**
 * Returns a new tactical snapshot with human sub-unit positions updated from validated movement orders.
 *
 * Purpose: Applies human-only march deltas with the same tactical footprint and range rules as opponent projection.
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
  const tacticalSet = new Set(battle.tacticalChildH3Indexes);
  const sub: TacticalSubUnitSnapshot[] = battle.subUnits.map((u) => ({ ...u }));
  const byId = new Map(sub.map((u, i) => [u.id, i] as const));
  for (const o of orders) {
    const outcome = tacticalComputeHumanMovementOrderOutcome({ byId, sub, order: o, tacticalSet, battle });
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
    sub[idx] = { ...u, h3Index: applied };
  }
  return { ...battle, subUnits: syncEmbarkedLandToNavalHex(sub) };
}
