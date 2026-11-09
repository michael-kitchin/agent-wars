/**
 * Contracts for one beat between two AI seats.
 * Run with: node dist/main/tacticalBattle/aiOnlyTacticalBeat.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dbRun } from '../gameDb';
import { setActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import { applyAiOnlyTacticalBeat } from './aiOnlyTacticalBeat';
import { getActiveTacticalBattleSnapshot, isTacticalBattleActive } from './tacticalBattleSession';
import { tacticalDbFixtureRegisterDefaultAfterEach } from './testSupport/tacticalDbFixture';
import { emptyPlan, legalStep, storedUnit, withTwoAiBattle } from './testSupport/twoAiBattleFixture';

tacticalDbFixtureRegisterDefaultAfterEach();

/**
 * Writes the beat-limit row in the temp match this test opened.
 *
 * Purpose: Each `withTwoAiBattle` callback has its own database, so the row has to be written inside it.
 * When to use: Before `applyAiOnlyTacticalBeat` in a limit test.
 * Expected outcome: The row replaces any earlier value.
 * Exceptions: Throws when the temp database is closed.
 */
function storeBeatLimit(value: string): void {
  dbRun("INSERT OR REPLACE INTO game_config (key, value) VALUES ('ai_only_beat_limit', ?)", [value]);
}

test('both drafts move their own sub-units in one beat', () => {
  withTwoAiBattle('aw-ai-only-both-move-', (battle) => {
    const lead = battle.leadPartyId!;
    const opposing = battle.opposingPartyId!;
    const leadStep = legalStep(battle, lead);
    const opposingStep = legalStep(battle, opposing);
    assert.ok(leadStep, 'lead needs a legal step');
    assert.ok(opposingStep, 'opposing needs a legal step');
    const beat = applyAiOnlyTacticalBeat({
      leadDraft: { ...emptyPlan(), movementOrders: [leadStep] },
      opposingDraft: { ...emptyPlan(), movementOrders: [opposingStep] },
    });
    assert.equal(beat.success, true);
    assert.equal(storedUnit(leadStep.unitId)?.h3Index, leadStep.toH3Index);
    assert.equal(storedUnit(opposingStep.unitId)?.h3Index, opposingStep.toH3Index);
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : undefined, undefined);
  });
});

test('an illegal row is dropped and the other seat still moves', () => {
  withTwoAiBattle('aw-ai-only-drop-', (battle) => {
    const opposing = battle.opposingPartyId!;
    const opposingStep = legalStep(battle, opposing);
    assert.ok(opposingStep);
    const before = battle.subUnits.find((unit) => unit.player === battle.leadPartyId)?.h3Index;
    const beat = applyAiOnlyTacticalBeat({
      leadDraft: { ...emptyPlan(), movementOrders: [{ unitId: 'missing-unit', toH3Index: battle.enclosingStrategicH3Index }] },
      opposingDraft: { ...emptyPlan(), movementOrders: [opposingStep] },
    });
    assert.equal(beat.success, true);
    assert.equal(storedUnit(opposingStep.unitId)?.h3Index, opposingStep.toH3Index);
    const leadStill = getActiveTacticalBattleSnapshot()?.subUnits.find((unit) => unit.player === battle.leadPartyId);
    assert.equal(leadStill?.h3Index, before);
  });
});

test('three idle beats set idle and leave the session active', () => {
  withTwoAiBattle('aw-ai-only-idle-', () => {
    applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    const third = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.equal(third.success, true);
    assert.equal(third.success ? third.battle.aiOnlyEndReason : undefined, 'idle');
    assert.equal(third.success ? third.battle.idleBeatStreak : undefined, 3);
    assert.equal(isTacticalBattleActive(), true);
  });
});

test('both exit flags on completed beat 4 do not end the battle', () => {
  withTwoAiBattle('aw-ai-only-exit-early-', (battle) => {
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 4, idleBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(true), opposingDraft: emptyPlan(true) });
    assert.equal(beat.success ? beat.battle.tacticalTurnNumber : 0, 5);
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : 'exit', undefined);
  });
});

