/**
 * The record wording is exact, because the prompts and the prompt documents quote it.
 * Run with: node dist/main/briefing/sideCombatRecordText.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CombatLossCounts, SideCombatRecord } from './sideCombatRecord';
import { formatSideCombatRecord, formatStanceConflict } from './sideCombatRecordText';

const ZERO: CombatLossCounts = { total: 0, responsibleAttacked: 0, victimAttacked: 0, closeCombat: 0, other: 0 };

/**
 * Builds a record for the wording cases.
 *
 * Purpose: Each case fills only the counts it is about.
 * When to use: The cases below.
 * Expected outcome: A record for side `opponent2` with zero counts unless given.
 * Exceptions: None.
 */
function record(partial: Partial<SideCombatRecord>): SideCombatRecord {
  return { sideId: 'opponent2', destroyedOfYours: ZERO, destroyedOfTheirs: ZERO, latestTurnDestroyedYours: null, latestTurnAttackedYou: null, ...partial };
}

test('a quiet window says there were no losses either way', () => {
  assert.equal(formatSideCombatRecord({ record: record({}), sideCode: 'a2', firstTurn: 2, lastTurn: 11 }), 'Record, turns 2 to 11: no losses either way.');
  assert.equal(formatSideCombatRecord({ record: record({}), sideCode: 'a2', firstTurn: 3, lastTurn: 3 }), 'Record, turn 3: no losses either way.');
});

test('both directions list their non-zero parts in order', () => {
  const text = formatSideCombatRecord({
    record: record({
      destroyedOfYours: { total: 6, responsibleAttacked: 3, victimAttacked: 1, closeCombat: 2, other: 0 },
      destroyedOfTheirs: { total: 4, responsibleAttacked: 3, victimAttacked: 1, closeCombat: 0, other: 0 },
      latestTurnDestroyedYours: 11,
    }),
    sideCode: 'a1',
    firstTurn: 2,
    lastTurn: 11,
  });
  assert.equal(
    text,
    'Record, turns 2 to 11: a1 destroyed 6 of your units (latest turn 11): 3 when a1 attacked, 1 when you attacked, 2 in close combat or battle. You destroyed 4 of theirs: 3 when you attacked, 1 when a1 attacked.'
  );
});

test('only their losses of yours says you destroyed none of theirs', () => {
  const text = formatSideCombatRecord({
    record: record({ destroyedOfYours: { ...ZERO, total: 3, responsibleAttacked: 3 }, latestTurnDestroyedYours: 9 }),
    sideCode: 'a4',
    firstTurn: 2,
    lastTurn: 11,
  });
  assert.equal(text, 'Record, turns 2 to 11: a4 destroyed 3 of your units (latest turn 9): 3 when a4 attacked. You destroyed none of theirs.');
});

test('only your losses of theirs says the side destroyed none of yours', () => {
  const text = formatSideCombatRecord({
    record: record({ destroyedOfTheirs: { ...ZERO, total: 1, other: 1 } }),
    sideCode: 'a2',
    firstTurn: 2,
    lastTurn: 11,
  });
  assert.equal(text, 'Record, turns 2 to 11: a2 destroyed none of your units. You destroyed 1 of theirs: 1 in other ways.');
});

test('a friendly stance toward a side that attacked on the previous turn is flagged with exact words', () => {
  assert.equal(
    formatStanceConflict({ sideCode: 'a2', stance: 'friendly', latestTurnAttackedYou: 11, currentTurnNumber: 12 }),
    'Your stance toward a2 is friendly, but a2 destroyed your units on turn 11.'
  );
  assert.equal(
    formatStanceConflict({ sideCode: 'a3', stance: 'cordial', latestTurnAttackedYou: 10, currentTurnNumber: 12 }),
    'Your stance toward a3 is cordial, but a3 destroyed your units on turn 10.'
  );
});

test('no flag for a guarded stance, no attack, or an attack older than two turns', () => {
  const base = { sideCode: 'a2', stance: 'friendly', latestTurnAttackedYou: 11, currentTurnNumber: 12 } as const;
  for (const stance of ['hostile', 'wary', 'neutral', null] as const) assert.equal(formatStanceConflict({ ...base, stance }), null);
  assert.equal(formatStanceConflict({ ...base, latestTurnAttackedYou: null }), null);
  assert.equal(formatStanceConflict({ ...base, latestTurnAttackedYou: 9 }), null);
});
