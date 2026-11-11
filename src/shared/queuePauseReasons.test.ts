/**
 * Paused-queue reasons and the sentences that name them.
 *
 * Purpose: Every surface prints the same words for the same pause.
 * When to use: After changing `listQueuePauseReasons` or the sentence builders.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatQueuePausedLines,
  formatQueuePausedNote,
  listQueuePauseReasons,
  queuePauseReasonForText,
} from './queuePauseReasons';

test('nothing queued is never paused', () => {
  assert.deepEqual(
    listQueuePauseReasons({
      buildable: false,
      nextItemType: null,
      fortifiableLeft: 0,
      maxedUnitTypes: new Set<string>(['infantry']),
    }),
    []
  );
});

test('an unoccupied hex with a fortification queue in a full city', () => {
  assert.deepEqual(
    listQueuePauseReasons({
      buildable: false,
      nextItemType: 'fortification',
      fortifiableLeft: 0,
      maxedUnitTypes: new Set<string>(),
    }),
    ['occupation', 'allCellsFortified']
  );
});

test('a capped unit type', () => {
  assert.deepEqual(
    listQueuePauseReasons({
      buildable: true,
      nextItemType: 'armor',
      fortifiableLeft: 0,
      maxedUnitTypes: new Set<string>(['armor']),
    }),
    ['unitCap']
  );
});

test('credits are never capped', () => {
  assert.deepEqual(
    listQueuePauseReasons({
      buildable: true,
      nextItemType: 'credits',
      fortifiableLeft: 0,
      maxedUnitTypes: new Set<string>(['armor']),
    }),
    []
  );
});

test('the note lists one reason', () => {
  assert.equal(
    formatQueuePausedNote(['occupation']),
    'Queue paused: occupying units or fortifications required.'
  );
});

test('the note sorts and joins three reasons', () => {
  assert.equal(
    formatQueuePausedNote(['unitCap', 'occupation', 'allCellsFortified']),
    'Queue paused: occupying units or fortifications required, every city cell fortified, and unit cap reached.'
  );
});

test('no reasons, no note', () => {
  assert.equal(formatQueuePausedNote([]), null);
});

test('reason text maps back', () => {
  assert.equal(queuePauseReasonForText('unit cap reached'), 'unitCap');
  assert.equal(queuePauseReasonForText('nope'), null);
});

test('lines group hexes that share reasons and name a missing code once', () => {
  assert.deepEqual(
    formatQueuePausedLines([
      { hexCode: 'C2', reasons: ['occupation'] },
      { hexCode: 'AA', reasons: ['occupation'] },
      { hexCode: 'BB', reasons: ['occupation'] },
      { hexCode: 'DD', reasons: ['unitCap', 'occupation'] },
      { hexCode: null, reasons: ['allCellsFortified'] },
      { hexCode: 'EE', reasons: [] },
    ]),
    [
      'Queues paused at AA, BB, and C2: occupying units or fortifications required.',
      'Queue paused at DD: occupying units or fortifications required and unit cap reached.',
      'Queue paused at an unidentified hex: every city cell fortified.',
    ]
  );
});
