/**
 * Builds a minimal GameStateSnapshot for OpenRouter order validation and plan_route during an active tactical battle.
 */

import { cellToParent } from 'h3-js';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import {
  effectiveRes4TerrainKindString,
  tacticalRes4BriefingLandWater,
} from '../../shared/tacticalTerrainCombatModifiers';
import { tacticalLogQuery } from './tacticalLogging';

/**
 * Projects the active tactical battle into a snapshot shape the AI pathfinding and movement validators understand.
 *
 * Contract: `hexes` contains only `tactical.res4ChildH3Indexes` rows; each row uses that child's res4 kind and land/water class, falling back to the enclosing hex only when the child has no kind.
 * When to use: `requestOrdersFlow` when `tacticalAiBattle` is set so `validateAiOrder` and `plan_route` operate on res4 geometry.
 * Expected outcome: `units` mirror tactical sub-units with the same ids and res4 `h3Index` values; all other fields copy `strategic`.
 * Exceptions: Res4 cells whose parent res1 is missing from `strategic.hexes` default to land/plains-like terrain rows when the battle also lacks a child kind.
 */
export function buildTacticalAiPlanState(
  strategic: GameStateSnapshot,
  tactical: TacticalBattleSnapshot
): GameStateSnapshot {
  tacticalLogQuery('buildTacticalAiPlanState', {
    battleId: tactical.battleId,
    res4Count: tactical.res4ChildH3Indexes.length,
    subUnitCount: tactical.subUnits.length,
  });
  const hexByRes1 = new Map(strategic.hexes.map((h) => [h.h3Index, h]));
  const tacticalHexes = tactical.res4ChildH3Indexes.map((h3) => {
    const parent = cellToParent(h3, 1);
    const base = hexByRes1.get(parent);
    const terrainPick = {
      res4TerrainKindByH3: tactical.res4TerrainKindByH3,
      strategicHexTerrain: tactical.strategicHexTerrain ?? base?.terrain,
      strategicHexTerrainKind: tactical.strategicHexTerrainKind ?? base?.terrainKind,
    };
    return {
      h3Index: h3,
      terrain: tacticalRes4BriefingLandWater(terrainPick, h3),
      terrainKind: effectiveRes4TerrainKindString(terrainPick, h3),
    };
  });
  const byId = new Map(tactical.subUnits.map((u) => [u.id, u] as const));
  const tacticalUnits = tactical.subUnits.map((u) => {
    let h3Index = u.h3Index;
    const embark = u.embarkedOnSubUnitId;
    if (embark) {
      const naval = byId.get(embark);
      if (naval && naval.unitType === 'naval') h3Index = naval.h3Index;
    }
    return {
      id: u.id,
      player: u.player,
      unitType: u.unitType,
      h3Index,
      embarkedOnSubUnitId: u.embarkedOnSubUnitId ?? undefined,
    };
  });
  return {
    ...strategic,
    hexes: tacticalHexes,
    units: tacticalUnits,
    fogOfWarEnabled: false,
    playerPerspective: 'opponent',
  };
}
