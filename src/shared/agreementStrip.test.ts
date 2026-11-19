/**
 * The agreements strip rules.
 *
 * Purpose: Counts, standing by turn, breach, mismatch, filters, and rows follow their contracts.
 * When to use: `npm run build:main`, then `node dist/shared/agreementStrip.test.js`.
 * Expected outcome: Each rule gives the specified result on a hand-built four-seat snapshot.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  AgreementDecisionRecord,
  AgreementHistoryEntry,
  AgreementVersion,
  AttackLossRecord,
} from './agreementHistoryTypes';
import { AGREEMENT_FILTER_ALL, agreementStrip, type AgreementStripFilter } from './agreementStrip';
import type { MatchChartsSnapshot, MatchChartsSeat } from './matchStatistics';
import type { SideAgreementKind, SideAgreementStatus } from './sideAgreements';

const ALL: AgreementStripFilter = { kind: AGREEMENT_FILTER_ALL, withSeatId: AGREEMENT_FILTER_ALL };

const seats = (outTurnOfOpponent2: number | null = null): MatchChartsSeat[] => [
  { seatId: 'human', seatOrder: 0, kind: 'human', name: 'You' },
  { seatId: 'opponent', seatOrder: 1, kind: 'ai', name: 'A1' },
  { seatId: 'opponent2', seatOrder: 2, kind: 'ai', name: 'A2', outTurn: outTurnOfOpponent2 },
  { seatId: 'opponent3', seatOrder: 3, kind: 'ai', name: 'A3' },
];

const version = (turnNumber: number, status: SideAgreementStatus, endTurn: number): AgreementVersion => ({
  turnNumber,
  status,
  endTurn,
  terms: 'hold the line',
  zoneCodes: [],
  intent: 'keep',
  reason: '',
});

const entry = (
  agreementId: number,
  seatId: string,
  counterpartSeatId: string,
  versions: readonly AgreementVersion[],
  extra: Partial<AgreementHistoryEntry> = {},
): AgreementHistoryEntry => ({
  agreementId,
  seatId,
  counterpartSeatId,
  kind: 'non_aggression',
  againstSeatId: null,
  startTurn: versions[0].turnNumber,
  versions,
  decisions: [],
  ...extra,
});

const snapshotOf = (
  agreements: readonly AgreementHistoryEntry[],
  attacks: readonly AttackLossRecord[] = [],
  outTurnOfOpponent2: number | null = null,
): MatchChartsSnapshot => ({
  seats: seats(outTurnOfOpponent2),
  turns: [1, 2, 3, 4, 5, 6].map((turnNumber) => ({ turnNumber, sides: [], relationships: [], hexesTaken: null })),
  currentTurnNumber: 7,
  agreementHistory: { agreements, attacks },
});

const activeCounts = (snapshot: MatchChartsSnapshot, filter = ALL, seatId = 'opponent'): number[] =>
  agreementStrip(snapshot, filter).rows.find((row) => row.seatId === seatId)!.cells.map((cell) => cell.activeCount);

test('an active agreement counts from its record turn to its end turn', () => {
  const snapshot = snapshotOf([entry(1, 'opponent', 'opponent2', [version(2, 'active', 4)])]);
  assert.deepEqual(activeCounts(snapshot), [0, 1, 1, 1, 0, 0]);
});

test('a later version that breaks the agreement removes it from that turn on', () => {
  const snapshot = snapshotOf([
    entry(1, 'opponent', 'opponent2', [version(2, 'active', 6), version(3, 'broken_by_me', 6)]),
  ]);
  assert.deepEqual(activeCounts(snapshot), [0, 1, 0, 0, 0, 0]);
});

test('a proposal is counted apart and is never breached', () => {
  const snapshot = snapshotOf(
    [entry(1, 'opponent', 'opponent2', [version(2, 'proposed', 6)])],
    [{ turnNumber: 3, bySeatId: 'opponent', fromSeatId: 'opponent2', units: 2 }],
  );
  const cell = agreementStrip(snapshot, ALL).rows[0].cells[2];
  assert.equal(cell.activeCount, 0);
  assert.equal(cell.proposedCount, 1);
  assert.equal(cell.breached, false);
  assert.equal(cell.mismatched, false);
});

test('an agreement lapses after the turn its counterpart is knocked out', () => {
  const snapshot = snapshotOf([entry(1, 'opponent', 'opponent2', [version(1, 'active', 6)])], [], 4);
  assert.deepEqual(activeCounts(snapshot), [1, 1, 1, 1, 0, 0]);
});

test('an attack on the counterpart breaches that turn only, and an attack on another side does not', () => {
  const snapshot = snapshotOf(
    [entry(1, 'opponent', 'opponent2', [version(1, 'active', 6)])],
    [
      { turnNumber: 3, bySeatId: 'opponent', fromSeatId: 'opponent2', units: 2 },
      { turnNumber: 4, bySeatId: 'opponent', fromSeatId: 'opponent3', units: 5 },
    ],
  );
  const cells = agreementStrip(snapshot, ALL).rows[0].cells;
  assert.deepEqual(cells.map((cell) => cell.breached), [false, false, true, false, false, false]);
  assert.equal(cells[2].items[0].unitsDestroyedByAttack, 2);
});

test('a break decision breaches that turn, a keep decision does not, and the newest decision carries forward', () => {
  const decisions: AgreementDecisionRecord[] = [
    { turnNumber: 2, decision: 'keep', reason: '' },
    { turnNumber: 3, decision: 'break', reason: 'betrayed' },
  ];
  const snapshot = snapshotOf([entry(1, 'opponent', 'opponent2', [version(1, 'active', 6)], { decisions })]);
  const cells = agreementStrip(snapshot, ALL).rows[0].cells;
  assert.deepEqual(cells.map((cell) => cell.breached), [false, false, true, false, false, false]);
  assert.equal(cells[4].items[0].latestDecision?.turnNumber, 3);
  assert.equal(cells[1].items[0].latestDecision?.decision, 'keep');
});

test('the kind filter limits cells and the with filter limits cells and removes that row', () => {
  const snapshot = snapshotOf([
    entry(1, 'opponent', 'opponent2', [version(1, 'active', 6)]),
    entry(2, 'opponent', 'opponent3', [version(1, 'active', 6)], { kind: 'ceasefire_in_place' as SideAgreementKind }),
  ]);
  assert.deepEqual(activeCounts(snapshot), [2, 2, 2, 2, 2, 2]);
  assert.deepEqual(activeCounts(snapshot, { ...ALL, kind: 'ceasefire_in_place' }), [1, 1, 1, 1, 1, 1]);
  const withTwo = { ...ALL, withSeatId: 'opponent2' };
  assert.deepEqual(activeCounts(snapshot, withTwo), [1, 1, 1, 1, 1, 1]);
  assert.deepEqual(agreementStrip(snapshot, withTwo).rows.map((row) => row.seatId), ['opponent', 'opponent3']);
});

test('the human seat never has a row', () => {
  const rows = agreementStrip(snapshotOf([]), ALL).rows.map((row) => row.seatId);
  assert.deepEqual(rows, ['opponent', 'opponent2', 'opponent3']);
});

test('the counterpart record is a match, none, or not applicable', () => {
  const snapshot = snapshotOf([
    entry(1, 'opponent', 'opponent2', [version(1, 'active', 6)]),
    entry(2, 'opponent2', 'opponent', [version(3, 'proposed', 6)]),
    entry(3, 'opponent', 'opponent3', [version(1, 'active', 6)]),
    entry(4, 'opponent3', 'opponent', [version(1, 'active', 6)], { kind: 'joint_action' as SideAgreementKind }),
    entry(5, 'opponent', 'human', [version(1, 'active', 6)]),
  ]);
  const cells = agreementStrip(snapshot, ALL).rows[0].cells;
  const record = (turnIndex: number, id: number) => cells[turnIndex].items.find((item) => item.agreementId === id)!.counterpartRecord;
  assert.deepEqual(record(0, 1), { kind: 'none' });
  assert.deepEqual(record(2, 1), { kind: 'match', agreementId: 2, standing: 'proposed' });
  assert.deepEqual(record(2, 3), { kind: 'none' });
  assert.deepEqual(record(2, 5), { kind: 'not_applicable' });
});

test('only an active unmatched item marks a mismatch, and items list active before proposed', () => {
  const snapshot = snapshotOf([
    entry(1, 'opponent', 'opponent2', [version(1, 'proposed', 6)]),
    entry(2, 'opponent', 'opponent3', [version(1, 'active', 6)]),
    entry(3, 'opponent', 'human', [version(1, 'active', 6)]),
  ]);
  const cell = agreementStrip(snapshot, ALL).rows[0].cells[0];
  assert.equal(cell.mismatched, true);
  assert.deepEqual(cell.items.map((item) => item.agreementId), [2, 3, 1]);
  const proposalOnly = snapshotOf([entry(1, 'opponent', 'opponent2', [version(1, 'proposed', 6)])]);
  assert.equal(agreementStrip(proposalOnly, ALL).rows[0].cells[0].mismatched, false);
});

test('a snapshot with no agreement history gives only empty cells', () => {
  const bare: MatchChartsSnapshot = { ...snapshotOf([]), agreementHistory: undefined };
  const strip = agreementStrip(bare, ALL);
  assert.deepEqual(strip.turns, [1, 2, 3, 4, 5, 6]);
  assert.equal(strip.rows.every((row) => row.cells.every((cell) => cell.items.length === 0)), true);
});
