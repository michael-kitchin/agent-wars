import { observeModeControls } from '../../shared/observeModeControls';
import { shouldApplyAutomaticBattleFrame, type LatLngFrameBox } from '../../shared/unitFrameBox';
import { getHexBoundaryLatLngForLeafletOverlay, WEB_MERCATOR_MAX_ABS_LAT } from './hexGrid';
import { matchMapExtentTarget } from './mainMapCameraReturn';
import { enterBattleLongitudeFrame, exitBattleLongitudeFrame, restoreLoadedMapExtent } from './mapExtent';
import { getLeafletGlobal } from './mapHelpers';
import { getMainLeafletMap } from './worldLeafletMap';
import { rendererSharedState as S } from '../core/state';
import { hidePlanningChromeToasts } from '../openRouter/openRouterUiHelpers';
import { clearAutomaticBattleFrameMemory, frameAutomaticBattleUnits } from './unitFrameCamera';

type LeafletMapLike = {
  getMinZoom?: () => number;
  getMaxZoom?: () => number;
  getZoom?: () => number;
  setView?: (center: unknown, zoom: number) => void;
  setMinZoom?: (z: number) => void;
  setMaxZoom?: (z: number) => void;
  setMaxBounds?: (b: unknown) => void;
  getBounds?: () => { getSouthWest: () => { lat: number; lng: number }; getNorthEast: () => { lat: number; lng: number } };
  fitBounds?: (b: unknown, opts?: { padding?: number[]; animate?: boolean }) => void;
  flyToBounds?: (
    b: unknown,
    opts?: { padding?: number[]; duration?: number; maxZoom?: number; animate?: boolean }
  ) => void;
  once?: (event: string, fn: () => void) => unknown;
};

/**
 * Corners of the battle area, including the same pad the tactical camera already uses.
 *
 * Purpose: Automatic and ordinary battles share one footprint, so pan limits and the unit-frame clamp match.
 * When to use: Before fitting a battle, and when a later beat frames units inside that area. The battle longitude
 *   frame must already be set, so a footprint that crosses 180° measures as one span.
 * Expected outcome: South, west, north, and east in degrees, in the battle's longitude frame. Null when no cell has a
 *   corner.
 * Exceptions: None.
 */
export function tacticalBattleAreaFrameBox(childTacticalH3Indexes: readonly string[]): LatLngFrameBox | null {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const h3 of childTacticalH3Indexes) {
    const boundary = getHexBoundaryLatLngForLeafletOverlay(h3);
    for (const [lat, lng] of boundary) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  if (minLat > maxLat) return null;
  const padLat = Math.max(0.0005, (maxLat - minLat) * 0.08);
  const padLng = Math.max(0.0005, (maxLng - minLng) * 0.08);
  return {
    south: Math.max(-WEB_MERCATOR_MAX_ABS_LAT, minLat - padLat),
    west: minLng - padLng,
    north: Math.min(WEB_MERCATOR_MAX_ABS_LAT, maxLat + padLat),
    east: maxLng + padLng,
  };
}

/**
 * True when this battle should open on the unit frame instead of flying to the whole footprint.
 *
 * Purpose: Only an observing auto-advance battle uses that tighter camera.
 * When to use: `enterTacticalMapView`, before choosing the fly.
 * Expected outcome: False for a human battle, a semi-automatic battle, playback, and a battle that has already ended.
 * Exceptions: None.
 */
function automaticBattleEntry(): boolean {
  const snap = S.tacticalBattleSnapshot;
  const state = S.gameState;
  if (!snap || !state || snap.aiOnlyEndReason != null) return false;
  return shouldApplyAutomaticBattleFrame({
    observing: observeModeControls(state.seats ?? []).observing,
    autoAdvance: S.autoAdvance,
    inBattle: true,
    playbackRunning: S.resolutionMoveAnimation != null,
    tacticalTurnNumber: snap.tacticalTurnNumber,
    framedBeatNumber: null,
  });
}

/**
 * Frames the open automatic battle on its living units, inside the battle area.
 *
 * Purpose: A beat's playback and turning auto-advance on share the entry camera's later fit.
 * When to use: After playback finishes, and when auto-advance turns on during a battle.
 * Expected outcome: The unit frame moves. Pan limits and minimum zoom stay as the entry left them. An ended battle does nothing.
 * Exceptions: None. A missing footprint leaves the camera where it is.
 */
export function frameOpenAutomaticBattle(): void {
  const snap = S.tacticalBattleSnapshot;
  if (!snap || snap.aiOnlyEndReason != null) return;
  const limit = tacticalBattleAreaFrameBox(snap.tacticalChildH3Indexes);
  if (!limit) return;
  frameAutomaticBattleUnits(limit);
}

/**
 * Tightens Leaflet pan/zoom limits to the tactical footprint and animates a zoomed-in view.
 *
 * Purpose: Frames the tactical battle area when entering tactical mode from strategic.
 * When to use: After a tactical battle session starts and child tactical indexes are known.
 * Expected outcome: Battle drawing moves to the footprint's longitude frame. Map flies/fits to the tactical bounds,
 * min/max zoom are adjusted, and planning chrome toasts are dismissed once at entry (hide only; later shows still work).
 * Exceptions: The camera steps no-op when the Leaflet map, global, fitBounds, or bounds are unavailable.
 */
