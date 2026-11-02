import { cellToLatLng, gridDisk } from 'h3-js';
import { alignLongitudeToReference } from './webMercator';

/**
 * How many hexes of span an automatic camera adds on one axis.
 *
 * Purpose: The framed view is the unit box plus this much width or height, centered.
 * When to use: `unitFrameBox`. Docs name this symbol.
 * Expected outcome: 3. Each side of the chosen axis grows by half of this.
 * Exceptions: None.
 */
export const UNIT_FRAME_PAD_HEXES = 3;

/**
 * A latitude/longitude rectangle in degrees.
 *
 * Purpose: The unit cluster, the pad, and the pan limit share one shape.
 * When to use: `unitFrameBox`. Longitude is already unwrapped, so `west` is not greater than `east`.
 * Expected outcome: Edges are degrees. A dateline box may place `east` above 180.
 * Exceptions: None.
 */
export interface LatLngFrameBox {
  /**
   * Southern edge, in degrees.
   *
   * Contract: Finite, and not above `north` on a box this module returns.
   * When to use: The south of a unit cluster, a pad, or a pan limit.
   * Expected outcome: A latitude.
   * Exceptions: None.
   */
  readonly south: number;
  /**
   * Western edge, in unwrapped degrees.
   *
   * Contract: Finite, and not to the right of `east` on a box this module returns.
   * When to use: The west of a unit cluster, a pad, or a pan limit.
   * Expected outcome: A longitude, which may be below -180.
   * Exceptions: None.
   */
  readonly west: number;
  /**
   * Northern edge, in degrees.
   *
   * Contract: Finite, and not below `south` on a box this module returns.
   * When to use: The north of a unit cluster, a pad, or a pan limit.
   * Expected outcome: A latitude.
   * Exceptions: None.
   */
  readonly north: number;
  /**
   * Eastern edge, in unwrapped degrees.
   *
   * Contract: Finite, and not to the left of `west` on a box this module returns.
   * When to use: The east of a unit cluster, a pad, or a pan limit.
   * Expected outcome: A longitude, which may be above 180.
   * Exceptions: None.
   */
  readonly east: number;
}

/**
 * Center-to-center hex size along each axis.
 *
 * Purpose: The pad is a multiple of these steps, not of the hex's vertex box.
 * When to use: The result of `hexCenterSteps`.
 * Expected outcome: Both steps are finite. A positive step is a real neighbor offset.
 * Exceptions: None.
 */
export interface HexCenterSteps {
  /**
   * Largest absolute latitude change to a neighbor, in degrees.
   *
   * Contract: Finite and at least 0.
   * When to use: The latitude pad in `unitFrameBox`.
   * Expected outcome: Degrees.
   * Exceptions: None.
   */
  readonly latStep: number;
  /**
   * Largest absolute aligned longitude change to a neighbor, in degrees.
   *
   * Contract: Finite, at least 0, and well under 180 for a real cell.
   * When to use: The longitude pad in `unitFrameBox`.
   * Expected outcome: Degrees. A dateline neighbor is aligned before this is measured.
   * Exceptions: None.
   */
  readonly lngStep: number;
}

/**
 * Inputs for one automatic camera box.
 *
 * Purpose: Keeps `unitFrameBox` to one argument.
 * When to use: The renderer, after it has measured units, hex steps, the map panel, and the pan limit.
 * Expected outcome: `unit` and `limit` use the same unwrapped longitude frame.
 * Exceptions: None.
 */
