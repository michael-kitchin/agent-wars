/**
 * Contracts for moving a broader place name off the names drawn on top of it.
 * Run: `node dist/shared/mapLabelNudge.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapLabelKind } from './mapLabelRules';
import {
  nudgeBroadLabels,
  type LabelNudge,
  type LabelNudgeFrame,
  type NudgedMapLabel,
} from './mapLabelNudge';
import type { PlacedMapLabel } from './mapLabelPlacement';

/**
 * Builds one placed label. The tests pass the center directly.
 *
 * Purpose: The shift tests choose boxes instead of going through placement.
 * When to use: From each shift test.
 * Expected outcome: A label whose text is its id and whose anchor index is 0.
 * Exceptions: None.
 */
function label(
  id: string,
  kind: MapLabelKind,
  x: number,
  y: number,
  width = 100,
  height = 36,
): PlacedMapLabel {
  return { featureId: id, kind, text: id, x, y, width, height, anchorIndex: 0 };
}

/**
 * Builds a frame for an 800 by 600 view.
 *
 * Purpose: The shift tests share one view.
 * When to use: From each shift test.
 * Expected outcome: The view size and the given previous shifts, or none.
 * Exceptions: None.
 */
function frame(previous: ReadonlyMap<string, LabelNudge> = new Map()): LabelNudgeFrame {
  return { viewSize: { width: 800, height: 600 }, previousNudges: previous };
}

/**
 * Builds a smaller name.
 *
 * Purpose: The broad name is what moves. This name stands in for the one drawn on top.
 * When to use: From a shift test that needs a country under a continent.
 * Expected outcome: A country label, 100 by 20.
 * Exceptions: None.
 */
function small(x: number, y: number): PlacedMapLabel {
  return label('small', 'country', x, y, 100, 20);
}

/**
 * Reads one result by id.
 *
 * Purpose: The assertions name the label they mean.
 * When to use: After `nudgeBroadLabels`.
 * Expected outcome: The matching label.
 * Exceptions: Throws when the id is missing.
 */
function nudged(labels: readonly NudgedMapLabel[], id: string): NudgedMapLabel {
  const found = labels.find((entry) => entry.featureId === id);
  if (found == null) throw new Error(`missing ${id}`);
  return found;
}

/**
 * Confirms a broad name that does not cover a smaller name stays put.
 *
 * Purpose: A shift is for an overlap, not for every broad name.
 * When to use: As the contract test for a clear anchor.
 * Expected outcome: Nudge `{0, 0}` and the original y.
 * Exceptions: Assertion failures when the name moves.
 */
test('a clear broad name stays on its anchor', () => {
  const broad = label('broad', 'continent', 400, 300);
  const result = nudgeBroadLabels([broad, small(400, 500)], frame());
  const moved = nudged(result, 'broad');
  assert.deepEqual(moved.nudge, { dx: 0, dy: 0 });
  assert.equal(moved.y, 300);
});

/**
 * Confirms a covered broad name takes the nearest clear spot and keeps input order.
 *
 * Purpose: The first clear step upward is 36 px for these boxes.
 * When to use: As the contract test for the search order.
 * Expected outcome: Nudge `{0, -36}`, center `(400, 264)`, and the input id order.
 * Exceptions: Assertion failures when another spot wins or the order changes.
 */
test('a covered broad name takes the nearest clear spot', () => {
  const broad = label('broad', 'continent', 400, 300);
  const covered = small(400, 300);
  const result = nudgeBroadLabels([broad, covered], frame());
  const moved = nudged(result, 'broad');
  assert.deepEqual(moved.nudge, { dx: 0, dy: -36 });
  assert.equal(moved.x, 400);
  assert.equal(moved.y, 264);
  assert.deepEqual(result.map((entry) => entry.featureId), ['broad', 'small']);
});

/**
 * Confirms a previous shift stays while the anchor is still covered.
 *
 * Purpose: A pan must not hop the name between two clear spots.
 * When to use: As the contract test for keeping a shift.
 * Expected outcome: The previous nudge `{12, -48}`.
 * Exceptions: Assertion failures when the name jumps to the nearer spot.
 */
test('a shifted name stays put while its anchor is blocked', () => {
  const broad = label('broad', 'continent', 400, 300);
  const result = nudgeBroadLabels([broad, small(400, 300)], frame(new Map([['broad', { dx: 12, dy: -48 }]])));
  assert.deepEqual(nudged(result, 'broad').nudge, { dx: 12, dy: -48 });
});

