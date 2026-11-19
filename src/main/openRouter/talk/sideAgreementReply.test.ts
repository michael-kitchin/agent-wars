/**
 * Parsing the agreements list of a talk reply.
 *
 * Purpose: Each rule drops one entry and counts it, and the other entries are unaffected.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/talk/sideAgreementReply.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, type SeatId } from '../../../shared/seatIds';
import { parseSideAgreementEntries } from './sideAgreementReply';

const OWN = AI_SEAT_IDS[0];
const addressable: readonly SeatId[] = [AI_SEAT_IDS[1], AI_SEAT_IDS[2]];

/**
 * Builds a valid raw entry.
 *
 * Purpose: Each case overrides only the field it breaks.
 * When to use: Every case.
 * Expected outcome: A new non-aggression entry with side a2.
 * Exceptions: None.
 */
function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 0,
    with: 'a2',
    kind: 'non_aggression',
    terms: 'No strikes.',
    zone: [],
    against: 'none',
    endTurn: 8,
    status: 'active',
    intent: 'keep',
    reason: 'Quiet.',
    ...overrides,
  };
}

/**
 * Parses a raw value for the commander `a1`.
 *
 * Purpose: The cases share the seats.
 * When to use: Every case.
 * Expected outcome: The parser's result.
 * Exceptions: None.
 */
function parse(raw: unknown) {
  return parseSideAgreementEntries({ raw, ownSeatId: OWN, addressableSeatIds: addressable });
}

test('a valid new entry is kept with id 0', () => {
  const result = parse([entry()]);
  assert.equal(result.droppedCount, 0);
  assert.equal(result.agreements[0]?.agreementId, 0);
  assert.equal(result.agreements[0]?.withSeatId, AI_SEAT_IDS[1]);
});

test('each failed rule drops its entry and counts it', () => {
  const bad = [
    'not an object',
    entry({ id: -1 }),
    entry({ with: 'a9' }),
    entry({ with: 'a1' }),
    entry({ kind: 'alliance' }),
    entry({ terms: '   ' }),
    entry({ endTurn: 8.5 }),
    entry({ kind: 'joint_action', against: 'a2' }),
    entry({ kind: 'no_entry_zone', zone: [' ', 4] }),
  ];
  const result = parse([...bad, entry()]);
  assert.equal(result.agreements.length, 1);
  assert.equal(result.droppedCount, bad.length);
});

test('a repeated positive id is dropped, and a repeated zero id is not', () => {
  assert.equal(parse([entry({ id: 5 }), entry({ id: 5, terms: 'Again.' })]).droppedCount, 1);
  assert.equal(parse([entry(), entry({ terms: 'Second.' })]).droppedCount, 0);
});

test('zone and against apply only to their own kinds', () => {
  const plain = parse([entry({ zone: ['D4'], against: 'a3' })]).agreements[0];
  assert.deepEqual(plain?.zoneCodes, []);
  assert.equal(plain?.againstSeatId, null);
  const joint = parse([entry({ kind: 'joint_action', against: 'a3' })]).agreements[0];
  assert.equal(joint?.againstSeatId, AI_SEAT_IDS[2]);
  const zone = parse([entry({ kind: 'no_entry_zone', zone: [' D4 ', 'DO'] })]).agreements[0];
  assert.deepEqual(zone?.zoneCodes, ['D4', 'DO']);
});

test('a non-array value gives no entries and no drops', () => {
  assert.deepEqual(parse({ id: 0 }), { agreements: [], droppedCount: 0 });
  assert.deepEqual(parse(undefined), { agreements: [], droppedCount: 0 });
});
