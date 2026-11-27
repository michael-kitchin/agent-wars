/**
 * A declared posture is stored, echoed, or refused until the hold ends.
 * Run with: node dist/main/operations/postureChoice.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dbGetOne, dbRun } from '../gameDb';
import { readPosture } from '../gameDb/postureMemory';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { applyPostureChoice, applyReplyPosture } from './postureChoice';

const SEAT = 'opponent';

test('the first posture is stored and the same choice leaves the turn unchanged', () => {
  withTempGameDb('aw-posture-choice-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    const first = applyPostureChoice({ seatId: SEAT, posture: 'maritime', turnNumber: 10 });
    assert.deepEqual(first, { applied: true, dropReasons: [] });
    assert.deepEqual(readPosture(ops, SEAT), { posture: 'maritime', sinceTurn: 10 });
    const echo = applyPostureChoice({ seatId: SEAT, posture: 'maritime', turnNumber: 12 });
    assert.deepEqual(echo, { applied: true, dropReasons: [] });
    assert.deepEqual(readPosture(ops, SEAT), { posture: 'maritime', sinceTurn: 10 });
  });
});

test('a change inside the hold is dropped and a change on the sixth turn is stored', () => {
  withTempGameDb('aw-posture-choice-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    applyPostureChoice({ seatId: SEAT, posture: 'maritime', turnNumber: 10 });
    const early = applyPostureChoice({ seatId: SEAT, posture: 'blitz', turnNumber: 15 });
    assert.equal(early.applied, false);
    assert.deepEqual(early.dropReasons, [
      'posture dropped: you set maritime on turn 10 and may change it from turn 16.',
    ]);
    assert.deepEqual(readPosture(ops, SEAT), { posture: 'maritime', sinceTurn: 10 });
    const later = applyPostureChoice({ seatId: SEAT, posture: 'blitz', turnNumber: 16 });
    assert.deepEqual(later, { applied: true, dropReasons: [] });
    assert.deepEqual(readPosture(ops, SEAT), { posture: 'blitz', sinceTurn: 16 });
  });
});

test('a seat with no row may set one on the first consult', () => {
  withTempGameDb('aw-posture-choice-', () => {
    const ops = { getOne: dbGetOne };
    assert.equal(readPosture(ops, SEAT), null);
    const chosen = applyPostureChoice({ seatId: SEAT, posture: 'strangle', turnNumber: 1 });
    assert.equal(chosen.applied, true);
    assert.deepEqual(readPosture({ getOne: dbGetOne }, SEAT), { posture: 'strangle', sinceTurn: 1 });
  });
});

test('an explicit overland with no stored row is stored and starts the hold', () => {
  withTempGameDb('aw-posture-choice-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    const chosen = applyPostureChoice({ seatId: SEAT, posture: 'overland', turnNumber: 10 });
    assert.deepEqual(chosen, { applied: true, dropReasons: [] });
    assert.deepEqual(readPosture(ops, SEAT), { posture: 'overland', sinceTurn: 10 });
    const early = applyPostureChoice({ seatId: SEAT, posture: 'maritime', turnNumber: 12 });
    assert.equal(early.applied, false);
    assert.deepEqual(early.dropReasons, [
      'posture dropped: you set overland on turn 10 and may change it from turn 16.',
    ]);
  });
});

test('repeating the stored posture keeps its turn', () => {
  withTempGameDb('aw-posture-choice-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    applyPostureChoice({ seatId: SEAT, posture: 'maritime', turnNumber: 3 });
    const again = applyPostureChoice({ seatId: SEAT, posture: 'maritime', turnNumber: 5 });
    assert.deepEqual(again, { applied: true, dropReasons: [] });
    assert.deepEqual(readPosture(ops, SEAT), { posture: 'maritime', sinceTurn: 3 });
  });
});

test('a reply that names a posture returns what applying that choice returns, and stores it', () => {
  withTempGameDb('aw-posture-choice-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    applyPostureChoice({ seatId: SEAT, posture: 'maritime', turnNumber: 10 });
    const direct = applyPostureChoice({ seatId: SEAT, posture: 'blitz', turnNumber: 12 });
    const fromReply = applyReplyPosture({ seatId: SEAT, posture: 'blitz', turnNumber: 12, priorDropReasons: [] });
    assert.deepEqual(fromReply, direct.dropReasons);
    const accepted = applyReplyPosture({ seatId: SEAT, posture: 'blitz', turnNumber: 16, priorDropReasons: [] });
    assert.deepEqual(accepted, []);
    assert.deepEqual(readPosture(ops, SEAT), { posture: 'blitz', sinceTurn: 16 });
  });
});

test('a reply that names no posture adds no drop reason and stores nothing', () => {
  withTempGameDb('aw-posture-choice-', () => {
    const reasons = applyReplyPosture({ seatId: SEAT, posture: undefined, turnNumber: 4, priorDropReasons: [] });
    assert.deepEqual(reasons, []);
    assert.equal(readPosture({ getOne: dbGetOne }, SEAT), null);
  });
});
