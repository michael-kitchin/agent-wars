/**
 * Battle-loss notes credit the other party in the battle and merge without repeats.
 * Run with: node dist/main/tacticalBattle/battleParentLossNotes.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DestroyedBattleParent } from '../../shared/destroyedBattleParent';
import { emptyPlayerLossSummary, type PlayerLossSummary } from '../../shared/lossSummary';
import { parsePlayerLossSummaryJson, serializePlayerLossSummary } from '../../shared/lossSummaryJson';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { activeAiSeatIds } from '../../shared/seatRoster';
import { stepKeyText, tacticalStep } from '../../shared/matchRecording';
import { isAttributedLossesRecord } from '../../shared/lossHistory';
import { getSeatRoster, upsertTurnLossNote } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { getTurnLossNoteColumns } from '../gameDb/turnNotesHistory';
import { listMatchEventsOfType } from '../recorder/matchRecordStore';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import {
  battleLossResponsibleOwnerIds,
  battleParentLostUnit,
  writeBattleParentLossNotes,
  type BattleLossContext,
} from './battleParentLossNotes';

const AI_BATTLE: BattleLossContext = {
  battleId: 'tb-ai',
  strategicTurnNumber: 4,
  beatNumber: 2,
  leadPartyId: 'opponent',
  opposingPartyId: 'opponent2',
};
const HUMAN_BATTLE: BattleLossContext = { battleId: 'tb-human', strategicTurnNumber: 4, beatNumber: 1, opposingPartyId: 'opponent' };
const SEAT_BATTLE: BattleLossContext = { battleId: 'tb-seat', strategicTurnNumber: 6, beatNumber: 3, opposingPartyId: AI_SEAT_IDS[0] };

/**
 * Builds one destroyed parent for a test.
 *
 * Purpose: Every case below needs a parent with an id, an owner, and a type.
 * When to use: The cases below.
 * Expected outcome: An armor parent unless a type is given.
 * Exceptions: None.
 */
function parent(id: string, ownerId: string, unitType = 'armor', h3Index = 'hX'): DestroyedBattleParent {
  return { id, ownerId, unitType, displayName: `Unit ${id}`, h3Index };
}

/**
 * Reads one seat's battle row back as two summaries.
 *
 * Purpose: The merge cases compare stored buckets.
 * When to use: After `writeBattleParentLossNotes`.
 * Expected outcome: The parsed own and other summaries, or null when no row exists.
 * Exceptions: None.
 */
function readBattleRow(
  seatId: (typeof AI_SEAT_IDS)[number],
  context: BattleLossContext
): { own: PlayerLossSummary; other: PlayerLossSummary } | null {
  const columns = getTurnLossNoteColumns(gameDbOps, {
    seatId,
    scope: 'strategic',
    battleId: context.battleId,
    turnNumber: context.strategicTurnNumber,
  });
  if (!columns) return null;
  return { own: parsePlayerLossSummaryJson(columns.ownLossJson), other: parsePlayerLossSummaryJson(columns.otherLossJson) };
}

test('an AI-versus-AI battle credits each party with the other party\'s destroyed parents', () => {
  assert.deepEqual(battleLossResponsibleOwnerIds(AI_BATTLE, 'opponent'), ['opponent2']);
  assert.deepEqual(battleLossResponsibleOwnerIds(AI_BATTLE, 'opponent2'), ['opponent']);
  assert.equal(battleLossResponsibleOwnerIds(AI_BATTLE, 'opponent3'), null);
});

test('a human battle credits the opposing party for the human and the human for the opposing party', () => {
  assert.deepEqual(battleLossResponsibleOwnerIds(HUMAN_BATTLE, HUMAN_SEAT_ID), ['opponent']);
  assert.deepEqual(battleLossResponsibleOwnerIds(HUMAN_BATTLE, 'opponent'), [HUMAN_SEAT_ID]);
});

test('a battle with no opposing party credits no one', () => {
  assert.equal(battleLossResponsibleOwnerIds({ battleId: 'tb', strategicTurnNumber: 1, beatNumber: 1 }, 'opponent'), null);
});

test('a destroyed parent becomes a loss row with its attribution, and a non-unit type is skipped', () => {
  const lost = battleParentLostUnit(parent('a1-t1', 'opponent'), AI_BATTLE);
  assert.deepEqual(lost, {
    displayName: 'Unit a1-t1',
    unitType: 'armor',
    unitId: 'a1-t1',
    attribution: { ownerId: 'opponent', lossH3Index: 'hX', responsibleOwnerIds: ['opponent2'], killerUnits: [] },
  });
  assert.equal(battleParentLostUnit(parent('a1-f1', 'opponent', 'fortification'), AI_BATTLE), null);
  assert.equal(battleParentLostUnit(parent('a1-t2', 'opponent', 'armor', ''), AI_BATTLE)?.attribution?.lossH3Index, null);
});