export interface UnitFrameBoxArgs {
  /**
   * Box that already contains every visible unit.
   *
   * Contract: Edges are finite. `west` is not greater than `east`.
   * When to use: The vertex bounds of the units to frame.
   * Expected outcome: The pad grows this box on one axis.
   * Exceptions: None.
   */
  readonly unit: LatLngFrameBox;
  /**
   * Latitude hex step, in degrees.
   *
   * Contract: A positive finite number pads. Anything else adds nothing.
   * When to use: `hexCenterSteps` for the sample cell.
   * Expected outcome: Half of `UNIT_FRAME_PAD_HEXES` times this value is added to each side when latitude is padded.
   * Exceptions: None.
   */
  readonly latStep: number;
  /**
   * Longitude hex step, in degrees.
   *
   * Contract: A positive finite number pads. Anything else adds nothing.
   * When to use: `hexCenterSteps` for the sample cell.
   * Expected outcome: Half of `UNIT_FRAME_PAD_HEXES` times this value is added to each side when longitude is padded.
   * Exceptions: None.
   */
  readonly lngStep: number;
  /**
   * Map panel width, in CSS pixels.
   *
   * Contract: A positive finite width can frame. Zero or less returns null.
   * When to use: The main map element's `clientWidth`.
   * Expected outcome: Compared with `panelHeightPx` as the panel aspect.
   * Exceptions: None.
   */
  readonly panelWidthPx: number;
  /**
   * Map panel height, in CSS pixels.
   *
   * Contract: A positive finite height can frame. Zero or less returns null.
   * When to use: The main map element's `clientHeight`.
   * Expected outcome: Compared with `panelWidthPx` as the panel aspect.
   * Exceptions: None.
   */
  readonly panelHeightPx: number;
  /**
   * Pan limit the camera must stay inside.
   *
   * Contract: Edges are finite and `west` is not greater than `east`.
   * When to use: The loaded map extent, the Mercator world, or the battle area.
   * Expected outcome: The padded box is cut to this rectangle.
   * Exceptions: None.
   */
  readonly limit: LatLngFrameBox;
}

/**
 * Whether the automatic strategic camera should move.
 *
 * Purpose: The renderer asks this before fitting, so the rule can be tested without the map.
 * When to use: At a planning-turn boundary while deciding whether to frame visible units.
 * Expected outcome: True only for an observing auto-advance match, in planning, outside a battle and outside playback, for a turn not yet framed.
 * Exceptions: None.
 */
export interface AutomaticUnitFrameGate {
  /**
   * True when the roster has no active human seat.
   *
   * Contract: `isObservingRoster`.
   * When to use: The gate.
   * Expected outcome: False keeps today's camera.
   * Exceptions: None.
   */
  readonly observing: boolean;
  /**
   * True when the observe checkbox is on.
   *
   * Contract: `S.autoAdvance`.
   * When to use: The gate.
   * Expected outcome: False is a semi-automatic watch and does not frame.
   * Exceptions: None.
   */
  readonly autoAdvance: boolean;
  /**
   * True while a tactical battle snapshot is open.
   *
   * Contract: The renderer sets this from the battle snapshot.
   * When to use: The gate.
   * Expected outcome: A battle uses the battle frame instead.
   * Exceptions: None.
   */
  readonly inBattle: boolean;
  /**
   * Strategic phase name.
   *
   * Contract: The snapshot's `phase`.
   * When to use: The gate.
   * Expected outcome: Only `planning` can frame.
   * Exceptions: None.
   */
  readonly phase: string;
  /**
   * True while resolution playback is on screen.
   *
   * Contract: The renderer sets this from `resolutionMoveAnimation`.
   * When to use: The gate.
   * Expected outcome: Playback keeps the camera where the player left it.
   * Exceptions: None.
   */
  readonly playbackRunning: boolean;
  /**
   * Strategic turn to frame.
   *
   * Contract: The snapshot's `turnNumber`.
   * When to use: Compared with `framedTurnNumber`.
   * Expected outcome: A turn already recorded is not framed again.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * Turn last framed, or null when none has been.
   *
   * Contract: Null until a frame succeeds. Cleared when a new match loads.
   * When to use: The gate.
   * Expected outcome: Equal to `turnNumber` skips the frame.
   * Exceptions: None.
   */
  readonly framedTurnNumber: number | null;
}

/**
 * Whether the automatic battle camera should move.
 *
 * Purpose: The renderer asks this at battle entry and after a beat's playback.
 * When to use: While an automatic battle is the current view.
 * Expected outcome: True only when the beat has not been framed and playback is not running.
 * Exceptions: None.
 */
