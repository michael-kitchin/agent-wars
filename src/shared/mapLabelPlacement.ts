/**
 * Chooses which place names to draw and where.
 *
 * Purpose: One label per feature, kept at the same anchor while that anchor stays usable, and names do not pile up.
 * When to use: Once per map frame, after the visible kinds are known.
 * Expected outcome: At most `MAX_LABELS_PER_FRAME` labels, in paint order. A different kind does not
 *   displace another kind. A later kind is painted on top. Two labels of the same kind do not overlap.
 * Exceptions: None. A feature with no usable anchor is omitted.
 */

import type { MapLabelAnchor, MapLabelFeature } from './mapLabelPack';
import {
  COUNTRY_LABEL_ZOOM_DELAY,
  LABEL_COLLISION_PADDING_PX,
  LABEL_MIN_ZOOM_SLACK,
  LABEL_VIEW_INSET_PX,
  MAX_LABELS_PER_FRAME,
  STATE_LABEL_MIN_RADIUS_PX,
  labelDisplayText,
  mercatorMetersPerPixel,
  type MapLabelKind,
} from './mapLabelRules';

const KIND_ORDER: Readonly<Record<MapLabelKind, number>> = { continent: 0, country: 1, state: 2 };

/**
 * What the placement pass needs from the current frame.
 *
 * Purpose: Projection and measurement stay with the canvas. This module stays about choice.
 * When to use: `placeMapLabels`.
 * Expected outcome: Features, the kinds in view, the zoom, the view size, and the previous choices.
 * Exceptions: None.
 */
export interface LabelPlacementInput {
  /**
   * Features that might be named.
   *
   * Contract: Parsed place-name features.
   * When to use: The full list, or the ones whose bounds meet the view.
   * Expected outcome: Candidates. This function still applies the kind and zoom tests.
   * Exceptions: None.
   */
  readonly features: readonly MapLabelFeature[];
  /**
   * Kinds the current view draws.
   *
   * Contract: The result of `visibleLabelKinds`.
   * When to use: Every frame.
   * Expected outcome: A feature of another kind is omitted.
   * Exceptions: None.
   */
  readonly kinds: readonly MapLabelKind[];
  /**
   * Map zoom.
   *
   * Contract: A number.
   * When to use: The minimum-zoom test and the fragment-height test.
   * Expected outcome: Passed to `labelFeatureIsCandidate` and the fragment-height test.
   * Exceptions: None.
   */
  readonly zoom: number;
  /**
   * View size in CSS pixels.
   *
   * Contract: Positive width and height.
   * When to use: The inset test and the distance to the view center.
   * Expected outcome: An anchor outside the inset is unusable.
   * Exceptions: None.
   */
  readonly viewSize: { readonly width: number; readonly height: number };
  /**
   * Projects an anchor to CSS pixels.
   *
   * Contract: The caller has already applied any longitude shift. This function does not know about longitude.
   * When to use: For every anchor of a candidate.
   * Expected outcome: An on-screen point. The view origin is the top left.
   * Exceptions: None.
   */
  readonly project: (lat: number, lng: number) => { readonly x: number; readonly y: number };
  /**
   * Measures the drawn text.
   *
   * Contract: Width and height in CSS pixels for the feature's display text.
   * When to use: Once per candidate that has a usable anchor.
   * Expected outcome: The box that will be drawn, centered on the anchor.
   * Exceptions: None.
   */
  readonly measure: (feature: MapLabelFeature) => { readonly width: number; readonly height: number };
  /**
   * Anchor index used for each feature last frame.
   *
   * Contract: A map of feature id to index. Missing ids have no previous choice.
   * When to use: So a label does not jump while its previous anchor is still usable.
   * Expected outcome: The previous index wins over a closer one.
   * Exceptions: None.
   */
  readonly previousAnchors: ReadonlyMap<string, number>;
}

/**
 * One label that passed collision.
 *
 * Purpose: The painter draws this and remembers `anchorIndex`.
 * When to use: The result of `placeMapLabels`.
 * Expected outcome: A centered box in CSS pixels.
 * Exceptions: None.
 */
