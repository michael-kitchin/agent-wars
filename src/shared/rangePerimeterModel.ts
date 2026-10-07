/**
 * Pure builders for the hex set whose outer perimeter is drawn during ranged/strike planning.
 */

import { gridDisk } from 'h3-js';
import { AIR_STRIKE_RANGE_HEXES, unitHasTacticalRangedBaseline } from './tacticalRanges';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from './tacticalBattleTypes';
import {
  effectiveTacticalRangedMaxRangeForAttacker,
  tacticalMovementTerrainAnchorH3,
  type TacticalBattleTerrainPick,
} from './tacticalTerrainCombatModifiers';

export type RangePerimeterUnitInput = { readonly h3Index: string; readonly unitType: string };

/**
 * Strategic strategic ranged distance in hex steps. Source of truth for `getRange` in `src/main/combatConstants.ts`.
 *
 * Purpose: One table for renderer perimeters, strategic validation, return fire, DEFEND auto-ranged, and air-strike AA.
 * When to use: Strategic ranged distance only — not tactical `RANGED_RANGE_BY_UNIT_TYPE`.
 * Expected outcome: infantry 0 (melee only), armor 1, naval 2, air 3; `0` for unknown types.
 * Exceptions: None.
 */
export function strategicRangedRangeHexesForUnitType(unitType: string): number {
  const table: Record<string, number> = {
    /**
     * Strategic infantry is melee-only on the strategic map.
     *
     * Purpose: Gates ranged orders, planning-parity return fire, DEFEND auto-ranged, and strategic air-strike AA.
     * When to use: Keep at `0`. Tactical infantry ranged and tactical AA use `RANGED_RANGE_BY_UNIT_TYPE`.
     * Expected outcome: `getRange('infantry') < 1` denies strategic ranged attacks and return fire.
     * Exceptions: None.
     */
    infantry: 0,
    armor: 1,
    naval: 2,
    air: 3,
  };
  return table[unitType] ?? 0;
}

/**
 * Returns whether a unit type can issue strategic direct ranged attacks.
 *
 * Purpose: Keeps the renderer Ranged-mode gate aligned with `getRange` without importing main-process combat constants.
 * When to use: Strategic map UI only — not tactical battles (use `unitHasTacticalRangedBaseline`).
 * Expected outcome: True for armor and naval with current constants; false for infantry (melee only), unknown types, and callers that should treat air as Strike rather than Ranged.
 * Exceptions: Air is `true` in this table because `getRange('air')` is 3; the renderer still routes all-air selections to Strike first.
 */
export function unitHasStrategicRangedBaseline(unitType: string): boolean {
  return strategicRangedRangeHexesForUnitType(unitType) >= 1;
}

/**
 * Returns whether a unit type may enter direct ranged planning for the current theater.
 *
 * Purpose: One predicate for the Ranged button so strategic infantry stay melee-only while tactical infantry keep tactical ranged.
 * When to use: Renderer ranged-mode enable/show paths that already know whether a tactical battle snapshot is active.
 * Expected outcome: Strategic uses `unitHasStrategicRangedBaseline`; tactical uses `unitHasTacticalRangedBaseline`.
 * Exceptions: None.
 */
export function unitHasDirectRangedPlanning(unitType: string, tacticalBattleActive: boolean): boolean {
  return tacticalBattleActive
    ? unitHasTacticalRangedBaseline(unitType)
    : unitHasStrategicRangedBaseline(unitType);
}

/**
 * Unions `gridDisk` around each unit using the strategic ranged range.
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
 * Unions `gridDisk` around each unit using the strategic air-strike range.
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
 * Unions effective tactical ranged disks clipped to the battle footprint (tactical).
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
 * Returns the full tactical footprint for air-strike perimeter (no grid cap).
 *
 * Purpose: Tactical air strikes may target any tactical cell in the parent strategic battle area.
 * When to use: Tactical battle with `airStrikeModeActive`.
 * Expected outcome: Same cells as `footprint`.
 * Exceptions: None.
 */
export function buildTacticalAirStrikeRangeSet(footprint: ReadonlySet<string>): Set<string> {
  return new Set(footprint);
}
