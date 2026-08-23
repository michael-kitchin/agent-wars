import { computeGridDistanceWithPathFallbackPure } from '../../shared/h3GridRangePure';
import { getRange } from '../combatConstants';
import { logDebug } from '../logger';

/**
 * Minimal indexed snapshot needed to list strategic (res1) ranged target hexes from enemy occupancy.
 *
 * Purpose: Keeps `collectRangedTargetHexes` decoupled from the full `IndexedState` in `possibleUnitActions.ts` while
 * remaining structurally compatible with values produced by `buildIndexedState`.
 * When to use: Only strategic ranged discovery for briefing markdown; tactical paths use `collectTacticalLegalRangedTargetRes4Hexes`.
 * Expected outcome: Callers pass the same `indexed` object they already build for possible-actions tables.
 * Exceptions: None.
 */
export type StrategicRangedTargetHexIndex = {
  enemyUnitsByHex: Map<string, Array<{ unitType: string }>>;
};

/**
 * Lists enemy-occupied res1 hexes within strategic ranged distance of the attacker using `getRange` + H3 `gridDistance`.
 *
 * Purpose: Isolates strategic ranged target discovery from the larger possible-actions builder.
 * When to use: `buildPossibleUnitActionsMarkdown` and strategic `collectAggregatedPossibleActionRows` ranged rows when `tacticalBattle` is absent (enemy-occupied res1 cells only).
 * Expected outcome: Every key of `indexed.enemyUnitsByHex` whose distance falls in `[0, getRange(unitType)]`.
 * Exceptions: None. Distances use the shared BFS fallback, because dropping a pair H3 cannot measure hid legal shots
 * across icosahedron face crossings from the Best Options table the model is told to act on.
 */
export function collectRangedTargetHexes(
  unitH3: string,
  unitType: string,
  indexed: StrategicRangedTargetHexIndex
): string[] {
  logDebug('possibleUnitActionsStrategicRanged collectRangedTargetHexes', {
    unitH3,
    unitType,
    enemyOccupiedHexCount: indexed.enemyUnitsByHex.size,
  });
  const r = getRange(unitType);
  if (r < 1) return [];
  const out = new Set<string>();
  for (const enemyHex of indexed.enemyUnitsByHex.keys()) {
    const d = computeGridDistanceWithPathFallbackPure(unitH3, enemyHex);
    if (d !== null && d >= 0 && d <= r) out.add(enemyHex);
  }
  return [...out];
}
