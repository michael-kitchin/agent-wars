/**
 * Storing a closed talk round.
 *
 * Purpose: Messages and changed stances are written together, and a moved match generation stores nothing.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/talk/talkRoundPersistence.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, type SeatId } from '../../../shared/seatIds';
import { strategicStep } from '../../../shared/matchRecording';
import { getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../../gameDb';
import { gameDbOps } from '../../gameDb/dbConnection';
import { listSentSideMessages, listSideStances } from '../../gameDb/sideMessageStore';
import { advanceMatchGeneration, getMatchGeneration } from '../../matchGeneration';
import { decodeRecordPayload } from '../../recorder/matchRecordCodec';
import { withSeatedTempGameDb } from '../../testSupport/withSeatedTempGameDb';
import type { TalkSeatResult } from './requestTalk';
import { persistTalkRound } from './talkRoundPersistence';

const step = strategicStep(4);

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

function spoke(to: SeatId, text: string, stance: boolean): TalkSeatResult {
  return {
    kind: 'spoke',
    costUsd: 0.1,
    reply: {
      messages: [{ toSeatId: to, text }],
      stances: stance ? [{ towardSeatId: to, stance: 'wary', reason: 'massing' }] : [],
      droppedCount: 0,
    },
  };
}

function eventTypes(): string[] {
  return gameDbOps.getAll<{ record_type: string }>(
    `SELECT record_type FROM match_records WHERE record_type IN ('message_sent', 'stance_declared') ORDER BY record_id`
  ).map((row) => row.record_type);
}

test('a closed round stores messages, stances, and events, and skips a seat that is out', () => {
  const regions = largestHomeRegions(3);
  assert.equal(regions.length, 3);
  withSeatedTempGameDb('aw-talk-persist-', {
    gameMapId: 'global',
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
      { kind: 'ai', homeRegion: regions[2] },
    ],
  }, () => {
    const generation = getMatchGeneration();
    const results = new Map([
      [AI_SEAT_IDS[0], spoke(HUMAN_SEAT_ID, 'from-a', true)],
      [AI_SEAT_IDS[1], spoke(AI_SEAT_IDS[0], 'from-b', true)],
    ]);
    const stored = persistTalkRound(step, results, generation);
    assert.equal(stored.get(AI_SEAT_IDS[0])?.[0]?.text, 'from-a');
    assert.equal(listSentSideMessages(gameDbOps).length, 2);
    assert.equal(listSideStances(gameDbOps, AI_SEAT_IDS[0])[0]?.stance, 'wary');
    assert.deepEqual(eventTypes(), ['message_sent', 'stance_declared', 'message_sent', 'stance_declared']);

    gameDbOps.run(`UPDATE seats SET out_turn = 2 WHERE seat_id = ?`, [AI_SEAT_IDS[0]]);
    const skipped = persistTalkRound(step, new Map([[AI_SEAT_IDS[1], spoke(AI_SEAT_IDS[0], 'too-late', false)]]), generation);
    assert.equal(skipped.size, 0);
    assert.equal(listSentSideMessages(gameDbOps).filter((row) => row.body === 'too-late').length, 0);

    const again = persistTalkRound(step, new Map([[AI_SEAT_IDS[0], spoke(HUMAN_SEAT_ID, 'again', true)]]), generation);
    assert.equal(again.get(AI_SEAT_IDS[0])?.[0]?.text, 'again');
    assert.equal(eventTypes().filter((type) => type === 'stance_declared').length, 2);

    const moved = getMatchGeneration();
    advanceMatchGeneration('new_game');
    const dropped = persistTalkRound(step, new Map([[AI_SEAT_IDS[0], spoke(HUMAN_SEAT_ID, 'stale', false)]]), moved);
    assert.equal(dropped.size, 0);
    assert.equal(listSentSideMessages(gameDbOps).some((row) => row.body === 'stale'), false);
    const payload = decodeRecordPayload(gameDbOps.getOne<{ payload: Buffer }>(
      `SELECT payload FROM match_records WHERE record_type = 'message_sent' ORDER BY record_id LIMIT 1`
    )?.payload ?? Buffer.alloc(0));
    assert.equal((payload as { text?: string }).text, 'from-a');
  });
});
