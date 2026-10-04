/**
 * Terrain cover: how much a target's terrain lowers the attack hit number of fire aimed at it.
 *
 * Purpose: Single source for cover values used by main-process dice, combat estimates, prompt text, and renderer tooltips.
 * When to use: Read cover through `terrainCoverFor` or `tacticalCellTerrainCover`; never copy the table values.
 * Expected outcome: Pure functions and frozen tables with no logging and no database access.
 * Exceptions: None.
 */
import { effectiveRes4TerrainKindString, type TacticalBattleTerrainPick } from './tacticalTerrainCombatModifiers';
import { normalizeDbTerrainKindToTacticalCategory, type TacticalMovementCategory } from './tacticalTerrainMovement';

/**
 * Points of cover subtracted from an attack hit number.
 *
 * Purpose: Keeps cover a closed set so no unexpected value can reach a threshold.
 * When to use: Cover tables, lookups, and `CombatUnit.targetCover`.
 * Expected outcome: `0` for open ground, up to `2` for the densest cover.
 * Exceptions: None.
 */
export type TerrainCover = 0 | 1 | 2;

/**
 * Which cover column a shot reads.
 *
 * Purpose: Ground and naval fire is blocked by more terrain than an air strike from above.
 * When to use: Pick it with `terrainCoverShooterForUnitType` from the firing unit's type.
 * Expected outcome: `'air'` for air strikes, `'surface'` for every other shot.
 * Exceptions: None.
 */
export type TerrainCoverShooter = 'surface' | 'air';

/**
 * Cover against each kind of shooter for one place.
 *
 * Purpose: Lets tooltips show both columns while dice read one.
 * When to use: Table rows and `terrainCoverPairFor` results.
 * Expected outcome: `surface` is never smaller than `air` in the shipped tables.
 * Exceptions: None.
 */
export type TerrainCoverPair = { readonly surface: TerrainCover; readonly air: TerrainCover };

/**
 * What cover reads about the target's place.
 *
 * Purpose: One input shape for strategic hexes (terrain kind only) and battle cells (terrain kind plus urban and rubble flags).
 * When to use: Build directly for a strategic hex, or with `tacticalCellCoverPlace` for a battle cell.
 * Expected outcome: Missing fields read as open ground with no urban or rubble.
 * Exceptions: None.
 */
export type TerrainCoverPlace = {
  readonly terrainKind?: string | null;
  readonly isUrban?: boolean;
  readonly isRubble?: boolean;
};

/**
 * Cover for each normalized terrain category.
 *
 * Purpose: Forest hides targets from every shooter; mountains and wetlands only blunt ground and naval fire.
 * When to use: Only through `terrainCoverPairFor`.
 * Expected outcome: Forests 2/1, mountains 2/0, wetlands 1/0, every other category 0/0 (surface/air).
 * Exceptions: None.
 */
export const TERRAIN_COVER_BY_CATEGORY: Readonly<Record<TacticalMovementCategory, TerrainCoverPair>> = Object.freeze({
  plains: Object.freeze({ surface: 0, air: 0 }),
  forests: Object.freeze({ surface: 2, air: 1 }),
  mountains: Object.freeze({ surface: 2, air: 0 }),
  wetlands: Object.freeze({ surface: 1, air: 0 }),
  desert: Object.freeze({ surface: 0, air: 0 }),
  arctic: Object.freeze({ surface: 0, air: 0 }),
  coastal: Object.freeze({ surface: 0, air: 0 }),
  water: Object.freeze({ surface: 0, air: 0 }),
});

/**
 * Cover from buildings or ruins on a battle cell.
 *
 * Purpose: Urban and rubble cells shelter a target the way forest does.
 * When to use: Only through `terrainCoverPairFor`, which takes the larger value per column against the terrain row.
 * Expected outcome: 2 against ground and naval fire, 1 against air strikes.
 * Exceptions: None.
 */
export const URBAN_OR_RUBBLE_TERRAIN_COVER: TerrainCoverPair = Object.freeze({ surface: 2, air: 1 });

/**
 * Picks the cover column a unit's shots read.
 *
 * Purpose: Air units strike from above; every other unit fires along the ground or sea.
 * When to use: When stamping cover onto an attacker before its roll.
 * Expected outcome: `'air'` for `'air'`, otherwise `'surface'`.
 * Exceptions: None.
 */
export function terrainCoverShooterForUnitType(unitType: string): TerrainCoverShooter {
  return unitType === 'air' ? 'air' : 'surface';
}

