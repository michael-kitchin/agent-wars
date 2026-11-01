/**
 * Fog-of-war visibility helpers.
 * Centralizes per-unit vision ranges and pure set computations so DB and renderer logic stay aligned.
 */

import { gridDisk } from 'h3-js';
import { isOnMap } from '../shared/loadedStrategicFootprint';
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
  missile: 0,
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
 * Hexes one unit can see by its own vision.
 *
 * Purpose: Fog and sight cues share one radius lookup, including the fallback when a disk cannot be built.
 * When to use: For each live unit whose vision should count. Missiles have radius 0, so they see only their own hex.
 * Expected outcome: Map hexes inside the unit's disk that are on the loaded footprint. An unknown type throws. A disk error returns the unit's own hex when that hex is on the map.
 * Exceptions: Throws when `unitType` is not in `VISION_RANGE_BY_UNIT_TYPE`.
 */
export function visibleHexesFromUnit(
  unit: { readonly id: string; readonly unitType: string; readonly h3Index: string },
  mapHexSet: ReadonlySet<string>
): string[] {
  logTrace('visibility visibleHexesFromUnit', { unitId: unit.id });
  const radius = VISION_RANGE_BY_UNIT_TYPE[unit.unitType];
  if (typeof radius !== 'number') {
    const err = new Error(`Unsupported unitType for visibility: ${unit.unitType}`);
    logError('visibility visibleHexesFromUnit: unsupported unit type', {
      unitId: unit.id,
      unitType: unit.unitType,
      h3Index: unit.h3Index,
    }, err);
    throw err;
  }
  try {
    return gridDisk(unit.h3Index, radius).filter((h3) => mapHexSet.has(h3) && isOnMap(h3));
  } catch (err) {
    logError('visibility visibleHexesFromUnit: gridDisk failed', {
      unitId: unit.id,
      unitType: unit.unitType,
      h3Index: unit.h3Index,
      radius,
    }, err);
    return mapHexSet.has(unit.h3Index) ? [unit.h3Index] : [];
  }
}

/**
 * Every hex a side's units can see.
 *
 * Purpose: Fog marks those hexes explored. The union drops duplicates when two units see the same hex.
 * When to use: After a snapshot and the set of hexes on the current map are in hand.
 * Expected outcome: Hexes inside any of that side's unit disks. An unknown unit type throws.
 * Exceptions: Throws when one of the side's units has a type that is not in `VISION_RANGE_BY_UNIT_TYPE`.
 */
export function computeVisibleHexesForSide(
  state: GameStateSnapshot,
  playerId: string,
  mapHexSet: Set<string>
): Set<string> {
  logTrace('visibility computeVisibleHexesForSide', { playerId });
  return new Set(
    state.units
      .filter((unit) => unit.player === playerId)
      .flatMap((unit) => visibleHexesFromUnit(unit, mapHexSet))
  );
}

