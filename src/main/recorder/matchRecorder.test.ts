/**
 * Step boundaries.
 *
 * Purpose: The first call starts the match, a later call writes a frame only when the step changed, and game over writes one final frame.
 * When to use: `npm run build:main`, then `node dist/main/recorder/matchRecorder.test.js`.
 * Expected outcome: The history rows follow the step, including a loaded turn that has not advanced.
 * Exceptions: None. The temporary directory is removed afterward, and the test clock and flag are restored.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gameDbOps } from '../gameDb/dbConnection';
import { MATCH_ID_CONFIG_KEY, setGameOutcomeWithOps } from '../gameDb/gameConfigKv';
import { strategicStep, tacticalStep } from '../../shared/matchRecording';
import { countMatchRecords, listMatchRecords } from './matchRecordStore';
import { recordMatchEvent, recordStepBoundary, setRecorderClockForTests } from './matchRecorder';
import { withTempGameDb } from '../testSupport/withTempGameDb';

test('boundaries write one frame per step change and one final frame at game over', () => {
  withTempGameDb('aw-match-boundary-', () => {
    setRecorderClockForTests(() => '2026-01-01T00:00:00.000Z');
    try {
      recordStepBoundary(null, '1.0.0');
      assert.equal(countMatchRecords(gameDbOps), 0);
      recordMatchEvent({
        type: 'orders_committed',
        step: strategicStep(1),
        visibility: 'engine',
        payload: () => 1,
      });
      assert.equal(countMatchRecords(gameDbOps), 0);

      recordStepBoundary(strategicStep(1), '1.0.0');
      const started = listMatchRecords(gameDbOps);
      assert.deepEqual(started.map((row) => row.recordType), ['match_started', 'state']);
      assert.equal(started[1]?.stepKey, 's1');
      const afterSameStep = countMatchRecords(gameDbOps);
      recordStepBoundary(strategicStep(1), '1.0.0');
      assert.equal(countMatchRecords(gameDbOps), afterSameStep);

      recordStepBoundary(strategicStep(2), '1.0.0');
      assert.equal(listMatchRecords(gameDbOps).filter((row) => row.kind === 'frame').length, 2);

      recordStepBoundary(tacticalStep(2, 'b1', 1), '1.0.0');
      recordStepBoundary(strategicStep(2), '1.0.0');
      const keys = listMatchRecords(gameDbOps).filter((row) => row.kind === 'frame').map((row) => row.stepKey);
      assert.deepEqual(keys, ['s1', 's2', 's2-bb1-t1', 's2']);
    } finally {
      setRecorderClockForTests(null);
    }
  });
});

test('game over adds one final frame and one match_ended', () => {
  withTempGameDb('aw-match-over-', () => {
    setRecorderClockForTests(() => '2026-01-01T00:00:00.000Z');
    try {
      recordStepBoundary(strategicStep(1), '1.0.0');
      setGameOutcomeWithOps(gameDbOps, { winnerSeatId: null, endReason: 'ended_by_human' });
      recordStepBoundary(strategicStep(1), '1.0.0');
      const rows = listMatchRecords(gameDbOps);
      assert.equal(rows.filter((row) => row.kind === 'frame').length, 2);
      const ended = rows.find((row) => row.recordType === 'match_ended');
      assert.deepEqual(ended?.payload, { winner: '', reason: 'ended_by_human' });
      const count = rows.length;
      recordStepBoundary(strategicStep(1), '1.0.0');
      assert.equal(countMatchRecords(gameDbOps), count);
    } finally {
      setRecorderClockForTests(null);
    }
  });
});

test('a step change on an ended match writes one frame and match_ended', () => {
  withTempGameDb('aw-match-over-step-', () => {
    recordStepBoundary(strategicStep(1), '1.0.0');
    setGameOutcomeWithOps(gameDbOps, { winnerSeatId: 'opponent', endReason: 'last_side_standing' });
    const framesBefore = listMatchRecords(gameDbOps).filter((row) => row.kind === 'frame').length;
    recordStepBoundary(strategicStep(2), '1.0.0');
    const rows = listMatchRecords(gameDbOps);
    assert.equal(rows.filter((row) => row.kind === 'frame').length, framesBefore + 1);
    assert.equal(rows.filter((row) => row.recordType === 'match_ended').length, 1);
    assert.equal(rows.at(-1)?.recordType, 'match_ended');
    assert.deepEqual(rows.at(-1)?.payload, { winner: 'opponent', reason: 'last_side_standing' });
  });
});

test('the recorder writes nothing when the flag is on', () => {
  withTempGameDb('aw-match-flag-', () => {
    process.env.AGENT_WARS_DISABLE_RECORDER = '1';
    try {
      recordStepBoundary(strategicStep(1), '1.0.0');
      assert.equal(countMatchRecords(gameDbOps), 0);
    } finally {
      delete process.env.AGENT_WARS_DISABLE_RECORDER;
    }
  });
});

test('an earlier event does not suppress match start', () => {
  withTempGameDb('aw-match-started-later-', () => {
    recordMatchEvent({
      type: 'orders_committed',
      step: strategicStep(4),
      visibility: 'engine',
      payload: { owner: 'opponent' },
    });
    recordStepBoundary(strategicStep(4), '1.0.0');
    const types = listMatchRecords(gameDbOps).map((row) => row.recordType);
    assert.equal(types[0], 'orders_committed');
    assert.ok(types.includes('match_started'));
    assert.equal(types.filter((type) => type === 'state').length, 1);
  });
});

test('the first recorded turn is the turn already stored', () => {
  withTempGameDb('aw-match-loaded-', () => {
    gameDbOps.run('UPDATE turn_state SET turn_number = 7 WHERE id = 1');
    gameDbOps.run('DELETE FROM game_config WHERE key = ?', [MATCH_ID_CONFIG_KEY]);
    recordStepBoundary(strategicStep(7), '1.0.0');
    const rows = listMatchRecords(gameDbOps);
    const started = rows.find((row) => row.recordType === 'match_started');
    const payload = started?.payload as { firstRecordedTurn: number; matchId: string };
    assert.equal(payload.firstRecordedTurn, 7);
    assert.ok(payload.matchId.length > 0);
    assert.equal(rows.find((row) => row.kind === 'frame')?.stepKey, 's7');
  });
});
