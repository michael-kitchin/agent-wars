/**
 * Documents the module-scope binding `EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON` (EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON).

 * Purpose: Supports maintainability by documenting why `EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/** @deprecated Use `EMBARKED_LAND_UNIT_MOVEMENT_BLOCK_REASON`. */
export const EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON =
  'Embarked land units cannot receive independent movement orders. Debark first.';

/**
 * User-facing reason when an embarked land unit receives an independent movement order.
 *
 * Purpose: Shared validation message for march preview, assign, and Ready filtering.
 * When to use: Return from `getLandMovementBlockReason` when cargo is still assigned to a naval carrier.
 * Expected outcome: Stable string for UI and tests.
 * Exceptions: None.
 */
export const EMBARKED_LAND_UNIT_MOVEMENT_BLOCK_REASON = EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON;

/**
 * Documents the `TerrainMapsByH3` interface as a named contract surface (export interface TerrainMapsByH3).

 * Purpose: Supports maintainability by documenting why `TerrainMapsByH3` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface TerrainMapsByH3 {
    /**
   * Specifies the contract for the `terrainByH3` member (terrainByH3: Map<string, string>;).

   * Contract: Describes stable behavior for callers of `terrainByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainByH3: Map<string, string>;
    /**
   * Specifies the contract for the `terrainKindByH3` member (terrainKindByH3: Map<string, string>;).

   * Contract: Describes stable behavior for callers of `terrainKindByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainKindByH3: Map<string, string>;
}

/**
 * Defines the `isLandUnitType` function shape (export function isLandUnitType(unitType: string): unitType is 'infantry' | 'armor').

 * Purpose: Supports maintainability by documenting why `isLandUnitType` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isLandUnitType(unitType: string): unitType is 'infantry' | 'armor' {
  return unitType === 'infantry' || unitType === 'armor';
}

/**
 * Defines the `buildTerrainMapsFromHexRows` function shape (export function buildTerrainMapsFromHexRows().

 * Purpose: Supports maintainability by documenting why `buildTerrainMapsFromHexRows` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildTerrainMapsFromHexRows(
  hexes: ReadonlyArray<{ h3Index: string; terrain: string; terrainKind?: string | null }>
): TerrainMapsByH3 {
  const terrainByH3 = new Map<string, string>();
  const terrainKindByH3 = new Map<string, string>();
  for (const hex of hexes) {
    terrainByH3.set(hex.h3Index, hex.terrain);
    terrainKindByH3.set(hex.h3Index, hex.terrainKind ?? '');
  }
  return { terrainByH3, terrainKindByH3 };
}

/**
 * Defines the `getLandMovementBlockReason` function shape (export function getLandMovementBlockReason(args:).

 * Purpose: Supports maintainability by documenting why `getLandMovementBlockReason` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getLandMovementBlockReason(args: {
  unitType: string;
  isEmbarked?: boolean;
}): string | null {
  if (isLandUnitType(args.unitType) && args.isEmbarked) {
    return EMBARKED_LAND_UNIT_MOVEMENT_BLOCK_REASON;
  }
  return null;
}
