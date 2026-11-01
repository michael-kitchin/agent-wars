import { cellToLatLng } from 'h3-js';
import { longitudeIntervalFromCenters, mapExtentBoxForHexes } from '../../shared/mapExtent';
import { observeModeControls } from '../../shared/observeModeControls';
import {
  hexCenterSteps,
  shouldApplyAutomaticBattleFrame,
  shouldApplyAutomaticUnitFrame,
  unitFrameBox,
  type HexCenterSteps,
  type LatLngFrameBox,
} from '../../shared/unitFrameBox';
import { rendererSharedState as S } from '../core/state';
import { WEB_MERCATOR_MAX_ABS_LAT } from './hexGrid';
import { loadedMapExtentTarget } from './mapExtent';
import { getLeafletGlobal } from './mapHelpers';
import { getMainLeafletMap } from './worldLeafletMap';

/**
 * Leaflet calls this camera uses.
 *
 * Purpose: The unit frame fits the main map and does not touch pan limits or the minimap.
 * When to use: `fitMainMapToFrame`.
 * Expected outcome: Missing methods make the fit a no-op.
 * Exceptions: None.
 */
interface FrameMap {
  /**
   * Moves the camera to a bounds rectangle.
   *
   * Contract: Optional. Called with two pixels of padding and animation off.
   * When to use: `fitMainMapToFrame`.
   * Expected outcome: The main map shows the framed box.
   * Exceptions: None.
   */
  fitBounds?: (bounds: unknown, options?: { padding?: number[]; animate?: boolean }) => void;
  /**
   * Returns the map's DOM container.
   *
   * Contract: Optional. The container reports its layout size in CSS pixels.
   * When to use: When choosing the pad axis.
   * Expected outcome: Width and height, or a missing method when the map is not ready.
   * Exceptions: None.
   */
  getContainer?: () => { clientWidth: number; clientHeight: number };
  /**
   * Returns the current zoom.
   *
   * Contract: Optional. Read after the battle footprint has been fitted.
   * When to use: An automatic battle locks zoom-out to that zoom.
   * Expected outcome: The zoom Leaflet is showing.
   * Exceptions: None.
   */
  getZoom?: () => number;
  /**
   * Sets the furthest zoom-out.
   *
   * Contract: Optional. The unit-frame fit itself does not call this.
   * When to use: After fitting the battle footprint, so zoom-out still reaches that footprint.
   * Expected outcome: The map cannot zoom out past the given zoom.
   * Exceptions: None.
   */
  setMinZoom?: (zoom: number) => void;
  /**
   * Sets the pan limit.
   *
   * Contract: Optional. The unit-frame fit itself does not call this.
   * When to use: After fitting the battle footprint, so pan stays in the battle area.
   * Expected outcome: The map cannot pan outside the given bounds.
   * Exceptions: None.
   */
  setMaxBounds?: (bounds: unknown) => void;
}

/**
 * Forgets which turn and beat the automatic camera has already framed.
 *
 * Purpose: A new match must frame its own first automatic turn, even on the same footprint.
 * When to use: When a new match replaces the renderer session.
 * Expected outcome: The next automatic planning turn and the next automatic beat can frame.
 * Exceptions: None.
 */
export function clearAutomaticFrameMemory(): void {
  S.automaticFramedTurnNumber = null;
  S.automaticFramedBeatNumber = null;
}

/**
 * Forgets which beat the automatic battle camera has framed.
 *
 * Purpose: The next battle starts its beat numbers over, and must be allowed to frame them.
 * When to use: When a battle ends, and when a new battle opens.
 * Expected outcome: `automaticFramedBeatNumber` is null. The strategic turn memory is left as it is.
 * Exceptions: None.
 */
export function clearAutomaticBattleFrameMemory(): void {
  S.automaticFramedBeatNumber = null;
}

/**
 * Fits the main map to the visible strategic units when this planning turn has not been framed.
 *
 * Purpose: An automatic watch starts each planning turn on the units, with three hexes of room on one axis.
 * When to use: After world-map playback, when Ready had nothing to play and is not opening a battle, when auto-advance turns on, and after a battle returns to the world map.
 * Expected outcome: `fitBounds` runs on the main map only. Pan limits, minimum zoom, and the minimap stay as they are. The turn number is remembered only when the camera moves. No units, a hidden panel, or a gate that is closed leaves the camera where it is.
 * Exceptions: A bad hex is skipped. Leaflet errors are logged and the turn is not remembered.
 */
