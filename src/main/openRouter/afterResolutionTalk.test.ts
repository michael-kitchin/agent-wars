/**
 * A post-resolution consult talks only when the policy consults, and an unread message still asks for orders.
 *
 * Purpose: The wave's orders calls start after the talk round closes.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/afterResolutionTalk.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, type AiSeatId } from '../../shared/seatIds';
import { strategicStep } from '../../shared/matchRecording';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { TacticalCommitResolutionPlayback } from '../../shared/ipcTypes';
import { closeGameDatabaseForTests, getGameState, openGameDatabaseAtPathForTests, resetGameForNewMatch, setAiLastConsultationTurn } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { insertSentSideMessage } from '../gameDb/sideMessageStore';
import { afterResolution, afterTacticalBeatResolution } from './afterResolution';
import { openTalkRound, type TalkRound } from './talk/talkRound';

/**
 * Opens a fresh match for one async case.
 *
 * Purpose: `afterResolution` reads the open database.
 * When to use: Each case.
 * Expected outcome: The case finishes before the database closes.
 * Exceptions: Propagates a case error after cleanup.
 */
async function withMatch(runCase: () => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-after-talk-'));
  openGameDatabaseAtPathForTests(path.join(dir, 't.sqlite'));
  try {
    resetGameForNewMatch();
    await runCase();
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A round whose timer the test can fire, and a runner that records seats.
 *
 * Purpose: The cases see who talked and when the round closed.
 * When to use: Each case that passes a round.
 * Expected outcome: `talked` grows as `speak` runs. `closed` becomes true after `whenClosed`.
 * Exceptions: None.
 */
function roundFor(seatIds: readonly AiSeatId[]): { round: TalkRound; talked: AiSeatId[]; closed: () => boolean } {
  const talked: AiSeatId[] = [];
  let isClosed = false;
  const round = openTalkRound({
    seatIds,
    theater: 'strategic',
    battle: null,
    turnNumber: 1,
    step: strategicStep(1),
    timeoutMs: 60_000,
    schedule: () => ({ cancel() { /* unused */ } }),
    runner: async (request) => {
      talked.push(request.seatId);
      return { kind: 'spoke', reply: { messages: [], stances: [], agreements: [], droppedCount: 0 }, costUsd: 0 };
    },
    persist: () => new Map(),
  });
  void round.whenClosed().then(() => { isClosed = true; });
  return { round, talked, closed: () => isClosed };
}

test('policy consults talk before orders, and an unread message orders without talking', async () => {
  await withMatch(async () => {
    const state = getGameState();
    const orders: string[] = [];
    const policy = roundFor([AI_SEAT_IDS[0]]);
    const consulted = await afterResolution(state, { success: true }, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      talkRound: policy.round,
      requestOrders: async () => {
        orders.push(policy.closed() ? 'after-close' : 'too-soon');
        return { success: true, orders: [] };
      },
    }, AI_SEAT_IDS[0]);
    assert.equal(consulted.consulted, true);
    assert.deepEqual(policy.talked, [AI_SEAT_IDS[0]]);
    assert.deepEqual(orders, ['after-close']);

    setAiLastConsultationTurn(AI_SEAT_IDS[0], state.turnNumber);
    for (const unit of gameDbOps.getAll<{ id: string; h3_index: string }>('SELECT id, h3_index FROM units WHERE player = ?', [AI_SEAT_IDS[0]])) {
      gameDbOps.run(
        `INSERT OR REPLACE INTO standing_orders (player_id, unit_id, order_type, params, status, created_turn, origin_hex)
         VALUES (?, ?, 'move', '{}', 'active', ?, ?)`,
        [AI_SEAT_IDS[0], unit.id, state.turnNumber, unit.h3_index]
      );
    }
    const quiet = roundFor([AI_SEAT_IDS[0]]);
    let quietOrders = 0;
    const skipped = await afterResolution(state, {
      success: true,
      hadStrategicMarchResolutionBySeat: { [AI_SEAT_IDS[0]]: true },
    }, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      talkRound: quiet.round,
      requestOrders: async () => {
        quietOrders += 1;
        return { success: true, orders: [] };
      },
    }, AI_SEAT_IDS[0]);
    assert.equal(skipped.consulted, false);
    assert.equal(skipped.absenceReason, 'no_new_consult');
    assert.equal(quiet.talked.length, 0);
    assert.equal(quietOrders, 0);

    insertSentSideMessage(gameDbOps, {
      fromSeatId: HUMAN_SEAT_ID,
      toSeatId: AI_SEAT_IDS[0],
      body: 'unread',
      step: strategicStep(1),
    });
    const waiting = roundFor([AI_SEAT_IDS[0]]);
    let unreadOrders = 0;
    const becauseUnread = await afterResolution(state, {
      success: true,
      hadStrategicMarchResolutionBySeat: { [AI_SEAT_IDS[0]]: true },
    }, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      talkRound: waiting.round,
      requestOrders: async () => {
        unreadOrders += 1;
        return { success: true, orders: [] };
      },
    }, AI_SEAT_IDS[0]);
    assert.equal(becauseUnread.consulted, true);
    assert.equal(waiting.talked.length, 0);
    assert.equal(unreadOrders, 1);

    let noRoundOrders = 0;
    const withoutRound = await afterResolution(state, {
      success: true,
      hadStrategicMarchResolutionBySeat: { [AI_SEAT_IDS[0]]: true },
    }, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      requestOrders: async () => {
        noRoundOrders += 1;
        return { success: true, orders: [] };
      },
    }, AI_SEAT_IDS[0]);
    assert.equal(withoutRound.consulted, true);
    assert.equal(noRoundOrders, 1);
  });
});

