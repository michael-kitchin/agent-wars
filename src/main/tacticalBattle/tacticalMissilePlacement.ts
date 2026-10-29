/**
 * Where a missile sub-unit is allowed to stand when a battle starts.
 *
 * Purpose: A missile is placed on its birth cell, which is urban when it was built and stays valid after that cell becomes rubble.
 * When to use: While placing missile parents in `computeTacticalBattleSnapshot`, before the generic passable test.
 * Expected outcome: The birth cell is tried first. Only urban and rubble cells pass the first test.
 * Exceptions: None.
 */

/**
 * Orders candidate cells so a missile's birth cell is tried first.
 *
 * Purpose: The missile never leaves its birth hex, so that cell is inside the battle core when it was recorded.
 * When to use: For a missile parent, in place of the generic ordered list.
 * Expected outcome: The birth cell first when it is in `coreSet`, then the other ordered cells. Otherwise a copy of `orderedCells`.
 * Exceptions: None.
 */
export function missilePlacementCellOrder(args: {
  readonly birthTacticalH3Index: string | null | undefined;
  readonly coreSet: ReadonlySet<string>;
  readonly orderedCells: readonly string[];
}): string[] {
  const birth = args.birthTacticalH3Index;
  if (!birth || !args.coreSet.has(birth)) return [...args.orderedCells];
  return [birth, ...args.orderedCells.filter((cell) => cell !== birth)];
}

/**
 * Reports whether a cell can hold a missile on the first placement pass.
 *
 * Purpose: The birth cell is urban or rubble. Other terrain is left for the generic fallback.
 * When to use: As the passable test for a missile's first `takeNextOpeningCell` call.
 * Expected outcome: True when `isUrbanOrRubble` says the cell is urban or rubble.
 * Exceptions: None.
 */
export function missilePlacementPassable(args: {
  readonly cell: string;
  readonly isUrbanOrRubble: (cell: string) => boolean;
}): boolean {
  return args.isUrbanOrRubble(args.cell);
}
