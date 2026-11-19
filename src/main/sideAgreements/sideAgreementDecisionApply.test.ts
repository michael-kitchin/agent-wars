/**
 * Storing the decisions of one orders reply.
 *
 * Purpose: Only an active agreement of the commander accepts a decision, and the next talk prompt shows it.
 * When to use: `npm run build:main`, then `node dist/main/sideAgreements/sideAgreementDecisionApply.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { getSideAgreement, insertSideAgreement, type SideAgreementRow } from '../gameDb/sideAgreementStore';
import { buildTalkSituationText } from '../openRouter/talk/talkPrompt';
import { readTalkPromptInput } from '../openRouter/talk/talkPromptInput';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { applySideAgreementDecisions } from './sideAgreementDecisionApply';

const OWN = AI_SEAT_IDS[0];
const OTHER = AI_SEAT_IDS[1];

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
 * Purpose: Decisions need an agreement with another seat of the match.
 * When to use: Every case.
 * Expected outcome: `runCase` sees the seats `human`, `opponent`, and `opponent2`.
 * Exceptions: Propagates a reset or case error.
 */
function withMatch(runCase: () => void): void {
  const regions = largestHomeRegions(3);
  withSeatedTempGameDb('aw-agreement-decision-', {
    gameMapId: 'global',
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
      { kind: 'ai', homeRegion: regions[2] },
    ],
  }, runCase);
}

/**
 * Stores one agreement for the commander.
 *
 * Purpose: Each case starts from an agreement it can decide on.
 * When to use: Every case.
 * Expected outcome: An active agreement that ends on turn 8, unless overridden.
 * Exceptions: Propagates a SQLite error.
 */
function agreement(overrides: Partial<Parameters<typeof insertSideAgreement>[1]> = {}): SideAgreementRow {
  return insertSideAgreement(gameDbOps, {
    seatId: OWN, counterpartSeatId: OTHER, kind: 'non_aggression', terms: 'No strikes.', zoneH3: [], againstSeatId: null,
    startTurn: 3, endTurn: 8, status: 'active', intent: 'keep', reason: '', ...overrides,
  });
}

/**
 * Counts the stored decision events.
 *
 * Purpose: A stored decision writes one event and a refused one writes none.
 * When to use: After an apply call.
 * Expected outcome: The number of `agreement_decision` rows.
 * Exceptions: None.
 */
function decisionEventCount(): number {
  return gameDbOps.getOne<{ n: number }>(`SELECT COUNT(*) AS n FROM match_records WHERE record_type = 'agreement_decision'`)?.n ?? 0;
}

test('a decision on an active agreement is stored and recorded once', () => {
  withMatch(() => {
    const row = agreement();
    const result = applySideAgreementDecisions({ seatId: OWN, decisions: [{ agreementId: row.agreementId, decision: 'break', reason: 'Open.' }], turnNumber: 5 });
    assert.deepEqual(result, { appliedCount: 1, dropReasons: [] });
    const stored = getSideAgreement(gameDbOps, row.agreementId);
    assert.deepEqual([stored?.decision, stored?.decisionReason, stored?.decisionTurn], ['break', 'Open.', 5]);
    assert.equal(decisionEventCount(), 1);
  });
});

test('another seat, a proposed, an expired, and an unknown agreement are each refused', () => {
  withMatch(() => {
    const theirs = agreement({ seatId: OTHER, counterpartSeatId: OWN });
    const proposed = agreement({ status: 'proposed' });
    const expired = agreement({ endTurn: 4 });
    const result = applySideAgreementDecisions({
      seatId: OWN,
      decisions: [theirs.agreementId, proposed.agreementId, expired.agreementId, 999].map((agreementId) => ({ agreementId, decision: 'keep' as const, reason: '' })),
      turnNumber: 5,
    });
    assert.equal(result.appliedCount, 0);
    assert.equal(result.dropReasons.length, 4);
    assert.ok(result.dropReasons[3]?.includes('agreement 999 is not one of your active agreements'));
    assert.equal(getSideAgreement(gameDbOps, theirs.agreementId)?.decision, null);
    assert.equal(decisionEventCount(), 0);
  });
});

test('the next talk prompt shows the decision', () => {
  withMatch(() => {
    const row = agreement();
    applySideAgreementDecisions({ seatId: OWN, decisions: [{ agreementId: row.agreementId, decision: 'break', reason: 'Open.' }], turnNumber: 5 });
    const text = buildTalkSituationText(readTalkPromptInput({ seatId: OWN, turnNumber: 6, battle: null }).input);
    assert.ok(text.includes('Your decision on turn 5: break'), text);
  });
});
