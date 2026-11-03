/* eslint-disable @typescript-eslint/no-require-imports -- dynamic require of the order-flow module */
/**
 * A consultation that never stops calling tools gets one tools-withheld reply and still submits orders.
 * Run: `npm run build:main` then `node dist/main/openRouter/requestOrdersRoundCap.test.js`
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildFinalOrdersRequestMessage } from './promptSpec/consultationText';
import { REQUEST_ORDERS_MAX_TOOL_ROUNDS } from './requestOrdersFlowSupport';
import { buildFixtureState, installElectronMock } from './openRouterTestHelpers';

const ORDERS_JSON = '{"message":"m","strategy":"s","orders":[]}';

/**
 * Runs one scripted consultation that calls a tool on every ordinary round.
 *
 * Purpose: Proves the round cap is followed by exactly one call that refuses tools.
 * When to use: This file's entry point.
 * Expected outcome: `requestOrders` succeeds, the next-turn tool-budget warning is set, the post count is the cap plus one, and the last message is the final orders note.
 * Exceptions: Logs the error and exits 1 when an assertion fails.
 */
async function run(): Promise<void> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-round-cap-'));
  const restoreElectron = installElectronMock(userDataDir);
  try {
    const openRouter = require('./openRouter') as {
      saveKey: (key: string) => void;
      setSelectedModel: (modelId: string) => void;
      setChatTransportOverrideForTests: (override: ((payload: {
        body: Record<string, unknown>;
      }) => Promise<{ ok: true; status: number; headers: Record<string, string>; bodyText: string }>) | null) => void;
      requestOrders: (
        state: unknown,
        modelId: string,
        options: { seatId: 'opponent'; enabledToolNames: string[]; usePrecomputation: boolean }
      ) => Promise<{ success: boolean; error?: string }>;
      getToolNamesForEnabledGroups: (ids: string[]) => string[];
    };
    const mapData = require('../mapData') as { getOrderedHexList: () => string[] };
    const gameDb = require('../gameDb') as {
      createFreshGameDatabaseAt: (canonicalPath: string) => void;
      getAndClearAiToolLimitExceededLastTurn: (seatId: 'opponent') => boolean;
    };
    gameDb.createFreshGameDatabaseAt(path.join(userDataDir, 'game.db'));
    openRouter.saveKey('test-key');
    openRouter.setSelectedModel('test-model');
    const state = buildFixtureState(mapData.getOrderedHexList().slice(0, 8));
    const bodies: Array<Record<string, unknown>> = [];
    openRouter.setChatTransportOverrideForTests(async (payload) => {
      bodies.push(payload.body);
      const message = payload.body.tool_choice === 'none'
        ? { content: ORDERS_JSON }
        : {
            content: null,
            tool_calls: [{ id: 'c1', type: 'function', function: { name: 'no_such_tool', arguments: '{}' } }],
          };
      return { ok: true, status: 200, headers: {}, bodyText: JSON.stringify({ choices: [{ message }] }) };
    });
    const result = await openRouter.requestOrders(state, 'test-model', {
      seatId: 'opponent',
      enabledToolNames: openRouter.getToolNamesForEnabledGroups(['planning']),
      usePrecomputation: false,
    });
    assert.strictEqual(result.success, true, result.error ?? 'requestOrders failed');
    assert.strictEqual(gameDb.getAndClearAiToolLimitExceededLastTurn('opponent'), true);
    assert.strictEqual(bodies.length, REQUEST_ORDERS_MAX_TOOL_ROUNDS + 1);
    const lastBody = bodies[bodies.length - 1] ?? {};
    assert.strictEqual(lastBody.tool_choice, 'none');
    const messages = lastBody.messages as Array<{ role: string; content?: string }>;
    const lastMessage = messages[messages.length - 1];
    assert.strictEqual(lastMessage?.content, buildFinalOrdersRequestMessage(REQUEST_ORDERS_MAX_TOOL_ROUNDS));
  } finally {
    const openRouter = require('./openRouter') as { setChatTransportOverrideForTests: (override: null) => void };
    openRouter.setChatTransportOverrideForTests(null);
    restoreElectron();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
