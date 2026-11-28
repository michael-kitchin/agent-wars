/* eslint-disable @typescript-eslint/no-require-imports -- `openRouter` loads only after the Electron stand-in */
/**
 * The standings in a real orders prompt and a real diplomacy prompt, from a seeded match.
 *
 * Purpose: Both prompts must show the same standings for a turn, and the diplomacy text must name the section only when it is shown.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/cityHexStandingsPrompts.test.js`.
 * Expected outcome: The cases below. No model is called.
 * Exceptions: None. The temporary match and user-data folder are removed afterward.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { AI_SEAT_IDS, type AiSeatId } from '../../shared/seatIds';
import { knockoutStatusForSeat } from '../gameActions/knockoutStatus';
import { getGameState, getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { readVictorySettings } from '../gameDb/gameConfigKv';
import { upsertGameConfigValue } from '../gameDb/gameConfigRows';
import { SCENARIO_ID_KEY } from '../gameDb/scenarioState';
import { headingOutline } from '../testSupport/promptOutlineHelpers';
import { withSeatedTempGameDbAsync } from '../testSupport/withSeatedTempGameDb';
import { buildCityHexStandingsBody } from './cityHexStandingsText';
import type * as OpenRouterModule from './openRouter';
import { installElectronMock } from './openRouterTestHelpers';
import { STANDINGS_TALK_BULLET } from './promptSpec/diplomacyRuleText';
import { requestTalk } from './talk/requestTalk';

/**
 * The commander whose prompts are checked.
 *
 * Purpose: Every case briefs the same seat.
 * When to use: The cases below.
 * Expected outcome: The second AI seat, so the commander is not the first row of every table.
 * Exceptions: None.
 */
const SEAT: AiSeatId = AI_SEAT_IDS[1];

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-standings-prompts-electron-'));
const restoreElectron = installElectronMock(userDataDir);
const openRouter = require('./openRouter') as typeof OpenRouterModule;
openRouter.saveKey('test-key');
openRouter.setSelectedModel('test-model');

