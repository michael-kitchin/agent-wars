/**
 * Cells a battle unit may not enter because another side fortified them.
 *
 * Purpose: March, hover, ferry, and AI routes share one block.
 * When to use: Whenever a path is planned inside a battle footprint.
 * Expected outcome: With no owner record, the march set is the whole footprint.
 * Exceptions: None.
 */

import type { TacticalBattleSnapshot } from './tacticalBattleTypes';

/**
 * Whether another side's fortification blocks this mover from the cell.
 *
 * Purpose: The owner may stand on and leave the cell. Everyone else may not enter it.
 * When to use: Before planning a march or ferry to `cell`.
 * Expected outcome: True when the record names an owner and that owner is not `moverPlayer`.
 * Exceptions: None.
 */
export function isCellBlockedByFortification(
  battle: Pick<TacticalBattleSnapshot, 'tacticalFortificationOwnerByH3'>,
  cell: string,
  moverPlayer: string
): boolean {
  const owner = battle.tacticalFortificationOwnerByH3?.[cell];
  return owner !== undefined && owner !== moverPlayer;
}

/**
 * The footprint cells this mover may path through.
 *
 * Purpose: Planners treat a blocked cell as outside the map, except the mover's current cell.
 * When to use: In place of the full footprint set when a unit marches, ferries, or is previewed.
 * Expected outcome: Every footprint cell that is not blocked, plus `originH3` when it was given.
 * Exceptions: None.
 */
export function tacticalMarchSetForMover(args: {
  readonly battle: Pick<TacticalBattleSnapshot, 'tacticalChildH3Indexes' | 'tacticalFortificationOwnerByH3'>;
  readonly moverPlayer: string;
  readonly originH3?: string;
}): Set<string> {
  const cells = new Set(
    args.battle.tacticalChildH3Indexes.filter(
      (cell) => !isCellBlockedByFortification(args.battle, cell, args.moverPlayer)
    )
  );
  if (args.originH3) cells.add(args.originH3);
  return cells;
}
