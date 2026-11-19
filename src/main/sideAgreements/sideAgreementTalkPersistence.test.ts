/**
 * Storing the agreements of one talk reply.
 *
 * Purpose: The limits that depend on the match decide which entries are stored, changed, or dropped.
 * When to use: `npm run build:main`, then `node dist/main/sideAgreements/sideAgreementTalkPersistence.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strategicStep, tacticalStep } from '../../shared/matchRecording';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { getSideAgreement, insertSideAgreement, listSideAgreementsForSeat } from '../gameDb/sideAgreementStore';
import type { TalkReplyAgreement } from '../openRouter/talk/sideAgreementReply';
import { decodeRecordPayload } from '../recorder/matchRecordCodec';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { persistTalkAgreements } from './sideAgreementTalkPersistence';
import type { ZoneCodeTranslator } from './sideAgreementZoneCodes';

const OWN = AI_SEAT_IDS[0];
const OTHER = AI_SEAT_IDS[1];
const ACTIVE = new Set<string>([HUMAN_SEAT_ID, OWN, OTHER]);
const FAKE_ZONES: ZoneCodeTranslator = {
  codeToH3: (code) => (code === 'D4' ? 'h-d4' : null),
  h3ToCode: () => null,
};

/**
 * The largest listed home regions.
 *
 * Purpose: A global start needs regions that can hold opening units.
 * When to use: Before the match in this file.
 * Expected outcome: Up to `count` names.
 * Exceptions: None.
 */
function largestHomeRegions(count: number): string[] {
  return listScenarioHomeRegions()
    .map((name) => ({ name, hexes: getScenarioHomeRegionHexes(name).length }))
    .filter((region) => region.hexes > 0)
    .sort((a, b) => b.hexes - a.hexes || a.name.localeCompare(b.name))
    .slice(0, count)
    .map((region) => region.name);
}

/**
 * Runs a case on a match with one human and two AI seats.
 *
 * Purpose: Agreements need a counterpart that is a seat of the match.
 * When to use: Every case.
 * Expected outcome: `runCase` sees the seats `human`, `opponent`, and `opponent2`.
 * Exceptions: Propagates a reset or case error.
 */
function withMatch(runCase: () => void): void {
  const regions = largestHomeRegions(3);
  assert.equal(regions.length, 3);
  withSeatedTempGameDb('aw-agreement-persist-', {
    gameMapId: 'global',
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
      { kind: 'ai', homeRegion: regions[2] },
    ],
  }, runCase);
}

/**
 * Builds one reply entry.
 *
 * Purpose: Each case overrides only what it checks.
 * When to use: Every case.
 * Expected outcome: A new active non-aggression entry with the other AI seat that ends on turn 8.
 * Exceptions: None.
 */
function entry(overrides: Partial<TalkReplyAgreement> = {}): TalkReplyAgreement {
  return {
    agreementId: 0,
    withSeatId: OTHER,
    kind: 'non_aggression',
    terms: 'No strikes.',
    zoneCodes: [],
    againstSeatId: null,
    endTurn: 8,
    status: 'active',
    intent: 'keep',
    reason: 'Quiet.',
    ...overrides,
  };
}

/**
 * Reads the payloads of the agreement events in write order.
 *
 * Purpose: The cases check what was recorded.
 * When to use: After a persist call.
 * Expected outcome: One decoded payload per `agreement_recorded` row.
 * Exceptions: None.
 */
function recordedPayloads(): Array<{ previousStatus: string | null; status: string; startTurn: number; endTurn: number }> {
  return gameDbOps
    .getAll<{ payload: Buffer }>(`SELECT payload FROM match_records WHERE record_type = 'agreement_recorded' ORDER BY record_id`)
    .map((row) => decodeRecordPayload(row.payload) as { previousStatus: string | null; status: string; startTurn: number; endTurn: number });
}

/**
 * Stores entries for the commander on turn 5.
 *
 * Purpose: Every case persists at the same step.
 * When to use: Every case.
 * Expected outcome: The stored and dropped counts.
 * Exceptions: Propagates a SQLite error.
 */
function persist(agreements: TalkReplyAgreement[]): { storedCount: number; droppedCount: number } {
  return persistTalkAgreements({ seatId: OWN, step: strategicStep(5), agreements, activeSeatIds: ACTIVE, zoneTranslator: FAKE_ZONES });
}