/**
 * Returns both cover columns for a place.
 *
 * Purpose: The one place that combines terrain cover with urban and rubble cover.
 * When to use: Tooltips that show both columns, and `terrainCoverFor`.
 * Expected outcome: The category row, raised per column to the urban/rubble row when either flag is set. Unknown or empty kinds read as plains, so they give 0/0.
 * Exceptions: None.
 */
export function terrainCoverPairFor(place: TerrainCoverPlace): TerrainCoverPair {
  const terrain = TERRAIN_COVER_BY_CATEGORY[normalizeDbTerrainKindToTacticalCategory(place.terrainKind ?? '', 'land')];
  if (place.isUrban !== true && place.isRubble !== true) return terrain;
  return {
    surface: Math.max(terrain.surface, URBAN_OR_RUBBLE_TERRAIN_COVER.surface) as TerrainCover,
    air: Math.max(terrain.air, URBAN_OR_RUBBLE_TERRAIN_COVER.air) as TerrainCover,
  };
}

/**
 * Returns the cover one shooter faces at a place.
 *
 * Purpose: The value a roll subtracts from the attacker's hit number.
 * When to use: Cover lookups and estimates.
 * Expected outcome: One column of `terrainCoverPairFor(place)`.
 * Exceptions: None.
 */
export function terrainCoverFor(place: TerrainCoverPlace, shooter: TerrainCoverShooter): TerrainCover {
  return terrainCoverPairFor(place)[shooter];
}

/**
 * Builds the cover place for one battle cell.
 *
 * Purpose: Reads the cell's effective terrain kind and its urban and rubble flags from the battle snapshot.
 * When to use: Battle cover lookups, estimates, and tooltips.
 * Expected outcome: The cell's terrain kind (falling back to the enclosing hex's kind) and its two flags.
 * Exceptions: None.
 */
export function tacticalCellCoverPlace(battle: TacticalBattleTerrainPick, res4H3: string): TerrainCoverPlace {
  return {
    terrainKind: effectiveRes4TerrainKindString(battle, res4H3),
    isUrban: battle.res4IsUrbanByH3?.[res4H3] === true,
    isRubble: battle.res4IsRubbleByH3?.[res4H3] === true,
  };
}

/**
 * Returns the cover one shooter faces at a battle cell.
 *
 * Purpose: Shortcut for battle roll sites that already know the target cell.
 * When to use: Battle air strikes on units and the battle cover lookup.
 * Expected outcome: `terrainCoverFor(tacticalCellCoverPlace(battle, res4H3), shooter)`.
 * Exceptions: None.
 */
export function tacticalCellTerrainCover(
  battle: TacticalBattleTerrainPick,
  res4H3: string,
  shooter: TerrainCoverShooter
): TerrainCover {
  return terrainCoverFor(tacticalCellCoverPlace(battle, res4H3), shooter);
}

/**
 * Names what gives a place its cover.
 *
 * Purpose: Tooltips label the cover source with the same words the slow-terrain tooltip uses, so its swatch helper recognizes them.
 * When to use: Next to a cover amount in a tooltip.
 * Expected outcome: `'Rubble'`, then `'Urban'`, then `'Forest'`, `'Mountain'`, or `'Wetlands'`; null when nothing gives cover.
 * Exceptions: None.
 */
export function terrainCoverSourceLabel(place: TerrainCoverPlace): string | null {
  if (place.isRubble === true) return 'Rubble';
  if (place.isUrban === true) return 'Urban';
  const category = normalizeDbTerrainKindToTacticalCategory(place.terrainKind ?? '', 'land');
  if (category === 'forests') return 'Forest';
  if (category === 'mountains') return 'Mountain';
  if (category === 'wetlands') return 'Wetlands';
  return null;
}

/**
 * Formats a cover pair for a tooltip line.
 *
 * Purpose: One wording for every tooltip that states cover.
 * When to use: After `terrainCoverPairFor`, when the tooltip has room for both columns.
 * Expected outcome: `-2 ground and naval fire, -1 air strikes`, either half alone when the other is 0, or null when both are 0.
 * Exceptions: None.
 */
export function formatTerrainCoverTooltipText(pair: TerrainCoverPair): string | null {
  const parts = [
    ...(pair.surface > 0 ? [`-${pair.surface} ground and naval fire`] : []),
    ...(pair.air > 0 ? [`-${pair.air} air strikes`] : []),
  ];
  return parts.length > 0 ? parts.join(', ') : null;
}
