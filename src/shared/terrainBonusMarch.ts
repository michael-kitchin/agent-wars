/**
 * Pure rules for battle movement under the terrain bonus: which birth terrain a moving unit may stop on.
 *
 * Purpose: One place decides whether a unit may spend the rest of a beat entering a cell of its birth terrain that it
 * could not otherwise enter, so the planner, Best Options, tools, tooltips, and the AI prompt never disagree.
 * When to use: Before planning a battle march, to resolve the category passed as `terrainBonusCategory`.
 * Expected outcome: Deterministic results with no logging and no I/O.
 * Exceptions: None.
 */

import { normalizeOriginTerrainKind } from './originBonusRules';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from './tacticalBattleTypes';
import {
  normalizeDbTerrainKindToTacticalCategory,
  tacticalEnterHexMovementCost,
  type TacticalMovementCategory,
} from './tacticalTerrainMovement';

/**
 * Returns the tactical movement category a unit may stop on through the terrain bonus, or `null`.
 *
 * Purpose: Derives the rule from the printed enter-cost table instead of a list of terrain kinds, so a change to that
 * table changes this rule with it.
 * When to use: Through `terrainBonusMarchCategoryForMover` when a battle and sub-unit are at hand; directly in tests.
 * Expected outcome: `null` when the bonus is off, the birth kind is missing, unknown, or water, or the unit type already
 * enters that category. Naval gets `wetlands` only for a wetlands birth. Infantry and armor get the category only when
 * its printed cost is not finite, so infantry and air always get `null`.
 * Exceptions: None.
 */
export function terrainBonusMarchCategoryFor(input: {
  readonly enabled: boolean;
  readonly unitType: string;
  readonly birthTerrainKind: string | null | undefined;
}): TacticalMovementCategory | null {
  if (!input.enabled) return null;
  const birthKind = normalizeOriginTerrainKind(input.birthTerrainKind);
  if (birthKind === null) return null;
  const category = normalizeDbTerrainKindToTacticalCategory(birthKind, 'land');
  if (category === 'water') return null;
  if (input.unitType === 'naval') return category === 'wetlands' ? category : null;
  if (input.unitType !== 'infantry' && input.unitType !== 'armor') return null;
  return Number.isFinite(tacticalEnterHexMovementCost(input.unitType, category)) ? null : category;
}

/**
 * Resolves the terrain-bonus stop category for one sub-unit marching in a battle.
 *
 * Purpose: Call sites hold a battle and a sub-unit; this keeps the flag check and the embarked-cargo rule in one place.
 * When to use: Every battle march plan, reachability list, tool estimate, and tooltip that knows the moving sub-unit.
 * Expected outcome: `null` unless the battle snapshot carries `terrainBonusEnabled === true` and `moveType` is the
 * unit's own type. Embarked cargo moves as naval, so it gets `null`. A battle saved without the flag reads as off.
 * Exceptions: None.
 */
export function terrainBonusMarchCategoryForMover(
  battle: Pick<TacticalBattleSnapshot, 'terrainBonusEnabled'>,
  mover: Pick<TacticalSubUnitSnapshot, 'unitType' | 'origin'>,
  moveType: string
): TacticalMovementCategory | null {
  if (battle.terrainBonusEnabled !== true || moveType !== mover.unitType) return null;
  return terrainBonusMarchCategoryFor({
    enabled: true,
    unitType: moveType,
    birthTerrainKind: mover.origin?.birthTerrainKind,
  });
}

/**
 * Prompt text that teaches the battle movement rule of the terrain bonus.
 *
 * Purpose: Keeps the wording beside the rule it describes.
 * When to use: Appended to the tactical terrain-bonus clause of the combat paragraph only.
 * Expected outcome: One paragraph of plain sentences; the same at Low and High.
 * Exceptions: None.
 */
export const TERRAIN_BONUS_MOVEMENT_PROMPT_SENTENCE =
  'Terrain bonus movement: an armor unit may enter one cell of its birth terrain kind that it otherwise could not ' +
  'enter, unless that kind is water, and a naval unit born on wetlands may enter one wetlands cell the same way. ' +
  'That entry uses the rest of the beat and the unit stops there; the next beat it may continue normally or make ' +
  'another such entry. Routes, distances, and beat estimates use these entries only when they arrive in fewer beats. ' +
  'Roads, rails, urban cells, rubble, and seaport rules are unchanged, so a road or rail through blocked terrain ' +
  'still allows several cells per beat.';
