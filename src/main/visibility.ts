/**
 * Fog-of-war visibility helpers for Milestone 1.3.
 * Centralizes per-unit vision ranges and pure set computations so DB and renderer logic stay aligned.
 */

import { gridDisk } from 'h3-js';
import type { GameStateSnapshot } from '../shared/ipcTypes';
import { logError, logTrace } from './logger';

/** Locked 1.3 vision ranges (hex radius) by unit type. */
export const VISION_RANGE_BY_UNIT_TYPE: Record<string, number> = {
  infantry: 1,
  armor: 2,
  naval: 2,
  air: 3,
};

/** Locked 1.3 stale-icon opacity by stale age in turns. */
export const STALE_ICON_OPACITY_BY_AGE: Record<number, number> = {
  0: 0.5,
  1: 0.3,
};

/**
 * Computes side-wide visibility by unioning each alive friendly unit's hex disk.
 * Returns only map-contained hexes from `mapHexSet`.
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

