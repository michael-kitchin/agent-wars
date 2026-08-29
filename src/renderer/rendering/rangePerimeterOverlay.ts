/**
 * Animated range perimeter overlay during ranged-attack and air-strike planning modes.
 */

import { cellToLatLng } from 'h3-js';
import { computeUnionPerimeterLoops } from '../../shared/rangePerimeterGeometry';
import {
  buildStrategicAirStrikeRangeSet,
  buildStrategicRangedRangeSet,
  buildTacticalAirStrikeRangeSet,
  buildTacticalRangedRangeSet,
  type RangePerimeterUnitInput,
} from '../../shared/rangePerimeterModel';
import { RANGE_PERIMETER_ALPHA, RANGE_PERIMETER_FLOW_PX_PER_SEC } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { alignLngToReference } from '../map/hexGrid';
import { getLeafletGlobal } from '../map/mapHelpers';
import { getMainLeafletMap } from '../map/worldLeafletMap';
import { rangePerimeterStaticLineStyle } from './orderDrawing';
import { drawClosedPolygonPath, type ScreenPoint } from './polygonOutline';

/** True while `tickRangePerimeterAnimation` is inside `redraw()` — prevents double RAF scheduling from `ensure`. */
let rangePerimeterAnimationTickInFlight = false;

/**
 * Returns whether either ranged or air-strike targeting mode is active.
 *
 * Purpose: Single gate for draw and animation scheduling.
 * When to use: Start of overlay draw and animation ensure paths.
 * Expected outcome: True when the user is picking a ranged or strike target.
 * Exceptions: None.
 */
function isRangePerimeterModeActive(): boolean {
  return S.rangedModeActive || S.airStrikeModeActive;
}

/**
 * Builds a cache key for recomputing perimeter loops when selection or mode changes.
 *
 * Purpose: Avoids recomputing H3 disks and edge loops on every animation frame.
 * When to use: Before reading or refreshing `S.rangePerimeterLoopsLatLng`.
 * Expected outcome: Stable string for unchanged selection; changes when mode, battle, or ids change.
 * Exceptions: None.
 */
export function buildRangePerimeterSignature(): string {
  if (!isRangePerimeterModeActive()) return '';
  const mode = S.airStrikeModeActive ? 'air' : 'ranged';
  const battleKey = S.tacticalBattleSnapshot?.enclosingRes1H3Index ?? 'strategic';
  const ids = [...S.selectedUnitIds].sort().join(',');
  return `${mode}|${battleKey}|${ids}`;
}

/**
 * Resolves the hex set whose outer perimeter should be outlined for the current planning state.
 *
 * Purpose: Maps renderer selection and mode flags to pure range-set builders.
 * When to use: When refreshing cached perimeter loops.
 * Expected outcome: Non-empty set when mode and selection are valid; `null` otherwise.
 * Exceptions: None; logs `console.error` on unexpected failures.
 */
function computeSelectedRangeHexSetFromState(): Set<string> | null {
  if (!isRangePerimeterModeActive()) return null;

  const tactical = S.tacticalBattleSnapshot;
  if (tactical) {
    const footprint = new Set(tactical.res4ChildH3Indexes);
    const selected = tactical.subUnits.filter((s) => S.selectedUnitIds.includes(s.id));
    if (selected.length === 0) return null;
    try {
      if (S.airStrikeModeActive) return buildTacticalAirStrikeRangeSet(footprint);
      return buildTacticalRangedRangeSet(tactical, selected, footprint);
    } catch (err) {
      console.error('computeSelectedRangeHexSetFromState tactical failed', err);
      return null;
    }
  }

  const gs = S.gameState;
  if (!gs) return null;
  const selected = gs.units.filter((u) => S.selectedUnitIds.includes(u.id));
  if (selected.length === 0) return null;
  const units: RangePerimeterUnitInput[] = selected.map((u) => ({
    h3Index: u.h3Index,
    unitType: u.unitType,
  }));
  try {
    if (S.airStrikeModeActive) return buildStrategicAirStrikeRangeSet(units);
    return buildStrategicRangedRangeSet(units);
  } catch (err) {
    console.error('computeSelectedRangeHexSetFromState strategic failed', err);
    return null;
  }
}