export function enterTacticalMapView(childTacticalH3Indexes: string[]): void {
  enterBattleLongitudeFrame(childTacticalH3Indexes, matchMapExtentTarget());
  const map = getMainLeafletMap() as LeafletMapLike | null;
  const L = getLeafletGlobal() as
    | {
        latLngBounds: (sw: { lat: number; lng: number }, ne: { lat: number; lng: number }) => unknown;
        latLng: (lat: number, lng: number) => unknown;
      }
    | null;
  if (!map || !L || typeof map.fitBounds !== 'function') return;

  const area = tacticalBattleAreaFrameBox(childTacticalH3Indexes);
  if (!area) return;
  const sw = { lat: area.south, lng: area.west };
  const ne = { lat: area.north, lng: area.east };
  const tacticalBounds = L.latLngBounds(L.latLng(sw.lat, sw.lng), L.latLng(ne.lat, ne.lng));
  hidePlanningChromeToasts();

  if (S.preTacticalLeafletMinZoom == null && typeof map.getMinZoom === 'function') {
    S.preTacticalLeafletMinZoom = map.getMinZoom();
  }
  if (S.preTacticalLeafletMaxZoom == null && typeof map.getMaxZoom === 'function') {
    S.preTacticalLeafletMaxZoom = map.getMaxZoom();
  }
  /** Midpoint between the prior closer cap (14) and the last bump (15). */
  const tacticalFlyMaxZoom = 14.5;
  const tacticalAbsoluteMaxZoom = 16;
  if (typeof map.setMaxZoom === 'function') map.setMaxZoom(tacticalAbsoluteMaxZoom);

  if (automaticBattleEntry()) {
    clearAutomaticBattleFrameMemory();
    map.fitBounds(tacticalBounds, { padding: [20, 20], animate: false });
    if (typeof map.getZoom === 'function' && typeof map.setMinZoom === 'function') {
      map.setMinZoom(map.getZoom());
    }
    if (typeof map.setMaxBounds === 'function') map.setMaxBounds(tacticalBounds);
    frameAutomaticBattleUnits(area);
    return;
  }

  /**
   * Applies tight pan limits and locks min zoom to the zoom level after fitting the tactical footprint.
   * When to use: After `flyToBounds` / `fitBounds` has settled (timer for fly, `moveend` for fit fallback).
   */
  const finalizeTacticalViewZoomAndPan = (): void => {
    if (typeof map.setMaxBounds === 'function') map.setMaxBounds(tacticalBounds);
    if (typeof map.getZoom === 'function' && typeof map.setMinZoom === 'function') {
      map.setMinZoom(map.getZoom());
    }
  };

  if (typeof map.flyToBounds === 'function') {
    map.flyToBounds(tacticalBounds, { padding: [20, 20], duration: 0.55, maxZoom: tacticalFlyMaxZoom });
    // Timed finalize: `moveend` is unreliable here (e.g. `setMaxBounds` elsewhere can pre-empt, and this map
    // uses `zoomAnimation: false`, so fly completion sequencing varies).
    setTimeout(finalizeTacticalViewZoomAndPan, 750);
  } else {
    map.fitBounds?.(tacticalBounds, { padding: [20, 20], animate: true });
    if (typeof map.once === 'function') {
      map.once('moveend', finalizeTacticalViewZoomAndPan);
    } else {
      setTimeout(finalizeTacticalViewZoomAndPan, 200);
    }
  }
}

/**
 * Restores the strategic longitude frame and Leaflet pan/zoom limits after tactical mode ends.
 *
 * Purpose: Strategic drawing and the camera return to the loaded map after a battle.
 * When to use: From every path that clears the battle snapshot.
 * Expected outcome: Battle drawing leaves the battle's longitude frame even without a map. With a map, the loaded
 *   extent, the saved zoom limits, and the strategic view return.
 * Exceptions: None.
 */
export function exitTacticalMapView(): void {
  exitBattleLongitudeFrame();
  const map = getMainLeafletMap() as LeafletMapLike | null;
  const L = getLeafletGlobal() as
    | {
        latLngBounds: (sw: { lat: number; lng: number }, ne: { lat: number; lng: number }) => unknown;
        latLng: (lat: number, lng: number) => unknown;
      }
    | null;
  if (!map || !L) {
    S.preTacticalLeafletMinZoom = null;
    S.preTacticalLeafletMaxZoom = null;
    return;
  }
  restoreLoadedMapExtent();
  if (typeof map.setMinZoom === 'function' && S.preTacticalLeafletMinZoom != null) {
    map.setMinZoom(S.preTacticalLeafletMinZoom);
  }
  if (typeof map.setMaxZoom === 'function' && S.preTacticalLeafletMaxZoom != null) {
    map.setMaxZoom(S.preTacticalLeafletMaxZoom);
  }
  S.preTacticalLeafletMinZoom = null;
  S.preTacticalLeafletMaxZoom = null;
  const home = S.strategicScenarioInitialLeafletView;
  if (home && typeof map.setView === 'function') {
    map.setView(L.latLng(home.lat, home.lng), home.zoom);
  } else {
    restoreLoadedMapExtent(true);
  }
}
