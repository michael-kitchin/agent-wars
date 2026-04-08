/**
 * One-step legal move destinations for AI order validation and prompt precomputation.
 * Mirrors the movement rules used by OpenRouter AI order validation (grid distance + terrain).
 */

import { gridDistance } from 'h3-js';
import type { GameStateSnapshot } from './gameDb';
import { passabilityAllowsLandUnit, passabilityAllowsNavalUnit } from '../shared/pipelineTerrain';
import { MOVEMENT_RANGE_BY_UNIT_TYPE } from '../shared/tacticalRanges';
/**
 * Why this exists:
 *     Matches movement passability rules where seaports make a hex count as coastal for naval/embark context.
 * When to use:
 *     One-step destination filtering alongside `getValidDestinations`.
 * What to expect:
 *     `"coastal"` when seaportCount > 0 for that res-1 hex, otherwise the map hex terrain string.
 */
export function resolveMovementTerrainForHex(
  hex: { h3Index: string; terrain: string } | undefined,
  seaportCountByHex: Map<string, number>
): string {
  if (!hex) return 'land';
  return (seaportCountByHex.get(hex.h3Index) ?? 0) > 0 ? 'coastal' : hex.terrain;
}

/**
 * Why this exists:
 *     Lists legal one-step move targets for a unit using the same grid-distance and terrain rules as AI order validation.
 * When to use:
 *     Prompt precomputation (possible moves) and any path that must stay aligned with `validateAiOrder` movement checks.
 * What to expect:
 *     H3 indices within movement range and passable for the unit domain; includes occupied cells unless filtered by caller.
 */
export function getValidDestinations(
  unit: { h3Index: string; unitType: string },
  state: GameStateSnapshot
): string[] {
  const range = MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 1;
  const wantLand = unit.unitType === 'infantry' || unit.unitType === 'armor';
  const seaportCountByHex = new Map((state.res1Infrastructure ?? []).map((row) => [row.h3Index, row.seaportCount] as const));
  const valid: string[] = [];
  for (const h of state.hexes) {
    if (h.h3Index === unit.h3Index) continue;
    let dist: number;
    try {
      dist = gridDistance(unit.h3Index, h.h3Index);
    } catch {
      continue;
    }
    if (dist < 1 || dist > range) continue;
    const movementTerrain = resolveMovementTerrainForHex(h, seaportCountByHex);
    if (unit.unitType === 'naval' && !passabilityAllowsNavalUnit(movementTerrain)) continue;
    if (wantLand && !passabilityAllowsLandUnit(h.terrain)) continue;
    valid.push(h.h3Index);
  }
  return valid;
}

/**
 * Why this exists:
 *     Same as getValidDestinations but excludes occupied hexes for adjacent-cell fallback prompts.
 * When to use:
 *     OpenRouter fallback movement list when planning tools are disabled.
 * What to expect:
 *     Subset of getValidDestinations with no unit-occupied destination cells.
 */
export function getValidDestinationsUnoccupied(
  unit: { h3Index: string; unitType: string },
  state: GameStateSnapshot
): string[] {
  const occupied = new Set(state.units.map((u) => u.h3Index));
  return getValidDestinations(unit, state).filter((h3) => !occupied.has(h3));
}
