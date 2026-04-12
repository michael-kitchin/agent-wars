/**
 * Pure tactical snapshot guard helpers shared by movement projection and composite order application.
 */

import type { TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { MOVEMENT_RANGE_BY_UNIT_TYPE } from '../../shared/tacticalRanges';
import { tacticalMarchWithinRes4GridSteps } from './tacticalRulesAdapter';

/**
 * Enumerates why an opponent tactical march order may be ignored during snapshot projection.
 *
 * Contract: Used only for diagnostics; does not imply user-facing wording.
 * When to use: Interpreting `tacticalComputeMovementOrderOutcome` failures before logging skip traces.
 * Expected outcome: Stable string union for switch/if diagnostics.
 * Exceptions: None.
 */
export type TacticalMovementBlockReason =
  | 'unknown_unit'
  | 'non_opponent'
  | 'outside_footprint'
  | 'out_of_range';

/**
 * Decides whether a single opponent movement order may mutate a tactical sub-unit row in the snapshot clone.
 *
 * Contract: Pure; does not log; does not mutate arrays; uses inclusive res4 grid-step distance identical to prior inline checks.
 * When to use: `projectTacticalSnapshotAfterOpponentMovementOrders` loop before applying `h3Index` updates.
 * Expected outcome: Returns `ok: true` with `idx` into the mutable `sub` clone, or `ok: false` with a reason and diagnostic context.
 * Exceptions: None; invalid H3 indexes propagate from `tacticalMarchWithinRes4GridSteps` as before.
 */
export function tacticalComputeMovementOrderOutcome(args: {
  byId: ReadonlyMap<string, number>;
  sub: readonly TacticalSubUnitSnapshot[];
  order: { unitId: string; toH3Index: string };
  res4Set: ReadonlySet<string>;
}):
  | { ok: true; idx: number }
  | { ok: false; reason: TacticalMovementBlockReason; context: Record<string, unknown> } {
  const idx = args.byId.get(args.order.unitId);
  if (idx === undefined) {
    return { ok: false, reason: 'unknown_unit', context: { unitId: args.order.unitId } };
  }
  const u = args.sub[idx]!;
  if (u.player !== 'opponent') {
    return { ok: false, reason: 'non_opponent', context: { unitId: args.order.unitId } };
  }
  if (!args.res4Set.has(args.order.toH3Index)) {
    return {
      ok: false,
      reason: 'outside_footprint',
      context: { unitId: args.order.unitId, toH3Index: args.order.toH3Index },
    };
  }
  const maxSteps = MOVEMENT_RANGE_BY_UNIT_TYPE[u.unitType] ?? 1;
  if (!tacticalMarchWithinRes4GridSteps(u.h3Index, args.order.toH3Index, maxSteps)) {
    return {
      ok: false,
      reason: 'out_of_range',
      context: { unitId: args.order.unitId, from: u.h3Index, to: args.order.toH3Index, maxSteps },
    };
  }
  return { ok: true, idx };
}

/**
 * Returns the index of the first row whose `id` matches `unitId`, or `-1` when absent.
 *
 * Contract: Standard `Array#findIndex` semantics on a shallow snapshot row list.
 * When to use: Composite tactical order application for embark and ferry rows before guarded mutation.
 * Expected outcome: Non-negative index when the id exists.
 * Exceptions: None.
 */
export function tacticalFindSubUnitIndexById(subUnits: readonly { id: string }[], unitId: string): number {
  return subUnits.findIndex((u) => u.id === unitId);
}

/**
 * Returns true when a res4 child hex id lies inside the tactical footprint set.
 *
 * Contract: Thin wrapper over `Set#has` to keep tactical footprint checks named consistently.
 * When to use: Ferry destination checks and any other res4 membership test against `res4ChildH3Indexes`.
 * Expected outcome: True iff the tactical snapshot lists the cell.
 * Exceptions: None.
 */
export function tacticalRes4FootprintContains(res4Set: ReadonlySet<string>, h3Index: string): boolean {
  return res4Set.has(h3Index);
}

/**
 * Returns true when the indexed sub-unit is an opponent air unit suitable for ferry mutation.
 *
 * Contract: Does not validate airport infrastructure or destination legality.
 * When to use: Composite ferry loop after `findIndex` succeeds.
 * Expected outcome: True only for `player === 'opponent'` and `unitType === 'air'`.
 * Exceptions: None.
 */
export function tacticalGuardOpponentAirSubUnitForFerry(sub: readonly TacticalSubUnitSnapshot[], index: number): boolean {
  const u = sub[index];
  return !!u && u.unitType === 'air' && u.player === 'opponent';
}