export interface AutomaticBattleFrameGate {
  /**
   * True when the roster has no active human seat.
   *
   * Contract: `isObservingRoster`.
   * When to use: The gate.
   * Expected outcome: A human battle keeps the full battle frame.
   * Exceptions: None.
   */
  readonly observing: boolean;
  /**
   * True when the observe checkbox is on.
   *
   * Contract: `S.autoAdvance`.
   * When to use: The gate.
   * Expected outcome: A semi-automatic battle keeps the full battle frame.
   * Exceptions: None.
   */
  readonly autoAdvance: boolean;
  /**
   * True while the battle snapshot is still the current view.
   *
   * Contract: False after the battle has been torn down.
   * When to use: The gate.
   * Expected outcome: An ended battle does not refit tactical cells.
   * Exceptions: None.
   */
  readonly inBattle: boolean;
  /**
   * True while a beat's resolution playback is on screen.
   *
   * Contract: The renderer sets this from `resolutionMoveAnimation`.
   * When to use: The gate.
   * Expected outcome: Playback is not interrupted by a refit.
   * Exceptions: None.
   */
  readonly playbackRunning: boolean;
  /**
   * Current tactical beat number.
   *
   * Contract: `tacticalTurnNumber` on the battle snapshot.
   * When to use: Compared with `framedBeatNumber`.
   * Expected outcome: A beat already recorded is not framed again.
   * Exceptions: None.
   */
  readonly tacticalTurnNumber: number;
  /**
   * Beat last framed, or null when none has been.
   *
   * Contract: Null until a frame succeeds. Cleared when the battle ends.
   * When to use: The gate.
   * Expected outcome: Equal to `tacticalTurnNumber` skips the frame.
   * Exceptions: None.
   */
  readonly framedBeatNumber: number | null;
}

/**
 * Pads the unit box by three hexes on the axis the panel would otherwise leave flush.
 *
 * Purpose: An automatic camera shows every unit with a little extra room on one axis.
 * When to use: After measuring the unit vertices, one hex's center steps, the map panel, and the pan limit.
 * Expected outcome: A box inside `limit`. Longitude is padded when the unit box is at least as wide, in Mercator, as the panel. Latitude is padded otherwise. Null when the panel or an edge cannot be used, or the clamp collapses the box.
 * Exceptions: None. Invalid H3 is the caller's concern. This function does not throw.
 */
export function unitFrameBox(args: UnitFrameBoxArgs): LatLngFrameBox | null {
  const { unit, limit } = args;
  if (!positivePanel(args.panelWidthPx, args.panelHeightPx)) return null;
  if (!finiteBox(unit) || !finiteBox(limit)) return null;
  if (unit.south > unit.north || unit.west > unit.east) return null;
  if (limit.south > limit.north || limit.west > limit.east) return null;
  const pad = UNIT_FRAME_PAD_HEXES / 2;
  const latPad = positiveStep(args.latStep) ? pad * args.latStep : 0;
  const lngPad = positiveStep(args.lngStep) ? pad * args.lngStep : 0;
  const widen = mercatorAspect(unit) >= args.panelWidthPx / args.panelHeightPx;
  const padded: LatLngFrameBox = widen
    ? { south: unit.south, north: unit.north, west: unit.west - lngPad, east: unit.east + lngPad }
    : { south: unit.south - latPad, north: unit.north + latPad, west: unit.west, east: unit.east };
  const clamped: LatLngFrameBox = {
    south: Math.max(limit.south, padded.south),
    west: Math.max(limit.west, padded.west),
    north: Math.min(limit.north, padded.north),
    east: Math.min(limit.east, padded.east),
  };
  if (clamped.south > clamped.north || clamped.west > clamped.east) return null;
  return clamped;
}

/**
 * Measures one cell's neighbor spacing along latitude and longitude.
 *
 * Purpose: The camera pad is three of these steps, not three copies of the cell's vertex width.
 * When to use: On the unit hex nearest the cluster center. Try another hex when this returns null.
 * Expected outcome: The largest absolute center deltas to a ring-1 neighbor. Longitude is aligned within 180° of the cell first. Null when the index is not a cell or has no finite neighbor.
 * Exceptions: A bad index returns null. `gridDisk` and the center reads do not escape this function.
 */
export function hexCenterSteps(h3Index: string): HexCenterSteps | null {
  try {
    const neighbors = gridDisk(h3Index, 1);
    const center = cellToLatLng(h3Index);
    const lat = center[0];
    const lng = center[1];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    let latStep = 0;
    let lngStep = 0;
    let found = false;
    for (const neighbor of neighbors) {
      if (neighbor === h3Index) continue;
      const point = cellToLatLng(neighbor);
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
      const alignedLng = alignLongitudeToReference(point[1], lng);
      latStep = Math.max(latStep, Math.abs(point[0] - lat));
      lngStep = Math.max(lngStep, Math.abs(alignedLng - lng));
      found = true;
    }
    if (!found || (latStep === 0 && lngStep === 0)) return null;
    return { latStep, lngStep };
  } catch {
    return null;
  }
}

