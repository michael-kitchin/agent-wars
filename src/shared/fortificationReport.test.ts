/**
 * Fortification report sentences and who may see them.
 *
 * Purpose: The turn report totals the hits, and fog hides a hex the viewer does not own.
 * When to use: After changing `formatFortificationSummaryLine`, `buildFortificationToastLines`, or `fortificationReportVisibleToViewer`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildFortificationToastLines,
  fortificationReportVisibleToViewer,
  formatFortificationSummaryLine,
  type FortificationReportEntry,
} from './fortificationReport';
import type { FortificationReport } from './ipc/fortificationTypes';
import { HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from './seatIds';

/**
 * One loss the summary can total.
 *
 * Purpose: A case sets the hit count, owner, and hex code without repeating the report shell.
 * When to use: The summary and grouping cases.
 * Expected outcome: `remaining` is 0. The sentence does not read it.
 * Exceptions: None.
 */
function report(h3Index: string, ownerId: string | null, lost: number, hexCode: string | null): FortificationReportEntry {
  const row: FortificationReport = { h3Index, ownerId, lost, remaining: 0 };
  return { report: row, hexCode };
}

const visibleReport: FortificationReport = {
  h3Index: '8928308280fffff',
  ownerId: HUMAN_SEAT_ID,
  lost: 1,
  remaining: 0,
};

test('one hit is singular', () => {
  assert.equal(
    formatFortificationSummaryLine([report('hex', HUMAN_SEAT_ID, 1, 'AA')]),
    'Fortifications in AA absorbed 1 hit.'
  );
});

test('hits total across sorted hexes', () => {
  assert.equal(
    formatFortificationSummaryLine([
      report('c2', HUMAN_SEAT_ID, 2, 'C2'),
      report('aa', HUMAN_SEAT_ID, 1, 'AA'),
    ]),
    'Fortifications in AA and C2 absorbed 3 hits.'
  );
});

test('battle cells use their codes', () => {
  assert.equal(
    formatFortificationSummaryLine([
      report('b9', HUMAN_SEAT_ID, 1, 'AA.B9'),
      report('b0', HUMAN_SEAT_ID, 1, 'AA.B0'),
    ]),
    'Fortifications in AA.B0 and AA.B9 absorbed 2 hits.'
  );
});

test('no hits give no sentence', () => {
  assert.equal(formatFortificationSummaryLine([]), null);
  assert.equal(formatFortificationSummaryLine([report('hex', HUMAN_SEAT_ID, 0, 'AA')]), null);
});

test('two missing codes are named once and both hits still add', () => {
  assert.equal(
    formatFortificationSummaryLine([
      report('one', HUMAN_SEAT_ID, 1, null),
      report('two', HUMAN_SEAT_ID, 1, null),
    ]),
    'Fortifications in an unidentified hex absorbed 2 hits.'
  );
});

test('toast lines group by owner and keep neutral separate from no owner', () => {
  assert.deepEqual(
    buildFortificationToastLines([
      report('aa', HUMAN_SEAT_ID, 1, 'AA'),
      report('c2', NEUTRAL_OWNER_ID, 1, 'C2'),
      report('e5', null, 1, 'E5'),
      report('g1', HUMAN_SEAT_ID, 1, 'G1'),
    ]),
    [
      { ownerId: HUMAN_SEAT_ID, line: 'Fortifications in AA and G1 absorbed 2 hits.' },
      { ownerId: NEUTRAL_OWNER_ID, line: 'Fortifications in C2 absorbed 1 hit.' },
      { ownerId: null, line: 'Fortifications in E5 absorbed 1 hit.' },
    ]
  );
});

test('an observer, the owner, or an explored hex can see the report', () => {
  const explored = new Set([visibleReport.h3Index]);
  assert.equal(fortificationReportVisibleToViewer(visibleReport, null, new Set()), true);
  assert.equal(fortificationReportVisibleToViewer(visibleReport, HUMAN_SEAT_ID, new Set()), true);
  assert.equal(fortificationReportVisibleToViewer(visibleReport, 'opponent', explored), true);
  assert.equal(fortificationReportVisibleToViewer(visibleReport, 'opponent', new Set()), false);
});
