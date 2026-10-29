/**
 * Fortification report sentences and who may see them.
 *
 * Purpose: The turn report names the hits and the remainder, and fog hides a hex the viewer does not own.
 * When to use: After changing `formatFortificationReportLine` or `fortificationReportVisibleToViewer`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fortificationReportVisibleToViewer } from './fortificationReport';
import { formatFortificationReportLine } from './fortificationRules';
import type { FortificationReport } from './ipc/fortificationTypes';
import { HUMAN_SEAT_ID } from './seatIds';

const report: FortificationReport = {
  h3Index: '8928308280fffff',
  ownerId: HUMAN_SEAT_ID,
  lost: 1,
  remaining: 0,
};

test('a fortification sentence names one or many hits and what remains', () => {
  assert.equal(
    formatFortificationReportLine({ placeName: 'Vienna', lost: 1, remaining: 0 }),
    'Fortifications at Vienna absorbed 1 hit; none remain.'
  );
  assert.equal(
    formatFortificationReportLine({ placeName: 'Vienna', lost: 4, remaining: 1 }),
    'Fortifications at Vienna absorbed 4 hits; 1 remains.'
  );
  assert.equal(
    formatFortificationReportLine({ placeName: 'Vienna', lost: 4, remaining: 16 }),
    'Fortifications at Vienna absorbed 4 hits; 16 remain.'
  );
});

test('an observer, the owner, or an explored hex can see the report', () => {
  const explored = new Set([report.h3Index]);
  assert.equal(fortificationReportVisibleToViewer(report, null, new Set()), true);
  assert.equal(fortificationReportVisibleToViewer(report, HUMAN_SEAT_ID, new Set()), true);
  assert.equal(fortificationReportVisibleToViewer(report, 'opponent', explored), true);
  assert.equal(fortificationReportVisibleToViewer(report, 'opponent', new Set()), false);
});
