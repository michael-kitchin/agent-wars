/**
 * Whether one battle cell is terrain a unit cannot enter.
 *
 * Purpose: The march hover names that terrain only when entry itself is refused. A stop the unit may make is not a block.
 * When to use: After a battle march plan finds no route to the hovered cell.
 * Expected outcome: True for an infantry or armor `x`, and for naval water the cell cannot host. False when a terrain-bonus stop is allowed.
 * Exceptions: None. Air is not a terrain mover and is not accepted here.
 */

import type { TacticalBattleSnapshot } from './tacticalBattleTypes';
import { movementEffectSymbolForUnit, type TerrainEffectsInput } from './terrainEffectsForTooltip';
import { isNavalTacticalCellNavigable } from './tacticalTerrainMovement';

/**
 * Battle fields needed to rebuild one cell's terrain-effect input.
 *
 * Purpose: Keeps the predicate off the full snapshot when a test has only the terrain maps.
 * When to use: `terrainEffectsInputForBattleCell`.
 * Expected outcome: The same maps the battle march resolver reads.
 * Exceptions: None.
 */
export type TacticalMarchTerrainCellSource = Pick<
  TacticalBattleSnapshot,
  | 'tacticalTerrainKindByH3'
  | 'strategicHexTerrain'
  | 'strategicHexTerrainKind'
  | 'tacticalIsSeaportByH3'
  | 'tacticalIsUrbanByH3'
  | 'tacticalIsRubbleByH3'
  | 'tacticalRoadSidesByH3'
  | 'tacticalRailSidesByH3'
>;

/**
 * True when any side of a road or rail mask is present.
 *
 * Purpose: Transport is a property of the cell, not of one edge, for the Effects symbol.
 * When to use: While building `TerrainEffectsInput` from a battle cell.
 * Expected outcome: True when any entry is true. False when the mask is missing or all false.
 * Exceptions: None.
 */
function anyTransportSide(sides: readonly boolean[] | undefined): boolean {
  return sides?.some((side) => side) === true;
}

/**
 * Builds the terrain-effect input for one battle cell.
 *
 * Purpose: Entry checks and the Effects line must see the same urban, rubble, road, rail, and seaport flags.
 * When to use: From `tacticalDestinationBlocksMarch`, and from tests of that predicate.
 * Expected outcome: A child kind wins over the enclosing hex. A missing child kind uses the hex kind. Road and rail are true when any side is true.
 * Exceptions: None.
 */
export function terrainEffectsInputForBattleCell(battle: TacticalMarchTerrainCellSource, h3: string): TerrainEffectsInput {
  const terrainKind = battle.tacticalTerrainKindByH3?.[h3] ?? battle.strategicHexTerrainKind ?? '';
  return {
    terrainKind,
    parentTerrain: battle.strategicHexTerrain ?? 'land',
    parentTerrainKind: battle.strategicHexTerrainKind ?? 'plains',
    isUrban: battle.tacticalIsUrbanByH3?.[h3] === true,
    isRubble: battle.tacticalIsRubbleByH3?.[h3] === true,
    isSeaport: battle.tacticalIsSeaportByH3?.[h3] === true,
    hasRoad: anyTransportSide(battle.tacticalRoadSidesByH3?.[h3]),
    hasRail: anyTransportSide(battle.tacticalRailSidesByH3?.[h3]),
  };
}

/**
 * True when this unit cannot enter the cell described by `input`.
 *
 * Purpose: Infantry and armor use the movement symbol. Naval uses navigability, because the Effects line hides a naval block on land.
 * When to use: For a hovered battle cell after the plan has already failed.
 * Expected outcome: False when `allowsTerrainBonusStop` is true. Otherwise true for an infantry or armor `x`, and true for naval when the cell is not navigable.
 * Exceptions: None.
 */
export function tacticalCellBlocksEntry(args: {
  readonly input: TerrainEffectsInput;
  readonly moveType: 'infantry' | 'armor' | 'naval';
  readonly allowsTerrainBonusStop: boolean;
}): boolean {
  if (args.allowsTerrainBonusStop) return false;
  if (args.moveType === 'naval') {
    return !isNavalTacticalCellNavigable({
      resolvedKindForCell: args.input.terrainKind,
      parentTerrain: args.input.parentTerrain,
      parentTerrainKind: args.input.parentTerrainKind,
      isSeaportCell: args.input.isSeaport,
    });
  }
  return movementEffectSymbolForUnit(args.moveType, args.input) === 'x';
}

/**
 * True when the hovered battle cell is terrain this unit cannot enter.
 *
 * Purpose: One call from the march hover, so the reason can name terrain instead of a missing route.
 * When to use: When `planTacticalMarch` cannot reach the hovered cell.
 * Expected outcome: The same answer as `tacticalCellBlocksEntry` for that cell.
 * Exceptions: None.
 */
export function tacticalDestinationBlocksMarch(args: {
  readonly battle: TacticalMarchTerrainCellSource;
  readonly h3: string;
  readonly moveType: 'infantry' | 'armor' | 'naval';
  readonly allowsTerrainBonusStop: boolean;
}): boolean {
  return tacticalCellBlocksEntry({
    input: terrainEffectsInputForBattleCell(args.battle, args.h3),
    moveType: args.moveType,
    allowsTerrainBonusStop: args.allowsTerrainBonusStop,
  });
}
