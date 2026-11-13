/**
 * Moves a broader place name off the names drawn on top of it.
 *
 * Purpose: A continent should not sit on a country, and a country should not sit on a state, when a clear spot is close.
 * When to use: After `placeMapLabels`, once per frame. The input must stay in that function's paint order.
 * Expected outcome: Each broad name is at its anchor, or up to 60 px away. The smaller names do not move.
 * Exceptions: None. A name with no allowed spot stays on its anchor.
 */

import type { MapLabelKind } from './mapLabelRules';
import { LABEL_COLLISION_PADDING_PX } from './mapLabelRules';
import { centeredBoxesMeet, insideInset, type LabelBox, type PlacedMapLabel } from './mapLabelPlacement';

/**
 * A shift from a label's anchor, in CSS pixels.
 *
 * Purpose: The next frame can keep a shift that is still the right one.
 * When to use: `LabelNudgeFrame.previousNudges` and `NudgedMapLabel.nudge`.
 * Expected outcome: `{0, 0}` when the name sits on its anchor.
 * Exceptions: None.
 */
export interface LabelNudge {
  /**
   * Horizontal shift in CSS pixels.
   *
   * Contract: A multiple of `LABEL_NUDGE_STEP_PX`, or a shift stored from an earlier frame.
   * When to use: Added to the anchor's x.
   * Expected outcome: Positive moves right.
   * Exceptions: None.
   */
  readonly dx: number;
  /**
   * Vertical shift in CSS pixels.
   *
   * Contract: A multiple of `LABEL_NUDGE_STEP_PX`, or a shift stored from an earlier frame.
   * When to use: Added to the anchor's y.
   * Expected outcome: Positive moves down.
   * Exceptions: None.
   */
  readonly dy: number;
}

/**
 * A placed label plus the shift that was applied to its center.
 *
 * Purpose: The painter draws `x` and `y` and does not add `nudge` again.
 * When to use: The result of `nudgeBroadLabels`.
 * Expected outcome: `x` and `y` are the anchor plus `nudge`.
 * Exceptions: None.
 */
export interface NudgedMapLabel extends PlacedMapLabel {
  /**
   * Shift from the anchor to the drawn center.
   *
   * Contract: The shift chosen for this frame.
   * When to use: Stored for the next frame. Not added to `x` and `y` again.
   * Expected outcome: `{0, 0}` when the name did not move.
   * Exceptions: None.
   */
  readonly nudge: LabelNudge;
}

/**
 * What the shift pass needs besides the labels.
 *
 * Purpose: The view edge and the previous shifts stay with the caller.
 * When to use: `nudgeBroadLabels`.
 * Expected outcome: The view size and the shifts from the previous frame.
 * Exceptions: None.
 */
export interface LabelNudgeFrame {
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
   * Shifts chosen last time these labels were drawn.
   *
   * Contract: Keyed by feature id. Missing ids are treated as having no previous shift.
   * When to use: When the anchor is still blocked and the old spot is still clear.
   * Expected outcome: The name keeps that shift instead of hopping to another clear spot.
   * Exceptions: None.
   */
  readonly previousNudges: ReadonlyMap<string, LabelNudge>;
}

/**
 * Farthest a broad name may move from its anchor.
 *
 * Purpose: A short move stays readable as the same name. A long move looks like a different place.
 * When to use: Building `LABEL_NUDGE_OFFSETS`.
 * Expected outcome: 60.
 * Exceptions: None.
 */
const LABEL_NUDGE_MAX_PX = 60;

/**
 * Distance between tried shifts.
 *
 * Purpose: A coarser grid keeps the search small and the chosen spot stable.
 * When to use: Building `LABEL_NUDGE_OFFSETS`.
 * Expected outcome: 12.
 * Exceptions: None.
 */
const LABEL_NUDGE_STEP_PX = 12;

/**
 * Gap required between a broad name and a name drawn on top of it.
 *
 * Purpose: The names should not touch, and the gap should stay smaller than the same-kind collision gap.
 * When to use: Counting overlaps with the foreground kind.
 * Expected outcome: 2.
 * Exceptions: None.
 */
const LABEL_NUDGE_GAP_PX = 2;

/**
 * No shift.
 *
 * Purpose: The anchor is one object, shared by every label that stays put.
 * When to use: When the anchor is clear, when only one kind is on screen, and when no spot is allowed.
 * Expected outcome: `{0, 0}`.
 * Exceptions: None.
 */
const ZERO_NUDGE: LabelNudge = { dx: 0, dy: 0 };

