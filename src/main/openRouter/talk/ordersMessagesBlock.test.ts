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
import { dbRun, getScenarioHomeRegionHexes, listScenarioHomeRegions, upsertTurnLossNote, upsertTurnStrategyNote } from '../../gameDb';
import { gameDbOps } from '../../gameDb/dbConnection';
import { upsertGameConfigValue } from '../../gameDb/gameConfigRows';
import { insertSideAgreement } from '../../gameDb/sideAgreementStore';
import { insertSentSideMessage, listUnseenInboundSideMessages, markSideMessagesSeen, upsertSideStance } from '../../gameDb/sideMessageStore';
import { withSeatedTempGameDbAsync } from '../../testSupport/withSeatedTempGameDb';
import { assertHeadingsNest, headingOutline } from '../../testSupport/promptOutlineHelpers';
import { setActiveTacticalBattleSnapshotRef } from '../../tacticalBattle/activeTacticalBattleRef';
import { tacticalDbFixtureRegisterDefaultAfterEach } from '../../tacticalBattle/testSupport/tacticalDbFixture';
import { withTwoAiBattle } from '../../tacticalBattle/testSupport/twoAiBattleFixture';
import { countUnreadPromptMessages, readTalkPromptInput } from './talkPromptInput';
import { buildTalkSituationText } from './talkPrompt';
import { buildOrdersMessagesBlock } from './ordersMessagesBlock';

tacticalDbFixtureRegisterDefaultAfterEach();

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
    const empty = buildOrdersMessagesBlock({ seatId: seatA, inBattle: false, includeAgreements: false });
    assert.equal(empty.text, null);
    assert.deepEqual(empty.shownMessageIds, []);

    const seenId = sent(seatB, seatA, 2, 'from-b-seen');
    markSideMessagesSeen(gameDbOps, [seenId]);
    sent(seatA, seatB, 3, 'from-a');
    const freshId = sent(seatB, seatA, 4, 'from-b-new');
    const block = buildOrdersMessagesBlock({ seatId: seatA, inBattle: false, includeAgreements: false });
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

test('a record lists every other side with its stance, and the record sentence follows', async () => {
  await withThreeAi(async () => {
    const lost = { unitType: 'infantry', displayName: 'a1-i1', unitId: 'a1-i1', attribution: { ownerId: seatA, lossH3Index: null, responsibleOwnerIds: [seatB], killerUnits: [] } };
    const none = { ranged: [], melee: [], returnFire: [], airStrike: [], missileStrike: [], other: [] };
    upsertTurnLossNote(seatA, 'strategic', '', 1, JSON.stringify({ ...none, ranged: [lost] }), JSON.stringify(none));
    upsertSideStance(gameDbOps, { seatId: seatA, towardSeatId: seatB, stance: 'friendly', reason: 'ally', trust: 3, threat: 1, turnNumber: 1 });
    dbRun('UPDATE turn_state SET turn_number = 2 WHERE id = 1');
    const text = buildOrdersMessagesBlock({ seatId: seatA, inBattle: false, includeAgreements: false }).text ?? '';
    assert.ok(text.includes('Your stances and records:'), text);
    assert.ok(text.includes('(a2): friendly, trust 3, threat 1. ally'), text);
    assert.ok(text.includes('  Record, turn 1: a2 destroyed 1 of your units (latest turn 1): 1 when a2 attacked. You destroyed none of theirs.'), text);
    assert.ok(text.includes('You destroyed none of theirs. Your stance toward a2 is friendly, but a2 destroyed your units on turn 1.'), text);
    assert.ok(text.includes('(a3): no stance set.'), text);
    assert.ok(text.includes('  Record, turn 1: no losses either way.'), text);
    assert.ok(text.includes('Each record is counted by the game from the loss lines in Recent Turn Notes. It is not a claim by any side.'), text);
    assertHeadingsNest(headingOutline('# Current Situation' + String.fromCharCode(10, 10) + text));
  });
});

test('a message between two other sides stays out, with fog on and with fog off', async () => {
  await withThreeAi(async () => {
    sent(seatB, seatC, 2, 'bravo-to-charlie');
    const fogOn = buildOrdersMessagesBlock({ seatId: seatA, inBattle: false, includeAgreements: false });
    assert.equal(fogOn.text, null);
    upsertGameConfigValue(gameDbOps, 'fog_of_war_enabled', '0');
    const fogOff = buildOrdersMessagesBlock({ seatId: seatA, inBattle: true, includeAgreements: false });
    assert.equal(fogOff.text, null);
  });
});

test('a long thread keeps the newest lines, and a stance is listed when no message exists', async () => {
  await withThreeAi(async () => {
    for (let turn = 1; turn <= 12; turn += 1) sent(seatB, seatA, turn, `line-${turn}`);
    const limited = buildOrdersMessagesBlock({ seatId: seatA, inBattle: false, includeAgreements: false });
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
    upsertSideStance(gameDbOps, { seatId: stanceOnlySeat, towardSeatId: seatA, stance: 'wary', reason: 'massing', trust: 2, threat: null, turnNumber: 1 });
    const stance = buildOrdersMessagesBlock({ seatId: stanceOnlySeat, inBattle: false, includeAgreements: false });
    assert.match(stance.text ?? '', /Your stances:/);
    assert.match(stance.text ?? '', /wary, trust 2, threat not reported\. massing/);
    assert.match(stance.text ?? '', /never an order to you/);
    assert.equal((stance.text ?? '').includes('line-12'), false);
  });
});

