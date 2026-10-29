import {
  type HomeRegionOwnerIdentity,
  type OwnershipBorderStyle,
} from '../../shared/homeRegionRules';
import { NEUTRAL_PALETTE } from '../../shared/seatPalette';
import { isNeutralOwnerId } from '../../shared/seatIds';
import { MULTI_PLAYER_FILL, MULTI_PLAYER_STROKE, OWNERSHIP_BORDER_ALPHA } from '../core/constants';
import { paletteForCurrentOwner } from './ownerColors';

/**
 * Maps current hex control to the outer solid ownership border color.
 *
 * Purpose: Home-region hexes use the controller's seat color on the outside edge.
 * When to use: Outlined home borders and any caller that needs control-only coloring.
 * Expected outcome: A seat's map color, Neutral's held-hex outline, or gray when nobody controls the hex.
 * Exceptions: None.
 */
export function resolveControllerBorderColor(controllerPlayerId: string | null | undefined): string {
  if (controllerPlayerId != null && isNeutralOwnerId(controllerPlayerId)) return NEUTRAL_PALETTE.heldHexOutline;
  return paletteForCurrentOwner(controllerPlayerId)?.map ?? MULTI_PLAYER_FILL;
}

/**
 * Maps home-region owner identity to the inner dashed border color.
 *
 * Purpose: The inner ring shows who declared the hex as home, not who controls it.
 * When to use: After `resolveHomeRegionOwnerIdentity`.
 * Expected outcome: That seat's map color, or `MULTI_PLAYER_STROKE` when two homes share the hex.
 * Exceptions: None. A null identity returns null.
 */
function resolveHomeRegionOwnerBorderColor(identity: HomeRegionOwnerIdentity): string | null {
  if (identity == null) return null;
  if (identity.kind === 'shared') return MULTI_PLAYER_STROKE;
  return paletteForCurrentOwner(identity.seatId)?.map ?? MULTI_PLAYER_FILL;
}

/**
 * Builds an inward-offset polygon for the inner home-region line.
 *
 * Purpose: The dashed home ring sits inside the solid control ring.
 * When to use: After the outer home border is drawn.
 * Expected outcome: The same vertex count, moved toward the centroid. Degenerate points stay put.
 * Exceptions: None.
 */
function buildInsetPolygonPoints(
  pts: readonly { x: number; y: number }[],
  insetPx: number
): { x: number; y: number }[] {
  if (pts.length === 0 || insetPx <= 0) return [...pts];
  let sumX = 0;
  let sumY = 0;
  for (const p of pts) {
    sumX += p.x;
    sumY += p.y;
  }
  const cx = sumX / pts.length;
  const cy = sumY / pts.length;
  return pts.map((p) => {
    const dx = cx - p.x;
    const dy = cy - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0.0001) return { x: p.x, y: p.y };
    const appliedInset = Math.min(insetPx, dist * 0.35);
    const t = appliedInset / dist;
    return { x: p.x + dx * t, y: p.y + dy * t };
  });
}

/**
 * Draws dual-line home-region ownership borders: solid outer (controller) and dashed inner (home owner).
 *
 * Purpose: A hex can be controlled by one seat and be home to another.
 * When to use: Whenever `resolveOwnershipBorderStyle` returns an outlined style.
 * Expected outcome: The outer ring uses the controller color. The inset dashed ring uses the home owner's color.
 * Exceptions: None.
 */
export function drawOutlinedHomeRegionOwnershipBorders(
  ctx: CanvasRenderingContext2D,
  pts: readonly { x: number; y: number }[],
  args: {
    controllerPlayerId: string | null | undefined;
    homeOwnerIdentity: HomeRegionOwnerIdentity;
    ownershipLineWidth: number;
    outerColor?: string;
    innerColor?: string;
  }
): void {
  ctx.save();
  ctx.globalAlpha = OWNERSHIP_BORDER_ALPHA;
  const outerColor = args.outerColor ?? resolveControllerBorderColor(args.controllerPlayerId);
  const innerColor = args.innerColor ?? resolveHomeRegionOwnerBorderColor(args.homeOwnerIdentity) ?? outerColor;
  const drawClosedPath = (points: readonly { x: number; y: number }[]): void => {
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  };
  drawClosedPath(pts);
  ctx.strokeStyle = outerColor;
  ctx.lineWidth = args.ownershipLineWidth;
  ctx.setLineDash([]);
  ctx.stroke();
  const innerPts = buildInsetPolygonPoints(pts, args.ownershipLineWidth * 1.5);
  const innerLineWidth = Math.max(args.ownershipLineWidth * 0.5, 1);
  drawClosedPath(innerPts);
  ctx.strokeStyle = innerColor;
  ctx.lineWidth = innerLineWidth;
  ctx.setLineDash([innerLineWidth * 2.6, innerLineWidth * 1.8]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Color for a single-line ownership border.
 *
 * Purpose: Non-home hexes use one stroke in the controller's map color.
 * When to use: After `resolveOwnershipBorderStyle` returns `normal`.
 * Expected outcome: That seat's map color. An uncontrolled home stays gray. Other styles return null.
 * Exceptions: None.
 */
export function resolveOwnershipBorderColor(style: OwnershipBorderStyle): string | null {
  if (style.kind === 'normal') return paletteForCurrentOwner(style.ownerId)?.map ?? MULTI_PLAYER_FILL;
  if (style.kind === 'outlinedNeutral') return MULTI_PLAYER_FILL;
  return null;
}

/**
 * Whether this style paints the dual home outline instead of a single line.
 *
 * Purpose: Outlined homes and Neutral-held hexes both use the dual-line drawer.
 * When to use: After `resolveOwnershipBorderStyle`.
 * Expected outcome: True for an outlined seat and for `outlinedNeutral`.
 * Exceptions: None.
 */
export function ownershipStyleIsOutlined(style: OwnershipBorderStyle): boolean {
  return style.kind === 'outlined' || style.kind === 'outlinedNeutral';
}
