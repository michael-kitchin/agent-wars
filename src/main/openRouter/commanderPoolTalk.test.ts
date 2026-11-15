/**
 * The talk switch and the production talk runner's early returns.
 *
 * Purpose: Talk stays off when the flag is set, and a missing model or an aborted signal does not call the model.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/commanderPoolTalk.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None. The environment flag is restored.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { closeGameDatabaseForTests, openGameDatabaseAtPathForTests, resetGameForNewMatch } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { isTalkStageEnabled, openCommanderTalkRoundAt, setCommanderTalkRunnerForTests } from './commanderPoolRounds';
import { runCommanderTalk } from './commanderPoolTalk';

test('the talk switch follows the environment flag', () => {
  const previous = process.env.AGENT_WARS_DISABLE_TALK;
  try {
    delete process.env.AGENT_WARS_DISABLE_TALK;
    assert.equal(isTalkStageEnabled(), true);
    process.env.AGENT_WARS_DISABLE_TALK = '1';
    assert.equal(isTalkStageEnabled(), false);
  } finally {
    if (previous === undefined) delete process.env.AGENT_WARS_DISABLE_TALK;
    else process.env.AGENT_WARS_DISABLE_TALK = previous;
  }
});

test('a round is not opened without seats or without a runner', () => {
  setCommanderTalkRunnerForTests(null);
  const schedule = (): { cancel: () => void } => ({ cancel() { /* unused */ } });
  assert.equal(openCommanderTalkRoundAt({
    seatIds: [],
    theater: 'strategic',
    battle: null,
    turnNumber: 1,
    talkRoundTimeoutMs: 1,
    schedule,
  }), null);
  assert.equal(openCommanderTalkRoundAt({
    seatIds: [AI_SEAT_IDS[0]],
    theater: 'strategic',
    battle: null,
    turnNumber: 1,
    talkRoundTimeoutMs: 1,
    schedule,
  }), null);
});

test('talk fails without a model and cancels when the signal is already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  const cancelled = await runCommanderTalk({
    seatId: AI_SEAT_IDS[0],
    theater: 'strategic',
    battle: null,
    turnNumber: 1,
    signal: controller.signal,
  });
  assert.deepEqual(cancelled, { kind: 'silent', reason: 'cancelled', costUsd: 0 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-talk-runner-'));
  openGameDatabaseAtPathForTests(path.join(dir, 't.sqlite'));
  try {
    resetGameForNewMatch();
    gameDbOps.run(`UPDATE seats SET model_id = '' WHERE seat_id = ?`, [AI_SEAT_IDS[0]]);
    const failed = await runCommanderTalk({
      seatId: AI_SEAT_IDS[0],
      theater: 'strategic',
      battle: null,
      turnNumber: 1,
      signal: new AbortController().signal,
    });
    assert.deepEqual(failed, { kind: 'silent', reason: 'failed', costUsd: 0 });
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