export function frameAutomaticStrategicUnits(): void {
  try {
    frameStrategicUnits();
  } catch (err) {
    console.error('automatic unit frame failed', err);
  }
}

/**
 * Fits the visible strategic units when the gate is open.
 *
 * Purpose: Keeps a bad cell or a map error from escaping `frameAutomaticStrategicUnits`.
 * When to use: `frameAutomaticStrategicUnits` only.
 * Expected outcome: The camera moves and the turn is remembered, or the camera stays and the error is logged.
 * Exceptions: An unexpected failure propagates. `frameAutomaticStrategicUnits` logs it and does not rethrow.
 */
function frameStrategicUnits(): void {
  const state = S.gameState;
  if (!state) return;
  const open = shouldApplyAutomaticUnitFrame({
    observing: observeModeControls(state.seats ?? []).observing,
    autoAdvance: S.autoAdvance,
    inBattle: S.tacticalBattleSnapshot != null,
    phase: state.phase ?? '',
    playbackRunning: S.resolutionMoveAnimation != null,
    turnNumber: state.turnNumber,
    framedTurnNumber: S.automaticFramedTurnNumber,
  });
  if (!open) return;
  const indexes = state.units.map((unit) => unit.h3Index).filter((index) => index.length > 0);
  const framed = frameForIndexes(indexes, null);
  if (!framed) return;
  if (!fitMainMapToFrame(framed)) return;
  S.automaticFramedTurnNumber = state.turnNumber;
  console.debug('automatic unit frame', { turnNumber: state.turnNumber, ...framed });
}

/**
 * Fits the main map to the living battle units when this beat has not been framed.
 *
 * Purpose: An automatic battle keeps the units in view at entry and after each beat's playback.
 * When to use: After the battle footprint is fitted, and when playback of a beat ends with the battle still open. Pass the battle-area box the camera is already allowed to show.
 * Expected outcome: The main map fits the unit frame inside `battleLimit`. Max bounds and minimum zoom are left to the caller. The beat is remembered only when the camera moves. An empty roster or an ended battle leaves the camera where it is.
 * Exceptions: A bad cell is skipped. Leaflet errors are logged and the beat is not remembered.
 */
export function frameAutomaticBattleUnits(battleLimit: LatLngFrameBox): void {
  try {
    frameBattleUnits(battleLimit);
  } catch (err) {
    console.error('automatic battle frame failed', err);
  }
}

/**
 * Fits the living battle units when the gate is open.
 *
 * Purpose: Keeps a bad cell or a map error from escaping `frameAutomaticBattleUnits`.
 * When to use: `frameAutomaticBattleUnits` only.
 * Expected outcome: The camera moves and the beat is remembered, or the camera stays and the error is logged.
 * Exceptions: An unexpected failure propagates. `frameAutomaticBattleUnits` logs it and does not rethrow.
 */
function frameBattleUnits(battleLimit: LatLngFrameBox): void {
  const snap = S.tacticalBattleSnapshot;
  const state = S.gameState;
  if (!snap || !state || snap.aiOnlyEndReason != null) return;
  const open = shouldApplyAutomaticBattleFrame({
    observing: observeModeControls(state.seats ?? []).observing,
    autoAdvance: S.autoAdvance,
    inBattle: true,
    playbackRunning: S.resolutionMoveAnimation != null,
    tacticalTurnNumber: snap.tacticalTurnNumber,
    framedBeatNumber: S.automaticFramedBeatNumber,
  });
  if (!open) return;
  const indexes = snap.subUnits
    .filter((unit) => unit.h3Index.length > 0)
    .map((unit) => unit.h3Index);
  const framed = frameForIndexes(indexes, battleLimit);
  if (!framed) return;
  if (!fitMainMapToFrame(framed)) return;
  S.automaticFramedBeatNumber = snap.tacticalTurnNumber;
  console.debug('automatic battle frame', { tacticalTurnNumber: snap.tacticalTurnNumber, ...framed });
}