test('one exit flag on beat 5 does not end the battle', () => {
  withTwoAiBattle('aw-ai-only-one-flag-', (battle) => {
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 5, idleBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(true), opposingDraft: emptyPlan(false) });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : 'exit', undefined);
  });
});

test('both exit flags on completed beat 5 end the battle', () => {
  withTwoAiBattle('aw-ai-only-exit-', (battle) => {
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 5, idleBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(true), opposingDraft: emptyPlan(true) });
    assert.equal(beat.success ? beat.battle.tacticalTurnNumber : 0, 6);
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : undefined, 'exit');
    assert.equal(isTacticalBattleActive(), true);
  });
});

test('a wiped side sets elimination even when both flags are true', () => {
  withTwoAiBattle('aw-ai-only-wiped-', (battle) => {
    const lead = battle.leadPartyId!;
    setActiveTacticalBattleSnapshotRef({
      ...battle,
      tacticalTurnNumber: 5,
      subUnits: battle.subUnits.filter((unit) => unit.player === lead),
    });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(true), opposingDraft: emptyPlan(true) });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : undefined, 'elimination');
    assert.equal(isTacticalBattleActive(), true);
  });
});

test('a contested cell returns melee results and dice', () => {
  withTwoAiBattle('aw-ai-only-melee-', (battle) => {
    const leadParty = battle.leadPartyId!;
    const otherParty = battle.opposingPartyId!;
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
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.equal(beat.success, true);
    if (!beat.success) return;
    assert.ok(beat.meleePack.meleeCombatHexes.includes(lead.h3Index), lead.h3Index);
    assert.ok(beat.meleePack.meleeDiceRolls.length > 0);
  });
});

test('one beat before the limit continues', () => {
  withTwoAiBattle('aw-ai-only-beat-before-', (battle) => {
    storeBeatLimit('20');
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 19, idleBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : 'beat_limit', undefined);
    assert.equal(beat.success ? beat.battle.tacticalTurnNumber : 0, 20);
  });
});

test('the limit ends the battle after that beat', () => {
  withTwoAiBattle('aw-ai-only-beat-limit-', (battle) => {
    storeBeatLimit('20');
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 20, idleBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : undefined, 'beat_limit');
    assert.equal(beat.success ? beat.battle.tacticalTurnNumber : 0, 21);
    assert.equal(isTacticalBattleActive(), true);
  });
});

test('Unlimited never ends on beats', () => {
  withTwoAiBattle('aw-ai-only-beat-unlimited-', (battle) => {
    storeBeatLimit('unlimited');
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 500, idleBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : 'beat_limit', undefined);
  });
});

test('a save with no row never ends on beats', () => {
  withTwoAiBattle('aw-ai-only-beat-missing-', (battle) => {
    // A new match stores 30. An old save is that match with the row removed.
    dbRun("DELETE FROM game_config WHERE key = 'ai_only_beat_limit'");
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 500, idleBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : 'beat_limit', undefined);
  });
});

test('idle wins on the limit beat', () => {
  withTwoAiBattle('aw-ai-only-beat-idle-', (battle) => {
    storeBeatLimit('20');
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 20, idleBeatStreak: 2 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : undefined, 'idle');
  });
});

test('commander exit wins on the limit beat', () => {
  withTwoAiBattle('aw-ai-only-beat-exit-', (battle) => {
    storeBeatLimit('20');
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 20, idleBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(true), opposingDraft: emptyPlan(true) });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : undefined, 'exit');
  });
});

test('a wipe wins on the limit beat', () => {
  withTwoAiBattle('aw-ai-only-beat-wipe-', (battle) => {
    storeBeatLimit('20');
    const lead = battle.leadPartyId!;
    setActiveTacticalBattleSnapshotRef({
      ...battle,
      tacticalTurnNumber: 20,
      subUnits: battle.subUnits.filter((unit) => unit.player === lead),
    });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : undefined, 'elimination');
  });
});
