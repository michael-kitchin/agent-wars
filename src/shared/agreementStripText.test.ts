/**
 * The agreements strip text rules.
 *
 * Purpose: Cell labels and tooltip lines follow their exact formats.
 * When to use: `npm run build:main`, then `node dist/shared/agreementStripText.test.js`.
 * Expected outcome: Each label and line reads as specified.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgreementCell, AgreementCellItem } from './agreementStrip';
import { agreementCellLabel, agreementCellShortLabel, agreementCellTooltip } from './agreementStripText';

const NAMES: Readonly<Record<string, string>> = {
  opponent: 'Sonnet 5.5',
  opponent2: 'DS 4.1 Flash',
  opponent3: 'GPT 6.2 Sol',
};
const nameOf = (seatId: string): string => NAMES[seatId] ?? seatId;
const displayText = (text: string): string => text.replace('a3', 'GPT 6.2 Sol');

const item = (extra: Partial<AgreementCellItem> = {}): AgreementCellItem => ({
  agreementId: 7,
  counterpartSeatId: 'opponent3',
  againstSeatId: null,
  kind: 'non_aggression',
  startTurn: 3,
  endTurn: 8,
  standing: 'active',
  intent: 'opportunistic',
  terms: 'no fire between a3 and us',
  zoneCodes: [],
  latestDecision: null,
  unitsDestroyedByAttack: 0,
  decidedBreakThisTurn: false,
  breached: false,
  counterpartRecord: { kind: 'not_applicable' },
  ...extra,
});

const cellOf = (items: readonly AgreementCellItem[], extra: Partial<AgreementCell> = {}): AgreementCell => ({
  activeCount: items.filter((i) => i.standing === 'active').length,
  proposedCount: items.filter((i) => i.standing === 'proposed').length,
  breached: items.some((i) => i.breached),
  mismatched: false,
  items,
  ...extra,
});

const tooltipOf = (cell: AgreementCell) => agreementCellTooltip({ rowSeatId: 'opponent', turn: 7, cell, nameOf, displayText });

test('labels show active, proposed, and breach, and the short label drops the proposals', () => {
  const empty = cellOf([]);
  assert.equal(agreementCellLabel(empty), '');
  assert.equal(agreementCellShortLabel(empty), '');
  const two = cellOf([item(), item({ agreementId: 8 })]);
  assert.equal(agreementCellLabel(two), '2');
  const proposed = cellOf([item(), item({ agreementId: 8 }), item({ agreementId: 9, standing: 'proposed' })]);
  assert.equal(agreementCellLabel(proposed), '2+1');
  const breached = { ...proposed, breached: true };
  assert.equal(agreementCellLabel(breached), '2+1!');
  assert.equal(agreementCellShortLabel(breached), '2!');
});

test('an empty cell has the heading and the no-match line', () => {
  assert.deepEqual(tooltipOf(cellOf([])), {
    heading: 'Sonnet 5.5 (turn 7)',
    lines: [{ text: 'No matching agreements.', emphasis: false }],
  });
});

test('an item head has a bold lead-in and then names kind, side, turns, standing, and intent', () => {
  const { lines } = tooltipOf(cellOf([item()]));
  assert.equal(lines[0].lead, 'Agreement #7:');
  assert.equal(lines[0].text, 'Non-aggression with GPT 6.2 Sol, turns 3 to 8, active, intent opportunistic');
  assert.deepEqual(lines.map((line) => line.emphasis), [true, false]);
  assert.equal(lines[1].text, 'Terms: no fire between GPT 6.2 Sol and us');
});

test('every line under an agreement head is a bullet, and the head and the no-match line are not', () => {
  const { lines } = tooltipOf(cellOf([
    item({ zoneCodes: ['CI'], latestDecision: { turnNumber: 5, decision: 'keep', reason: '' }, counterpartRecord: { kind: 'none' } }),
    item({ agreementId: 8 }),
  ]));
  assert.deepEqual(
    lines.map((line) => (line.lead !== undefined ? 'head' : line.bullet === true ? 'bullet' : 'plain')),
    ['head', 'bullet', 'bullet', 'bullet', 'bullet', 'head', 'bullet'],
  );
  assert.equal(tooltipOf(cellOf([])).lines[0].bullet, undefined);
  assert.equal(tooltipOf(cellOf([])).lines[0].lead, undefined);
});

test('a joint action names its target and a zone lists its codes', () => {
  const { lines } = tooltipOf(cellOf([
    item({ kind: 'joint_action', againstSeatId: 'opponent2', zoneCodes: ['CI', 'CJ'] }),
  ]));
  assert.ok(lines[0].text.endsWith(', against DS 4.1 Flash'));
  assert.ok(lines.some((line) => line.text === 'Zone: CI, CJ'));
});

test('a decision line has a reason only when there is one', () => {
  const withReason = tooltipOf(cellOf([item({ latestDecision: { turnNumber: 5, decision: 'break', reason: 'a3 struck first' } })]));
  assert.ok(withReason.lines.some((line) => line.text === 'Decision on turn 5: break: GPT 6.2 Sol struck first'));
  const without = tooltipOf(cellOf([item({ latestDecision: { turnNumber: 5, decision: 'keep', reason: '' } })]));
  assert.ok(without.lines.some((line) => line.text === 'Decision on turn 5: keep'));
});

test('a breach line joins its parts and says unit or units', () => {
  const both = tooltipOf(cellOf([item({ breached: true, unitsDestroyedByAttack: 2, decidedBreakThisTurn: true })]));
  assert.ok(both.lines.some((line) => line.text
    === 'Breach this turn: destroyed 2 units of GPT 6.2 Sol by attack and decided to break it'));
  const one = tooltipOf(cellOf([item({ breached: true, unitsDestroyedByAttack: 1 })]));
  assert.ok(one.lines.some((line) => line.text === 'Breach this turn: destroyed 1 unit of GPT 6.2 Sol by attack'));
});

test('the counterpart line says match or none, and a non-AI counterpart adds none', () => {
  const match = tooltipOf(cellOf([item({ counterpartRecord: { kind: 'match', agreementId: 4, standing: 'proposed' } })]));
  assert.ok(match.lines.some((line) => line.text === 'GPT 6.2 Sol records it as #4 (proposed)'));
  const none = tooltipOf(cellOf([item({ counterpartRecord: { kind: 'none' } })]));
  assert.ok(none.lines.some((line) => line.text === 'GPT 6.2 Sol records no matching agreement'));
  const human = tooltipOf(cellOf([item()]));
  assert.equal(human.lines.length, 2);
});
