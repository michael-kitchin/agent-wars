import type { OwnerId } from './seatIds';

/**
 * The owner that opening placement records on a hex.
 *
 * Purpose: Shared by the claim map and the mixed-hex scan so strategic seeding and tactical opening placement use the same side names.
 * When to use: As the value stored for a hex and as the side passed into a claim.
 * Expected outcome: An owner id. Two different owners still cannot share a hex.
 * Exceptions: None.
 */
export type InitialPlacementSide = OwnerId;

/**
 * Records that `placingSide` holds `h3Index` when that hex is empty or already held by the same side.
 *
 * Purpose: Opening placement for a strategic game and for a tactical battle must never put both sides in one hex.
 * When to use: Immediately before committing a starting unit or tactical sub-unit to a hex.
 * Expected outcome: `true` and the map updated when the hex is empty or already this side; `false` and the map unchanged when the other side is already there.
 * Exceptions: None.
 */
export function claimInitialPlacementHex(
  occupiedByHex: Map<string, InitialPlacementSide>,
  h3Index: string,
  placingSide: InitialPlacementSide
): boolean {
  const occupiedBy = occupiedByHex.get(h3Index);
  if (occupiedBy !== undefined && occupiedBy !== placingSide) return false;
  occupiedByHex.set(h3Index, placingSide);
  return true;
}

/**
 * Lists hexes whose opening units include both sides.
 *
 * Purpose: Seeders use this as a backstop after placement so a missed filter cannot start a game with mixed hexes.
 * When to use: After both sides' opening units are known, and in tests of that scan.
 * Expected outcome: Sorted unique hex ids that contain more than one side. Empty when every hex is one side or empty.
 * Exceptions: None.
 */
export function findMixedInitialPlacementHexes(
  units: readonly { h3Index: string; side: InitialPlacementSide }[]
): string[] {
  const sidesByHex = new Map<string, Set<InitialPlacementSide>>();
  for (const unit of units) {
    const sides = sidesByHex.get(unit.h3Index) ?? new Set<InitialPlacementSide>();
    sides.add(unit.side);
    sidesByHex.set(unit.h3Index, sides);
  }
  return [...sidesByHex.entries()]
    .filter(([, sides]) => sides.size > 1)
    .map(([h3Index]) => h3Index)
    .sort((a, b) => a.localeCompare(b));
}
