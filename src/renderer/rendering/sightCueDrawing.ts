import type { SightCueBeam } from '../../shared/ipc/sightCueTypes';
import {
  lerpNumber,
  SIGHT_CUE_STYLE,
  insetBeamSegment,
  sightCueFrameAt,
  sightCueRingTargets,
  type SightCueFrame,
} from '../../shared/sightCueDrawModel';
import { reducedMotionRequested } from '../chrome/panelSlideHelpers';
import { ORDER_LINE_CASING_PAD, UNIT_RADIUS } from '../core/constants';
import { hexCenterPx, hexCenterPxRelativeTo } from '../map/mapHelpers';
import { withOpacityHex } from './canvasColor';
import { paletteForCurrentOwner } from './ownerColors';
import { getCurrentRangeOverlayLineWidth } from './rangeOverlayStroke';

/**
 * Paints the sight lines for one frame of the opening playback stage.
 *
 * Purpose: Ongoing lines draw first, then new contacts, then one ring on each newly spotted hex.
 * When to use: The strategic map, after unit tokens and before combat overlays, while the sight-cue stage is current.
 * Expected outcome: Nothing when there are no beams, the frame is invisible, or the zoom hides strategic units. The caller checks the zoom.
 * Exceptions: None. A seat with no map color is skipped.
 */
export function drawSightCueBeams(
  ctx: CanvasRenderingContext2D,
  beams: readonly SightCueBeam[],
  stageElapsedMs: number
): void {
  if (beams.length === 0) return;
  const frame = sightCueFrameAt(stageElapsedMs, reducedMotionRequested());
  if (frame.alpha <= 0 || frame.drawProgress <= 0) return;
  const connectorWidth = getCurrentRangeOverlayLineWidth('connector');
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  for (const beam of beams.filter((item) => !item.isNewContact)) {
    strokeSightCueBeam(ctx, beam, frame, connectorWidth * SIGHT_CUE_STYLE.ongoing.widthScale, SIGHT_CUE_STYLE.ongoing);
  }
  for (const beam of beams.filter((item) => item.isNewContact)) {
    strokeSightCueBeam(
      ctx,
      beam,
      frame,
      connectorWidth * SIGHT_CUE_STYLE.newContact.widthScale,
      SIGHT_CUE_STYLE.newContact
    );
  }
  if (frame.ringProgress !== null) {
    for (const beam of sightCueRingTargets(beams)) {
      strokeSightCueRing(ctx, beam, frame, connectorWidth * SIGHT_CUE_STYLE.newContact.widthScale);
    }
  }
  ctx.restore();
}

/**
 * Strokes one beam's casing and then its colored core, up to the draw-in tip.
 *
 * Purpose: The gradient spans the whole inset segment, so a half-drawn line already shows the fade it will have when finished.
 * When to use: From `drawSightCueBeams`, ongoing beams before new contacts.
 * Expected outcome: A round-capped line. Nothing when the seat has no color or the segment is shorter than a pixel.
 * Exceptions: None.
 */
function strokeSightCueBeam(
  ctx: CanvasRenderingContext2D,
  beam: SightCueBeam,
  frame: SightCueFrame,
  width: number,
  opacity: { readonly startOpacity: number; readonly endOpacity: number }
): void {
  const color = paletteForCurrentOwner(beam.seatId)?.map;
  if (!color) return;
  const segment = insetBeamSegment(
    hexCenterPx(beam.fromH3Index),
    hexCenterPxRelativeTo(beam.fromH3Index, beam.toH3Index),
    UNIT_RADIUS
  );
  if (!segment) return;
  const tip = {
    x: lerpNumber(segment.start.x, segment.end.x, frame.drawProgress),
    y: lerpNumber(segment.start.y, segment.end.y, frame.drawProgress),
  };
  const startAlpha = opacity.startOpacity * frame.alpha;
  const endAlpha = opacity.endOpacity * frame.alpha;
  const gradient = ctx.createLinearGradient(segment.start.x, segment.start.y, segment.end.x, segment.end.y);
  gradient.addColorStop(0, withOpacityHex(color, startAlpha));
  gradient.addColorStop(1, withOpacityHex(color, endAlpha));
  const casing = ctx.createLinearGradient(segment.start.x, segment.start.y, segment.end.x, segment.end.y);
  casing.addColorStop(0, withOpacityHex('#ffffff', SIGHT_CUE_STYLE.casingAlpha * startAlpha));
  casing.addColorStop(1, withOpacityHex('#ffffff', SIGHT_CUE_STYLE.casingAlpha * endAlpha));
  ctx.beginPath();
  ctx.moveTo(segment.start.x, segment.start.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.lineWidth = width + ORDER_LINE_CASING_PAD * 2;
  ctx.strokeStyle = casing;
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = gradient;
  ctx.stroke();
}

/**
 * Strokes the expanding ring around one newly spotted hex.
 *
 * Purpose: The ring is centered with the spotter's hex so a wrapped world still puts it on the target the beam points at.
 * When to use: After that seat's new-contact beams, and only when the frame has a ring progress.
 * Expected outcome: A cased circle in the spotter's map color. Nothing when that seat has no color.
 * Exceptions: None.
 */
function strokeSightCueRing(
  ctx: CanvasRenderingContext2D,
  beam: SightCueBeam,
  frame: SightCueFrame,
  width: number
): void {
  const color = paletteForCurrentOwner(beam.seatId)?.map;
  if (!color || frame.ringProgress == null) return;
  const center = hexCenterPxRelativeTo(beam.fromH3Index, beam.toH3Index);
  const radius =
    UNIT_RADIUS *
    lerpNumber(SIGHT_CUE_STYLE.ring.startRadiusScale, SIGHT_CUE_STYLE.ring.endRadiusScale, frame.ringProgress);
  const opacity =
    lerpNumber(SIGHT_CUE_STYLE.ring.startOpacity, SIGHT_CUE_STYLE.ring.endOpacity, frame.ringProgress) * frame.alpha;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.lineWidth = width + ORDER_LINE_CASING_PAD * 2;
  ctx.strokeStyle = withOpacityHex('#ffffff', SIGHT_CUE_STYLE.casingAlpha * opacity);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.lineWidth = width;
  ctx.strokeStyle = withOpacityHex(color, opacity);
  ctx.stroke();
}
