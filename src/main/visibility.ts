/**
 * Fog-of-war visibility helpers for Milestone 1.3.
 * Centralizes per-unit vision ranges and pure set computations so DB and renderer logic stay aligned.
 */

import { gridDisk } from 'h3-js';
import type { GameStateSnapshot } from '../shared/ipcTypes';
import { logError, logTrace } from './logger';

/**
 * Documents the module-scope binding `VISION_RANGE_BY_UNIT_TYPE` (VISION_RANGE_BY_UNIT_TYPE: Record<string, number>).

 * Purpose: Supports maintainability by documenting why `VISION_RANGE_BY_UNIT_TYPE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const VISION_RANGE_BY_UNIT_TYPE: Record<string, number> = {
    /**
   * Documents the object literal property `infantry` (infantry: 1).

   * Purpose: Supports maintainability by documenting why `infantry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infantry: 1,
    /**
   * Documents the object literal property `armor` (armor: 2).

   * Purpose: Supports maintainability by documenting why `armor` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
armor: 2,
    /**
   * Documents the object literal property `naval` (naval: 2).

   * Purpose: Supports maintainability by documenting why `naval` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
naval: 2,
    /**
   * Documents the object literal property `air` (air: 3).

   * Purpose: Supports maintainability by documenting why `air` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
air: 3,
};

/**
 * Documents the module-scope binding `STALE_ICON_OPACITY_BY_AGE` (STALE_ICON_OPACITY_BY_AGE: Record<number, number>).

 * Purpose: Supports maintainability by documenting why `STALE_ICON_OPACITY_BY_AGE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const STALE_ICON_OPACITY_BY_AGE: Record<number, number> = {
  0: 0.5,
  1: 0.3,
};

/**
 * Defines the `computeVisibleHexesForSide` function shape (export function computeVisibleHexesForSide().

 * Purpose: Supports maintainability by documenting why `computeVisibleHexesForSide` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function computeVisibleHexesForSide(
  state: GameStateSnapshot,
  playerId: string,
  mapHexSet: Set<string>
): Set<string> {
  logTrace('visibility computeVisibleHexesForSide', { playerId });
  const visible = new Set<string>();
  const units = state.units.filter((u) => u.player === playerId);
  for (const unit of units) {
    const radius = VISION_RANGE_BY_UNIT_TYPE[unit.unitType];
    if (typeof radius !== 'number') {
      const err = new Error(`Unsupported unitType for visibility: ${unit.unitType}`);
      logError('visibility computeVisibleHexesForSide: unsupported unit type', {
        unitId: unit.id,
        unitType: unit.unitType,
        h3Index: unit.h3Index,
      }, err);
      throw err;
    }
    try {
      const disk = gridDisk(unit.h3Index, radius);
      for (const h3 of disk) {
        if (mapHexSet.has(h3)) visible.add(h3);
      }
    } catch (err) {
      // Keep visibility robust even if one origin cell errors.
      logError('visibility computeVisibleHexesForSide: gridDisk failed', {
        unitId: unit.id,
        unitType: unit.unitType,
        h3Index: unit.h3Index,
        radius,
      }, err);
      if (mapHexSet.has(unit.h3Index)) visible.add(unit.h3Index);
    }
  }
  return visible;
}

