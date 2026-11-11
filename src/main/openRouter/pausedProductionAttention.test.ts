/**
 * Paused-queue sentences for the situation message.
 *
 * Purpose: The subsection groups the same reasons as the turn report, then names banked points and the remedy.
 * When to use: After changing `formatPausedQueuesSection` or the pointer.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUEUE_PAUSE_REASON_TEXT } from '../../shared/queuePauseReasons';
import {
  SECTION_TITLE_PAUSED_QUEUES,
  SECTION_TITLE_PRODUCTION_STATUS,
} from './promptSpec/sectionHeadings';
import {
  PAUSED_FORTIFICATION_REMEDY,
  PAUSED_OCCUPATION_REMEDY,
  findPausedProductionHexes,
  formatPausedProductionPointer,
  formatPausedQueuesSection,
} from './pausedProductionAttention';
import type { ControlledHexQueueSnapshot } from './productionQueueSnapshotTypes';

const occupied = QUEUE_PAUSE_REASON_TEXT.occupation;
const full = QUEUE_PAUSE_REASON_TEXT.allCellsFortified;
const capped = QUEUE_PAUSE_REASON_TEXT.unitCap;
const label = (ll: [number, number]): string => `H${ll[0]}`;
const pointer = `Paused queues: see ${SECTION_TITLE_PAUSED_QUEUES} under ${SECTION_TITLE_PRODUCTION_STATUS}.`;

/**
 * One controlled-hex row with the pause texts and banked points under test.
 *
 * Purpose: The finder reads only `hex`, `pausedReasons`, and `storedPoints`.
 * When to use: Inside this file.
 * Expected outcome: A snapshot row whose center is `[id, 0]`.
 * Exceptions: None.
 */
function row(id: number, reasons: readonly string[], storedPoints: number): ControlledHexQueueSnapshot {
  return { hex: [id, 0], availableUnitTypes: [], entries: [], pausedReasons: [...reasons], storedPoints };
}

test('paused hexes keep occupation and full-city pauses and leave cap-only pauses to the idle flag', () => {
  const paused = findPausedProductionHexes(
    [
      row(3, [occupied], 40),
      row(1, [occupied], 25),
      row(2, [full], 0),
      row(4, [capped], 7),
      row(5, [], 9),
      row(6, [occupied, full], 10),
      row(8, [occupied, capped], 5),
    ],
    label
  );
  assert.deepEqual(paused.map((hex) => hex.hexText), ['H3', 'H1', 'H2', 'H6', 'H8']);
  assert.equal(
    formatPausedQueuesSection(paused),
    [
      'Queues paused at H1 and H3: occupying units or fortifications required.',
      'Queue paused at H6: occupying units or fortifications required and every city cell fortified.',
      'Queue paused at H8: occupying units or fortifications required and unit cap reached.',
      'Queue paused at H2: every city cell fortified.',
      '80 banked production points are waiting in these cells.',
      PAUSED_OCCUPATION_REMEDY,
      PAUSED_FORTIFICATION_REMEDY,
    ].join('\n\n')
  );
  assert.equal(formatPausedProductionPointer(paused), pointer);
});

test('one point is singular, zero points are omitted, and nothing paused is null', () => {
  assert.equal(
    formatPausedQueuesSection(findPausedProductionHexes([row(7, [occupied], 1)], label)),
    [
      'Queue paused at H7: occupying units or fortifications required.',
      '1 banked production point is waiting in this cell.',
      PAUSED_OCCUPATION_REMEDY,
    ].join('\n\n')
  );
  assert.equal(
    formatPausedQueuesSection(findPausedProductionHexes([row(7, [occupied], 1), row(2, [full], 0)], label)),
    [
      'Queue paused at H7: occupying units or fortifications required.',
      'Queue paused at H2: every city cell fortified.',
      '1 banked production point is waiting in these cells.',
      PAUSED_OCCUPATION_REMEDY,
      PAUSED_FORTIFICATION_REMEDY,
    ].join('\n\n')
  );
  assert.equal(
    formatPausedQueuesSection(findPausedProductionHexes([row(2, [full], 0)], label)),
    ['Queue paused at H2: every city cell fortified.', PAUSED_FORTIFICATION_REMEDY].join('\n\n')
  );
  assert.equal(formatPausedQueuesSection([]), null);
  assert.equal(formatPausedProductionPointer([]), null);
});
