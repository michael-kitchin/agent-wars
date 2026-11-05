/**
 * Playback move lists built for strategic Ready and melee-intercept resolve.
 *
 * Hex indexes and unit ids in this file are test data, not live match values.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { buildReadyPlaybackMoves } from './readyPlaybackMoves';

test('buildReadyPlaybackMoves keeps resolution moves and appends each side\'s ferries with their paths', () => {
  const humanFerryPath = ['hex-h-from', 'hex-h-stop', 'hex-h-to'];
  const opponentFerryPath = ['hex-a-from', 'hex-a-to'];
  const cargoPath = ['hex-c-from', 'hex-c-stop', 'hex-c-to'];
  const result = buildReadyPlaybackMoves({
    humanMoves: [{ unitId: 'human-march', fromH3Index: 'hex-m-from', toH3Index: 'hex-m-to' }],
    aiMoves: [
      { unitId: 'opponent-march', fromH3Index: 'hex-o-from', toH3Index: 'hex-o-to', player: AI_SEAT_IDS[0] },
      {
        unitId: 'opponent-cargo',
        fromH3Index: 'hex-c-from',
        toH3Index: 'hex-c-to',
        player: AI_SEAT_IDS[0],
        pathH3Indexes: cargoPath,
      },
    ],
    resolvedFerryMoves: [
      {
        unitId: 'human-ferry',
        player: HUMAN_SEAT_ID,
        fromH3Index: 'hex-h-from',
        toH3Index: 'hex-h-to',
        pathH3Indexes: humanFerryPath,
      },
      {
        unitId: 'opponent-ferry',
        player: AI_SEAT_IDS[0],
        fromH3Index: 'hex-a-from',
        toH3Index: 'hex-a-to',
        pathH3Indexes: opponentFerryPath,
      },
    ],
  });

  assert.deepEqual(result.humanMoves, [
    { unitId: 'human-march', fromH3Index: 'hex-m-from', toH3Index: 'hex-m-to' },
    {
      unitId: 'human-ferry',
      fromH3Index: 'hex-h-from',
      toH3Index: 'hex-h-to',
      pathH3Indexes: ['hex-h-from', 'hex-h-stop', 'hex-h-to'],
    },
  ]);
  assert.deepEqual(result.aiMoves, [
    { unitId: 'opponent-march', fromH3Index: 'hex-o-from', toH3Index: 'hex-o-to', player: AI_SEAT_IDS[0] },
    {
      unitId: 'opponent-cargo',
      fromH3Index: 'hex-c-from',
      toH3Index: 'hex-c-to',
      player: AI_SEAT_IDS[0],
      pathH3Indexes: cargoPath,
    },
    {
      unitId: 'opponent-ferry',
      fromH3Index: 'hex-a-from',
      toH3Index: 'hex-a-to',
      pathH3Indexes: ['hex-a-from', 'hex-a-to'],
    },
  ]);
  humanFerryPath.push('hex-mutated');
  assert.deepEqual(result.humanMoves[1]?.pathH3Indexes, ['hex-h-from', 'hex-h-stop', 'hex-h-to']);
});

test('buildReadyPlaybackMoves returns empty lists when the resolution carried no moves', () => {
  assert.deepEqual(buildReadyPlaybackMoves({}), { humanMoves: [], aiMoves: [] });
});