export interface PlacedMapLabel {
  /**
   * Feature id.
   *
   * Contract: The feature's id.
   * When to use: The key in the next frame's `previousAnchors`.
   * Expected outcome: A stable id.
   * Exceptions: None.
   */
  readonly featureId: string;
  /**
   * Place-name kind.
   *
   * Contract: One of the input kinds.
   * When to use: Choosing the font and the color.
   * Expected outcome: The feature's kind.
   * Exceptions: None.
   */
  readonly kind: MapLabelKind;
  /**
   * Text to draw.
   *
   * Contract: The result of `labelDisplayText`.
   * When to use: `fillText`.
   * Expected outcome: Capitals for continents and countries.
   * Exceptions: None.
   */
  readonly text: string;
  /**
   * Horizontal center in CSS pixels.
   *
   * Contract: The projected anchor.
   * When to use: With `textAlign` center.
   * Expected outcome: Inside the view inset.
   * Exceptions: None.
   */
  readonly x: number;
  /**
   * Vertical center in CSS pixels.
   *
   * Contract: The projected anchor.
   * When to use: With `textBaseline` middle.
   * Expected outcome: Inside the view inset.
   * Exceptions: None.
   */
  readonly y: number;
  /**
   * Box width in CSS pixels.
   *
   * Contract: The measured width.
   * When to use: Collision and drawing.
   * Expected outcome: The measured value.
   * Exceptions: None.
   */
  readonly width: number;
  /**
   * Box height in CSS pixels.
   *
   * Contract: The measured height.
   * When to use: Collision and the fragment-height test.
   * Expected outcome: The measured value.
   * Exceptions: None.
   */
  readonly height: number;
  /**
   * Index of the anchor that was used.
   *
   * Contract: An index into the feature's anchors. 0 is the primary point.
   * When to use: Stored for the next frame.
   * Expected outcome: A usable anchor.
   * Exceptions: None.
   */
  readonly anchorIndex: number;
}

/**
 * A candidate that has a chosen anchor.
 *
 * Purpose: Sorting happens after the anchor is chosen and before collision.
 * When to use: Inside `placeMapLabels`.
 * Expected outcome: One feature, its measured box, and the anchor index.
 * Exceptions: None.
 */
interface ChosenLabel {
  /**
   * The feature being placed.
   *
   * Contract: A feature that passed the kind and zoom tests.
   * When to use: Sorting and the result id.
   * Expected outcome: The source feature.
   * Exceptions: None.
   */
  readonly feature: MapLabelFeature;
  /**
   * Index of the chosen anchor.
   *
   * Contract: An index into `feature.anchors`.
   * When to use: The result and the next frame's memory.
   * Expected outcome: A usable anchor.
   * Exceptions: None.
   */
  readonly anchorIndex: number;
  /**
   * Horizontal center in CSS pixels.
   *
   * Contract: The projected anchor.
   * When to use: Collision.
   * Expected outcome: Inside the view inset.
   * Exceptions: None.
   */
  readonly x: number;
  /**
   * Vertical center in CSS pixels.
   *
   * Contract: The projected anchor.
   * When to use: Collision.
   * Expected outcome: Inside the view inset.
   * Exceptions: None.
   */
  readonly y: number;
  /**
   * Measured width in CSS pixels.
   *
   * Contract: A positive number.
   * When to use: Collision.
   * Expected outcome: The measured width.
   * Exceptions: None.
   */
  readonly width: number;
  /**
   * Measured height in CSS pixels.
   *
   * Contract: A positive number.
   * When to use: Collision.
   * Expected outcome: The measured height.
   * Exceptions: None.
   */
  readonly height: number;
}

/**
 * Places the labels for one frame.
 *
 * Purpose: The same rules run in tests and on the map.
 * When to use: From the label canvas, once per draw.
 * Expected outcome: Labels in kind, rank, minimum zoom, largest anchor radius, then id order, stopping at the frame cap.
 *   A label is skipped only when it meets another label of the same kind. A later kind is painted on top.
 *   The previous anchor is kept while it stays usable. Otherwise the primary anchor wins, then the usable anchor nearest the center.
 * Exceptions: None.
 */
export function placeMapLabels(input: LabelPlacementInput): PlacedMapLabel[] {
  const chosen: ChosenLabel[] = [];
  for (const feature of input.features) {
    if (!labelFeatureIsCandidate(feature, input.kinds, input.zoom)) continue;
    const selection = chooseAnchor(feature, input);
    if (selection == null) continue;
    chosen.push(selection);
  }
  chosen.sort(compareChosen);
  const placed: PlacedMapLabel[] = [];
  for (const label of chosen) {
    if (placed.length >= MAX_LABELS_PER_FRAME) break;
    if (placed.some((other) => boxesOverlap(label, other))) continue;
    placed.push({
      featureId: label.feature.id,
      kind: label.feature.kind,
      text: labelDisplayText(label.feature),
      x: label.x,
      y: label.y,
      width: label.width,
      height: label.height,
      anchorIndex: label.anchorIndex,
    });
  }
  return placed;
}