after(() => {
  openRouter.setChatTransportOverrideForTests(null);
  restoreElectron();
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

/**
 * Opens a global match with three AI seats and a turn limit of 30.
 *
 * Purpose: The standings name the turn and the limit only in a match that has one.
 * When to use: Each case below.
 * Expected outcome: `runCase` sees three seats on the largest home regions, on turn 1.
 * Exceptions: Propagates a reset or case error.
 */
async function withLimitedMatch(runCase: () => Promise<void>): Promise<void> {
  const regions = listScenarioHomeRegions()
    .map((name) => ({ name, hexes: getScenarioHomeRegionHexes(name).length }))
    .filter((region) => region.hexes > 0)
    .sort((a, b) => b.hexes - a.hexes || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((region) => region.name);
  assert.equal(regions.length, 3);
  await withSeatedTempGameDbAsync('aw-standings-prompts-', {
    gameMapId: 'global',
    seats: regions.map((homeRegion) => ({ kind: 'ai' as const, homeRegion })),
  }, async () => {
    upsertGameConfigValue(gameDbOps, 'victory_rule', 'most_city_hexes_at_turn_limit');
    upsertGameConfigValue(gameDbOps, 'turn_limit', '30');
    await runCase();
  });
}

/**
 * The message contents of one chat request body.
 *
 * Purpose: Both calls are read through the body the transport receives.
 * When to use: After a captured call.
 * Expected outcome: Each message's text, in order.
 * Exceptions: None.
 */
function contentsOf(body: Record<string, unknown>): readonly string[] {
  return (body.messages as readonly { content: unknown }[]).map((message) =>
    typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
  );
}

/**
 * Runs one orders consult for `SEAT` and returns the message that carries Scenario Progress.
 *
 * Purpose: The standings are part of that message.
 * When to use: The world-map case.
 * Expected outcome: The text of the first request's Scenario Progress message.
 * Exceptions: Fails the test when the consult fails or no message has Scenario Progress.
 */
async function ordersSituation(): Promise<string> {
  const bodies: Record<string, unknown>[] = [];
  openRouter.setChatTransportOverrideForTests(async (payload) => {
    bodies.push(payload.body);
    const content = JSON.stringify({ strategy: 'hold', orders: [], airStrikes: [], ferryOrders: [], callbacks: [] });
    return { ok: true, status: 200, headers: {}, bodyText: JSON.stringify({ choices: [{ message: { content } }] }) };
  });
  const result = await openRouter.requestOrders(getGameState(), 'test-model', { seatId: SEAT, enabledToolNames: [], usePrecomputation: false });
  openRouter.setChatTransportOverrideForTests(null);
  assert.equal(result.success, true, JSON.stringify(result));
  const message = contentsOf(bodies[0]!).find((text) => text.includes('Scenario Progress'));
  assert.ok(message, 'no message has Scenario Progress');
  return message;
}

/**
 * Runs one world-map talk call for `SEAT`.
 *
 * Purpose: The talk prompt is read through the body the transport receives.
 * When to use: Each case below.
 * Expected outcome: The system text and the situation text.
 * Exceptions: Fails the test when the call does not reach the model.
 */
async function talkTexts(): Promise<{ readonly system: string; readonly situation: string }> {
  const bodies: Record<string, unknown>[] = [];
  const result = await requestTalk(
    { seatId: SEAT, modelId: 'test-model', turnNumber: getGameState().turnNumber, battle: null },
    {
      loadKey: () => 'test-key',
      resolveOrdersRequestProfile: undefined,
      postOpenRouterChatWithTimeoutAndRetry: async (payload) => {
        bodies.push(payload.body);
        const content = '{"messages":[],"stances":[],"agreements":[]}';
        return { ok: true, status: 200, headers: {}, bodyText: JSON.stringify({ choices: [{ message: { content } }] }) };
      },
    }
  );
  assert.equal(result.kind, 'spoke', JSON.stringify(result));
  const [system, situation] = contentsOf(bodies[0]!);
  return { system: system!, situation: situation! };
}

test('the orders and diplomacy prompts of a turn show the same standings', async () => {
  await withLimitedMatch(async () => {
    const status = knockoutStatusForSeat(SEAT);
    assert.ok(status);
    const turnNumber = getGameState().turnNumber;
    const body = buildCityHexStandingsBody({ status, victory: readVictorySettings(gameDbOps), turnNumber });
    assert.ok(body.includes(`This is turn ${turnNumber} of 30.`), body);

    const situation = await ordersSituation();
    const outline = headingOutline(situation);
    const progress = outline.findIndex((line) => line.endsWith(' Scenario Progress'));
    const standings = outline.findIndex((line) => line.endsWith(' Standings'));
    assert.ok(progress >= 0 && standings === progress + 1, outline.join('\n'));
    assert.equal(outline[standings], `#${outline[progress]!.split(' ')[0]} Standings`);
    assert.ok(situation.includes(`${outline[standings]}\n\n${body}\n`), situation);

    const talk = await talkTexts();
    assert.ok(talk.situation.includes(`## Standings\n${body}\n\n`), talk.situation);
    assert.ok(talk.system.includes(`- ${STANDINGS_TALK_BULLET}\n`), talk.system);
  });
});

test('without a knockout status the diplomacy prompt has no standings and does not mention them', async () => {
  await withLimitedMatch(async () => {
    upsertGameConfigValue(gameDbOps, SCENARIO_ID_KEY, 'no_scenario');
    assert.equal(knockoutStatusForSeat(SEAT), null);
    const talk = await talkTexts();
    assert.equal(talk.situation.includes('## Standings'), false, talk.situation);
    assert.equal(talk.system.includes(STANDINGS_TALK_BULLET), false, talk.system);
    assert.equal(talk.system.includes('Standings'), false, talk.system);
  });
});
