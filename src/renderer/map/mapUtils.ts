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
import {
  isNetPanAxesZero,
  panAxisKeyToNetAxes,
  scoreNeighborForPanAxes,
  type PanAxisKey,
} from '../../shared/mapKeyboardPanLogic';

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
 * Returns true when the event target is an editable field that should not keep map pan running.
 *
 * Purpose: Shared focusin clear check matching `shouldIgnoreGlobalKeydown` target rules.
 * When to use: On `focusin` before calling `clearMapKeyboardPan`.
 * Expected outcome: true for input/textarea/select/contentEditable.
 * Exceptions: None.
 */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!target.isContentEditable;
}

/**
 * Picks the res-1 neighbor that best matches signed north/south and east/west pan axes.
 *
 * Purpose: One hex step toward a cardinal or diagonal net vector for hold-to-continue pan.
 * When to use: From `panMapByNetAxes` and as the implementation behind single-axis pan wrappers.
 * Expected outcome: Neighbor h3 with maximum `scoreNeighborForPanAxes`, or null when axes are zero / no neighbors.
 * Exceptions: None (invalid h3 from `gridDisk` is skipped via empty neighbor lists).
 */
export function getNeighborForPanAxes(
  centerH3: string,
  ns: -1 | 0 | 1,
  ew: -1 | 0 | 1
): string | null {
  if (ns === 0 && ew === 0) return null;
  const [centerLat, centerLng] = cellToLatLng(centerH3);
  const neighbors = Array.from(gridDisk(centerH3, 1)).filter((h3) => h3 !== centerH3);
  if (neighbors.length === 0) return null;
  let bestH3: string | null = null;
  let bestScore = -Infinity;
  for (const h3 of neighbors) {
    const [lat, lng] = cellToLatLng(h3);
    const alignedLng = alignLngToReference(lng, centerLng);
    const score = scoreNeighborForPanAxes(lat - centerLat, alignedLng - centerLng, ns, ew);
    if (score > bestScore) {
      bestScore = score;
      bestH3 = h3;
    }
  }
  return bestH3;
}

/**
 * Defines the `getNeighborForPan` function shape (export function getNeighborForPan(centerH3: string, direction: PanDirection): string | null).

 * Purpose: Single-axis wrapper over net-axis neighbor selection (legacy call sites and tests).
 * When to use: When only one cardinal direction is known.
 * Expected outcome: Same neighbor as `getNeighborForPanAxes` with the matching unit vector.
 * Exceptions: None.
 */
export function getNeighborForPan(centerH3: string, direction: PanDirection): string | null {
  const { ns, ew } = panAxisKeyToNetAxes(direction as PanAxisKey);
  return getNeighborForPanAxes(centerH3, ns, ew);
}

/**
 * Pans the main Leaflet map one res-1 hex toward the given net axes.
 *
 * Purpose: View update used by the hold-to-continue keyboard pan controller.
 * When to use: From the renderer pan wire module; no-ops when axes are zero or the map is unavailable.
 * Expected outcome: `setView` on the best neighbor hex center, preserving zoom and lng alignment.
 * Exceptions: None (swallows invalid center→h3 conversion).
 */
export function panMapByNetAxes(ns: -1 | 0 | 1, ew: -1 | 0 | 1): void {
  if (isNetPanAxesZero({ ns, ew })) return;
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
  const neighbor = getNeighborForPanAxes(centerH3, ns, ew);
  if (!neighbor) return;
  const [nextLat, nextLngRaw] = cellToLatLng(neighbor);
  const nextLng = alignLngToReference(nextLngRaw, center.lng);
  map.setView(Lref.latLng(clampLatForWebMercatorDisplay(nextLat), nextLng), map.getZoom());
}

/**
 * Defines the `panMapOneRes1Hex` function shape (export function panMapOneRes1Hex(direction: PanDirection): void).

 * Purpose: Single-axis wrapper over `panMapByNetAxes` for callers that still pass one cardinal.
 * When to use: Prefer `panMapByNetAxes` for hold-to-continue; keep this for one-shot cardinal pan.
 * Expected outcome: Same as `panMapByNetAxes` with the matching unit vector.
 * Exceptions: None.
 */
export function panMapOneRes1Hex(direction: PanDirection): void {
  const { ns, ew } = panAxisKeyToNetAxes(direction as PanAxisKey);
  panMapByNetAxes(ns, ew);
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
    getCenter?: () => { lat: number; lng: number };
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
  const ctr = typeof map.getCenter === 'function' ? map.getCenter() : null;
  if (ctr) {
    S.strategicScenarioInitialLeafletView = { lat: ctr.lat, lng: ctr.lng, zoom: map.getZoom() };
  }
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
