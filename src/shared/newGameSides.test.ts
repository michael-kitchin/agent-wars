import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NewGameCommanderInput } from './ipc/ordersTypes';
import {
  addRowBlockedReason,
  addSideRow,
  sidesHaveAnyModel,
  buildSeatsPayload,
  homeOptionsForRow,
  initialSidesState,
  randomizeRowHome,
  removeSideRow,
  rowLabel,
  setObserveOnly,
  setRowCommander,
  setRowHome,
  sidesCaption,
  startBlockedReason,
  type HomeOption,
} from './newGameSides';

/**
 * A commander used only to see that rows keep the object they were given.
 *
 * Purpose: Payload tests need a stable commander.
 * When to use: The cases in this file.
 * Expected outcome: Balanced, with no model.
 * Exceptions: None.
 */
const COMMANDER: NewGameCommanderInput = { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced' };

/**
 * Three homes, so a fourth row cannot be added.
 *
 * Purpose: The cap test needs fewer homes than four.
 * When to use: The cases in this file.
 * Expected outcome: Keys a, b, and c.
 * Exceptions: None.
 */
const THREE: readonly HomeOption[] = [
  { key: 'a', label: 'Alpha' },
  { key: 'b', label: 'Beta' },
  { key: 'c', label: 'Gamma' },
];

test('a three-home map caps at three rows and the caption counts them', () => {
  const started = initialSidesState({ mapKind: 'regional', homes: THREE, defaultCommander: COMMANDER });
  assert.equal(started.rows.length, 2);
  assert.equal(rowLabel(started, 0), 'You');
  assert.equal(rowLabel(started, 1), 'Opponent 1');
  assert.equal(sidesCaption(started, THREE), '2 of 3 sides in play');
  const three = addSideRow(started, THREE, COMMANDER);
  assert.deepEqual(three.rows.map((row) => row.homeKey), ['a', 'b', 'c']);
  assert.equal(addRowBlockedReason(three, THREE), 'No free side on this map');
  assert.equal(addSideRow(three, THREE, COMMANDER), three);
  const fourHomes: HomeOption[] = [...THREE, { key: 'd', label: 'Delta' }];
  const full = addSideRow(addSideRow(started, fourHomes, COMMANDER), fourHomes, COMMANDER);
  assert.equal(full.rows.length, 4);
  assert.equal(addRowBlockedReason(full, fourHomes), 'Up to 4 sides');
});

/**
 * The key in this case is a fake value for testing.
 *
 * Purpose: The copy must keep the key without using a real credential.
 * When to use: The add-row copy case.
 * Expected outcome: The new row matches this commander and is a different object.
 * Exceptions: None.
 */
const COPIED_COMMANDER: NewGameCommanderInput = {
  modelId: 'test-model',
  reasoningEffort: 'high',
  doctrineChoice: 'aggressive',
  apiKey: 'test-openrouter-key',
};

test('adding a side copies the previous AI commander onto a new object', () => {
  const homes: HomeOption[] = [...THREE, { key: 'd', label: 'Delta' }];
  const started = initialSidesState({ mapKind: 'global', homes, defaultCommander: COMMANDER });
  const tuned = setRowCommander(started, 1, COPIED_COMMANDER);
  const added = addSideRow(tuned, homes, COMMANDER);
  assert.deepEqual(added.rows[2]?.commander, COPIED_COMMANDER);
  assert.notEqual(added.rows[2]?.commander, tuned.rows[1]?.commander);
  assert.equal(added.rows[1]?.commander, tuned.rows[1]?.commander);
  assert.equal(added.rows[2]?.homeKey, 'c');
});

test('a model on an AI row is enough, and a human row is ignored', () => {
  const started = initialSidesState({ mapKind: 'global', homes: THREE, defaultCommander: COMMANDER });
  assert.equal(sidesHaveAnyModel(null), false);
  assert.equal(sidesHaveAnyModel(started), false);
  const tuned = setRowCommander(started, 1, COPIED_COMMANDER);
  assert.equal(sidesHaveAnyModel(tuned), true);
  const humanOnly = setRowCommander(tuned, 0, COPIED_COMMANDER);
  const clearedAi: typeof humanOnly = {
    ...humanOnly,
    rows: humanOnly.rows.map((row, index) => (index === 1 ? { ...row, commander: { ...COPIED_COMMANDER, modelId: null } } : row)),
  };
  assert.equal(sidesHaveAnyModel(clearedAi), false);
});

test('adding a side uses the fallback when no AI commander exists', () => {
  const homes: HomeOption[] = [...THREE, { key: 'd', label: 'Delta' }];
  const started = initialSidesState({ mapKind: 'global', homes, defaultCommander: COMMANDER });
  const cleared: typeof started = {
    ...started,
    rows: started.rows.map((row) => (row.kind === 'ai' ? { ...row, commander: null } : row)),
  };
  const added = addSideRow(cleared, homes, COMMANDER);
  assert.equal(added.rows[2]?.commander, COMMANDER);
});

test('Observe keeps homes and turns You into Side 1', () => {
  const started = initialSidesState({ mapKind: 'global', homes: THREE, defaultCommander: COMMANDER });
  const watching = setObserveOnly(started, true, COMMANDER);
  assert.equal(watching.observeOnly, true);
  assert.equal(watching.rows[0]?.kind, 'ai');
  assert.equal(watching.rows[0]?.homeKey, 'a');
  assert.equal(watching.rows[0]?.commander?.doctrineChoice, 'balanced');
  assert.equal(rowLabel(watching, 0), 'Side 1');
  assert.equal(rowLabel(watching, 1), 'Side 2');
  assert.equal(sidesCaption(watching, THREE), '2 of 3 sides, all AI');
  const playing = setObserveOnly(watching, false, COMMANDER);
  assert.equal(playing.rows[0]?.kind, 'human');
  assert.equal(playing.rows[0]?.commander, null);
  assert.equal(playing.rows[0]?.homeKey, 'a');
  assert.equal(rowLabel(playing, 0), 'You');
});

test('a taken home is labeled, and removing a row frees it', () => {
  const started = initialSidesState({ mapKind: 'regional', homes: THREE, defaultCommander: COMMANDER });
  const options = homeOptionsForRow(started, 1, THREE);
  const taken = options.find((option) => option.key === 'a');
  assert.equal(taken?.disabled, true);
  assert.equal(taken?.takenBy, 'You');
  assert.equal(setRowHome(started, 1, 'a'), started);
  const three = addSideRow(started, THREE, COMMANDER);
  const removed = removeSideRow(three, 1);
  assert.deepEqual(removed.rows.map((row) => row.homeKey), ['a', 'c']);
  assert.equal(homeOptionsForRow(removed, 0, THREE).find((option) => option.key === 'b')?.disabled, false);
  assert.equal(removeSideRow(started, 1), started);
});

test('Start refuses a shared home, and the payload keeps row order and kinds', () => {
  const started = initialSidesState({ mapKind: 'global', homes: THREE, defaultCommander: COMMANDER, rowCount: 3 });
  const shared = {
    ...started,
    rows: started.rows.map((row, index) => (index === 2 ? { ...row, homeKey: 'a' } : row)),
  };
  assert.equal(startBlockedReason(shared), 'Two sides share a home');
  const payload = buildSeatsPayload(started);
  assert.deepEqual(payload.map((seat) => seat.kind), ['human', 'ai', 'ai']);
  assert.deepEqual(payload.map((seat) => seat.homeRegion), ['a', 'b', 'c']);
  assert.equal(payload[0]?.commander, undefined);
  assert.equal(payload[1]?.commander?.doctrineChoice, 'balanced');
  const regional = buildSeatsPayload({ ...started, mapKind: 'regional' });
  assert.deepEqual(regional.map((seat) => seat.sideGroupId), ['a', 'b', 'c']);
});

test('a commander change stays on that AI row', () => {
  const started = initialSidesState({ mapKind: 'global', homes: THREE, defaultCommander: COMMANDER, rowCount: 3 });
  const next = setRowCommander(started, 1, { ...COMMANDER, doctrineChoice: 'aggressive' });
  assert.equal(next.rows[1]?.commander?.doctrineChoice, 'aggressive');
  assert.equal(next.rows[2]?.commander?.doctrineChoice, 'balanced');
  assert.equal(setRowCommander(started, 0, COMMANDER), started);
});

test('randomize stays on a free home', () => {
  const started = initialSidesState({ mapKind: 'regional', homes: THREE, defaultCommander: COMMANDER });
  const next = randomizeRowHome(started, 1, THREE, () => 0.99);
  assert.equal(next.rows[1]?.homeKey, 'c');
  assert.notEqual(next.rows[0]?.homeKey, next.rows[1]?.homeKey);
});