/**
 * Decides whether this strategic planning turn still needs the automatic frame.
 *
 * Purpose: One place owns the observe, auto-advance, battle, playback, and already-framed checks.
 * When to use: Before `unitFrameBox` on the world map.
 * Expected outcome: True only when every condition holds. A human match, a semi-automatic watch, a battle, playback, a non-planning phase, and a turn already framed are false.
 * Exceptions: None.
 */
export function shouldApplyAutomaticUnitFrame(gate: AutomaticUnitFrameGate): boolean {
  return gate.observing
    && gate.autoAdvance
    && !gate.inBattle
    && gate.phase === 'planning'
    && !gate.playbackRunning
    && gate.framedTurnNumber !== gate.turnNumber;
}

/**
 * Decides whether this battle beat still needs the automatic frame.
 *
 * Purpose: One place owns the observe, auto-advance, playback, and already-framed checks for a battle.
 * When to use: At automatic battle entry and after a beat's playback, when the battle is still open.
 * Expected outcome: True only when every condition holds. A human battle, a semi-automatic battle, playback, and a beat already framed are false.
 * Exceptions: None.
 */
export function shouldApplyAutomaticBattleFrame(gate: AutomaticBattleFrameGate): boolean {
  return gate.observing
    && gate.autoAdvance
    && gate.inBattle
    && !gate.playbackRunning
    && gate.framedBeatNumber !== gate.tacticalTurnNumber;
}

/**
 * True when both panel edges can form an aspect ratio.
 *
 * Purpose: A hidden or not-yet-laid-out map must not move the camera.
 * When to use: `unitFrameBox`.
 * Expected outcome: True for two positive finite pixel sizes.
 * Exceptions: None.
 */
function positivePanel(widthPx: number, heightPx: number): boolean {
  return Number.isFinite(widthPx) && widthPx > 0 && Number.isFinite(heightPx) && heightPx > 0;
}

/**
 * True when every edge is a finite degree.
 *
 * Purpose: A NaN from a bad hex must not become a camera target.
 * When to use: `unitFrameBox` on the unit box and the limit.
 * Expected outcome: True when south, west, north, and east are finite.
 * Exceptions: None.
 */
function finiteBox(box: LatLngFrameBox): boolean {
  return Number.isFinite(box.south)
    && Number.isFinite(box.west)
    && Number.isFinite(box.north)
    && Number.isFinite(box.east);
}

/**
 * True when a hex step can add real padding.
 *
 * Purpose: A missing neighbor measurement adds nothing instead of spreading NaN.
 * When to use: `unitFrameBox`.
 * Expected outcome: True for a positive finite step.
 * Exceptions: None.
 */
function positiveStep(step: number): boolean {
  return Number.isFinite(step) && step > 0;
}

/**
 * Web Mercator width divided by Web Mercator height.
 *
 * Purpose: The tight axis is the one that fills the panel, and Mercator degrees are not square on the screen.
 * When to use: `unitFrameBox` before choosing the pad axis.
 * Expected outcome: A positive ratio. A zero-height box returns infinity so longitude is padded. A zero-width box returns 0 so latitude is padded.
 * Exceptions: None.
 */
function mercatorAspect(box: LatLngFrameBox): number {
  const width = mercatorX(box.east) - mercatorX(box.west);
  const height = mercatorY(box.north) - mercatorY(box.south);
  if (height === 0) return Number.POSITIVE_INFINITY;
  return width / height;
}

/**
 * Web Mercator x for a longitude.
 *
 * Purpose: Longitude is linear in the projection the map uses.
 * When to use: `mercatorAspect`.
 * Expected outcome: Radians.
 * Exceptions: None.
 */
function mercatorX(lngDeg: number): number {
  return lngDeg * Math.PI / 180;
}

/**
 * Web Mercator y for a latitude.
 *
 * Purpose: Latitude stretches away from the equator, so a degree of height is not a degree of width.
 * When to use: `mercatorAspect`.
 * Expected outcome: The standard Mercator y, in radians of the projection.
 * Exceptions: None. Callers pass a latitude the map can show.
 */
function mercatorY(latDeg: number): number {
  const lat = latDeg * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + lat / 2));
}