/**
 * Largest inscribed radius stored for a feature.
 *
 * Purpose: The primary anchor can sit on a sliver while another piece of the same feature is large enough to name.
 * When to use: The state size test and the collision tie-break.
 * Expected outcome: The greatest `radiusM` among the anchors. Zero when the feature has none.
 * Exceptions: None.
 */
function largestAnchorRadiusM(feature: MapLabelFeature): number {
  let largest = 0;
  for (const anchor of feature.anchors) {
    if (anchor.radiusM > largest) largest = anchor.radiusM;
  }
  return largest;
}

/**
 * Whether a feature belongs in this frame before its anchors are tested.
 *
 * Purpose: Kind, minimum zoom, and state size are cheaper than projection, and the canvas uses the same test for memory.
 * When to use: The first filter in `placeMapLabels`, and before the bounds test on the label canvas.
 * Expected outcome: False for a kind that is not visible. Continents pass with no further test.
 *   A country passes once the zoom reaches its minimum plus `COUNTRY_LABEL_ZOOM_DELAY`.
 *   A state passes from `LABEL_MIN_ZOOM_SLACK` below its minimum, once its largest anchor covers `STATE_LABEL_MIN_RADIUS_PX`.
 * Exceptions: None.
 */
export function labelFeatureIsCandidate(
  feature: MapLabelFeature,
  kinds: readonly MapLabelKind[],
  zoom: number,
): boolean {
  if (!kinds.includes(feature.kind)) return false;
  if (feature.kind === 'continent') return true;
  if (feature.kind === 'country') return feature.minZoom + COUNTRY_LABEL_ZOOM_DELAY <= zoom;
  return feature.minZoom <= zoom + LABEL_MIN_ZOOM_SLACK
    && largestAnchorRadiusM(feature) / mercatorMetersPerPixel(zoom) >= STATE_LABEL_MIN_RADIUS_PX;
}

/**
 * Picks the anchor for one feature.
 *
 * Purpose: A label should not jump, and a fragment has to be large enough to read.
 * When to use: After the feature has passed the kind and zoom tests.
 * Expected outcome: The previous index when it is still usable, else index 0, else the usable anchor nearest the view center.
 *   Null when none are usable.
 * Exceptions: None.
 */
function chooseAnchor(feature: MapLabelFeature, input: LabelPlacementInput): ChosenLabel | null {
  const measured = input.measure(feature);
  const usable: Array<{ index: number; x: number; y: number }> = [];
  feature.anchors.forEach((anchor, index) => {
    const point = input.project(anchor.lat, anchor.lng);
    if (!insideInset(point, input.viewSize)) return;
    if (index > 0 && !fragmentIsTallEnough(anchor, measured.height, input.zoom)) return;
    usable.push({ index, x: point.x, y: point.y });
  });
  if (usable.length === 0) return null;
  const previous = input.previousAnchors.get(feature.id);
  const chosen = usable.find((anchor) => anchor.index === previous)
    ?? usable.find((anchor) => anchor.index === 0)
    ?? nearestCenter(usable, input.viewSize);
  return {
    feature,
    anchorIndex: chosen.index,
    x: chosen.x,
    y: chosen.y,
    width: measured.width,
    height: measured.height,
  };
}

/**
 * Whether a point is inside the view, away from the edges.
 *
 * Purpose: A name cut by the screen edge is harder to read than no name.
 * When to use: For every projected anchor.
 * Expected outcome: True when the point is at least `LABEL_VIEW_INSET_PX` from each edge.
 * Exceptions: None.
 */
export function insideInset(
  point: { readonly x: number; readonly y: number },
  viewSize: { readonly width: number; readonly height: number },
): boolean {
  return point.x >= LABEL_VIEW_INSET_PX
    && point.y >= LABEL_VIEW_INSET_PX
    && point.x <= viewSize.width - LABEL_VIEW_INSET_PX
    && point.y <= viewSize.height - LABEL_VIEW_INSET_PX;
}

/**
 * Whether a fragment's inscribed circle is at least as tall as the text.
 *
 * Purpose: A sliver of a country should not carry the country's name.
 * When to use: For every anchor except the primary one.
 * Expected outcome: True when `radiusM` covers at least the measured height at this zoom.
 * Exceptions: None.
 */
function fragmentIsTallEnough(anchor: MapLabelAnchor, height: number, zoom: number): boolean {
  return anchor.radiusM / mercatorMetersPerPixel(zoom) >= height;
}

