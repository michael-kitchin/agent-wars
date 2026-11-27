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
import type { TacticalBattleSnapshot } from '../../../shared/tacticalBattleTypes';
import { playerIdCodeFor } from '../../../shared/unitIds';
import { strategicStep } from '../../../shared/matchRecording';
import { dbRun, getScenarioHomeRegionHexes, listScenarioHomeRegions, upsertTurnLossNote, upsertTurnStrategyNote } from '../../gameDb';
import { gameDbOps } from '../../gameDb/dbConnection';
import { upsertGameConfigValue } from '../../gameDb/gameConfigRows';
import { insertSideAgreement } from '../../gameDb/sideAgreementStore';
import { writeHoldAutomaticFireAgainstSeatIds } from '../../gameDb/holdAutomaticFireAgainstMemory';
import { insertSentSideMessage, listUnseenInboundSideMessages, markSideMessagesSeen, upsertSideStance } from '../../gameDb/sideMessageStore';
import { withSeatedTempGameDbAsync } from '../../testSupport/withSeatedTempGameDb';
import { assertHeadingsNest, headingOutline } from '../../testSupport/promptOutlineHelpers';
import { setActiveTacticalBattleSnapshotRef } from '../../tacticalBattle/activeTacticalBattleRef';
import { tacticalDbFixtureRegisterDefaultAfterEach } from '../../tacticalBattle/testSupport/tacticalDbFixture';
import { withTwoAiBattle } from '../../tacticalBattle/testSupport/twoAiBattleFixture';
import { applyHoldAutomaticFireAgainstChoice } from '../holdAutomaticFireAgainstApply';
import { countUnreadPromptMessages, readTalkPromptInput, readTalkSides } from './talkPromptInput';
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

test('an empty automatic-fire list leaves the section as it was', async () => {
  await withThreeAi(async () => {
    /**
     * The first seat's orders Messages section.
     *
     * Purpose: The case compares it before and after a write.
     * When to use: Between writes.
     * Expected outcome: The section text, or null.
     * Exceptions: None.
     */
    const orders = (): string | null => buildOrdersMessagesBlock({ seatId: seatA, inBattle: false, includeAgreements: false }).text;
    assert.equal(orders(), null);
    sent(seatB, seatA, 1, 'from-b');
    const before = orders();
    writeHoldAutomaticFireAgainstSeatIds(gameDbOps, seatA, [seatB], 1);
    assert.notEqual(orders(), before);
    writeHoldAutomaticFireAgainstSeatIds(gameDbOps, seatA, [], 1);
    assert.equal(orders(), before);
  });
});

test('a stored automatic-fire list opens the section on its own and follows the threads', async () => {
  await withThreeAi(async () => {
    writeHoldAutomaticFireAgainstSeatIds(gameDbOps, seatA, [seatB], 1);
    const label = readTalkSides(seatA).find((side) => side.code === 'a2')?.label;
    const line = `Holding automatic fire: your units do not fire on their own at ${label} (a2).`;
    const alone = buildOrdersMessagesBlock({ seatId: seatA, inBattle: false, includeAgreements: false }).text ?? '';
    assert.ok(alone.includes(line), alone);
    assert.ok(alone.split('\n\n').at(-1)?.startsWith("Each message is its sender's claim."), alone);
    sent(seatB, seatA, 1, 'thread-line');
    const full = buildOrdersMessagesBlock({ seatId: seatA, inBattle: false, includeAgreements: false }).text ?? '';
    assert.ok(full.indexOf('thread-line') < full.indexOf(line), full);
    assert.ok(full.indexOf(line) < full.indexOf("Each message is its sender's claim."), full);
  });
});

/**
 * Stores one turn's loss note: a unit of the commander destroyed by another side.
 *
 * Purpose: The flag reads the same stored notes as the combat record.
 * When to use: Inside `withThreeAi`.
 * Expected outcome: One strategic note for that turn, with the loss filed under `cause`.
 * Exceptions: None.
 */
function storeLoss(turnNumber: number, cause: 'ranged' | 'airStrike' | 'melee', bySeat: AiSeatId): void {
  const lost = { unitType: 'infantry', displayName: 'a1-i1', unitId: 'a1-i1', attribution: { ownerId: seatA, lossH3Index: null, responsibleOwnerIds: [bySeat], killerUnits: [] } };
  const none = { ranged: [], melee: [], returnFire: [], airStrike: [], missileStrike: [], other: [] };
  upsertTurnLossNote(seatA, 'strategic', '', turnNumber, JSON.stringify({ ...none, [cause]: [lost] }), JSON.stringify(none));
}

/**
 * Lists sides as the commander's reply would, then builds both world-map prompts on a later turn.
 *
 * Purpose: The flag depends on the turn the side was listed.
 * When to use: The flag cases.
 * Expected outcome: The orders Messages section and the talk situation text.
 * Exceptions: None.
 */
