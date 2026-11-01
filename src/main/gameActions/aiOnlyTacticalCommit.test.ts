/**
 * Playback and loss notes for one beat between two AI seats.
 * Run with: node dist/main/gameActions/aiOnlyTacticalCommit.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAiSeatId } from '../../shared/seatIds';
import { getRecentTurnNotes } from '../gameDb/aiStateAccess';
import { setActiveTacticalBattleSnapshotRef } from '../tacticalBattle/activeTacticalBattleRef';
import { applyAiOnlyTacticalBeat } from '../tacticalBattle/aiOnlyTacticalBeat';
import { tacticalDbFixtureRegisterDefaultAfterEach } from '../tacticalBattle/testSupport/tacticalDbFixture';
import { emptyPlan, legalStep, storedUnit, withTwoAiBattle } from '../tacticalBattle/testSupport/twoAiBattleFixture';
import { buildAiOnlyTacticalBeatPlayback, commitAiOnlyTacticalBeat } from './aiOnlyTacticalCommit';

tacticalDbFixtureRegisterDefaultAfterEach();

test('an AI-only beat plays both seats\' marches as opponent moves, lead first', () => {
  withTwoAiBattle('aw-ai-only-playback-', (battle) => {
    const lead = battle.leadPartyId;
    const opposing = battle.opposingPartyId;
    assert.ok(lead && opposing);
    const leadStep = legalStep(battle, lead);
    const opposingStep = legalStep(battle, opposing);
    assert.ok(leadStep, 'lead needs a legal step');
    assert.ok(opposingStep, 'opposing needs a legal step');
    const preBattle = { ...battle, subUnits: battle.subUnits.map((unit) => ({ ...unit })) };
    const leadDraft = { ...emptyPlan(), movementOrders: [leadStep] };
    const opposingDraft = { ...emptyPlan(), movementOrders: [opposingStep] };
    const beat = applyAiOnlyTacticalBeat({ leadDraft, opposingDraft });
    assert.equal(beat.success, true);
    if (!beat.success) return;
    const playback = buildAiOnlyTacticalBeatPlayback({ preBattle, leadDraft, opposingDraft, outcome: beat });
    assert.deepEqual(playback.humanMoves, []);
    const moves = playback.opponentMoves ?? [];
    assert.deepEqual(moves.map((move) => move.unitId), [leadStep.unitId, opposingStep.unitId]);
    assert.equal(moves[0]?.fromH3Index, preBattle.subUnits.find((unit) => unit.id === leadStep.unitId)?.h3Index);
    assert.equal(moves[1]?.fromH3Index, preBattle.subUnits.find((unit) => unit.id === opposingStep.unitId)?.h3Index);
    assert.equal(moves[0]?.toH3Index, storedUnit(leadStep.unitId)?.h3Index);
    assert.equal(moves[1]?.toH3Index, storedUnit(opposingStep.unitId)?.h3Index);
    assert.notEqual(moves[0]?.fromH3Index, moves[0]?.toH3Index);
    assert.notEqual(moves[1]?.fromH3Index, moves[1]?.toH3Index);
  });
});

test('an AI-only commit returns melee playback, dice, and a tactical loss note for a contested cell', () => {
  withTwoAiBattle('aw-ai-only-commit-melee-', (battle) => {
    const leadParty = battle.leadPartyId;
    const otherParty = battle.opposingPartyId;
    if (leadParty == null || otherParty == null || !isAiSeatId(leadParty) || !isAiSeatId(otherParty)) {
      assert.fail('both parties should be AI seats');
      return;
    }
    const lead = battle.subUnits.find(
      (unit) => unit.player === leadParty && (unit.unitType === 'infantry' || unit.unitType === 'armor')
    );
    const other = battle.subUnits.find(
      (unit) => unit.player === otherParty && (unit.unitType === 'infantry' || unit.unitType === 'armor')
    );
    assert.ok(lead && other, 'each seat needs a land sub-unit');
    setActiveTacticalBattleSnapshotRef({
      ...battle,
      subUnits: battle.subUnits.map((unit) => (unit.id === other.id ? { ...unit, h3Index: lead.h3Index } : unit)),
    });
    const committed = commitAiOnlyTacticalBeat({
      preBattle: battle,
      leadDraft: emptyPlan(),
      opposingDraft: emptyPlan(),
    });
    assert.equal(committed.success, true, committed.success ? '' : committed.reason);
    if (!committed.success) return;
    const playback = committed.tacticalResolutionPlayback;
    assert.ok(playback?.meleeCombatHexes?.includes(lead.h3Index), lead.h3Index);
    assert.ok((playback?.meleeDiceRolls?.length ?? 0) > 0);
    assert.equal(getRecentTurnNotes(leadParty, 'tactical', battle.battleId, 2).length, 1);
    assert.equal(getRecentTurnNotes(otherParty, 'tactical', battle.battleId, 2).length, 1);
  });
});