/**
 * Confirms a previous shift that now covers the smaller name is abandoned.
 *
 * Purpose: A stored anchor is not a reason to stay on the smaller name.
 * When to use: As the contract test for searching again.
 * Expected outcome: Nudge `{0, -36}`.
 * Exceptions: Assertion failures when the name stays on `{0, 0}`.
 */
test('a blocked earlier spot is searched again', () => {
  const broad = label('broad', 'continent', 400, 300);
  const result = nudgeBroadLabels([broad, small(400, 300)], frame(new Map([['broad', { dx: 0, dy: 0 }]])));
  assert.deepEqual(nudged(result, 'broad').nudge, { dx: 0, dy: -36 });
});

/**
 * Confirms a shift does not land on another broad name.
 *
 * Purpose: Yielding to a smaller name must not cover a second continent.
 * When to use: As the contract test for the broad-name gap.
 * Expected outcome: The covered name moves down. The other continent stays.
 * Exceptions: Assertion failures when the upward spot is taken or the other continent moves.
 */
test('a shift does not land on another broad name', () => {
  const broad = label('broad', 'continent', 400, 300);
  const other = label('other', 'continent', 400, 258);
  const result = nudgeBroadLabels([broad, other, small(400, 300)], frame());
  assert.deepEqual(nudged(result, 'broad').nudge, { dx: 0, dy: 36 });
  assert.deepEqual(nudged(result, 'other').nudge, { dx: 0, dy: 0 });
});

/**
 * Confirms a shift does not put the center inside the view margin.
 *
 * Purpose: The inset is 24 px, so a name at y 30 cannot move up.
 * When to use: As the contract test for the view edge.
 * Expected outcome: Nudge `{0, 36}`.
 * Exceptions: Assertion failures when the name moves up or stays on the smaller name.
 */
test('a shift stays inside the view inset', () => {
  const broad = label('broad', 'continent', 400, 30);
  const result = nudgeBroadLabels([broad, small(400, 30)], frame());
  assert.deepEqual(nudged(result, 'broad').nudge, { dx: 0, dy: 36 });
});

/**
 * Confirms the fewest overlaps win when every spot is covered.
 *
 * Purpose: The name is still drawn. It does not disappear.
 * When to use: As the contract test for the fallback.
 * Expected outcome: Nudge `{0, -36}`, which meets the wall and misses the smaller name.
 * Exceptions: Assertion failures when the name stays on both or is omitted.
 */
test('the fewest overlaps win when nothing is clear', () => {
  const broad = label('broad', 'continent', 400, 300);
  const wall = label('wall', 'country', 400, 300, 400, 400);
  const result = nudgeBroadLabels([broad, wall, small(400, 300)], frame());
  assert.equal(result.length, 3);
  assert.deepEqual(nudged(result, 'broad').nudge, { dx: 0, dy: -36 });
});

/**
 * Confirms a previous shift is dropped once the anchor is clear.
 *
 * Purpose: The name returns home when the smaller name no longer covers it.
 * When to use: As the contract test for returning to the anchor.
 * Expected outcome: Nudge `{0, 0}` and the original y, despite a stored shift.
 * Exceptions: Assertion failures when the stored shift sticks.
 */
test('a shifted name returns once its anchor is clear', () => {
  const broad = label('broad', 'continent', 400, 300);
  const result = nudgeBroadLabels(
    [broad, small(400, 500)],
    frame(new Map([['broad', { dx: 12, dy: -48 }]])),
  );
  const moved = nudged(result, 'broad');
  assert.deepEqual(moved.nudge, { dx: 0, dy: 0 });
  assert.equal(moved.y, 300);
});

/**
 * Confirms one kind does not move, even when a shift was stored.
 *
 * Purpose: A world view of continents has no smaller name to avoid.
 * When to use: As the contract test for a single kind.
 * Expected outcome: Both nudges are `{0, 0}` and the broad name stays at y 300.
 * Exceptions: Assertion failures when a stored shift is applied.
 */
test('a single kind does not move', () => {
  const broad = label('broad', 'continent', 400, 300);
  const other = label('other', 'continent', 400, 500);
  const result = nudgeBroadLabels([broad, other], frame(new Map([['broad', { dx: 12, dy: 12 }]])));
  assert.deepEqual(nudged(result, 'broad').nudge, { dx: 0, dy: 0 });
  assert.deepEqual(nudged(result, 'other').nudge, { dx: 0, dy: 0 });
  assert.equal(nudged(result, 'broad').y, 300);
});