/**
 * Shifts to try, nearest first.
 *
 * Purpose: The search order is fixed, so the same overlap chooses the same spot every frame.
 * When to use: `chooseNudge`, after the anchor and the previous shift have been rejected.
 * Expected outcome: `{0, 0}` first. The first entry of length 36 with `dx` 0 is `{0, -36}`.
 *   A max of 36 includes that entry because 36 divides the 12 px step.
 * Exceptions: None.
 */
const LABEL_NUDGE_OFFSETS: readonly LabelNudge[] = labelNudgeOffsetsWithin(LABEL_NUDGE_MAX_PX);

/**
 * Builds the shift grid for one maximum distance.
 *
 * Purpose: Land names and water names search the same step, out to different limits.
 * When to use: At module load for the land grid, and for the water grid.
 * Expected outcome: Every step-multiple whose length is at most `maxPx`, nearest first. `{0, 0}` is first.
 * Exceptions: None.
 */
export function labelNudgeOffsetsWithin(maxPx: number): LabelNudge[] {
  const steps = maxPx / LABEL_NUDGE_STEP_PX;
  const values = Array.from({ length: steps * 2 + 1 }, (_value, index) => (index - steps) * LABEL_NUDGE_STEP_PX);
  return values
    .flatMap((dx) => values.map((dy) => ({ dx, dy })))
    .filter((offset) => Math.hypot(offset.dx, offset.dy) <= maxPx)
    .sort(compareNudgeOffsets);
}

/**
 * Nearest shift first, then the one with the smaller horizontal component, then the higher one.
 *
 * Purpose: An upward step is tried before the downward step of the same length.
 * When to use: Sorting `LABEL_NUDGE_OFFSETS`.
 * Expected outcome: A negative number when `left` should be tried first.
 * Exceptions: None.
 */
function compareNudgeOffsets(left: LabelNudge, right: LabelNudge): number {
  const length = Math.hypot(left.dx, left.dy) - Math.hypot(right.dx, right.dy);
  if (length !== 0) return length;
  const absDx = Math.abs(left.dx) - Math.abs(right.dx);
  if (absDx !== 0) return absDx;
  if (left.dy !== right.dy) return left.dy - right.dy;
  return left.dx - right.dx;
}

/**
 * Moves broad names off the smaller names.
 *
 * Purpose: The name on top keeps its place. The broader name yields when a clear spot is close, and returns when its anchor is clear.
 * When to use: Once per frame, with labels in paint order. The last kind is the one drawn on top.
 * Expected outcome: Input order. `x` and `y` are the drawn center. A single kind does not move.
 * Exceptions: None.
 */
export function nudgeBroadLabels(
  labels: readonly PlacedMapLabel[],
  frame: LabelNudgeFrame,
): NudgedMapLabel[] {
  if (labels.length === 0) return [];
  const foregroundKind = labels[labels.length - 1]!.kind;
  const foreground = labels.filter((label) => label.kind === foregroundKind);
  if (foreground.length === labels.length) return labels.map((label) => withNudge(label, ZERO_NUDGE));
  const current = labels.map((label) => withNudge(label, ZERO_NUDGE));
  for (let index = 0; index < current.length; index += 1) {
    const label = current[index]!;
    if (label.kind === foregroundKind) continue;
    const nudge = chooseNudge(label, current, foreground, foregroundKind, frame);
    current[index] = withNudge(label, nudge);
  }
  return current;
}

/**
 * The inputs `chooseNudge` reads for one broad label.
 *
 * Purpose: Keeps that function under the argument limit.
 * When to use: Inside `nudgeBroadLabels`.
 * Expected outcome: The anchor, the labels already considered, and the names drawn on top.
 * Exceptions: None.
 */
interface NudgeChoice {
  /**
   * Broad label being moved.
   *
   * Contract: Its `x` and `y` are still the anchor.
   * When to use: As the origin of the shift.
   * Expected outcome: One label that is not the foreground kind.
   * Exceptions: None.
   */
  readonly label: NudgedMapLabel;
  /**
   * Labels in input order, with earlier broad names already moved.
   *
   * Contract: The same length and order as the input.
   * When to use: To keep a shift off another broad name.
   * Expected outcome: Drawn centers for labels already chosen, anchors for the rest.
   * Exceptions: None.
   */
  readonly current: readonly NudgedMapLabel[];
  /**
   * Names drawn on top.
   *
   * Contract: Every label of the foreground kind.
   * When to use: Counting overlaps.
   * Expected outcome: The labels that do not move.
   * Exceptions: None.
   */
  readonly foreground: readonly PlacedMapLabel[];
  /**
   * Kind drawn on top.
   *
   * Contract: The kind of the last input label.
   * When to use: Deciding which labels are broad.
   * Expected outcome: State, country, or continent, matching the paint order.
   * Exceptions: None.
   */
  readonly foregroundKind: MapLabelKind;
  /**
   * View size and previous shifts.
   *
   * Contract: The frame passed to `nudgeBroadLabels`.
   * When to use: The inset test and the previous-shift test.
   * Expected outcome: The same frame for every label in this call.
   * Exceptions: None.
   */
  readonly frame: LabelNudgeFrame;
}

