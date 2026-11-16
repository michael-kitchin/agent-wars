/**
 * The chart data rules.
 *
 * Purpose: Series, tooltips, zoom and pan, relationship rows, the stance strip, and spoke positions follow their contracts.
 * When to use: `npm run build:main`, then `node dist/shared/matchChartSeries.test.js`.
 * Expected outcome: Each rule gives the specified result on a hand-built three-seat snapshot.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chartTooltip,
  lineChartData,
  pannedTurnRange,
  relationshipRows,
  relationshipStrip,
  spokePositions,
  zoomedTurnRange,
} from './matchChartSeries';
import type {
  HexesTaken,
  MatchChartsSnapshot,
  RelationshipReport,
  SideStatistics,
  TurnStatistics,
} from './matchStatistics';

const side = (seatId: string, turn: number): SideStatistics => ({
  seatId,
  out: false,
  builtUnits: { infantry: turn, armor: 2, naval: 0, air: 1, missile: 0 },
  mercenaryUnits: { infantry: 1, armor: 0, naval: 0, air: 0 },
  hexes: turn * 2,
  productionPerTurn: 5,
  storedPoints: 3,
  treasury: seatId === 'human' ? 100 : 40,
  upkeepPerTurn: 2,
  unitsLost: seatId === 'opponent' && turn === 10 ? null : 1,
  costUsd: seatId === 'human' ? 0 : 0.125,
});

const report = (seatId: string, towardSeatId: string, stance: RelationshipReport['stance'], reportedTurn: number): RelationshipReport => ({
  seatId,
  towardSeatId,
  stance,
  trust: 3,
  threat: 1,
  reportedTurn,
});

const turn = (turnNumber: number, relationships: RelationshipReport[], hexesTaken: HexesTaken[] | null): TurnStatistics => ({
  turnNumber,
  sides: ['human', 'opponent', 'opponent2'].map((seatId) => side(seatId, turnNumber)),
  relationships,
  hexesTaken,
});

const snapshot: MatchChartsSnapshot = {
  seats: [
    { seatId: 'human', seatOrder: 0, kind: 'human', name: 'You' },
    { seatId: 'opponent', seatOrder: 1, kind: 'ai', name: 'Iberia' },
    { seatId: 'opponent2', seatOrder: 2, kind: 'ai', name: 'Levant' },
  ],
  turns: [
    // Opponent reported on the human at turn 5 (old), and never on opponent2.
    turn(10, [report('opponent', 'human', 'wary', 5)], [{ bySeatId: 'opponent', fromSeatId: 'human', hexes: 2 }]),
    turn(11, [report('opponent', 'human', 'wary', 5), report('opponent2', 'human', 'hostile', 10)], null),
    turn(12, [report('opponent', 'human', 'wary', 5), report('opponent2', 'human', 'hostile', 10)], []),
    turn(13, [report('opponent', 'human', 'wary', 5), report('opponent2', 'human', 'friendly', 12)], [
      { bySeatId: 'opponent2', fromSeatId: 'human', hexes: 3 },
      { bySeatId: 'opponent', fromSeatId: 'human', hexes: 1 },
    ]),
  ],
  currentTurnNumber: 14,
};

const name = (seatId: string): string => ({ human: 'You', opponent: 'Iberia', opponent2: 'Levant' })[seatId] ?? seatId;

test('built units sums the types, or returns one type', () => {
  const total = lineChartData(snapshot, 'built-units', null);
  assert.deepEqual(total.turns, [10, 11, 12, 13]);
  assert.deepEqual(total.series[0].values, [13, 14, 15, 16]);
  assert.deepEqual(lineChartData(snapshot, 'built-units', 'armor').series[0].values, [2, 2, 2, 2]);
});

test('model cost lists AI seats only', () => {
  const cost = lineChartData(snapshot, 'model-cost', null);
  assert.deepEqual(cost.series.map((s) => s.seatId), ['opponent', 'opponent2']);
});

test('a null units lost stays null and the tooltip leaves it out of the total', () => {
  const lost = lineChartData(snapshot, 'units-lost', null);
  assert.equal(lost.series[1].values[0], null);
  const tip = chartTooltip(lost, 0, name, 0);
  assert.equal(tip.heading, 'Turn 10');
  assert.deepEqual(tip.lines, ['You: 1', 'Iberia: no data', 'Levant: 1']);
  assert.equal(tip.total, 'Total: 2');
});

test('tooltip totals use the requested decimals', () => {
  assert.equal(chartTooltip(lineChartData(snapshot, 'treasury', null), 3, name, 0).total, 'Total: 180');
  assert.equal(chartTooltip(lineChartData(snapshot, 'model-cost', null), 3, name, 2).total, 'Total: 0.25');
});

test('a turn with no entry for a seat gives null', () => {
  const partial: MatchChartsSnapshot = {
    ...snapshot,
    turns: [{ ...snapshot.turns[0], sides: snapshot.turns[0].sides.filter((s) => s.seatId !== 'opponent') }],
  };
  assert.equal(lineChartData(partial, 'hexes', null).series[1].values[0], null);
});

test('zoom keeps the anchor, honors the minimum span, and stops at the full range', () => {
  const full = { min: 0, max: 100 };
  const mid = zoomedTurnRange({ range: full, full, anchor: 50, factor: 0.5, minSpan: 2 });
  assert.deepEqual(mid, { min: 25, max: 75 });
  const edge = zoomedTurnRange({ range: full, full, anchor: 0, factor: 0.5, minSpan: 2 });
  assert.deepEqual(edge, { min: 0, max: 50 });
  const tight = zoomedTurnRange({ range: { min: 10, max: 12 }, full, anchor: 11, factor: 0.1, minSpan: 2 });
  assert.equal(tight.max - tight.min, 2);
  const out = zoomedTurnRange({ range: { min: 25, max: 75 }, full, anchor: 50, factor: 4, minSpan: 2 });
  assert.deepEqual(out, full);
});

test('pan clamps at the edge and keeps the span', () => {
  const full = { min: 0, max: 100 };
  assert.deepEqual(pannedTurnRange({ range: { min: 50, max: 100 }, full, deltaTurns: 10 }), { min: 50, max: 100 });
  assert.deepEqual(pannedTurnRange({ range: { min: 20, max: 40 }, full, deltaTurns: 5 }), { min: 25, max: 45 });
  assert.deepEqual(pannedTurnRange({ range: { min: 5, max: 25 }, full, deltaTurns: -50 }), { min: 0, max: 20 });
});

test('relationship rows give fresh, old, and none, and sum hexes taken in the window', () => {
  const rows = relationshipRows(snapshot, 'human');
  assert.deepEqual(rows.map((r) => [r.reporterSeatId, r.age]), [
    ['opponent', 'old'],
    ['opponent2', 'fresh'],
  ]);
  assert.equal(rows[1].stance, 'friendly');
  assert.equal(rows[1].reportedTurn, 12);
  // Turns 10 to 13 are inside the window and the unknown turn 11 is skipped.
  assert.equal(rows[0].hexesTaken, 3);
  assert.equal(rows[1].hexesTaken, 3);
  const toOpponent = relationshipRows(snapshot, 'opponent');
  assert.deepEqual(toOpponent.map((r) => [r.reporterSeatId, r.age, r.stance]), [['opponent2', 'none', null]]);
});

test('hexes taken is null when every turn in the window is unknown', () => {
  const unknown: MatchChartsSnapshot = { ...snapshot, turns: snapshot.turns.map((t) => ({ ...t, hexesTaken: null })) };
  assert.equal(relationshipRows(unknown, 'human')[0].hexesTaken, null);
});

test('hexes taken ignores turns outside the window', () => {
  const far: MatchChartsSnapshot = {
    ...snapshot,
    turns: [
      turn(1, [], [{ bySeatId: 'opponent', fromSeatId: 'human', hexes: 9 }]),
      turn(10, [], [{ bySeatId: 'opponent', fromSeatId: 'human', hexes: 1 }]),
    ],
  };
  assert.equal(relationshipRows(far, 'human')[0].hexesTaken, 1);
});

test('the strip marks a report when its turn moves forward and carries it as not reported after', () => {
  const strip = relationshipStrip(snapshot, 'human');
  assert.deepEqual(strip.turns, [10, 11, 12, 13]);
  const iberia = strip.rows[0].cells;
  // Reported at turn 5, first recorded turn 10: not within one turn, so a carried stance.
  assert.deepEqual(iberia.map((c) => c.reportedThisTurn), [false, false, false, false]);
  const levant = strip.rows[1].cells;
  assert.deepEqual(levant.map((c) => c.stance), [null, 'hostile', 'hostile', 'friendly']);
  // Report first present at turn 11 (no previous report), then carried, then moved forward at 13.
  assert.deepEqual(levant.map((c) => c.reportedThisTurn), [false, true, false, true]);
});

test('the first recorded turn counts a report one turn behind as reported', () => {
  const first: MatchChartsSnapshot = { ...snapshot, turns: [turn(10, [report('opponent', 'human', 'wary', 9)], null)] };
  assert.equal(relationshipStrip(first, 'human').rows[0].cells[0].reportedThisTurn, true);
});

test('spoke positions start straight up and go clockwise', () => {
  const points = spokePositions(4, 10);
  const expected = [
    [0, -10],
    [10, 0],
    [0, 10],
    [-10, 0],
  ];
  points.forEach((p, i) => {
    assert.ok(Math.abs(p.x - expected[i][0]) < 0.001, `x ${i}`);
    assert.ok(Math.abs(p.y - expected[i][1]) < 0.001, `y ${i}`);
  });
  assert.deepEqual(spokePositions(0, 10), []);
});
