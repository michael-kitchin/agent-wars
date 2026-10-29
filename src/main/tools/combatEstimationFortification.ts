/**
 * How many hits a defender's fortifications absorb before a unit is lost.
 *
 * Purpose: Combat estimates use the same soak the resolution uses, without growing the estimation module.
 * When to use: `executeEstimateCombat`, once per estimate.
 * Expected outcome: A core cell soaks one hit. A strategic hex soaks its fortified count when that player controls it and the hex is explored.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../../shared/ipc/gameStateTypes';
import { isHexExploredInSnapshot } from '../../shared/fortificationSnapshotRules';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { logTrace } from '../logger';

/**
 * The battle fields the soak lookup reads.
 *
 * Purpose: Estimates during a battle need the owner record and the core, not the whole snapshot.
 * When to use: The `battle` argument of the soak helpers.
 * Expected outcome: A structural match for those three snapshot fields.
 * Exceptions: None.
 */
type FortificationSoakBattle = Pick<
  TacticalBattleSnapshot,
  'tacticalFortificationOwnerByH3' | 'coreChildH3Indexes' | 'tacticalChildH3Indexes'
>;

/**
 * How many hits this defender's fortifications absorb at the target.
 *
 * Purpose: Losses and elimination wait until those hits are spent. The hit total itself does not.
 * When to use: When the defending player is already known.
 * Expected outcome: 1 for that player's fortified core cell. The hex's fortified count when that player controls an explored hex. Otherwise 0. A margin cell is 0.
 * Exceptions: None.
 */
export function defenderFortificationSoak(args: {
  readonly state: GameStateSnapshot;
  readonly defendingH3Index: string;
  readonly defendingPlayer: string;
  readonly battle?: FortificationSoakBattle;
}): number {
  if (args.battle) {
    const core = new Set(args.battle.coreChildH3Indexes ?? args.battle.tacticalChildH3Indexes);
    const owned = core.has(args.defendingH3Index)
      && args.battle.tacticalFortificationOwnerByH3?.[args.defendingH3Index] === args.defendingPlayer;
    const soak = owned ? 1 : 0;
    logTrace('combatEstimationFortification defenderFortificationSoak', {
      defendingH3Index: args.defendingH3Index,
      defendingPlayer: args.defendingPlayer,
      battle: true,
      soak,
    });
    return soak;
  }
  const explored = isHexExploredInSnapshot(args.state, args.defendingH3Index);
  const controller = args.state.strategicControl?.find((row) => row.h3Index === args.defendingH3Index)?.controllerPlayerId;
  const fortified = args.state.strategicInfrastructure?.find((row) => row.h3Index === args.defendingH3Index)?.fortifiedCount ?? 0;
  const soak = explored && controller === args.defendingPlayer ? fortified : 0;
  logTrace('combatEstimationFortification defenderFortificationSoak', {
    defendingH3Index: args.defendingH3Index,
    defendingPlayer: args.defendingPlayer,
    battle: false,
    soak,
  });
  return soak;
}

/**
 * The soak to pass into an engagement prediction.
 *
 * Purpose: A hex with no defender units still soaks when an enemy controls it and it is fortified.
 * When to use: Once in `executeEstimateCombat`, before the uncontested shortcut.
 * Expected outcome: The defending unit's soak when a defender is present. Otherwise the enemy controller's soak, which is 0 for the estimator's own hex and for an unexplored hex. Unit losses stay 0 when no defender unit is present.
 * Exceptions: None.
 */
export function defenderSoakForEstimate(args: {
  readonly state: GameStateSnapshot;
  readonly defendingH3Index: string;
  readonly defenderPlayer: string | undefined;
  readonly ownSeatId: string;
  readonly battle?: FortificationSoakBattle;
}): number {
  const cellOwner = args.battle?.tacticalFortificationOwnerByH3?.[args.defendingH3Index];
  const hexOwner = args.state.strategicControl?.find((row) => row.h3Index === args.defendingH3Index)?.controllerPlayerId;
  const defendingPlayer = args.defenderPlayer ?? cellOwner ?? hexOwner ?? undefined;
  if (!defendingPlayer || defendingPlayer === args.ownSeatId) {
    logTrace('combatEstimationFortification defenderSoakForEstimate', {
      defendingH3Index: args.defendingH3Index,
      soak: 0,
    });
    return 0;
  }
  return defenderFortificationSoak({
    state: args.state,
    defendingH3Index: args.defendingH3Index,
    defendingPlayer,
    battle: args.battle,
  });
}