test('each active AI seat gets the destroyed parents in its battle row, split by owner', () => {
  withSeatedTempGameDb('aw-battle-loss-write-', { fogOfWarEnabled: false }, () => {
    const seats = activeAiSeatIds(getSeatRoster());
    assert.ok(seats.length > 0, 'the seated match has an active AI seat');
    writeBattleParentLossNotes([parent('a1-t1', AI_SEAT_IDS[0]), parent('h1-t1', HUMAN_SEAT_ID)], SEAT_BATTLE);
    for (const seatId of seats) {
      const row = readBattleRow(seatId, SEAT_BATTLE);
      assert.ok(row, `${seatId} has a battle row`);
      const ownIds = row.own.other.map((unit) => unit.unitId);
      const otherIds = row.other.other.map((unit) => unit.unitId);
      assert.deepEqual(ownIds, seatId === AI_SEAT_IDS[0] ? ['a1-t1'] : []);
      assert.ok(otherIds.includes('h1-t1'));
    }
  });
});

test('a second write adds only the new parent and never repeats an id', () => {
  withSeatedTempGameDb('aw-battle-loss-merge-', { fogOfWarEnabled: false }, () => {
    assert.ok(activeAiSeatIds(getSeatRoster()).length > 0);
    writeBattleParentLossNotes([parent('h1-t1', HUMAN_SEAT_ID)], SEAT_BATTLE);
    writeBattleParentLossNotes([parent('h1-t1', HUMAN_SEAT_ID), parent('h1-t2', HUMAN_SEAT_ID), parent('h1-t2', HUMAN_SEAT_ID)], SEAT_BATTLE);
    const row = readBattleRow(AI_SEAT_IDS[0], SEAT_BATTLE);
    assert.ok(row);
    assert.deepEqual(row.other.other.map((unit) => unit.unitId), ['h1-t1', 'h1-t2']);
  });
});

test('a battle write leaves the turn\'s own row untouched, and an empty list writes nothing', () => {
  withSeatedTempGameDb('aw-battle-loss-own-row-', { fogOfWarEnabled: false }, () => {
    assert.ok(activeAiSeatIds(getSeatRoster()).length > 0);
    const own = serializePlayerLossSummary({ ...emptyPlayerLossSummary(), ranged: [{ displayName: 'R', unitType: 'armor', unitId: 'r1' }] });
    upsertTurnLossNote(AI_SEAT_IDS[0], 'strategic', '', SEAT_BATTLE.strategicTurnNumber, own, own);
    writeBattleParentLossNotes([parent('h1-t1', HUMAN_SEAT_ID)], SEAT_BATTLE);
    const turnRow = getTurnLossNoteColumns(gameDbOps, { seatId: AI_SEAT_IDS[0], scope: 'strategic', battleId: '', turnNumber: SEAT_BATTLE.strategicTurnNumber });
    assert.deepEqual(turnRow, { ownLossJson: own, otherLossJson: own });
    writeBattleParentLossNotes([], { ...SEAT_BATTLE, battleId: 'tb-empty' });
    assert.equal(readBattleRow(AI_SEAT_IDS[0], { ...SEAT_BATTLE, battleId: 'tb-empty' }), null);
  });
});

test('a battle write records one attributed-losses event with each owner\'s parents in its other bucket', () => {
  withSeatedTempGameDb('aw-battle-loss-history-', { fogOfWarEnabled: false }, () => {
    writeBattleParentLossNotes([parent('a1-t1', AI_SEAT_IDS[0]), parent('h1-t1', HUMAN_SEAT_ID)], SEAT_BATTLE);
    writeBattleParentLossNotes([], { ...SEAT_BATTLE, battleId: 'tb-empty' });
    const events = listMatchEventsOfType(gameDbOps, 'losses_attributed');
    assert.equal(events.length, 1);
    const event = events[0]!;
    assert.equal(event.stepKey, stepKeyText(tacticalStep(SEAT_BATTLE.strategicTurnNumber, SEAT_BATTLE.battleId, SEAT_BATTLE.beatNumber)));
    assert.equal(event.visibility, 'engine');
    assert.ok(isAttributedLossesRecord(event.payload));
    assert.equal(event.payload.source, 'battleParents');
    assert.deepEqual(Object.keys(event.payload.byOwner).sort(), [AI_SEAT_IDS[0], HUMAN_SEAT_ID].sort());
    assert.deepEqual(event.payload.byOwner[AI_SEAT_IDS[0]]?.other.map((unit) => unit.unitId), ['a1-t1']);
    assert.deepEqual(event.payload.byOwner[HUMAN_SEAT_ID]?.other.map((unit) => unit.unitId), ['h1-t1']);
    assert.equal(event.payload.byOwner[HUMAN_SEAT_ID]?.ranged.length, 0);
  });
});
