import { cellToLatLng, cellToParent, gridDisk, latLngToCell } from 'h3-js';
import { alignLngToReference, clampLatForWebMercatorDisplay } from './hexGrid';
import {
  getMainLeafletMap,
  hexCenterToOverlayPoint,
  hexCenterToOverlayPointWithReferenceLng,
  type GlobalLeafletFactory,
} from './worldLeafletMap';
import { DETAIL_H3_RESOLUTION, INITIAL_CAMERA_ZOOM_IN_LEVELS, WORLD_H3_RESOLUTION } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import type { PanDirection } from '../core/types';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';

/**
 * Defines the `shouldIgnoreGlobalKeydown` function shape (export function shouldIgnoreGlobalKeydown(e: KeyboardEvent): boolean).

 * Purpose: Supports maintainability by documenting why `shouldIgnoreGlobalKeydown` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function shouldIgnoreGlobalKeydown(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!target.isContentEditable;
}

/**
 * Defines the `getNeighborForPan` function shape (export function getNeighborForPan(centerH3: string, direction: PanDirection): string | null).

 * Purpose: Supports maintainability by documenting why `getNeighborForPan` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getNeighborForPan(centerH3: string, direction: PanDirection): string | null {
  const [centerLat, centerLng] = cellToLatLng(centerH3);
  const neighbors = Array.from(gridDisk(centerH3, 1)).filter((h3) => h3 !== centerH3);
  if (neighbors.length === 0) return null;
  let bestH3: string | null = null;
  let bestScore = direction === 'north' || direction === 'east' ? -Infinity : Infinity;
  for (const h3 of neighbors) {
    const [lat, lng] = cellToLatLng(h3);
    const alignedLng = alignLngToReference(lng, centerLng);
    const deltaLng = alignedLng - centerLng;
    const deltaLat = lat - centerLat;
    const score =
      direction === 'north'
        ? deltaLat
        : direction === 'south'
          ? deltaLat
          : direction === 'east'
            ? deltaLng
            : deltaLng;
    if (direction === 'north' || direction === 'east') {
      if (score > bestScore) {
        bestScore = score;
        bestH3 = h3;
      }
    } else if (score < bestScore) {
      bestScore = score;
      bestH3 = h3;
    }
  }
  return bestH3;
}

/**
 * Defines the `panMapOneRes1Hex` function shape (export function panMapOneRes1Hex(direction: PanDirection): void).

 * Purpose: Supports maintainability by documenting why `panMapOneRes1Hex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function panMapOneRes1Hex(direction: PanDirection): void {
  const map = getMainLeafletMap() as {
    getCenter: () => { lat: number; lng: number };
    setView: (center: unknown, zoom: number) => unknown;
    getZoom: () => number;
  } | null;
  const Lref = (globalThis as unknown as { L?: { latLng: (lat: number, lng: number) => unknown } }).L;
  if (!map || !Lref) return;
  const center = map.getCenter();
  let centerH3: string;
  try {
    centerH3 = latLngToCell(center.lat, center.lng, WORLD_H3_RESOLUTION);
  } catch {
    return;
  }
  const neighbor = getNeighborForPan(centerH3, direction);
  if (!neighbor) return;
  const [nextLat, nextLngRaw] = cellToLatLng(neighbor);
  const nextLng = alignLngToReference(nextLngRaw, center.lng);
  map.setView(Lref.latLng(clampLatForWebMercatorDisplay(nextLat), nextLng), map.getZoom());
}

/**
 * Defines the `applyInitialCameraForState` function shape (export function applyInitialCameraForState(state: GameStateSnapshot): void).

 * Purpose: Supports maintainability by documenting why `applyInitialCameraForState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function applyInitialCameraForState(state: GameStateSnapshot): void {
  const map = getMainLeafletMap() as {
    getZoom: () => number;
    getMaxZoom?: () => number;
    setView: (center: unknown, zoom: number) => unknown;
  } | null;
  const Lref = (globalThis as unknown as { L?: { latLng: (lat: number, lng: number) => unknown } }).L;
  if (!map || !Lref) return;

  const humanGround = state.units.filter(
    (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
  );
  const anchors = humanGround.length > 0 ? humanGround : state.units.filter((u) => u.player === 'human');
  if (anchors.length === 0) return;

  const [, anchorLng] = cellToLatLng(anchors[0]!.h3Index);
  let latSum = 0;
  let lngSum = 0;
  for (const unit of anchors) {
    const [lat, lng] = cellToLatLng(unit.h3Index);
    latSum += lat;
    lngSum += alignLngToReference(lng, anchorLng);
  }
  const centerLat = latSum / anchors.length;
  const centerLng = lngSum / anchors.length;
  const maxZoom = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : 12;
  const targetZoom = Math.min(maxZoom, map.getZoom() + INITIAL_CAMERA_ZOOM_IN_LEVELS);
  map.setView(Lref.latLng(clampLatForWebMercatorDisplay(centerLat), centerLng), targetZoom);
  S.initialCameraApplied = true;
}

/**
 * Defines the `getLeafletGlobal` function shape (export function getLeafletGlobal(): GlobalLeafletFactory | undefined).

 * Purpose: Supports maintainability by documenting why `getLeafletGlobal` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getLeafletGlobal(): GlobalLeafletFactory | undefined {
  return (globalThis as unknown as { L?: GlobalLeafletFactory }).L;
}

/**
 * Defines the `hexCenterPx` function shape (export function hexCenterPx(h3Index: string):).

 * Purpose: Supports maintainability by documenting why `hexCenterPx` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function hexCenterPx(h3Index: string): { x: number; y: number } {
  return hexCenterToOverlayPoint(h3Index, cellToLatLng);
}

/**
 * Defines the `hexCenterPxRelativeTo` function shape (export function hexCenterPxRelativeTo(fromH3Index: string, toH3Index: string):).

 * Purpose: Supports maintainability by documenting why `hexCenterPxRelativeTo` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function hexCenterPxRelativeTo(fromH3Index: string, toH3Index: string): { x: number; y: number } {
  const [, refLng] = cellToLatLng(fromH3Index);
  return hexCenterToOverlayPointWithReferenceLng(toH3Index, refLng, cellToLatLng);
}

/**
 * Defines the `hitTestHexAtContainerPixel` function shape (export function hitTestHexAtContainerPixel(x: number, y: number, mapHexSet: Set<string>): string | null).

 * Purpose: Supports maintainability by documenting why `hitTestHexAtContainerPixel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function hitTestHexAtContainerPixel(x: number, y: number, mapHexSet: Set<string>): string | null {
  const map = getMainLeafletMap() as
    | { containerPointToLatLng: (pt: unknown) => { lat: number; lng: number } }
    | null;
  if (!map) return null;
  const L = getLeafletGlobal();
  const latlng = map.containerPointToLatLng(L.point(x, y));
  let cell: string;
  try {
    cell = latLngToCell(latlng.lat, latlng.lng, WORLD_H3_RESOLUTION);
  } catch {
    return null;
  }
  if (mapHexSet.has(cell)) return cell;
  try {
    const detailCell = latLngToCell(latlng.lat, latlng.lng, DETAIL_H3_RESOLUTION);
    const parent = cellToParent(detailCell, WORLD_H3_RESOLUTION);
    return mapHexSet.has(parent) ? parent : null;
  } catch {
    return null;
  }
}

/**
 * Resolves a main-map container pixel to a res4 tactical cell in the active battle footprint (or its enclosing res1).
 *
 * Purpose: `hitTestHexAtContainerPixel` maps res4 clicks onto strategic res1 parents using `gameState.hexes`, but tactical
 * sub-units use res4 `h3Index` values; without this helper, `drawnAtHit` stays empty and human unit clicks no-op.
 * When to use: While `tacticalBattleSnapshot` is non-null for click hit-testing and hover cursor hints over tactical units.
 * Expected outcome: Returns a res4 id from `res4ChildH3Indexes` when the pointer snaps inside that cell; may return
 * `enclosingRes1H3Index` when the pointer resolves to that res1 cell; null when outside the tactical footprint.
 * Exceptions: `latLngToCell` failures return null.
 */
export function hitTestTacticalRes4HexAtContainerPixel(
  x: number,
  y: number,
  tactical: TacticalBattleSnapshot
): string | null {
  const map = getMainLeafletMap() as
    | { containerPointToLatLng: (pt: unknown) => { lat: number; lng: number } }
    | null;
  if (!map) return null;
  const L = getLeafletGlobal();
  if (!L) return null;
  const latlng = map.containerPointToLatLng(L.point(x, y));
  let res4: string;
  try {
    res4 = latLngToCell(latlng.lat, latlng.lng, DETAIL_H3_RESOLUTION);
  } catch {
    return null;
  }
  if (tactical.res4ChildH3Indexes.includes(res4)) return res4;
  try {
    const res1 = latLngToCell(latlng.lat, latlng.lng, WORLD_H3_RESOLUTION);
    if (res1 === tactical.enclosingRes1H3Index) return tactical.enclosingRes1H3Index;
  } catch {
    return null;
  }
  return null;
}