/**
 * Clears cached perimeter loops and signature after planning mode ends.
 *
 * Purpose: Frees geometry and prevents stale outlines on the next session.
 * When to use: When animation stops because mode flags cleared.
 * Expected outcome: Both cache fields reset to `null`.
 * Exceptions: None.
 */
function clearRangePerimeterCache(): void {
  S.rangePerimeterLoopsLatLng = null;
  S.rangePerimeterSignature = null;
}

/**
 * Recomputes cached lat/lng loops when the perimeter signature changes.
 *
 * Purpose: Keeps `S.rangePerimeterLoopsLatLng` aligned with selection and mode.
 * When to use: At the start of each `drawRangePerimeterOverlay` when mode is active.
 * Expected outcome: Updated loops or cleared cache when hex set is empty.
 * Exceptions: None; logs `console.error` on failure without throwing.
 */
function refreshRangePerimeterCacheIfNeeded(): void {
  const signature = buildRangePerimeterSignature();
  if (signature === S.rangePerimeterSignature) return;
  S.rangePerimeterSignature = signature;
  const hexSet = computeSelectedRangeHexSetFromState();
  if (!hexSet || hexSet.size === 0) {
    S.rangePerimeterLoopsLatLng = null;
    return;
  }
  try {
    S.rangePerimeterLoopsLatLng = computeUnionPerimeterLoops(hexSet);
  } catch (err) {
    console.error('refreshRangePerimeterCacheIfNeeded failed', err);
    S.rangePerimeterLoopsLatLng = null;
  }
}

/**
 * Resolves reference longitude for aligning perimeter vertices on the canvas.
 *
 * Purpose: Prevents antimeridian jumps when projecting mixed loop vertices.
 * When to use: Once per draw before projecting loops.
 * Expected outcome: Longitude from primary selected unit anchor, or `0` when unavailable.
 * Exceptions: None.
 */
function resolveReferenceLngForPerimeter(): number {
  const tactical = S.tacticalBattleSnapshot;
  if (tactical) {
    const primaryId = S.selectedUnitIds[0];
    const sub = primaryId ? tactical.subUnits.find((s) => s.id === primaryId) : undefined;
    if (sub) {
      try {
        return cellToLatLng(sub.h3Index)[1];
      } catch {
        // fall through
      }
    }
  }
  const gs = S.gameState;
  const primaryId = S.selectedUnitIds[0];
  const unit = primaryId && gs ? gs.units.find((u) => u.id === primaryId) : undefined;
  if (unit) {
    try {
      return cellToLatLng(unit.h3Index)[1];
    } catch {
      // fall through
    }
  }
  return 0;
}

/**
 * Projects cached lat/lng loops to container pixels for canvas stroking.
 *
 * Purpose: Converts H3 perimeter geometry to `ScreenPoint` paths for one draw pass.
 * When to use: Inside `drawRangePerimeterOverlay` after cache refresh.
 * Expected outcome: One screen loop per cached lat/lng loop; skips loops with no map.
 * Exceptions: None.
 */
function projectLoopsToScreen(
  loops: readonly (readonly (readonly [number, number])[])[],
  refLng: number
): ScreenPoint[][] {
  const map = getMainLeafletMap() as {
    latLngToContainerPoint: (ll: unknown) => { x: number; y: number };
  } | null;
  const L = getLeafletGlobal();
  if (!map || !L) return [];
  const out: ScreenPoint[][] = [];
  for (const loop of loops) {
    const pts: ScreenPoint[] = [];
    for (const [lat, lng] of loop) {
      const alignedLng = alignLngToReference(lng, refLng);
      const p = map.latLngToContainerPoint(L.latLng(lat, alignedLng));
      pts.push({ x: p.x, y: p.y });
    }
    if (pts.length >= 3) out.push(pts);
  }
  return out;
}

/**
 * Draws the animated dashed range perimeter when ranged or air-strike planning is active.
 *
 * Purpose: Visualizes max range for the selected group without LOS or target validity filtering, using the same stroke as planned/hover support lines plus flowing dashes.
 * When to use: In both tactical and strategic `drawGameScene` branches before unit icons.
 * Expected outcome: Mode-colored flowing dashed outline around the union range hex perimeter; tactical width matches movement lines; strategic width uses the thicker home-border scale with butt caps and 2×-width dashes so the trough stays visible; no-op when mode off.
 * Exceptions: None; failures are logged and skipped.
 */
