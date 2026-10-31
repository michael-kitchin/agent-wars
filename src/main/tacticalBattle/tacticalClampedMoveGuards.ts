/**
 * Gates a shortened tactical AI move when the sub-unit can already shoot.
 */

import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { logTrace } from '../logger';
import { pickClosestEnemyTacticalRangedTargetForSubUnit } from './tacticalRangedTargetResolve';

/**
 * True when a shortened tactical step should be dropped so the sub-unit keeps its shot.
 *
 * Purpose: A destination past this beat's budget is shortened to the first reachable leg. That step is not applied when the sub-unit can already shoot, unless the step enters an enemy cell.
 * When to use: From the tactical branch of `applyParsedRequestOrders`, only when the applied cell differs from the ordered cell. Do not call it from the shared march planner or from human Ready.
 * Expected outcome: False when the applied cell is the ordered cell, the sub-unit is missing, or the applied cell holds another side. Otherwise true when a legal ranged target exists at beat start.
 * Exceptions: None. A missing sub-unit returns false.
 */
export function holdsShooterOnClampedMove(args: {
  battle: TacticalBattleSnapshot;
  subUnitId: string;
  orderedH3: string;
  appliedH3: string;
}): boolean {
  const shooter = args.battle.subUnits.find((unit) => unit.id === args.subUnitId);
  const entersEnemyCell =
    shooter !== undefined &&
    args.battle.subUnits.some((unit) => unit.h3Index === args.appliedH3 && unit.player !== shooter.player);
  const hold =
    args.appliedH3 !== args.orderedH3 &&
    shooter !== undefined &&
    !entersEnemyCell &&
    pickClosestEnemyTacticalRangedTargetForSubUnit(args.battle, args.subUnitId) !== undefined;
  logTrace('tacticalClampedMoveGuards holdsShooterOnClampedMove', {
    subUnitId: args.subUnitId,
    orderedH3: args.orderedH3,
    appliedH3: args.appliedH3,
    hold,
  });
  return hold;
}
