/**
 * The message snapshot follows fog of war and the roster.
 *
 * Purpose: The renderer is given only what the viewer may see.
 * When to use: `npm run build:main`, then `node dist/main/ipc/sideMessageIpcHandler.test.js`.
 * Expected outcome: Fog on still lists a message between AI sides. An observer sees every message and cannot send. A knocked-out side leaves the recipient list.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { strategicStep } from '../../shared/matchRecording';
import { getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { upsertGameConfigValue } from '../gameDb/gameConfigRows';
import { insertSentSideMessage, listStagedSideMessages, replaceStagedSideMessage } from '../gameDb/sideMessageStore';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { IPC_GAME } from '../../shared/ipc/channels';
import type { IpcMain } from 'electron';
import { buildSideMessageThreadSnapshot, registerSideMessageIpcHandler } from './sideMessageIpcHandler';

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
    .sort((left, right) => right.hexes - left.hexes || left.name.localeCompare(right.name))
    .slice(0, count)
    .map((region) => region.name);
}

/**
 * Stores the three messages the visibility cases share.
 *
 * Purpose: One message to the human, one from the human, and one between two AI sides.
 * When to use: Inside a seated match.
 * Expected outcome: Three sent rows, oldest first.
 * Exceptions: Propagates a SQLite error.
 */
function insertVisibilityRows(): void {
  const step = strategicStep(1);
  insertSentSideMessage(gameDbOps, { fromSeatId: AI_SEAT_IDS[0], toSeatId: HUMAN_SEAT_ID, body: 'to-you', step });
  insertSentSideMessage(gameDbOps, { fromSeatId: HUMAN_SEAT_ID, toSeatId: AI_SEAT_IDS[0], body: 'from-you', step });
  insertSentSideMessage(gameDbOps, { fromSeatId: AI_SEAT_IDS[0], toSeatId: AI_SEAT_IDS[1], body: 'between', step });
}

test('the history lists every sent message, and a draft stays out of the history', () => {
  const regions = largestHomeRegions(3);
  assert.equal(regions.length, 3);
  withSeatedTempGameDb('aw-side-message-ipc-', {
    gameMapId: 'global',
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
      { kind: 'ai', homeRegion: regions[2] },
    ],
  }, () => {
    insertVisibilityRows();
    const fogOn = buildSideMessageThreadSnapshot();
    assert.equal(fogOn.viewerSeatId, HUMAN_SEAT_ID);
    assert.equal(fogOn.canSend, true);
    assert.deepEqual(fogOn.messages.map((message) => message.text), ['to-you', 'from-you', 'between']);
    assert.deepEqual(fogOn.recipientSeatIds, [AI_SEAT_IDS[0], AI_SEAT_IDS[1]]);

    upsertGameConfigValue(gameDbOps, 'fog_of_war_enabled', '0');
    const fogOff = buildSideMessageThreadSnapshot();
    assert.deepEqual(fogOff.messages.map((message) => message.text), ['to-you', 'from-you', 'between']);

    replaceStagedSideMessage(gameDbOps, {
      fromSeatId: HUMAN_SEAT_ID,
      toSeatId: AI_SEAT_IDS[0],
      body: 'draft',
      step: strategicStep(1),
    });
    const withDraft = buildSideMessageThreadSnapshot();
    assert.deepEqual(withDraft.staged.map((message) => message.text), ['draft']);
    assert.equal(withDraft.messages.some((message) => message.text === 'draft'), false);

    gameDbOps.run('UPDATE seats SET out_turn = 2 WHERE seat_id = ?', [AI_SEAT_IDS[1]]);
    const afterKnockout = buildSideMessageThreadSnapshot();
    assert.deepEqual(afterKnockout.recipientSeatIds, [AI_SEAT_IDS[0]]);
  });
});

test('an observer sees every message and cannot send', () => {
  const regions = largestHomeRegions(2);
  assert.equal(regions.length, 2);
  withSeatedTempGameDb('aw-side-message-ipc-observe-', {
    gameMapId: 'global',
    seats: regions.map((homeRegion) => ({ kind: 'ai' as const, homeRegion })),
  }, () => {
    insertVisibilityRows();
    const snapshot = buildSideMessageThreadSnapshot();
    assert.equal(snapshot.viewerSeatId, null);
    assert.equal(snapshot.canSend, false);
    assert.deepEqual(snapshot.staged, []);
    assert.deepEqual(snapshot.messages.map((message) => message.text), ['to-you', 'from-you', 'between']);
  });
});

test('a bad stage payload is refused and a bad cancel leaves the draft', () => {
  const regions = largestHomeRegions(2);
  assert.equal(regions.length, 2);
  withSeatedTempGameDb('aw-side-message-ipc-refuse-', {
    gameMapId: 'global',
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
    ],
  }, () => {
    replaceStagedSideMessage(gameDbOps, {
      fromSeatId: HUMAN_SEAT_ID,
      toSeatId: AI_SEAT_IDS[0],
      body: 'keep',
      step: strategicStep(1),
    });
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const ipc = {
      handle: (channel: string, listener: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, listener);
      },
    } as unknown as IpcMain;
    registerSideMessageIpcHandler(ipc);
    const stage = handlers.get(IPC_GAME.stageSideMessage);
    const cancel = handlers.get(IPC_GAME.cancelStagedSideMessage);
    assert.ok(stage && cancel);
    assert.deepEqual(stage({}, null), { success: false, reason: 'Invalid message.' });
    assert.deepEqual(stage({}, { toSeatId: 1, text: 'no' }), { success: false, reason: 'Invalid message.' });
    cancel({}, { toSeatId: 1 });
    assert.deepEqual(listStagedSideMessages(gameDbOps, HUMAN_SEAT_ID).map((row) => row.body), ['keep']);
  });
});
