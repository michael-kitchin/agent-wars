/**
 * Copies of a battle's own state, kept while replay steps through its beats.
 *
 * Purpose: Replay replaces the battle view with recorded beats, and the queued sub-unit marches and the pending order lists belong to the present. This file only reads the live state; `replayMode.ts` keeps the copy and puts it back.
 * When to use: Entering replay while a battle is open.
 * Expected outcome: A copy that leaves the live values where they are.
 * Exceptions: None.
 */

import { rendererSharedState as S } from '../core/state';

/**
 * The battle view, the queued marches, and the six pending order lists.
 *
 * Purpose: One value holds everything leaving replay puts back over a battle.
 * When to use: The type of `replayMode.ts`'s kept battle state.
 * Expected outcome: Values copied at entry.
 * Exceptions: None.
 */
export interface ReplayBattleCopy {
  /**
   * The battle view on screen when replay opened.
   *
   * Contract: The same object, not a copy; replay steps replace `S.tacticalBattleSnapshot` instead of changing it.
   * When to use: Put back on leaving.
   * Expected outcome: The live battle view.
   * Exceptions: None.
   */
  readonly snapshot: typeof S.tacticalBattleSnapshot;
  /**
   * Copies of the queued sub-unit marches.
   *
   * Contract: Each row is copied.
   * When to use: Put back on leaving.
   * Expected outcome: The marches as they were.
   * Exceptions: None.
   */
  readonly marches: typeof S.tacticalPendingMarches;
  /**
   * Copy of the pending ranged attacks.
   *
   * Contract: A new array.
   * When to use: Put back on leaving.
   * Expected outcome: The orders as they were.
   * Exceptions: None.
   */
  readonly rangedAttacks: typeof S.pendingRangedAttacks;
  /**
   * Copy of the pending air strikes.
   *
   * Contract: A new array.
   * When to use: Put back on leaving.
   * Expected outcome: The orders as they were.
   * Exceptions: None.
   */
  readonly airStrikes: typeof S.pendingAirStrikes;
  /**
   * Copy of the pending air drops.
   *
   * Contract: A new array.
   * When to use: Put back on leaving.
   * Expected outcome: The orders as they were.
   * Exceptions: None.
   */
  readonly airDrops: typeof S.pendingAirDrops;
  /**
   * Copy of the pending missile launches.
   *
   * Contract: A new array.
   * When to use: Put back on leaving.
   * Expected outcome: The orders as they were.
   * Exceptions: None.
   */
  readonly missileLaunches: typeof S.pendingMissileLaunches;
  /**
   * Copy of the pending ferry orders.
   *
   * Contract: A new array.
   * When to use: Put back on leaving.
   * Expected outcome: The orders as they were.
   * Exceptions: None.
   */
  readonly ferryOrders: typeof S.pendingFerryOrders;
  /**
   * Copy of the pending embark orders.
   *
   * Contract: A new array.
   * When to use: Put back on leaving.
   * Expected outcome: The orders as they were.
   * Exceptions: None.
   */
  readonly embarkOrders: typeof S.pendingEmbarkOrders;
}

/**
 * Copies the battle's own state.
 *
 * Purpose: Replaying a battle's beats must leave the queued marches and the pending orders as they were.
 * When to use: On entering replay while a battle is open. Entering over the world map stores null instead, so a copy kept by a replay a new match dropped is never put back.
 * Expected outcome: Copies of the battle view, the queued marches, and the pending order lists. The live values stay where they are.
 * Exceptions: None.
 */
export function copyBattleState(): ReplayBattleCopy {
  return {
    snapshot: S.tacticalBattleSnapshot,
    marches: S.tacticalPendingMarches.map((row) => ({ ...row })),
    rangedAttacks: [...S.pendingRangedAttacks],
    airStrikes: [...S.pendingAirStrikes],
    airDrops: [...S.pendingAirDrops],
    missileLaunches: [...S.pendingMissileLaunches],
    ferryOrders: [...S.pendingFerryOrders],
    embarkOrders: [...S.pendingEmbarkOrders],
  };
}