function listedThenBriefed(args: {
  /**
   * The turn of the listing reply.
   *
   * Contract: A strategic turn.
   * When to use: Applying the choice.
   * Expected outcome: The side counts from this turn, or the next one for a battle.
   * Exceptions: None.
   */
  readonly listedOnTurn: number;
  /**
   * The turn both prompts are built on.
   *
   * Contract: Later than the stored loss notes.
   * When to use: Building the prompts.
   * Expected outcome: Earlier turns are in the record.
   * Exceptions: None.
   */
  readonly briefedOnTurn: number;
  /**
   * The sides to list.
   *
   * Contract: Seats other than the first.
   * When to use: Building the choice.
   * Expected outcome: All are listed.
   * Exceptions: None.
   */
  readonly sides: readonly AiSeatId[];
  /**
   * The battle the listing reply belongs to.
   *
   * Contract: Omitted for a world-map reply.
   * When to use: Applying the choice.
   * Expected outcome: A battle listing counts from the next turn.
   * Exceptions: None.
   */
  readonly battle?: TacticalBattleSnapshot;
}): string[] {
  applyHoldAutomaticFireAgainstChoice({
    seatId: seatA,
    choice: { kind: 'replace', sideCodes: args.sides.map((side) => playerIdCodeFor(side)) },
    turnNumber: args.listedOnTurn,
    battle: args.battle ?? null,
  });
  dbRun('UPDATE turn_state SET turn_number = ? WHERE id = 1', [args.briefedOnTurn]);
  return [
    buildOrdersMessagesBlock({ seatId: seatA, inBattle: false, includeAgreements: false }).text ?? '',
    buildTalkSituationText(readTalkPromptInput({ seatId: seatA, turnNumber: args.briefedOnTurn, battle: null }).input),
  ];
}

const STRUCK_ON = /\(a2\) is on this list, and the game's record shows its ranged, air, or missile attacks destroyed units of yours since you listed it, last on turn (\d+)\./;

test('a listed side whose attacks destroyed units since it was listed is named with the turn, in both world-map prompts', async () => {
  await withThreeAi(async () => {
    storeLoss(2, 'airStrike', seatB);
    for (const text of listedThenBriefed({ listedOnTurn: 2, briefedOnTurn: 3, sides: [seatB, seatC] })) {
      assert.equal(STRUCK_ON.exec(text)?.[1], '2', text);
      assert.equal(/\(a3\) is on this list/.test(text), false, text);
    }
  });
});

test('a loss from before the side was listed is not flagged', async () => {
  await withThreeAi(async () => {
    storeLoss(1, 'ranged', seatB);
    for (const text of listedThenBriefed({ listedOnTurn: 2, briefedOnTurn: 3, sides: [seatB] })) {
      assert.match(text, /Holding automatic fire: /);
      assert.equal(/is on this list, and/.test(text), false, text);
    }
  });
});

test('a melee loss is not flagged', async () => {
  await withThreeAi(async () => {
    storeLoss(2, 'melee', seatB);
    for (const text of listedThenBriefed({ listedOnTurn: 2, briefedOnTurn: 3, sides: [seatB] })) {
      assert.equal(/is on this list, and/.test(text), false, text);
    }
  });
});

test('a side listed during a battle is flagged only for attacks of later turns', async () => {
  await withThreeAi(async () => {
    const battle = { battleId: 'listing-battle', tacticalTurnNumber: 1 } as TacticalBattleSnapshot;
    storeLoss(2, 'ranged', seatB);
    for (const text of listedThenBriefed({ listedOnTurn: 2, briefedOnTurn: 3, sides: [seatB], battle })) {
      assert.equal(/is on this list, and/.test(text), false, text);
    }
    storeLoss(3, 'ranged', seatB);
    dbRun('UPDATE turn_state SET turn_number = 4 WHERE id = 1');
    const later = buildOrdersMessagesBlock({ seatId: seatA, inBattle: false, includeAgreements: false }).text ?? '';
    assert.equal(STRUCK_ON.exec(later)?.[1], '3', later);
  });
});

test('a battle counts the listed opponent shots in both prompts, with the talk step off', () => {
  const previous = process.env.AGENT_WARS_DISABLE_TALK;
  try {
    process.env.AGENT_WARS_DISABLE_TALK = '1';
    withTwoAiBattle('aw-automatic-fire-battle-prompts-', (started) => {
      const lead = started.leadPartyId as AiSeatId;
      const opposing = started.opposingPartyId as AiSeatId;
      writeHoldAutomaticFireAgainstSeatIds(gameDbOps, lead, [opposing], 1);
      const battle = { ...started, lastBeatActivity: { beatNumber: 1, leadShots: 0, opposingShots: 3, meleeFought: false } };
      setActiveTacticalBattleSnapshotRef(battle);
      const texts = [
        buildOrdersMessagesBlock({ seatId: lead, inBattle: true, includeAgreements: false }).text ?? '',
        buildTalkSituationText(readTalkPromptInput({ seatId: lead, turnNumber: battle.strategicTurnNumber, battle }).input),
      ];
      for (const text of texts) {
        assert.match(text, /Holding automatic fire: your units do not fire on their own at /);
        assert.match(text, /\(a2\) is on this list\. Attack shots the game counted from it last beat: 3\./);
      }
    });
  } finally {
    if (previous === undefined) delete process.env.AGENT_WARS_DISABLE_TALK;
    else process.env.AGENT_WARS_DISABLE_TALK = previous;
  }
});
