/**
 * Battle soak for one hit on a fortified core cell.
 *
 * Purpose: A fortified cell saves its owner's sub-unit once, then the flag is gone.
 * When to use: The tactical air and ranged phases. Do not pass these hooks to melee.
 * Expected outcome: `absorbHit` is true only for the controller, on a fortified core cell. There is no siege.
 * Exceptions: Propagates SQLite errors from the cell read and write.
 */

import type { FortificationCombatHooks, FortificationVictim } from '../fortificationCombat';
import { getHexController, isTacticalCellFortified, setTacticalCellFortified } from '../gameDb';
import { logDebug } from '../logger';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';

/**
 * Builds soak hooks for one battle.
 *
 * Purpose: Ranged fire and air strikes share one way of spending a fortified cell.
 * When to use: Once at the start of `applyTacticalAirStrikeThenRangedPhaseOnBattle`.
 * Expected outcome: The controller is read once. A margin cell and an attacker's cell return false. The hooks have no siege members.
 * Exceptions: Propagates SQLite errors.
 */
export function createTacticalFortificationHooks(
  battle: Pick<TacticalBattleSnapshot, 'coreChildH3Indexes' | 'tacticalChildH3Indexes' | 'enclosingStrategicH3Index'>
): FortificationCombatHooks {
  const controller = getHexController(battle.enclosingStrategicH3Index);
  const core = new Set(battle.coreChildH3Indexes ?? battle.tacticalChildH3Indexes);
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
      logDebug('createTacticalFortificationHooks absorbHit', { h3Index: victim.h3Index, player: victim.player });
      return true;
    },
  };
}
