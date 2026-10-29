import type { BuildUnitType } from './ipcTypes';
import { activeGameMap } from './activeGameMap';

/**
 * Returns the purchase cost of one unit on the active map.
 *
 * Purpose: Production, refill, and prompt sentences share one lookup.
 * When to use: Any spend or cost sentence. Tests that want the global column can keep reading `UNIT_COST_BY_TYPE`.
 * Expected outcome: A positive integer from the active profile.
 * Exceptions: Throws when `unitType` is not a build type.
 */
export function unitCostFor(unitType: BuildUnitType): number {
  const rules = activeGameMap().rules;
  switch (unitType) {
    case 'infantry':
      return rules.infantryCost;
    case 'armor':
      return rules.armorCost;
    case 'naval':
      return rules.navalCost;
    case 'air':
      return rules.airCost;
    case 'missile':
      return rules.missileCost;
    default: {
      const unexpected: never = unitType;
      throw new Error(`Unknown unit type ${String(unexpected)}`);
    }
  }
}

/**
 * Returns the urban-cell count required before a type can be built.
 *
 * Purpose: Armor, air, and naval gates change with the map. Infantry stays at one cell on every map.
 * When to use: `getAvailableBuildUnitTypes` and the build-cost prompt. Airport and seaport checks stay separate.
 * Expected outcome: 1 for infantry. The active profile's minimum otherwise.
 * Exceptions: Throws when `unitType` is not a build type.
 */
export function buildMinimumUrbanCells(unitType: BuildUnitType): number {
  const rules = activeGameMap().rules;
  switch (unitType) {
    case 'infantry':
      return 1;
    case 'armor':
      return rules.armorMinUrbanCells;
    case 'air':
      return rules.airMinUrbanCells;
    case 'naval':
      return rules.navalMinUrbanCells;
    case 'missile':
      return rules.advancedMinUrbanCells;
    default: {
      const unexpected: never = unitType;
      throw new Error(`Unknown unit type ${String(unexpected)}`);
    }
  }
}

/**
 * Returns the urban-cell count that makes a birth hex Advanced.
 *
 * Purpose: Prompts and `techLevelFromUrbanHexCount` follow the loaded map.
 * When to use: Tech classification and the Advanced sentence.
 * Expected outcome: 21 on the global map. The catalog threshold on a regional map.
 * Exceptions: None.
 */
export function advancedTechMinUrbanCells(): number {
  return activeGameMap().rules.advancedMinUrbanCells;
}

/**
 * Returns the missile launch range of the loaded map, in hex steps.
 *
 * Purpose: Launch checks and the briefing share the manifest value. Membership in `gridDisk` is the only range test.
 * When to use: Validation, reach sets, and prompt sentences. The disk includes the launch hex.
 * Expected outcome: 12 on the global map. The catalog range on a regional map.
 * Exceptions: None.
 */
export function missileRangeHexes(): number {
  return activeGameMap().rules.missileRangeHexes;
}

/**
 * Returns how many urban cells one strategic air strike removes.
 *
 * Purpose: The global cap is 9. A regional map uses its catalog count.
 * When to use: The strategic branch of infrastructure destruction. A tactical strike still removes one named cell.
 * Expected outcome: A positive integer from the active profile.
 * Exceptions: None.
 */
export function strategicUrbanCellsDestroyedPerHit(): number {
  return activeGameMap().rules.strategicStrikeUrbanCells;
}
