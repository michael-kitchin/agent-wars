/**
 * Pure builders for the hex set whose outer perimeter is drawn during ranged/strike planning.
 */

import { gridDisk } from 'h3-js';
import { AIR_STRIKE_RANGE_HEXES } from './tacticalRanges';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from './tacticalBattleTypes';
import {
  effectiveTacticalRangedMaxRangeForAttacker,
  tacticalMovementTerrainAnchorH3,
  type TacticalBattleTerrainPick,
} from './tacticalTerrainCombatModifiers';

export type RangePerimeterUnitInput = { readonly h3Index: string; readonly unitType: string };

/**
 * Strategic res1 ranged distance in hex steps (mirrors `getRange` in `src/main/combatConstants.ts`).
 *
 * Purpose: Keeps renderer perimeter logic free of main-process imports while staying aligned with validation.
 * When to use: `buildStrategicRangedRangeSet` only.
 * Expected outcome: Same values as `getRange` for known unit types; `0` for unknown types.
 * Exceptions: None.
 */
export function strategicRangedRangeHexesForUnitType(unitType: string): number {
  const table: Record<string, number> = { infantry: 1, armor: 1, naval: 2, air: 3 };
  return table[unitType] ?? 0;
}

/**
 * Unions `gridDisk` around each unit using strategic ranged range (res1).
 *
 * Purpose: Range-only envelope for strategic ranged planning mode.
 * When to use: Strategic map with `rangedModeActive` and selected ground units.
 * Expected outcome: All hexes within any selected unit's ranged disk.
 * Exceptions: None; invalid H3 indices are skipped per `gridDisk` behavior.
 */
export function buildStrategicRangedRangeSet(units: readonly RangePerimeterUnitInput[]): Set<string> {
  const out = new Set<string>();
  for (const u of units) {
    const range = strategicRangedRangeHexesForUnitType(u.unitType);
    if (range < 1) continue;
    try {
      for (const h of gridDisk(u.h3Index, range)) out.add(h);
    } catch {
      // skip unit
    }
  }
  return out;
}

/**
 * Unions `gridDisk` around each unit using strategic air-strike range (res1).
 *
 * Purpose: Range-only envelope for strategic air-strike planning mode.
 * When to use: Strategic map with `airStrikeModeActive` and selected air units.
 * Expected outcome: All hexes within `AIR_STRIKE_RANGE_HEXES` of any selected unit origin.
 * Exceptions: None.
 */
export function buildStrategicAirStrikeRangeSet(units: readonly RangePerimeterUnitInput[]): Set<string> {
  const out = new Set<string>();
  for (const u of units) {
    try {
      for (const h of gridDisk(u.h3Index, AIR_STRIKE_RANGE_HEXES)) out.add(h);
    } catch {
      // skip unit
    }
  }
  return out;
}

/**
 * Unions effective tactical ranged disks clipped to the battle footprint (res4).
 *
 * Purpose: Range-only envelope for tactical ranged planning (terrain caps, no LOS).
 * When to use: Tactical battle with `rangedModeActive` and selected sub-units.
 * Expected outcome: Subset of `footprint` reachable by grid distance under per-unit effective range.
 * Exceptions: None.
 */
export function buildTacticalRangedRangeSet(
  battle: TacticalBattleTerrainPick & Pick<TacticalBattleSnapshot, 'subUnits'>,
  subUnits: readonly Pick<TacticalSubUnitSnapshot, 'id' | 'h3Index' | 'unitType' | 'embarkedOnSubUnitId'>[],
  footprint: ReadonlySet<string>
): Set<string> {
  const out = new Set<string>();
  for (const u of subUnits) {
    const anchor = tacticalMovementTerrainAnchorH3(u, battle.subUnits);
    const range = effectiveTacticalRangedMaxRangeForAttacker(battle, u.unitType, anchor);
    if (range < 1) continue;
    try {
      for (const h of gridDisk(anchor, range)) {
        if (footprint.has(h)) out.add(h);
      }
    } catch {
      // skip unit
    }
  }
  return out;
}

/**
 * Returns the full tactical res4 footprint for air-strike perimeter (no grid cap).
 *
 * Purpose: Tactical air strikes may target any res4 cell in the parent res1 battle area.
 * When to use: Tactical battle with `airStrikeModeActive`.
 * Expected outcome: Same cells as `footprint`.
 * Exceptions: None.
 */
export function buildTacticalAirStrikeRangeSet(footprint: ReadonlySet<string>): Set<string> {
  return new Set(footprint);
}