/**
 * Picks the shift for one broad label.
 *
 * Purpose: A clear anchor wins. A still-clear previous shift wins over a nearer new spot. Otherwise the nearest clear spot wins, then the fewest overlaps.
 * When to use: For each label that is not the foreground kind.
 * Expected outcome: A shift whose center is inside the inset when any such spot exists. `{0, 0}` when none does.
 * Exceptions: None.
 */
function chooseNudge(
  label: NudgedMapLabel,
  current: readonly NudgedMapLabel[],
  foreground: readonly PlacedMapLabel[],
  foregroundKind: MapLabelKind,
  frame: LabelNudgeFrame,
): LabelNudge {
  const choice: NudgeChoice = { label, current, foreground, foregroundKind, frame };
  if (isClear(choice, ZERO_NUDGE)) return ZERO_NUDGE;
  const previous = frame.previousNudges.get(label.featureId);
  if (previous != null && isClear(choice, previous)) return previous;
  let best: LabelNudge | null = null;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const offset of LABEL_NUDGE_OFFSETS) {
    if (!isAllowed(choice, offset)) continue;
    const count = overlapCount(choice, offset);
    if (count === 0) return offset;
    if (count < bestCount) {
      best = offset;
      bestCount = count;
    }
  }
  return best ?? ZERO_NUDGE;
}

/**
 * Whether a shift is clear of every smaller name.
 *
 * Purpose: A clear anchor, or a clear previous shift, is taken before the search.
 * When to use: `chooseNudge`.
 * Expected outcome: True when the spot is allowed and meets no foreground label.
 * Exceptions: None.
 */
function isClear(choice: NudgeChoice, nudge: LabelNudge): boolean {
  return isAllowed(choice, nudge) && overlapCount(choice, nudge) === 0;
}

/**
 * Whether a shifted center may be used.
 *
 * Purpose: The name must stay inside the inset and must not land on another broad name.
 * When to use: `isClear` and the overlap search.
 * Expected outcome: False when the center is in the margin or the box meets another broad label.
 * Exceptions: None.
 */
function isAllowed(choice: NudgeChoice, nudge: LabelNudge): boolean {
  const box = shiftedBox(choice.label, nudge);
  if (!insideInset(box, choice.frame.viewSize)) return false;
  return !choice.current.some((other) => (
    other.featureId !== choice.label.featureId
    && other.kind !== choice.foregroundKind
    && centeredBoxesMeet(box, other, LABEL_COLLISION_PADDING_PX)
  ));
}

/**
 * How many smaller names a shift meets.
 *
 * Purpose: With no clear spot, the name takes the spot that covers the fewest of them.
 * When to use: `isClear` and the fallback in `chooseNudge`.
 * Expected outcome: A count from zero through the number of foreground labels.
 * Exceptions: None.
 */
function overlapCount(choice: NudgeChoice, nudge: LabelNudge): number {
  const box = shiftedBox(choice.label, nudge);
  return choice.foreground.reduce(
    (count, label) => count + (centeredBoxesMeet(box, label, LABEL_NUDGE_GAP_PX) ? 1 : 0),
    0,
  );
}

/**
 * The drawn box for one shift.
 *
 * Purpose: Overlap tests use the center after the shift, not the anchor.
 * When to use: `isAllowed` and `overlapCount`.
 * Expected outcome: The label's size at the shifted center.
 * Exceptions: None.
 */
function shiftedBox(label: PlacedMapLabel, nudge: LabelNudge): LabelBox {
  return {
    x: label.x + nudge.dx,
    y: label.y + nudge.dy,
    width: label.width,
    height: label.height,
  };
}

/**
 * Copies a label to its drawn center.
 *
 * Purpose: `x` and `y` are what the painter uses.
 * When to use: When a nudge has been chosen, and when a foreground label stays put.
 * Expected outcome: A label whose center is the anchor plus `nudge`.
 * Exceptions: None.
 */
function withNudge(label: PlacedMapLabel, nudge: LabelNudge): NudgedMapLabel {
  return {
    ...label,
    x: label.x + nudge.dx,
    y: label.y + nudge.dy,
    nudge,
  };
}
