/**
 * Battle soak for one hit on a fortified core cell.
 *
 * Purpose: A fortified cell saves its owner's sub-unit once, then the flag is gone.
 * When to use: The tactical air and ranged phases. Do not pass these hooks to melee.
 * Expected outcome: `absorbHit` is true only for the controller, on a fortified core cell. There is no siege.
 * Exceptions: Propagates SQLite errors from the cell read and write.
 */

import type { FortificationReport } from '../../shared/ipc/fortificationTypes';
import type { FortificationCombatHooks, FortificationVictim } from '../fortificationCombat';
import { getHexController, isTacticalCellFortified, setTacticalCellFortified } from '../gameDb';
import { logDebug, logTrace } from '../logger';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';

/**
 * Soak hooks plus the cells that absorbed a hit.
 *
 * Purpose: The beat report can list those cells without a second pass over the battle.
 * When to use: The return of `createTacticalFortificationHooks` only. Do not add this method to `FortificationCombatHooks`.
 * Expected outcome: `absorbHit` matches the combat hooks. `absorbedReports` lists each cell once.
 * Exceptions: None.
 */
export interface TacticalFortificationHooks extends FortificationCombatHooks {
  /**
   * Cells whose fortification absorbed a hit through these hooks.
   *
   * Contract: One report per cell, in the order of the first absorb. `remaining` is 0 because the sentence does not read it.
   * When to use: Once, after air and ranged fire for this beat.
   * Expected outcome: An empty list when nothing was absorbed. A later miss on the same cell does not add a report.
   * Exceptions: None.
   */
  absorbedReports(): FortificationReport[];
}

/**
 * Builds soak hooks for one battle.
 *
 * Purpose: Ranged fire and air strikes share one way of spending a fortified cell.
 * When to use: Once at the start of `applyTacticalAirStrikeThenRangedPhaseOnBattle`.
 * Expected outcome: The controller is read once. A margin cell and an attacker's cell return false. The hooks have no siege members.
 *   `absorbedReports` lists each cell that returned true.
 * Exceptions: Propagates SQLite errors.
 */
export function createTacticalFortificationHooks(
  battle: Pick<TacticalBattleSnapshot, 'coreChildH3Indexes' | 'tacticalChildH3Indexes' | 'enclosingStrategicH3Index'>
): TacticalFortificationHooks {
  const controller = getHexController(battle.enclosingStrategicH3Index);
  const core = new Set(battle.coreChildH3Indexes ?? battle.tacticalChildH3Indexes);
  const absorbed = new Map<string, number>();
  logDebug('createTacticalFortificationHooks', {
    enclosingStrategicH3Index: battle.enclosingStrategicH3Index,
    controller,
    coreCount: core.size,
  });
  return {
    absorbHit(victim: FortificationVictim): boolean {
      if (controller === null || victim.player !== controller) return false;
      if (!core.has(victim.h3Index) || !isTacticalCellFortified(victim.h3Index)) return false;
      setTacticalCellFortified(victim.h3Index, false);
      absorbed.set(victim.h3Index, (absorbed.get(victim.h3Index) ?? 0) + 1);
      logDebug('createTacticalFortificationHooks absorbHit', { h3Index: victim.h3Index, player: victim.player });
      return true;
    },
    absorbedReports(): FortificationReport[] {
      const reports = [...absorbed.entries()].map(([h3Index, lost]) => ({
        h3Index,
        ownerId: controller,
        lost,
        remaining: 0,
      }));
      logTrace('createTacticalFortificationHooks absorbedReports', { count: reports.length });
      return reports;
    },
  };
}