/**
 * Builds the padded camera box for these cells.
 *
 * Purpose: Strategic units and battle sub-units share the pad, the panel check, and the pan-limit clamp.
 * When to use: From the strategic and battle frame functions.
 * Expected outcome: Null when there are no cells, the panel has no size, or the clamp collapses the box.
 * Exceptions: None. A cell `h3-js` cannot read is omitted.
 */
function frameForIndexes(indexes: readonly string[], battleLimit: LatLngFrameBox | null): LatLngFrameBox | null {
  if (indexes.length === 0) return null;
  const panel = mainMapPanelSize();
  if (!panel) return null;
  const unit = unitVertexBox(indexes);
  if (!unit) return null;
  const limit = battleLimit
    ? shiftIntoFrame(battleLimit, (unit.west + unit.east) / 2)
    : panLimitFor(unit);
  if (!limit) return null;
  const steps = stepsNear(indexes);
  return unitFrameBox({
    unit,
    latStep: steps.latStep,
    lngStep: steps.lngStep,
    panelWidthPx: panel.width,
    panelHeightPx: panel.height,
    limit,
  });
}

/**
 * Reads the main map's layout size.
 *
 * Purpose: The pad axis depends on the panel the player is looking at.
 * When to use: `frameForIndexes`.
 * Expected outcome: Null when the map or its container is missing.
 * Exceptions: None.
 */
function mainMapPanelSize(): { width: number; height: number } | null {
  const map = getMainLeafletMap() as FrameMap | null;
  const container = map?.getContainer?.();
  if (!container) return null;
  return { width: container.clientWidth, height: container.clientHeight };
}

/**
 * Vertex bounds of these cells, in the short-way longitude frame.
 *
 * Purpose: The pad starts from every corner of the cells, not from their centers alone.
 * When to use: `frameForIndexes`.
 * Expected outcome: An unwrapped box. Null when no center is finite.
 * Exceptions: None.
 */
function unitVertexBox(indexes: readonly string[]): LatLngFrameBox | null {
  const readable: string[] = [];
  const longitudes: number[] = [];
  for (const index of indexes) {
    try {
      const lng = cellToLatLng(index)[1];
      if (!Number.isFinite(lng)) continue;
      longitudes.push(lng);
      readable.push(index);
    } catch (err) {
      console.error('automatic unit frame skipped a cell', index, err);
    }
  }
  try {
    const box = mapExtentBoxForHexes(longitudeIntervalFromCenters(longitudes), readable);
    if (!box) return null;
    return { south: box.south, west: box.west, north: box.north, east: box.east };
  } catch (err) {
    console.error('automatic unit frame skipped the unit box', err);
    return null;
  }
}

/**
 * Pan limit in the same longitude frame as `unit`.
 *
 * Purpose: The pad must not ask the camera to show hexes outside the limit that is already set.
 * When to use: After the unit box is known.
 * Expected outcome: A regional limit shifted onto the unit box's copy of the world, or one Mercator world centered on that box. Null when no extent has been applied and the map is missing.
 * Exceptions: None.
 */
function panLimitFor(unit: LatLngFrameBox): LatLngFrameBox | null {
  const target = loadedMapExtentTarget();
  if (target === 'world') {
    const mid = (unit.west + unit.east) / 2;
    return {
      south: -WEB_MERCATOR_MAX_ABS_LAT,
      west: mid - 180,
      north: WEB_MERCATOR_MAX_ABS_LAT,
      east: mid + 180,
    };
  }
  return shiftIntoFrame(
    { south: target.south, west: target.west, north: target.north, east: target.east },
    (unit.west + unit.east) / 2
  );
}

/**
 * Moves `box` by whole worlds until its midpoint is within 180° of `referenceLng`.
 *
 * Purpose: A dateline unit box and a dateline region must be compared on the same copy of the world.
 * When to use: The regional pan limit, before clamping.
 * Expected outcome: The same width and height, with longitude shifted by a multiple of 360.
 * Exceptions: None.
 */
