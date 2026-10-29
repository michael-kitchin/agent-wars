import type { BuildQueueItemType, BuildUnitType } from './ipcTypes';
import { activeGameMap } from './activeGameMap';
import { FORTIFICATION_COST_INFANTRY_MULTIPLIER, FORTIFICATION_QUEUE_ITEM } from './fortificationRules';

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

/**
 * Returns the production cost of fortifying one intact city cell.
 *
 * Purpose: A fortification costs the same as one infantry unit on the loaded map.
 * When to use: Queue spend, the build popup, and the production prompt.
 * Expected outcome: `infantryCost` times `FORTIFICATION_COST_INFANTRY_MULTIPLIER`.
 * Exceptions: None.
 */
export function fortificationCostPerCell(): number {
  return activeGameMap().rules.infantryCost * FORTIFICATION_COST_INFANTRY_MULTIPLIER;
}

/**
 * Returns the production cost of one queued item on the active map.
 *
 * Purpose: Queue spend and estimates charge a fortification without treating it as a unit.
 * When to use: Keep-building refill, turn estimates, and the production spend loop.
 * Expected outcome: `fortificationCostPerCell` for a fortification. `unitCostFor` for a unit.
 * Exceptions: Throws when `itemType` is not a build-queue item. `unitCostFor` throws for an unknown unit.
 */
export function buildQueueItemCostFor(itemType: BuildQueueItemType): number {
  if (itemType === FORTIFICATION_QUEUE_ITEM) return fortificationCostPerCell();
  return unitCostFor(itemType);
}