export function drawRangePerimeterOverlay(ctx: CanvasRenderingContext2D): void {
  if (!isRangePerimeterModeActive()) return;
  refreshRangePerimeterCacheIfNeeded();
  const loops = S.rangePerimeterLoopsLatLng;
  if (!loops?.length) return;

  const style = rangePerimeterStaticLineStyle(S.airStrikeModeActive ? 'airStrike' : 'ranged', 'perimeter');
  const patternLength = style.dash[0] + style.dash[1];
  const phase =
    patternLength > 0
      ? -(((performance.now() / 1000) * RANGE_PERIMETER_FLOW_PX_PER_SEC) % patternLength)
      : 0;

  const refLng = resolveReferenceLngForPerimeter();
  const screenLoops = projectLoopsToScreen(loops, refLng);
  if (screenLoops.length === 0) return;

  ctx.save();
  ctx.globalAlpha = RANGE_PERIMETER_ALPHA;
  ctx.strokeStyle = style.strokeColor;
  ctx.lineWidth = style.lineWidth;
  ctx.lineCap = style.lineCap;
  ctx.lineJoin = 'round';
  ctx.setLineDash(style.dash);
  ctx.lineDashOffset = phase;
  for (const pts of screenLoops) {
    drawClosedPolygonPath(ctx, pts);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.restore();
}

/**
 * Cancels any pending range-perimeter RAF and clears cached geometry.
 *
 * Purpose: Stops the dash loop when planning mode ends.
 * When to use: From `ensureRangePerimeterAnimation` when mode is inactive, and from `tick` when mode clears.
 * Expected outcome: `rangePerimeterAnimationFrameId` is null and cache fields are cleared.
 * Exceptions: None.
 */
function stopRangePerimeterAnimation(): void {
  if (S.rangePerimeterAnimationFrameId !== null) {
    cancelAnimationFrame(S.rangePerimeterAnimationFrameId);
    S.rangePerimeterAnimationFrameId = null;
  }
  clearRangePerimeterCache();
}

/**
 * Fires on each animation frame while range perimeter mode is active.
 *
 * Purpose: Drives flowing dashes by calling `redraw` once per frame and scheduling exactly one follow-up RAF. `ensureRangePerimeterAnimation` must not schedule while this tick is in flight (it would double-schedule with the follow-up here and freeze the UI).
 * When to use: Only as a RAF callback started by `ensureRangePerimeterAnimation`.
 * Expected outcome: Continuous redraw with advancing `lineDashOffset`; loop stops when mode ends.
 * Exceptions: None.
 */
function tickRangePerimeterAnimation(redraw: () => void): void {
  S.rangePerimeterAnimationFrameId = null;
  if (!isRangePerimeterModeActive()) {
    stopRangePerimeterAnimation();
    return;
  }
  rangePerimeterAnimationTickInFlight = true;
  try {
    redraw();
  } finally {
    rangePerimeterAnimationTickInFlight = false;
  }
  if (!isRangePerimeterModeActive()) {
    stopRangePerimeterAnimation();
    return;
  }
  S.rangePerimeterAnimationFrameId = requestAnimationFrame(() => tickRangePerimeterAnimation(redraw));
}

/**
 * Starts the range perimeter animation loop when planning mode is active.
 *
 * Purpose: Kick-starts the RAF chain after mode entry or a non-tick redraw; ongoing frames are chained only from `tickRangePerimeterAnimation`.
 * When to use: End of each `drawGameScene` branch (injected `redraw` from renderer).
 * Expected outcome: At most one RAF chain while mode active and no resolution playback.
 * Exceptions: None.
 */
export function ensureRangePerimeterAnimation(redraw: () => void): void {
  if (!isRangePerimeterModeActive()) {
    stopRangePerimeterAnimation();
    return;
  }
  if (S.resolutionMoveAnimation) return;
  if (rangePerimeterAnimationTickInFlight) return;
  if (S.rangePerimeterAnimationFrameId !== null) return;
  S.rangePerimeterAnimationFrameId = requestAnimationFrame(() => tickRangePerimeterAnimation(redraw));
}