test('a new active agreement is stored from the step turn and recorded as new', () => {
  withMatch(() => {
    assert.deepEqual(persist([entry()]), { storedCount: 1, droppedCount: 0 });
    const [row] = listSideAgreementsForSeat(gameDbOps, OWN);
    assert.deepEqual([row?.startTurn, row?.endTurn, row?.status], [5, 8, 'active']);
    assert.equal(recordedPayloads()[0]?.previousStatus, null);
    assert.equal(recordedPayloads().length, 1);
  });
});

test('a new agreement that starts closed, with a side that left, or with a bad zone is dropped', () => {
  withMatch(() => {
    const out = persistTalkAgreements({
      seatId: OWN,
      step: strategicStep(5),
      agreements: [entry({ status: 'ended' }), entry({ withSeatId: HUMAN_SEAT_ID }), entry({ kind: 'no_entry_zone', zoneCodes: ['ZZ'] })],
      activeSeatIds: new Set([OWN, OTHER]),
      zoneTranslator: FAKE_ZONES,
    });
    assert.deepEqual(out, { storedCount: 0, droppedCount: 3 });
    const zone = persist([entry({ kind: 'no_entry_zone', zoneCodes: ['D4'] })]);
    assert.equal(zone.storedCount, 1);
    assert.deepEqual(listSideAgreementsForSeat(gameDbOps, OWN)[0]?.zoneH3, ['h-d4']);
  });
});

test('a fourth open agreement with one side is dropped, counting those stored earlier', () => {
  withMatch(() => {
    assert.deepEqual(persist([entry(), entry({ terms: 'Two.' })]), { storedCount: 2, droppedCount: 0 });
    assert.deepEqual(persist([entry({ terms: 'Three.' }), entry({ terms: 'Four.' })]), { storedCount: 1, droppedCount: 1 });
    assert.equal(listSideAgreementsForSeat(gameDbOps, OWN).length, 3);
  });
});

test('an end turn far away is cut to the start plus nine', () => {
  withMatch(() => {
    persist([entry({ endTurn: 35 })]);
    assert.equal(listSideAgreementsForSeat(gameDbOps, OWN)[0]?.endTurn, 14);
  });
});

test('a change is stored and recorded once, and the same change again writes nothing new', () => {
  withMatch(() => {
    persist([entry({ status: 'proposed' })]);
    const id = listSideAgreementsForSeat(gameDbOps, OWN)[0]?.agreementId ?? 0;
    assert.deepEqual(persist([entry({ agreementId: id, status: 'active' })]), { storedCount: 1, droppedCount: 0 });
    assert.deepEqual(recordedPayloads().map((payload) => payload.previousStatus), [null, 'proposed']);
    persist([entry({ agreementId: id, status: 'active' })]);
    assert.equal(recordedPayloads().length, 2);
    assert.equal(getSideAgreement(gameDbOps, id)?.status, 'active');
  });
});

test('a change naming another side, another kind, another seat, or a closed agreement is dropped', () => {
  withMatch(() => {
    persist([entry()]);
    const id = listSideAgreementsForSeat(gameDbOps, OWN)[0]?.agreementId ?? 0;
    const theirs = insertSideAgreement(gameDbOps, {
      seatId: OTHER, counterpartSeatId: OWN, kind: 'non_aggression', terms: 'x', zoneH3: [], againstSeatId: null,
      startTurn: 5, endTurn: 8, status: 'active', intent: 'keep', reason: '',
    });
    const dropped = persist([
      entry({ agreementId: id, withSeatId: HUMAN_SEAT_ID }),
      entry({ agreementId: id, kind: 'ceasefire_in_place' }),
      entry({ agreementId: theirs.agreementId, withSeatId: OWN }),
      entry({ agreementId: 999 }),
    ]);
    assert.deepEqual(dropped, { storedCount: 0, droppedCount: 4 });
    persist([entry({ agreementId: id, status: 'ended' })]);
    assert.deepEqual(persist([entry({ agreementId: id, status: 'active' })]), { storedCount: 0, droppedCount: 1 });
  });
});

test('a tactical step stores nothing', () => {
  withMatch(() => {
    const out = persistTalkAgreements({ seatId: OWN, step: tacticalStep(5, 'b1', 1), agreements: [entry()], activeSeatIds: ACTIVE, zoneTranslator: FAKE_ZONES });
    assert.deepEqual(out, { storedCount: 0, droppedCount: 0 });
    assert.equal(listSideAgreementsForSeat(gameDbOps, OWN).length, 0);
  });
});
