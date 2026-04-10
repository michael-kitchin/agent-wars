/**
 * Documents the module-scope binding `LAND_UNITS_CANNOT_ENTER_ARCTIC_REASON` (LAND_UNITS_CANNOT_ENTER_ARCTIC_REASON).

 * Purpose: Supports maintainability by documenting why `LAND_UNITS_CANNOT_ENTER_ARCTIC_REASON` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const LAND_UNITS_CANNOT_ENTER_ARCTIC_REASON = 'Land units cannot move to or through arctic hexes.';
/**
 * Documents the module-scope binding `EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON` (EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON).

 * Purpose: Supports maintainability by documenting why `EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON =
  'Embarked land units cannot receive independent movement orders while at sea.';
/**
 * Documents the module-scope binding `LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON` (LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON).

 * Purpose: Supports maintainability by documenting why `LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON =
  'Land units cannot move directly from one water or arctic hex to another.';

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
 * Defines the `getArcticMovementBlockReason` function shape (export function getArcticMovementBlockReason(args: { unitType: string; originH3Index: string; destinationH3Index: string; terrainKindByH3: ReadonlyM).

 * Purpose: Supports maintainability by documenting why `getArcticMovementBlockReason` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getArcticMovementBlockReason(args: {
  unitType: string;
  originH3Index: string;
  destinationH3Index: string;
  terrainKindByH3: ReadonlyMap<string, string>;
  terrainByH3?: ReadonlyMap<string, string>;
  traversedH3Indices?: readonly string[];
}): string | null {
  if (!isLandUnitType(args.unitType)) return null;
  const originTerrainKind = args.terrainKindByH3.get(args.originH3Index) ?? '';
  const destinationTerrainKind = args.terrainKindByH3.get(args.destinationH3Index) ?? '';
  const originTerrain = args.terrainByH3?.get(args.originH3Index) ?? '';
  const destinationTerrain = args.terrainByH3?.get(args.destinationH3Index) ?? '';
  if (originTerrainKind === 'arctic' || destinationTerrainKind === 'arctic' || originTerrain === 'arctic' || destinationTerrain === 'arctic') {
    return LAND_UNITS_CANNOT_ENTER_ARCTIC_REASON;
  }
  const traversed = (args.traversedH3Indices ?? []).filter((h3Index): h3Index is string => typeof h3Index === 'string');
  for (const traversedH3Index of traversed) {
    if (traversedH3Index === args.originH3Index || traversedH3Index === args.destinationH3Index) continue;
    const traversedTerrainKind = args.terrainKindByH3.get(traversedH3Index) ?? '';
    const traversedTerrain = args.terrainByH3?.get(traversedH3Index) ?? '';
    if (traversedTerrainKind === 'arctic' || traversedTerrain === 'arctic') {
      return LAND_UNITS_CANNOT_ENTER_ARCTIC_REASON;
    }
  }
  return null;
}

/**
 * Defines the `getLandWaterToWaterMoveBlockReason` function shape (export function getLandWaterToWaterMoveBlockReason(args: { unitType: string; originH3Index: string; destinationH3Index: string; terrainByH3: Readonl).

 * Purpose: Supports maintainability by documenting why `getLandWaterToWaterMoveBlockReason` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getLandWaterToWaterMoveBlockReason(args: {
  unitType: string;
  originH3Index: string;
  destinationH3Index: string;
  terrainByH3: ReadonlyMap<string, string>;
  terrainKindByH3: ReadonlyMap<string, string>;
  traversedH3Indices?: readonly string[];
}): string | null {
  if (!isLandUnitType(args.unitType)) return null;
  const routeH3: string[] = [args.originH3Index];
  const traversed = (args.traversedH3Indices ?? []).filter((h3Index): h3Index is string => typeof h3Index === 'string');
  for (const traversedH3Index of traversed) {
    if (routeH3[routeH3.length - 1] === traversedH3Index) continue;
    routeH3.push(traversedH3Index);
  }
  if (routeH3[routeH3.length - 1] !== args.destinationH3Index) {
    routeH3.push(args.destinationH3Index);
  }
  const isWaterOrArcticHex = (h3Index: string): boolean => {
    const terrain = args.terrainByH3.get(h3Index) ?? '';
    const terrainKind = args.terrainKindByH3.get(h3Index) ?? '';
    return terrain === 'water' || terrain === 'arctic' || terrainKind === 'water' || terrainKind === 'arctic';
  };
  for (let i = 1; i < routeH3.length; i++) {
    const previousHex = routeH3[i - 1]!;
    const currentHex = routeH3[i]!;
    if (isWaterOrArcticHex(previousHex) && isWaterOrArcticHex(currentHex)) {
      return LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON;
    }
  }
  return null;
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
 * Defines the `getLandMovementBlockReason` function shape (export function getLandMovementBlockReason(args: { unitType: string; originH3Index: string; destinationH3Index: string; terrainByH3: ReadonlyMap<str).

 * Purpose: Supports maintainability by documenting why `getLandMovementBlockReason` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getLandMovementBlockReason(args: {
  unitType: string;
  originH3Index: string;
  destinationH3Index: string;
  terrainByH3: ReadonlyMap<string, string>;
  terrainKindByH3: ReadonlyMap<string, string>;
  traversedH3Indices?: readonly string[];
  isEmbarkedAtSea?: boolean;
}): string | null {
  if (isLandUnitType(args.unitType) && args.isEmbarkedAtSea) {
    return EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON;
  }
  const waterToWaterReason = getLandWaterToWaterMoveBlockReason({
    unitType: args.unitType,
    originH3Index: args.originH3Index,
    destinationH3Index: args.destinationH3Index,
    terrainByH3: args.terrainByH3,
    terrainKindByH3: args.terrainKindByH3,
    traversedH3Indices: args.traversedH3Indices,
  });
  if (waterToWaterReason) return waterToWaterReason;
  return null;
}
