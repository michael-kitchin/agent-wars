/**
 * Builds a minimal GameStateSnapshot for OpenRouter order validation and plan_route during an active tactical battle.
 */

import { strategicParentOf } from '../../shared/h3Resolutions';

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import {
  effectiveTacticalTerrainKindString,
  tacticalBriefingLandWater,
} from '../../shared/tacticalTerrainCombatModifiers';
import { tacticalLogQuery } from './tacticalLogging';

/**
 * Projects the active tactical battle into a snapshot shape the AI pathfinding and movement validators understand.
 *
 * Contract: `hexes` contains only `tactical.tacticalChildH3Indexes` rows; each row uses that child's tactical kind and land/water class, falling back to the enclosing hex only when the child has no kind.
 * When to use: `requestOrdersFlow` when `tacticalAiBattle` is set so `validateAiOrder` and `plan_route` operate on tactical geometry.
 * Expected outcome: `units` mirror tactical sub-units with the same ids and tactical `h3Index` values; all other fields copy `strategic`.
 * Exceptions: Tactical cells whose parent strategic is missing from `strategic.hexes` default to land/plains-like terrain rows when the battle also lacks a child kind.
 */
export function buildTacticalAiPlanState(
  strategic: GameStateSnapshot,
  tactical: TacticalBattleSnapshot
): GameStateSnapshot {
  tacticalLogQuery('buildTacticalAiPlanState', {
    battleId: tactical.battleId,
    tacticalCount: tactical.tacticalChildH3Indexes.length,
    subUnitCount: tactical.subUnits.length,
  });
  const hexByStrategic = new Map(strategic.hexes.map((h) => [h.h3Index, h]));
  const tacticalHexes = tactical.tacticalChildH3Indexes.map((h3) => {
    const parent = strategicParentOf(h3);
    const base = hexByStrategic.get(parent);
    const terrainPick = {
      tacticalTerrainKindByH3: tactical.tacticalTerrainKindByH3,
      strategicHexTerrain: tactical.strategicHexTerrain ?? base?.terrain,
      strategicHexTerrainKind: tactical.strategicHexTerrainKind ?? base?.terrainKind,
    };
    return {
      h3Index: h3,
      terrain: tacticalBriefingLandWater(terrainPick, h3),
      terrainKind: effectiveTacticalTerrainKindString(terrainPick, h3),
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
