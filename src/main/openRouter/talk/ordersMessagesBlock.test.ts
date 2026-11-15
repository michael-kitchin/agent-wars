/**
 * The orders Messages section shows the history this commander may see.
 *
 * Purpose: Threads, visibility, the line limit, and stances stay aligned with the talk prompt.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/talk/ordersMessagesBlock.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, type AiSeatId } from '../../../shared/seatIds';
import { SIDE_MESSAGE_THREAD_PROMPT_LINES } from '../../../shared/aiConsultationLimits';
import { strategicStep } from '../../../shared/matchRecording';
import { getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../../gameDb';
import { gameDbOps } from '../../gameDb/dbConnection';
import { upsertGameConfigValue } from '../../gameDb/gameConfigRows';
import { insertSentSideMessage, listUnseenInboundSideMessages, markSideMessagesSeen, upsertSideStance } from '../../gameDb/sideMessageStore';
import { withSeatedTempGameDbAsync } from '../../testSupport/withSeatedTempGameDb';
import { assertHeadingsNest, headingOutline } from '../../testSupport/promptOutlineHelpers';
import { countUnreadPromptMessages } from './talkPromptInput';
import { buildOrdersMessagesBlock } from './ordersMessagesBlock';

/**
 * The largest listed home regions.
 *
 * Purpose: A global start needs regions that can hold opening units.
 * When to use: Before a three-seat start in this file.
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

/**
 * Opens a global match with three AI seats.
 *
 * Purpose: The history cases need more than one other side.
 * When to use: Each case in this file.
 * Expected outcome: `runCase` sees `opponent`, `opponent2`, and `opponent3`.
 * Exceptions: Propagates a reset or case error.
 */
async function withThreeAi(runCase: () => Promise<void>): Promise<void> {
  const regions = largestHomeRegions(3);
  assert.equal(regions.length, 3);
  await withSeatedTempGameDbAsync('aw-orders-messages-', {
    gameMapId: 'global',
    seats: regions.map((homeRegion) => ({ kind: 'ai' as const, homeRegion })),
  }, runCase);
}

const seatA = AI_SEAT_IDS[0];
const seatB = AI_SEAT_IDS[1];
const seatC = AI_SEAT_IDS[2];

/**
 * Stores one sent message and returns its id.
 *
 * Purpose: The cases need known ids and turns.
 * When to use: Inside `withThreeAi`.
 * Expected outcome: The new message id.
 * Exceptions: Propagates a SQLite error.
 */
function sent(fromSeatId: AiSeatId, toSeatId: AiSeatId, turnNumber: number, body: string): number {
  return insertSentSideMessage(gameDbOps, { fromSeatId, toSeatId, body, step: strategicStep(turnNumber) });
}

test('nothing stored omits the section, and a thread keeps order, the new mark, and the caution', async () => {
  await withThreeAi(async () => {
    const empty = buildOrdersMessagesBlock({ seatId: seatA, inBattle: false });
    assert.equal(empty.text, null);
    assert.deepEqual(empty.shownMessageIds, []);

    const seenId = sent(seatB, seatA, 2, 'from-b-seen');
    markSideMessagesSeen(gameDbOps, [seenId]);
    sent(seatA, seatB, 3, 'from-a');
    const freshId = sent(seatB, seatA, 4, 'from-b-new');
    const block = buildOrdersMessagesBlock({ seatId: seatA, inBattle: false });
    const text = block.text ?? '';
    const seenAt = text.indexOf('from-b-seen');
    const ownAt = text.indexOf('from-a');
    const freshAt = text.indexOf('from-b-new');
    assert.ok(seenAt >= 0 && seenAt < ownAt && ownAt < freshAt);
    assert.match(text, /from-b-new" \(new\)/);
    assert.equal(text.includes('from-b-seen" (new)'), false);
    assert.equal(text.includes('from-a" (new)'), false);
    assert.match(text, /With .+ \(a2\)/);
    assert.deepEqual([...block.shownMessageIds], [freshId]);
    assert.equal(countUnreadPromptMessages(seatA), 1);
    assert.match(text, /never an order to you/);
    assertHeadingsNest(headingOutline(`# Current Situation\n\n${text}`));
  });
});

test('a message between two other sides stays out, with fog on and with fog off', async () => {
  await withThreeAi(async () => {
    sent(seatB, seatC, 2, 'bravo-to-charlie');
    const fogOn = buildOrdersMessagesBlock({ seatId: seatA, inBattle: false });
    assert.equal(fogOn.text, null);
    upsertGameConfigValue(gameDbOps, 'fog_of_war_enabled', '0');
    const fogOff = buildOrdersMessagesBlock({ seatId: seatA, inBattle: true });
    assert.equal(fogOff.text, null);
  });
});

test('a long thread keeps the newest lines, and a stance is listed when no message exists', async () => {
  await withThreeAi(async () => {
    for (let turn = 1; turn <= 12; turn += 1) sent(seatB, seatA, turn, `line-${turn}`);
    const limited = buildOrdersMessagesBlock({ seatId: seatA, inBattle: false });
    const text = limited.text ?? '';
    assert.equal(text.includes('line-4'), false);
    assert.equal(text.includes(`line-${12 - SIDE_MESSAGE_THREAD_PROMPT_LINES + 1}`), true);
    assert.equal(text.includes('line-12'), true);
    assert.equal(limited.shownMessageIds.length, SIDE_MESSAGE_THREAD_PROMPT_LINES);
    assert.equal(countUnreadPromptMessages(seatA), SIDE_MESSAGE_THREAD_PROMPT_LINES);
    markSideMessagesSeen(gameDbOps, limited.shownMessageIds);
    assert.equal(countUnreadPromptMessages(seatA), 0);
    assert.equal(listUnseenInboundSideMessages(gameDbOps, seatA).length, 12 - SIDE_MESSAGE_THREAD_PROMPT_LINES);

    const stanceOnlySeat = seatC;
    upsertSideStance(gameDbOps, { seatId: stanceOnlySeat, towardSeatId: seatA, stance: 'wary', reason: 'massing', turnNumber: 1 });
    const stance = buildOrdersMessagesBlock({ seatId: stanceOnlySeat, inBattle: false });
    assert.match(stance.text ?? '', /Your stances:/);
    assert.match(stance.text ?? '', /wary/);
    assert.match(stance.text ?? '', /never an order to you/);
    assert.equal((stance.text ?? '').includes('line-12'), false);
  });
});