/**
 * The usable anchor closest to the middle of the view.
 *
 * Purpose: When the primary point is off screen, the name sits on the visible piece nearest the reader.
 * When to use: After the previous index and index 0 have been rejected.
 * Expected outcome: One of the usable anchors. The list is not empty.
 * Exceptions: None.
 */
function nearestCenter(
  usable: readonly { index: number; x: number; y: number }[],
  viewSize: { readonly width: number; readonly height: number },
): { index: number; x: number; y: number } {
  const centerX = viewSize.width / 2;
  const centerY = viewSize.height / 2;
  let best = usable[0]!;
  let bestDistance = distanceSquared(best, centerX, centerY);
  for (const anchor of usable) {
    const distance = distanceSquared(anchor, centerX, centerY);
    if (distance < bestDistance) {
      best = anchor;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Squared distance from a point to the view center.
 *
 * Purpose: Comparing distances does not need the square root.
 * When to use: From `nearestCenter`.
 * Expected outcome: A non-negative number.
 * Exceptions: None.
 */
function distanceSquared(
  point: { readonly x: number; readonly y: number },
  centerX: number,
  centerY: number,
): number {
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  return dx * dx + dy * dy;
}

/**
 * Priority order for collision.
 *
 * Purpose: Later kinds are painted on top, so a state sits over a country and a country sits over a continent.
 * When to use: Before the greedy pass.
 * Expected outcome: Continent, then country, then state. Within a kind, smaller rank, then smaller minimum zoom, then larger anchor radius, then id.
 * Exceptions: None.
 */
function compareChosen(left: ChosenLabel, right: ChosenLabel): number {
  const kind = KIND_ORDER[left.feature.kind] - KIND_ORDER[right.feature.kind];
  if (kind !== 0) return kind;
  if (left.feature.rank !== right.feature.rank) return left.feature.rank - right.feature.rank;
  if (left.feature.minZoom !== right.feature.minZoom) return left.feature.minZoom - right.feature.minZoom;
  const radius = largestAnchorRadiusM(right.feature) - largestAnchorRadiusM(left.feature);
  if (radius !== 0) return radius;
  return left.feature.id < right.feature.id ? -1 : left.feature.id > right.feature.id ? 1 : 0;
}

/**
 * Whether two centered boxes meet after the candidate is padded.
 *
 * Purpose: Names of the same kind need a gap. A different kind may share the place and is painted later.
 * When to use: Against every label already accepted.
 * Expected outcome: False when the kinds differ. Otherwise true when the candidate,
 *   grown by `LABEL_COLLISION_PADDING_PX`, meets the placed box.
 * Exceptions: None.
 */
function boxesOverlap(candidate: ChosenLabel, placed: PlacedMapLabel): boolean {
  return candidate.feature.kind === placed.kind
    && centeredBoxesMeet(candidate, placed, LABEL_COLLISION_PADDING_PX);
}

/**
 * A centered label box.
 *
 * Purpose: Collision and the broad-name shift share one overlap test.
 * When to use: `centeredBoxesMeet`.
 * Expected outcome: Center, width, and height in CSS pixels.
 * Exceptions: None.
 */
export interface LabelBox {
  /**
   * Horizontal center in CSS pixels.
   *
   * Contract: A number.
   * When to use: The overlap test.
   * Expected outcome: The box center.
   * Exceptions: None.
   */
  readonly x: number;
  /**
   * Vertical center in CSS pixels.
   *
   * Contract: A number.
   * When to use: The overlap test.
   * Expected outcome: The box center.
   * Exceptions: None.
   */
  readonly y: number;
  /**
   * Width in CSS pixels.
   *
   * Contract: A non-negative number.
   * When to use: The overlap test.
   * Expected outcome: The box width.
   * Exceptions: None.
   */
  readonly width: number;
  /**
   * Height in CSS pixels.
   *
   * Contract: A non-negative number.
   * When to use: The overlap test.
   * Expected outcome: The box height.
   * Exceptions: None.
   */
  readonly height: number;
}

/**
 * Whether two centered boxes meet, including a gap.
 *
 * Purpose: Same-kind collision and the broad-name shift use one comparison.
 * When to use: With `LABEL_COLLISION_PADDING_PX` for two names of the same kind, or a smaller gap against a name drawn on top.
 * Expected outcome: True when the gap between the boxes is below `paddingPx`.
 * Exceptions: None.
 */
export function centeredBoxesMeet(a: LabelBox, b: LabelBox, paddingPx: number): boolean {
  return Math.abs(a.x - b.x) * 2 < a.width + b.width + paddingPx * 2
    && Math.abs(a.y - b.y) * 2 < a.height + b.height + paddingPx * 2;
}