function shiftIntoFrame(box: LatLngFrameBox, referenceLng: number): LatLngFrameBox {
  const mid = (box.west + box.east) / 2;
  let shift = 0;
  while (mid + shift - referenceLng > 180) shift -= 360;
  while (referenceLng - (mid + shift) > 180) shift += 360;
  return { south: box.south, west: box.west + shift, north: box.north, east: box.east + shift };
}

/**
 * Picks neighbor spacing at the cell nearest the cluster's average center.
 *
 * Purpose: One hex step should match the cells being framed, and a broken index should not zero the pad.
 * When to use: `frameForIndexes`.
 * Expected outcome: Positive steps, or zeros when no cell has a neighbor.
 * Exceptions: None.
 */
function stepsNear(indexes: readonly string[]): HexCenterSteps {
  const sample = nearestIndex(indexes);
  const ordered = sample == null ? indexes : [sample, ...indexes.filter((index) => index !== sample)];
  for (const index of ordered) {
    const steps = hexCenterSteps(index);
    if (steps) return steps;
  }
  return { latStep: 0, lngStep: 0 };
}

/**
 * Returns the cell whose center is closest to the average of the centers.
 *
 * Purpose: A hex at the edge of a long front is a poor sample for the pad step.
 * When to use: `stepsNear`.
 * Expected outcome: One of `indexes`, or null when none have a finite center. Longitude is aligned before the distance is measured.
 * Exceptions: None.
 */
function nearestIndex(indexes: readonly string[]): string | null {
  const centers: { index: string; lat: number; lng: number }[] = [];
  for (const index of indexes) {
    try {
      const [lat, lng] = cellToLatLng(index);
      if (Number.isFinite(lat) && Number.isFinite(lng)) centers.push({ index, lat, lng });
    } catch (err) {
      console.error('automatic unit frame skipped a cell center', index, err);
    }
  }
  if (centers.length === 0) return null;
  const interval = longitudeIntervalFromCenters(centers.map((center) => center.lng));
  const reference = interval?.referenceLng ?? centers[0].lng;
  const aligned = centers.map((center) => ({ ...center, lng: alignTo(center.lng, reference) }));
  const meanLat = aligned.reduce((sum, center) => sum + center.lat, 0) / aligned.length;
  const meanLng = aligned.reduce((sum, center) => sum + center.lng, 0) / aligned.length;
  let best = aligned[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const center of aligned) {
    const distance = (center.lat - meanLat) ** 2 + (center.lng - meanLng) ** 2;
    if (distance < bestDistance) {
      best = center;
      bestDistance = distance;
    }
  }
  return best.index;
}

/**
 * Shifts `lng` by 360° until it is within 180° of `refLng`.
 *
 * Purpose: Averaging centers across the antimeridian must not put the sample on the wrong side.
 * When to use: `nearestIndex`.
 * Expected outcome: The returned longitude differs from `lng` by a multiple of 360.
 * Exceptions: None.
 */
function alignTo(lng: number, refLng: number): number {
  let shifted = lng;
  while (shifted - refLng > 180) shifted -= 360;
  while (refLng - shifted > 180) shifted += 360;
  return shifted;
}

/**
 * Fits the main map to `framed` without changing pan limits or minimum zoom.
 *
 * Purpose: The automatic frame is a camera move. The loaded map and the battle area keep their own limits.
 * When to use: After `unitFrameBox` returns a box.
 * Expected outcome: True when `fitBounds` was called. False when the map is not ready.
 * Exceptions: Logs and returns false when Leaflet throws.
 */
function fitMainMapToFrame(framed: LatLngFrameBox): boolean {
  const map = getMainLeafletMap() as FrameMap | null;
  const leaflet = getLeafletGlobal() as {
    latLng?: (lat: number, lng: number, noWrap?: boolean) => unknown;
    latLngBounds?: (sw: unknown, ne: unknown) => unknown;
  } | null;
  if (!map?.fitBounds || !leaflet?.latLng || !leaflet.latLngBounds) return false;
  try {
    const bounds = leaflet.latLngBounds(
      leaflet.latLng(framed.south, framed.west, true),
      leaflet.latLng(framed.north, framed.east, true)
    );
    map.fitBounds(bounds, { padding: [2, 2], animate: false });
    return true;
  } catch (err) {
    console.error('automatic unit frame failed', err);
    return false;
  }
}
