/**
 * Opening placement of sub-units onto fortified cells.
 *
 * Purpose: The defender's units take fortified core cells before anyone else, and no side stands on another owner's fortification.
 * When to use: `computeTacticalBattleSnapshot`, only when the battle hex has fortified core cells.
 * Expected outcome: Missiles stay first. The defender's other units come next. A battle with no fortified core cell keeps today's order.
 * Exceptions: None.
 */

import { isMissileUnitType } from '../../shared/missileRules';
import { claimInitialPlacementHex, type InitialPlacementSide } from '../../shared/initialPlacementSides';
import type { OwnerId } from '../../shared/seatIds';
import { logTrace } from '../logger';

/**
 * Lists fortified cells that belong to one owner, in the given cell order.
 *
 * Purpose: Defenders are placed onto their own fortified cells before the usual opening order.
 * When to use: After the owner record and the ordered core cells are known.
 * Expected outcome: The subset of `orderedCells` whose record owner is `ownerId`. An absent record yields none.
 * Exceptions: None.
 */
export function fortifiedCellsForOwner(args: {
  readonly orderedCells: readonly string[];
  readonly ownerByH3: Readonly<Record<string, OwnerId>> | undefined;
  readonly ownerId: OwnerId;
}): string[] {
  const cells = args.ownerByH3
    ? args.orderedCells.filter((cell) => args.ownerByH3?.[cell] === args.ownerId)
    : [];
  logTrace('fortifiedCellsForOwner', { ownerId: args.ownerId, cellCount: cells.length });
  return cells;
}

/**
 * Whether a side may be placed on a cell.
 *
 * Purpose: A fortified cell is reserved for its owner, including missiles.
 * When to use: Around the missile and generic passable checks in opening placement.
 * Expected outcome: False when another owner holds the cell. Otherwise the base check.
 * Exceptions: None.
 */
export function placementPassableForSide(args: {
  readonly cell: string;
  readonly placingOwnerId: OwnerId;
  readonly ownerByH3: Readonly<Record<string, OwnerId>> | undefined;
  readonly basePassable: (cell: string) => boolean;
}): boolean {
  const owner = args.ownerByH3?.[args.cell];
  const passable = (owner === undefined || owner === args.placingOwnerId) && args.basePassable(args.cell);
  logTrace('placementPassableForSide', { cell: args.cell, placingOwnerId: args.placingOwnerId, owner: owner ?? null, passable });
  return passable;
}

/**
 * Orders parents so missiles land first and the defender's other units take the remaining forts.
 *
 * Purpose: Missiles already choose cells before other units. Fortified placement keeps that and then prefers the defender.
 * When to use: Only when the defender has at least one fortified core cell. Otherwise keep the caller's order.
 * Expected outcome: Missiles, then `defenderSide`'s other parents, then everyone else. Equal parents keep their incoming order.
 * Exceptions: None.
 */
export function orderParentsForFortifiedPlacement<T extends { readonly player: string; readonly unitType: string }>(
  parents: readonly T[],
  defenderSide: OwnerId
): T[] {
  const missiles = parents.filter((parent) => isMissileUnitType(parent.unitType));
  const defenderRest = parents.filter((parent) => !isMissileUnitType(parent.unitType) && parent.player === defenderSide);
  const others = parents.filter((parent) => !isMissileUnitType(parent.unitType) && parent.player !== defenderSide);
  logTrace('orderParentsForFortifiedPlacement', {
    defenderSide,
    missileCount: missiles.length,
    defenderCount: defenderRest.length,
    otherCount: others.length,
  });
  return [...missiles, ...defenderRest, ...others];
}

/**
 * Claims the first fortified cell the defender may still occupy.
 *
 * Purpose: Each defender sub-unit takes one remaining fortified cell before the usual cursor.
 * When to use: Inside the placement loop for a non-missile defender parent.
 * Expected outcome: The cell, already claimed in `occupiedByHex`, or null when none remain that this side can hold.
 * Exceptions: None.
 */
export function takeFortifiedCellForDefender(args: {
  readonly cells: readonly string[];
  readonly held: ReadonlySet<string>;
  readonly passable: (cell: string) => boolean;
  readonly occupiedByHex: Map<string, InitialPlacementSide>;
  readonly placingSide: InitialPlacementSide;
}): string | null {
  for (const cell of args.cells) {
    if (args.held.has(cell)) continue;
    if (!args.passable(cell)) continue;
    if (!claimInitialPlacementHex(args.occupiedByHex, cell, args.placingSide)) continue;
    logTrace('takeFortifiedCellForDefender', { cell, placingSide: args.placingSide });
    return cell;
  }
  logTrace('takeFortifiedCellForDefender', { cell: null, placingSide: args.placingSide });
  return null;
}
