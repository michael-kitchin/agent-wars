/**
 * The posture strip rules.
 *
 * Purpose: Rows, cells, validation of stored reports, and tooltip lines follow their contracts.
 * When to use: `npm run build:main`, then `node dist/shared/postureStrip.test.js`.
 * Expected outcome: Each rule gives the specified result on a hand-built snapshot.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MatchChartsSnapshot, PostureReport, TurnStatistics } from './matchStatistics';
import { postureCellTooltipText, postureReportsOf, postureStrip } from './postureStrip';

const turn = (turnNumber: number, postures?: unknown): TurnStatistics =>
  ({ turnNumber, sides: [], relationships: [], hexesTaken: null, postures }) as unknown as TurnStatistics;

const report = (seatId: string, posture: PostureReport['posture'], declared: boolean, acting: boolean): PostureReport => ({
  seatId,
  posture,
  declared,
  acting,
});

const snapshotOf = (turns: TurnStatistics[]): MatchChartsSnapshot => ({
  seats: [
    { seatId: 'opponent2', seatOrder: 2, kind: 'ai', name: 'Levant', outTurn: 7 },
    { seatId: 'human', seatOrder: 0, kind: 'human', name: 'You' },
    { seatId: 'opponent', seatOrder: 1, kind: 'ai', name: 'Iberia' },
  ],
  turns,
  currentTurnNumber: 9,
});

test('turns without a valid postures list are not recorded', () => {
  const strip = postureStrip(snapshotOf([turn(5), turn(6, 'bad')]));
  assert.equal(postureReportsOf(turn(5)), null);
  assert.equal(postureReportsOf(turn(6, 'bad')), null);
  for (const row of strip.rows) {
    assert.deepEqual(row.cells.map((cell) => cell.recorded), [false, false]);
  }
});

test('an entry with an unknown posture is dropped', () => {
  const strip = postureStrip(snapshotOf([turn(5, [report('opponent', 'overland', true, true), { ...report('opponent2', 'overland', true, true), posture: 'siege' }])]));
  assert.deepEqual(strip.rows[0].cells[0], { recorded: true, posture: 'overland', declared: true, acting: true });
  assert.deepEqual(strip.rows[1].cells[0], { recorded: true, posture: null, declared: false, acting: false });
});

test('rows are the AI seats in seat order and the human has none', () => {
  const strip = postureStrip(snapshotOf([turn(5, []), turn(6, [])]));
  assert.deepEqual(strip.rows.map((row) => row.seatId), ['opponent', 'opponent2']);
  assert.deepEqual(strip.turns, [5, 6]);
});

test('a seat out on turn 7 reads out of the match afterwards and no report before', () => {
  const cell = postureStrip(snapshotOf([turn(6, [])])).rows[1].cells[0];
  assert.equal(postureCellTooltipText({ name: 'Levant', cell, outTurn: 7, turnNumber: 6 }), 'Levant: no report');
  assert.equal(postureCellTooltipText({ name: 'Levant', cell, outTurn: 7, turnNumber: 8 }), 'Levant: out of the match');
});

test('tooltip lines use the specified wording', () => {
  const base = { name: 'Iberia', outTurn: null, turnNumber: 5 };
  assert.equal(postureCellTooltipText({ ...base, cell: { recorded: false, posture: null, declared: false, acting: false } }), 'Iberia: not recorded');
  assert.equal(postureCellTooltipText({ ...base, cell: { recorded: true, posture: 'overland', declared: false, acting: false } }), 'Iberia: overland by default, idle');
  assert.equal(postureCellTooltipText({ ...base, cell: { recorded: true, posture: 'overland', declared: false, acting: true } }), 'Iberia: overland by default, acting');
  assert.equal(postureCellTooltipText({ ...base, cell: { recorded: true, posture: 'maritime', declared: true, acting: true } }), 'Iberia: maritime, acting');
  assert.equal(postureCellTooltipText({ ...base, cell: { recorded: true, posture: 'blitz', declared: true, acting: false } }), 'Iberia: blitz, idle');
});
