/**
 * Places each unit on the hex it occupied before this resolution, except units whose own flight is on screen.
 *
 * Purpose: The snapshot after Ready already shows every mover on its destination. Drawing that during the
 * air, ranged, and sight-cue stages makes the unit jump ahead, then snap back when Movement starts.
 * When to use: With the playback's move list and the ids of units in an outbound or return flight.
 *   The same helper serves the world map and a battle.
 * Expected outcome: A new list, in the same order. A mover is copied onto the first move's `fromH3Index`.
 *   An id in `flyingUnitIds`, and any unit with no move, is the same row that was passed in. Inputs are not mutated.
 * Exceptions: None.
 */
export function unitsAtPlaybackOrigins<T extends { readonly id: string; readonly h3Index: string }>(
  units: readonly T[],
  moves: readonly { readonly unitId: string; readonly fromH3Index: string }[],
  flyingUnitIds: ReadonlySet<string>
): T[] {
  const originByUnitId = new Map<string, string>();
  for (const move of moves) {
    if (!originByUnitId.has(move.unitId)) originByUnitId.set(move.unitId, move.fromH3Index);
  }
  return units.map((unit) => {
    if (flyingUnitIds.has(unit.id)) return unit;
    const origin = originByUnitId.get(unit.id);
    if (origin === undefined || origin === unit.h3Index) return unit;
    return { ...unit, h3Index: origin };
  });
}
