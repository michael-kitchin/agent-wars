/**
 * Places water names after land names are final.
 *
 * Purpose: A water name gives way to every land name, and to an earlier water name.
 * When to use: After `nudgeBroadLabels`, once per frame, with the anchors from `chooseMapLabelAnchors`.
 * Expected outcome: At most `MAX_WATER_LABELS_PER_FRAME` names. Each is on its anchor or up to 36 px away.
 *   A name with no clear spot is omitted. Land names are not in the result and do not move.
 * Exceptions: None.
 */

import { LABEL_COLLISION_PADDING_PX } from './mapLabelRules';
import { centeredBoxesMeet, insideInset, type LabelBox, type PlacedMapLabel } from './mapLabelPlacement';
import { labelNudgeOffsetsWithin, type LabelNudge, type NudgedMapLabel } from './mapLabelNudge';

/**
 * Farthest a water name may move from its anchor, in CSS pixels.
 *
 * Purpose: A water name can step aside without leaving the body it names.
 * When to use: Building the water shift grid.
 * Expected outcome: 36, which is three steps of the shared 12 px grid, including `{0, -36}`.
 * Exceptions: None.
 */
export const WATER_LABEL_NUDGE_MAX_PX = 36;

/**
 * Most water names drawn in one frame.
 *
 * Purpose: A dense coast must not fill the map with water names.
 * When to use: `settleWaterLabels`, after a name has found a clear spot.
 * Expected outcome: At most this many water names. Later names in input order are not tried once the cap is reached.
 * Exceptions: None.
 */
export const MAX_WATER_LABELS_PER_FRAME = 40;

/**
 * What the water shift pass needs besides the water labels.
 *
 * Purpose: Land names stay fixed, and a water name can keep last frame's shift.
 * When to use: `settleWaterLabels`.
 * Expected outcome: The view size, the land labels as they will be painted, and the previous water shifts.
 * Exceptions: None.
 */
export interface WaterLabelFrame {
  /**
   * View size in CSS pixels.
   *
   * Contract: Positive width and height.
   * When to use: The inset test for a shifted center.
   * Expected outcome: The label canvas size.
   * Exceptions: None.
   */
  readonly viewSize: { readonly width: number; readonly height: number };
  /**
   * Land labels as they will be painted, after their own shift.
   *
   * Contract: Their centers are the drawn centers. This pass does not move them.
   * When to use: As obstacles. They are not returned.
   * Expected outcome: Every land name that will be painted this frame.
   * Exceptions: None.
   */
  readonly landLabels: readonly LabelBox[];
  /**
   * Shifts chosen for water names last frame, by feature id.
   *
   * Contract: Keyed by feature id. Missing ids have no previous shift.
   * When to use: After the anchor is blocked and before the rest of the grid.
   * Expected outcome: The name keeps that shift when it is still clear.
   * Exceptions: None.
   */
  readonly previousNudges: ReadonlyMap<string, LabelNudge>;
}

/** Shifts a water name may try, nearest first. The first entry is `{0, 0}`. */
const WATER_NUDGE_OFFSETS: readonly LabelNudge[] = labelNudgeOffsetsWithin(WATER_LABEL_NUDGE_MAX_PX);

/**
 * Places water names so they do not cover land names or each other.
 *
 * Purpose: Land names are already final. A water name moves up to `WATER_LABEL_NUDGE_MAX_PX` or is left off.
 * When to use: Once per frame, with `chooseMapLabelAnchors` output in its sort order.
 * Expected outcome: Drawn centers. At most `MAX_WATER_LABELS_PER_FRAME` labels. Input order is kept among the names that fit.
 * Exceptions: None.
 */
export function settleWaterLabels(
  water: readonly PlacedMapLabel[],
  frame: WaterLabelFrame,
): NudgedMapLabel[] {
  const accepted: NudgedMapLabel[] = [];
  for (const label of water) {
    if (accepted.length >= MAX_WATER_LABELS_PER_FRAME) break;
    const nudge = firstClearNudge(label, accepted, frame);
    if (nudge == null) continue;
    accepted.push({
      ...label,
      x: label.x + nudge.dx,
      y: label.y + nudge.dy,
      nudge,
    });
  }
  return accepted;
}

/**
 * The first shift that keeps one water name off the land names and the water names already kept.
 *
 * Purpose: The anchor wins, then last frame's shift, then the nearest new spot.
 * When to use: For each water label until the frame cap is full.
 * Expected outcome: A shift, or null when every spot within `WATER_LABEL_NUDGE_MAX_PX` is blocked.
 * Exceptions: None.
 */
function firstClearNudge(
  label: PlacedMapLabel,
  accepted: readonly NudgedMapLabel[],
  frame: WaterLabelFrame,
): LabelNudge | null {
  const attempts: LabelNudge[] = [{ dx: 0, dy: 0 }];
  const previous = frame.previousNudges.get(label.featureId);
  if (previous != null) attempts.push(previous);
  attempts.push(...WATER_NUDGE_OFFSETS);
  for (const nudge of attempts) {
    const box: LabelBox = {
      x: label.x + nudge.dx,
      y: label.y + nudge.dy,
      width: label.width,
      height: label.height,
    };
    if (isClearSpot(box, accepted, frame)) return nudge;
  }
  return null;
}

/**
 * Whether a shifted water box may be drawn.
 *
 * Purpose: A water name is omitted rather than painted on top of another name.
 * When to use: From `firstClearNudge`.
 * Expected outcome: True when the center is inside the inset and the box meets no land label and no accepted water label.
 * Exceptions: None.
 */
function isClearSpot(
  box: LabelBox,
  accepted: readonly NudgedMapLabel[],
  frame: WaterLabelFrame,
): boolean {
  if (!insideInset(box, frame.viewSize)) return false;
  const hitsLand = frame.landLabels.some((land) => centeredBoxesMeet(box, land, LABEL_COLLISION_PADDING_PX));
  if (hitsLand) return false;
  return !accepted.some((other) => centeredBoxesMeet(box, other, LABEL_COLLISION_PADDING_PX));
}