test('two seats finish talking before either asks for orders', async () => {
  await withMatch(async () => {
    const state = getGameState();
    const { round, talked } = roundFor([AI_SEAT_IDS[0], AI_SEAT_IDS[1]]);
    const orders: string[] = [];
    const deps = {
      modelId: 'test-model',
      enabledToolNames: [] as string[],
      hasKey: () => true,
      talkRound: round,
      requestOrders: async (_state: unknown, _model: string, options: { seatId: AiSeatId }) => {
        orders.push(talked.length === 2 ? options.seatId : 'early');
        return { success: true as const, orders: [] };
      },
    };
    await Promise.all([
      afterResolution(state, { success: true }, deps, AI_SEAT_IDS[0]),
      afterResolution(state, { success: true }, deps, AI_SEAT_IDS[1]),
    ]);
    assert.equal(orders.includes('early'), false);
    assert.equal(orders.length, 2);
  });
});

test('a tactical hard skip returns before talk, and an unread message still asks for orders', async () => {
  await withMatch(async () => {
    const state = getGameState();
    const wiped = {
      battleId: 'wiped',
      tacticalTurnNumber: 1,
      opposingPartyId: AI_SEAT_IDS[0],
      subUnits: [],
    } as unknown as TacticalBattleSnapshot;
    const wipedRound = roundFor([AI_SEAT_IDS[0]]);
    let wipedOrders = 0;
    const skipped = await afterTacticalBeatResolution(state, wiped, {} as TacticalCommitResolutionPlayback, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      talkRound: wipedRound.round,
      requestOrders: async () => {
        wipedOrders += 1;
        return { success: true, orders: [] };
      },
    }, AI_SEAT_IDS[0]);
    assert.equal(skipped.consulted, false);
    assert.equal(skipped.absenceReason, 'no_units_in_battle');
    assert.equal(wipedRound.talked.length, 0);
    assert.equal(wipedOrders, 0);

    const live = {
      battleId: 'live',
      tacticalTurnNumber: 1,
      opposingPartyId: AI_SEAT_IDS[0],
      subUnits: [
        { id: 'h', player: HUMAN_SEAT_ID },
        { id: 'a', player: AI_SEAT_IDS[0] },
      ],
    } as unknown as TacticalBattleSnapshot;
    const playback = { opponentMoves: [{ unitId: 'a' }] } as unknown as TacticalCommitResolutionPlayback;
    const quiet = roundFor([AI_SEAT_IDS[0]]);
    let quietOrders = 0;
    const noConsult = await afterTacticalBeatResolution(state, live, playback, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      talkRound: quiet.round,
      requestOrders: async () => {
        quietOrders += 1;
        return { success: true, orders: [] };
      },
    }, AI_SEAT_IDS[0]);
    assert.equal(noConsult.absenceReason, 'no_new_consult');
    assert.equal(quiet.talked.length, 0);
    assert.equal(quietOrders, 0);

    insertSentSideMessage(gameDbOps, {
      fromSeatId: HUMAN_SEAT_ID,
      toSeatId: AI_SEAT_IDS[0],
      body: 'beat',
      step: strategicStep(1),
    });
    const waiting = roundFor([AI_SEAT_IDS[0]]);
    let unreadOrders = 0;
    const becauseUnread = await afterTacticalBeatResolution(state, live, playback, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      talkRound: waiting.round,
      requestOrders: async () => {
        unreadOrders += 1;
        return { success: true, orders: [] };
      },
    }, AI_SEAT_IDS[0]);
    assert.equal(becauseUnread.consulted, true);
    assert.equal(waiting.talked.length, 0);
    assert.equal(unreadOrders, 1);

    const talking = roundFor([AI_SEAT_IDS[0]]);
    let talkedBeforeOrders = false;
    await afterTacticalBeatResolution(state, live, {} as unknown as TacticalCommitResolutionPlayback, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      talkRound: talking.round,
      requestOrders: async () => {
        talkedBeforeOrders = talking.talked.length === 1 && talking.closed();
        return { success: true, orders: [] };
      },
    }, AI_SEAT_IDS[0]);
    assert.equal(talkedBeforeOrders, true);
  });
});
