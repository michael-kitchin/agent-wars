/**
 * The human player can stage a message and send it on commit.
 *
 * Purpose: A draft is replaced, refused, cancelled, and delivered with one recorder event.
 * When to use: `npm run build:main`, then `node dist/main/sideMessages/humanSideMessages.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { tacticalStep } from '../../shared/matchRecording';
import { getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { listStagedSideMessages, listUnseenInboundSideMessages } from '../gameDb/sideMessageStore';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import {
  SIDE_MESSAGE_EMPTY,
  SIDE_MESSAGE_NO_PLAYER,
  SIDE_MESSAGE_RECIPIENT_GONE,
  cancelStagedHumanSideMessage,
  sendStagedHumanSideMessages,
  stageHumanSideMessage,
} from './humanSideMessages';

/**
 * The largest listed home regions.
 *
 * Purpose: A global start needs regions that can hold opening units.
 * When to use: Before a seated start in this file.
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

test('staging replaces a draft, refuses a bad recipient, and sending records the message', () => {
  const regions = largestHomeRegions(3);
  assert.equal(regions.length, 3);
  withSeatedTempGameDb('aw-human-messages-', {
    gameMapId: 'global',
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
      { kind: 'ai', homeRegion: regions[2] },
    ],
  }, () => {
    assert.equal(stageHumanSideMessage(AI_SEAT_IDS[0], '  first   draft ').success, true);
    assert.equal(stageHumanSideMessage(AI_SEAT_IDS[0], 'second').success, true);
    const staged = listStagedSideMessages(gameDbOps, HUMAN_SEAT_ID);
    assert.equal(staged.length, 1);
    assert.equal(staged[0]?.body, 'second');

    assert.deepEqual(stageHumanSideMessage(HUMAN_SEAT_ID, 'self'), { success: false, reason: SIDE_MESSAGE_RECIPIENT_GONE });
    assert.deepEqual(stageHumanSideMessage('nobody', 'x'), { success: false, reason: SIDE_MESSAGE_RECIPIENT_GONE });
    assert.deepEqual(stageHumanSideMessage(AI_SEAT_IDS[0], '   '), { success: false, reason: SIDE_MESSAGE_EMPTY });
    gameDbOps.run('UPDATE seats SET out_turn = 2 WHERE seat_id = ?', [AI_SEAT_IDS[1]]);
    assert.deepEqual(stageHumanSideMessage(AI_SEAT_IDS[1], 'late'), { success: false, reason: SIDE_MESSAGE_RECIPIENT_GONE });

    cancelStagedHumanSideMessage(AI_SEAT_IDS[0]);
    assert.equal(listStagedSideMessages(gameDbOps, HUMAN_SEAT_ID).length, 0);

    assert.equal(stageHumanSideMessage(AI_SEAT_IDS[0], 'delivered').success, true);
    assert.equal(stageHumanSideMessage(AI_SEAT_IDS[1], 'to-the-gone-side').success, false);
    gameDbOps.run(
      `INSERT INTO side_messages (from_seat_id, to_seat_id, status, body, scope, turn_number, battle_id, beat_number, seen_by_recipient)
       VALUES (?, ?, 'staged', 'leftover', 'strategic', 1, '', 0, 0)`,
      [HUMAN_SEAT_ID, AI_SEAT_IDS[1]]
    );
    const step = tacticalStep(1, 'battle-1', 2);
    assert.equal(sendStagedHumanSideMessages(step), 1);
    assert.equal(sendStagedHumanSideMessages(step), 0);
    const unseen = listUnseenInboundSideMessages(gameDbOps, AI_SEAT_IDS[0]);
    assert.equal(unseen.length, 1);
    assert.equal(unseen[0]?.body, 'delivered');
    assert.equal(unseen[0]?.step.battleId, 'battle-1');
    const events = gameDbOps.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM match_records WHERE record_type = 'message_sent'`
    );
    assert.equal(events?.count, 1);
    assert.equal(listStagedSideMessages(gameDbOps, HUMAN_SEAT_ID).length, 0);
  });
});

test('a match with no human seat cannot stage a message', () => {
  const regions = largestHomeRegions(2);
  assert.equal(regions.length, 2);
  withSeatedTempGameDb('aw-human-messages-none-', {
    gameMapId: 'global',
    seats: regions.map((homeRegion) => ({ kind: 'ai' as const, homeRegion })),
  }, () => {
    assert.deepEqual(stageHumanSideMessage(AI_SEAT_IDS[0], 'hello'), { success: false, reason: SIDE_MESSAGE_NO_PLAYER });
    assert.equal(sendStagedHumanSideMessages(tacticalStep(1, '', 0)), 0);
  });
});
