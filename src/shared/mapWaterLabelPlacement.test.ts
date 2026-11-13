/**
 * Contracts for placing water names after land names are final.
 * Run: `node dist/shared/mapWaterLabelPlacement.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapLabelKind } from './mapLabelRules';
import { LABEL_COLLISION_PADDING_PX } from './mapLabelRules';
import { centeredBoxesMeet, type PlacedMapLabel } from './mapLabelPlacement';
import type { LabelNudge } from './mapLabelNudge';
import { settleWaterLabels, type WaterLabelFrame } from './mapWaterLabelPlacement';

const VIEW = { width: 1000, height: 800 };

/**
 * Builds one placed label.
 *
 * Purpose: The water tests choose boxes instead of going through placement.
 * When to use: From each water placement test.
 * Expected outcome: A label whose text is its id and whose anchor index is 0.
 * Exceptions: None.
 */
function label(
  id: string,
  kind: MapLabelKind,
  x: number,
  y: number,
  width = 40,
  height = 16,
): PlacedMapLabel {
  return { featureId: id, kind, text: id, x, y, width, height, anchorIndex: 0 };
}

/**
 * Builds a frame for a 1000 by 800 view.
 *
 * Purpose: The water tests share one view.
 * When to use: From each water placement test.
 * Expected outcome: The view size, the land boxes, and the previous water shifts.
 * Exceptions: None.
 */
function frame(
  landLabels: WaterLabelFrame['landLabels'] = [],
  previousNudges: ReadonlyMap<string, LabelNudge> = new Map(),
): WaterLabelFrame {
  return { viewSize: VIEW, landLabels, previousNudges };
}

/**
 * Confirms a clear water name stays on its anchor.
 *
 * Purpose: A shift is for an overlap, not for every water name.
 * When to use: As the contract test for a clear anchor.
 * Expected outcome: The label at its anchor with nudge `{0, 0}`.
 * Exceptions: Assertion failures when the name moves or is omitted.
 */
test('a clear water name stays on its anchor', () => {
  const water = label('sea', 'major_water', 500, 400);
  const placed = settleWaterLabels([water], frame());
  assert.equal(placed.length, 1);
  assert.deepEqual(placed[0]?.nudge, { dx: 0, dy: 0 });
  assert.equal(placed[0]?.x, 500);
  assert.equal(placed[0]?.y, 400);
});

/**
 * Confirms a water name moves off a land name and the land name stays out of the result.
 *
 * Purpose: Land names are already final.
 * When to use: As the contract test for a blocked anchor with room above.
 * Expected outcome: The water name is higher than its anchor and no longer meets the land box.
 * Exceptions: Assertion failures when the water name stays, is omitted, or still meets the land box.
 */
test('a blocked water name moves off the land name', () => {
  const land = label('land', 'country', 500, 400);
  const placed = settleWaterLabels([label('sea', 'major_water', 500, 400)], frame([land]));
  assert.equal(placed.length, 1);
  const water = placed[0]!;
  assert.ok(water.y < 400);
  assert.equal(centeredBoxesMeet(water, land, LABEL_COLLISION_PADDING_PX), false);
  assert.equal(placed.some((entry) => entry.featureId === 'land'), false);
});

/**
 * Confirms a water name with no spot inside 36 px is omitted.
 *
 * Purpose: A water name is not drawn on top of a land name.
 * When to use: As the contract test for a fully blocked neighborhood.
 * Expected outcome: No label.
 * Exceptions: Assertion failures when a label is returned.
 */
test('a water name boxed in within 36 px is omitted', () => {
  const land = label('land', 'country', 500, 400, 200, 200);
  const placed = settleWaterLabels([label('sea', 'major_water', 500, 400)], frame([land]));
  assert.equal(placed.length, 0);
});

/**
 * Confirms two water names on one anchor do not cover each other.
 *
 * Purpose: An earlier water name keeps the anchor. The later one moves or is omitted.
 * When to use: As the contract test for water-to-water collision.
 * Expected outcome: The first label stays at the anchor. Any second label does not meet it.
 * Exceptions: Assertion failures when the first label moves or the boxes meet.
 */
test('two water names on one anchor do not cover each other', () => {
  const placed = settleWaterLabels([
    label('first', 'major_water', 500, 400),
    label('second', 'major_water', 500, 400),
  ], frame());
  assert.ok(placed.length >= 1);
  assert.equal(placed[0]?.featureId, 'first');
  assert.deepEqual(placed[0]?.nudge, { dx: 0, dy: 0 });
  if (placed.length === 2) {
    assert.equal(centeredBoxesMeet(placed[0]!, placed[1]!, LABEL_COLLISION_PADDING_PX), false);
  }
});

/**
 * Confirms a still-clear previous shift wins over a nearer new spot.
 *
 * Purpose: A water name should not hop while its old spot stays open.
 * When to use: As the contract test for previous-shift preference.
 * Expected outcome: Nudge `{0, -36}` while the anchor is blocked and a shorter upward step is also clear.
 * Exceptions: Assertion failures when the name returns to the anchor or takes the nearer step.
 */
test('a clear previous water shift is kept', () => {
  const previous = new Map<string, LabelNudge>([['sea', { dx: 0, dy: -36 }]]);
  const land = label('land', 'country', 500, 400);
  const placed = settleWaterLabels([label('sea', 'major_water', 500, 400)], frame([land], previous));
  assert.equal(placed.length, 1);
  assert.deepEqual(placed[0]?.nudge, { dx: 0, dy: -36 });
});
