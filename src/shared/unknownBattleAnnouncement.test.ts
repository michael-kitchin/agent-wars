/**
 * Sentence contract for unknown battles in the turn-update toast.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatUnknownBattleAnnouncement } from './unknownBattleAnnouncement';

test('formatUnknownBattleAnnouncement sorts unique trimmed names and joins them with commas', () => {
  assert.equal(formatUnknownBattleAnnouncement(['Europe']), 'Unknown battle observed in Europe.');
  assert.equal(
    formatUnknownBattleAnnouncement(['Europe', 'Africa']),
    'Unknown battle observed in Africa, Europe.'
  );
  assert.equal(
    formatUnknownBattleAnnouncement(['C', 'A', 'B']),
    'Unknown battle observed in A, B, C.'
  );
  assert.equal(
    formatUnknownBattleAnnouncement(['Asia', ' Europe ', 'Asia', '']),
    'Unknown battle observed in Asia, Europe.'
  );
  const mixedCase = formatUnknownBattleAnnouncement(['asia', 'Asia']);
  assert.match(mixedCase, /^Unknown battle observed in .+[.]$/);
  assert.ok(mixedCase.includes('asia') && mixedCase.includes('Asia'));
  const original = ['Europe', 'Africa'];
  formatUnknownBattleAnnouncement(original);
  assert.deepEqual(original, ['Europe', 'Africa']);
});

test('formatUnknownBattleAnnouncement uses the unidentified continent sentence when no name remains', () => {
  assert.equal(
    formatUnknownBattleAnnouncement([]),
    'Unknown battle observed in an unidentified continent.'
  );
  assert.equal(
    formatUnknownBattleAnnouncement(['', '   ']),
    'Unknown battle observed in an unidentified continent.'
  );
});
