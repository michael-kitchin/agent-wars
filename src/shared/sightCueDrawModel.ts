import type { SightCueBeam } from './ipc/sightCueTypes';
import {
  SIGHT_CUE_DRAW_IN_MS,
  SIGHT_CUE_FADE_MS,
  SIGHT_CUE_HOLD_MS,
} from './resolutionPlaybackTiming';

/**
 * Pure decisions for drawing sight lines.
 *
 * Purpose: The canvas module stays thin, and Node tests can cover who sees which beams, how they fade, and where they end.
 * When to use: From the renderer when Ready returns, and from the beam painter each frame.
 * Expected outcome: No canvas, DOM, or logging.
 * Exceptions: None.
 */

/**
 * Opacities and widths for a sight line and its ring.
 *
 * Purpose: One place to tune a crowded front. Lower `ongoing.startOpacity` first, in steps of 0.05, and stop at 0.25.
 * When to use: The painter, for every beam and ring.
 * Expected outcome: Ongoing lines stay quieter than a new contact. The ring grows from one unit radius to two.
 * Exceptions: None.
 */
export const SIGHT_CUE_STYLE = {
  ongoing: { startOpacity: 0.45, endOpacity: 0.05, widthScale: 0.5 },
  newContact: { startOpacity: 0.85, endOpacity: 0.15, widthScale: 0.8 },
  ring: { startRadiusScale: 1, endRadiusScale: 2, startOpacity: 0.85, endOpacity: 0.15 },
  casingAlpha: 0.8,
} as const;

/**
 * How far a sight line has drawn on one frame.
 *
 * Purpose: The painter reads this instead of the stage clock.
 * When to use: Once per frame, before stroking.
 * Expected outcome: `drawProgress` and `alpha` are in 0..1. `ringProgress` is null until the ring should appear.
 * Exceptions: None.
 */
export interface SightCueFrame {
  /**
   * How much of each line is stroked, from the spotter toward the target.
   *
   * Contract: 0 draws nothing. 1 draws the whole inset segment.
   * When to use: The tip of the stroke.
   * Expected outcome: A fraction of the segment.
   * Exceptions: None.
   */
  readonly drawProgress: number;
  /**
   * Multiplier for every painted opacity on this frame.
   *
   * Contract: 0 means the stage is invisible.
   * When to use: Both ends of a beam and the ring.
   * Expected outcome: 1 through the hold, then a fade to 0.
   * Exceptions: None.
   */
  readonly alpha: number;
  /**
   * How far the new-contact ring has grown.
   *
   * Contract: Null before the ring appears. 0 is the start radius. 1 is the end radius.
   * When to use: Only for new contacts.
   * Expected outcome: Null during the draw-in. Otherwise a fraction of the hold.
   * Exceptions: None.
   */
  readonly ringProgress: number | null;
}

/**
 * One end of an inset sight line, in canvas pixels.
 *
 * Purpose: The painter strokes between these points.
 * When to use: The return of `insetBeamSegment`.
 * Expected outcome: Both ends sit inside the segment that joins the two hex centers.
 * Exceptions: None.
 */
export interface SightCueSegment {
  /**
   * The spotter end.
   *
   * Contract: Inset from the spotter hex center.
   * When to use: The start of the stroke.
   * Expected outcome: A canvas point.
   * Exceptions: None.
   */
  readonly start: { readonly x: number; readonly y: number };
  /**
   * The target end.
   *
   * Contract: Inset from the target hex center.
   * When to use: The end of the full segment. The drawn tip may stop short of it.
   * Expected outcome: A canvas point.
   * Exceptions: None.
   */
  readonly end: { readonly x: number; readonly y: number };
}

/**
 * The beams one viewer should see.
 *
 * Purpose: All sides shows every seat. A seat shows only the lines that seat drew.
 * When to use: Once, when Ready returns, before arming playback.
 * Expected outcome: A new array. `null` copies every beam. A seat id keeps only that seat.
 * Exceptions: None.
 */
export function sightCueBeamsForViewer(
  beams: readonly SightCueBeam[],
  viewerSeatId: string | null
): SightCueBeam[] {
  if (viewerSeatId == null) return [...beams];
  return beams.filter((beam) => beam.seatId === viewerSeatId);
}

/**
 * Draw-in, hold, and fade for one moment in the sight-cue stage.
 *
 * Purpose: Reduced motion shows the finished lines only during the hold. The stage still lasts the full time.
 * When to use: Each frame of the sight-cue stage.
 * Expected outcome: A frame. Reduced motion is invisible outside the hold, and fully drawn during it.
 * Exceptions: None.
 */
export function sightCueFrameAt(stageElapsedMs: number, reducedMotion: boolean): SightCueFrame {
  const drawIn = SIGHT_CUE_DRAW_IN_MS;
  const holdEnd = drawIn + SIGHT_CUE_HOLD_MS;
  if (reducedMotion) {
    const duringHold = stageElapsedMs >= drawIn && stageElapsedMs < holdEnd;
    return duringHold
      ? { drawProgress: 1, alpha: 1, ringProgress: 1 }
      : { drawProgress: 0, alpha: 0, ringProgress: null };
  }
  const drawProgress = drawIn <= 0 ? 1 : Math.min(1, stageElapsedMs / drawIn);
  const alpha =
    stageElapsedMs < holdEnd
      ? 1
      : Math.max(0, 1 - (stageElapsedMs - holdEnd) / SIGHT_CUE_FADE_MS);
  const ringProgress =
    stageElapsedMs < drawIn ? null : Math.min(1, (stageElapsedMs - drawIn) / SIGHT_CUE_HOLD_MS);
  return { drawProgress, alpha, ringProgress };
}

/**
 * Pulls both ends in by one inset, or by a quarter of the length when the centers are closer than twice that inset.
 *
 * Purpose: A beam stops one unit radius short of each token. A beam too short for both insets keeps a visible middle.
 * When to use: After the two hex centers are known.
 * Expected outcome: The inset segment, or null when the centers are less than one pixel apart.
 * Exceptions: None.
 */
export function insetBeamSegment(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  inset: number
): SightCueSegment | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;
  const pull = length < inset * 2 ? length / 4 : inset;
  const ux = dx / length;
  const uy = dy / length;
  return {
    start: { x: from.x + ux * pull, y: from.y + uy * pull },
    end: { x: to.x - ux * pull, y: to.y - uy * pull },
  };
}

/**
 * One ring per seat and newly spotted hex.
 *
 * Purpose: Several units in one hex share a ring. The first beam supplies the spotter hex used to place it.
 * When to use: After the beams for this viewer are known.
 * Expected outcome: New-contact beams only, in input order, with later duplicates of the same seat and target dropped.
 * Exceptions: None.
 */
export function sightCueRingTargets(beams: readonly SightCueBeam[]): SightCueBeam[] {
  const seen = new Set<string>();
  const rings: SightCueBeam[] = [];
  for (const beam of beams) {
    if (!beam.isNewContact) continue;
    const key = `${beam.seatId}\0${beam.toH3Index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rings.push(beam);
  }
  return rings;
}

/**
 * Linear blend clamped to the unit interval.
 *
 * Purpose: Draw-in tips, ring radii, and ring opacity share one blend.
 * When to use: When a frame fraction should not run past either end.
 * Expected outcome: `from` at 0 and below, `to` at 1 and above, and the blend between.
 * Exceptions: None.
 */
export function lerpNumber(from: number, to: number, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return from + (to - from) * clamped;
}