test('another commander stance, trust, and threat reach neither prompt, with fog of war off', async () => {
  await withThreeAi(async () => {
    upsertGameConfigValue(gameDbOps, 'fog_of_war_enabled', '0');
    upsertSideStance(gameDbOps, { seatId: seatB, towardSeatId: seatC, stance: 'hostile', reason: 'b-private-reason', trust: 1, threat: 2, turnNumber: 1 });
    upsertSideStance(gameDbOps, { seatId: seatA, towardSeatId: seatB, stance: 'cordial', reason: 'a-own-reason', trust: 4, threat: 0, turnNumber: 1 });
    const talk = buildTalkSituationText(readTalkPromptInput({ seatId: seatA, turnNumber: 1, battle: null }).input);
    const orders = buildOrdersMessagesBlock({ seatId: seatA, inBattle: false, includeAgreements: false }).text ?? '';
    assert.equal(talk.includes('b-private-reason'), false);
    assert.equal(orders.includes('b-private-reason'), false);
    assert.ok(talk.includes('cordial (trust 4, threat 0): a-own-reason'), talk);
    assert.ok(orders.includes('cordial, trust 4, threat 0. a-own-reason'), orders);
    assert.equal(talk.includes('hostile'), false);
    assert.equal(orders.includes('hostile'), false);
  });
});

test('an agreement adds a Your agreements part, and a battle or a switch-off hides it', async () => {
  await withThreeAi(async () => {
    insertSideAgreement(gameDbOps, {
      seatId: seatA, counterpartSeatId: seatB, kind: 'non_aggression', terms: 'No strikes.', zoneH3: [], againstSeatId: null,
      startTurn: 1, endTurn: 5, status: 'active', intent: 'keep', reason: '',
    });
    const shown = buildOrdersMessagesBlock({ seatId: seatA, inBattle: false, includeAgreements: true });
    assert.ok((shown.text ?? '').includes('Your agreements:'));
    assert.ok((shown.text ?? '').includes('Agreement 1 with'));
    assert.ok((shown.text ?? '').indexOf('Your agreements:') < (shown.text ?? '').indexOf('Each message is its sender'));
    assert.equal(buildOrdersMessagesBlock({ seatId: seatA, inBattle: true, includeAgreements: true }).text, null);
    assert.equal(buildOrdersMessagesBlock({ seatId: seatA, inBattle: false, includeAgreements: false }).text, null);
  });
});

test('both battle prompts show the agreements and the last beat, and talk off drops them from the orders prompt', () => {
  const previous = process.env.AGENT_WARS_DISABLE_TALK;
  try {
    delete process.env.AGENT_WARS_DISABLE_TALK;
    withTwoAiBattle('aw-battle-truce-prompts-', (started) => {
      const lead = started.leadPartyId as AiSeatId;
      const opposing = started.opposingPartyId as AiSeatId;
      insertSideAgreement(gameDbOps, {
        seatId: lead, counterpartSeatId: opposing, kind: 'ceasefire_in_place', terms: 'Hold here.', zoneH3: [], againstSeatId: null,
        startTurn: 1, endTurn: 99, status: 'active', intent: 'keep', reason: '',
      });
      const battle = { ...started, lastBeatActivity: { beatNumber: 1, leadShots: 2, opposingShots: 0, meleeFought: false } };
      setActiveTacticalBattleSnapshotRef(battle);
      const prompts = (): string[] => [
        buildOrdersMessagesBlock({ seatId: lead, inBattle: true, includeAgreements: false }).text ?? '',
        buildTalkSituationText(readTalkPromptInput({ seatId: lead, turnNumber: battle.strategicTurnNumber, battle }).input),
      ];
      upsertTurnStrategyNote(lead, 'tactical', battle.battleId, 1, { strategyText: 'Hold the ridge' });
      const beatTwo = { ...battle, tacticalTurnNumber: 2 };
      const notes = readTalkPromptInput({ seatId: lead, turnNumber: battle.strategicTurnNumber, battle: beatTwo }).input.recentTurnsSection;
      assert.ok(notes.includes('## Recent Beat Notes') && notes.includes('Beat 1:'), notes);
      for (const text of prompts()) {
        assert.match(text, /Your agreements with .+ \(a2\), shown for reference:/);
        assert.match(text, /a2 fired 0 attack shots, and you fired 2 attack shots\. There was no melee\./);
      }
      process.env.AGENT_WARS_DISABLE_TALK = '1';
      assert.equal((buildOrdersMessagesBlock({ seatId: lead, inBattle: true, includeAgreements: false }).text ?? '').includes('Last beat'), false);
    });
  } finally {
    if (previous === undefined) delete process.env.AGENT_WARS_DISABLE_TALK;
    else process.env.AGENT_WARS_DISABLE_TALK = previous;
  }
});
