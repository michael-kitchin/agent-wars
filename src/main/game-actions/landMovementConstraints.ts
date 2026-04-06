export const LAND_UNITS_CANNOT_ENTER_ARCTIC_REASON = 'Land units cannot move to or through arctic hexes.';
export const EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON =
  'Embarked land units cannot receive independent movement orders while at sea.';
export const LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON =
  'Land units cannot move directly from one water or arctic hex to another.';

export interface TerrainMapsByH3 {
  terrainByH3: Map<string, string>;
  terrainKindByH3: Map<string, string>;
}

/**
 * Why this exists:
 *     Provides one canonical land-unit type gate for movement constraints shared by validation and preview.
 * When to use:
 *     Before applying infantry/armor-only movement checks (arctic blocking, embarked-at-sea restrictions).
 * What to expect:
 *     Returns true only for infantry and armor.
 */
export function isLandUnitType(unitType: string): unitType is 'infantry' | 'armor' {
  return unitType === 'infantry' || unitType === 'armor';
}

/**
 * Why this exists:
 *     Applies the shared "land units cannot move to or through arctic" rule across order validation and previews.
 * When to use:
 *     After terrain-kind lookup is available for origin, destination, and optional traversed path cells.
 * What to expect:
 *     Returns a user-facing reason when movement should be rejected; returns null when movement is arctic-safe.
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
 * Why this exists:
 *     Enforces the sealift planning restriction that land units cannot receive direct movement orders between water/arctic hexes.
 * When to use:
 *     Movement validation and planning previews once raw terrain and terrain-kind are known for origin and destination.
 * What to expect:
 *     Returns a user-facing reason only when a land unit attempts (water|arctic)->(water|arctic) movement; returns null otherwise.
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
  const specialHexes = routeH3.filter((h3Index) => isWaterOrArcticHex(h3Index));
  if (specialHexes.length === 0) return null;
  const firstSpecial = specialHexes[0];
  const hasInternalSpecial = specialHexes.some((h3Index) => h3Index !== args.originH3Index && h3Index !== args.destinationH3Index);
  const hasMultipleSpecialHexes = specialHexes.length > 1;
  const hasSingleNonEndpointSpecial =
    specialHexes.length === 1 && firstSpecial !== args.originH3Index && firstSpecial !== args.destinationH3Index;
  if (hasInternalSpecial || hasMultipleSpecialHexes || hasSingleNonEndpointSpecial) {
    return LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON;
  }
  return null;
}

/**
 * Why this exists:
 *     Builds raw-terrain and terrain-kind maps once from snapshot hex rows for movement-rule evaluation.
 * When to use:
 *     Renderer march previews or any read-only flow that already has hex rows in memory.
 * What to expect:
 *     Returns two maps keyed by h3Index; missing terrain kinds are normalized to empty string.
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
 * Why this exists:
 *     Orchestrates all shared land-movement exclusion checks in one deterministic order.
 * When to use:
 *     Movement order validation and hover preview validation for infantry/armor movement attempts.
 * What to expect:
 *     Returns the first blocking reason (embarked-at-sea, then water->water, then arctic); returns null when allowed.
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
  const arcticReason = getArcticMovementBlockReason({
    unitType: args.unitType,
    originH3Index: args.originH3Index,
    destinationH3Index: args.destinationH3Index,
    terrainKindByH3: args.terrainKindByH3,
    terrainByH3: args.terrainByH3,
    traversedH3Indices: args.traversedH3Indices,
  });
  if (arcticReason) return arcticReason;
  return null;
}
