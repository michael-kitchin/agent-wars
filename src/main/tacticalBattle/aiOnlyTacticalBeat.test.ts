/**
 * Contracts for one beat between two AI seats.
 * Run with: node dist/main/tacticalBattle/aiOnlyTacticalBeat.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { computeGridDistancePure } from '../../shared/h3GridRangePure';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { dbRun } from '../gameDb';
import { setActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import { applyAiOnlyTacticalBeat } from './aiOnlyTacticalBeat';
import { tacticalComputeMovementOrderOutcomeForPlayer } from './tacticalSnapshotGuards';
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

/**
 * A legal one-cell move that brings a lead sub-unit nearer to the opposing side.
 *
 * Purpose: The streak case needs a beat whose only event is a sub-unit closing on the enemy.
 * When to use: The quiet-streak reset case.
 * Expected outcome: A movement row that lowers that sub-unit's distance to the nearest opposing sub-unit, or null.
 * Exceptions: None.
 */
function closingStep(battle: TacticalBattleSnapshot): { unitId: string; toH3Index: string } | null {
  const tacticalSet = new Set(battle.tacticalChildH3Indexes);
  const sub = battle.subUnits.map((unit) => ({ ...unit }));
  const byId = new Map(sub.map((unit, index) => [unit.id, index] as const));
  const lead = battle.leadPartyId!;
  const enemyCells = battle.subUnits.filter((unit) => unit.player === battle.opposingPartyId).map((unit) => unit.h3Index);
  const nearest = (from: string): number =>
    Math.min(...enemyCells.map((cell) => computeGridDistancePure(from, cell) ?? Number.POSITIVE_INFINITY));
  for (const unit of battle.subUnits) {
    if (unit.player !== lead || (unit.unitType !== 'infantry' && unit.unitType !== 'armor')) continue;
    for (const cell of gridDisk(unit.h3Index, 1)) {
      const distance = nearest(cell);
      if (distance === 0 || distance >= nearest(unit.h3Index)) continue;
      const order = { unitId: unit.id, toH3Index: cell };
      if (tacticalComputeMovementOrderOutcomeForPlayer(lead, { byId, sub, order, tacticalSet, battle }).ok) return order;
    }
  }
  return null;
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

test('three quiet beats set quiet and leave the session active', () => {
  withTwoAiBattle('aw-ai-only-quiet-', () => {
    applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    const third = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.equal(third.success, true);
    assert.equal(third.success ? third.battle.aiOnlyEndReason : undefined, 'quiet');
    assert.equal(third.success ? third.battle.quietBeatStreak : undefined, 3);
    assert.equal(isTacticalBattleActive(), true);
  });
});

test('both exit flags end the battle on any beat', () => {
  withTwoAiBattle('aw-ai-only-exit-early-', (battle) => {
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 1, quietBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(true), opposingDraft: emptyPlan(true) });
    assert.equal(beat.success ? beat.battle.tacticalTurnNumber : 0, 2);
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : undefined, 'exit');
  });
});

test('one exit flag on beat 5 does not end the battle', () => {
  withTwoAiBattle('aw-ai-only-one-flag-', (battle) => {
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 5, quietBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(true), opposingDraft: emptyPlan(false) });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : 'exit', undefined);
  });
});

test('both exit flags on completed beat 5 end the battle', () => {
  withTwoAiBattle('aw-ai-only-exit-', (battle) => {
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 5, quietBeatStreak: 0 });
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
    assert.equal(beat.battle.lastBeatActivity?.meleeFought, true);
    assert.equal(beat.battle.quietBeatStreak, 0);
  });
});

test('a beat stores what each side fired', () => {
  withTwoAiBattle('aw-ai-only-activity-', (battle) => {
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.deepEqual(beat.success ? beat.battle.lastBeatActivity : undefined, {
      beatNumber: battle.tacticalTurnNumber,
      leadShots: 0,
      opposingShots: 0,
      meleeFought: false,
    });
  });
});

test('a step toward the enemy resets the quiet streak', () => {
  withTwoAiBattle('aw-ai-only-closer-', (battle) => {
    const step = closingStep(battle);
    assert.ok(step, 'the fixture needs a lead step that closes on the enemy');
    setActiveTacticalBattleSnapshotRef({ ...battle, quietBeatStreak: 2 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: { ...emptyPlan(), movementOrders: [step] }, opposingDraft: emptyPlan() });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : 'quiet', undefined);
    assert.equal(beat.success ? beat.battle.quietBeatStreak : undefined, 0);
  });
});

test('one beat before the limit continues', () => {
  withTwoAiBattle('aw-ai-only-beat-before-', (battle) => {
    storeBeatLimit('20');
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 19, quietBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : 'beat_limit', undefined);
    assert.equal(beat.success ? beat.battle.tacticalTurnNumber : 0, 20);
  });
});

test('the limit ends the battle after that beat', () => {
  withTwoAiBattle('aw-ai-only-beat-limit-', (battle) => {
    storeBeatLimit('20');
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 20, quietBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : undefined, 'beat_limit');
    assert.equal(beat.success ? beat.battle.tacticalTurnNumber : 0, 21);
    assert.equal(isTacticalBattleActive(), true);
  });
});

test('Unlimited never ends on beats', () => {
  withTwoAiBattle('aw-ai-only-beat-unlimited-', (battle) => {
    storeBeatLimit('unlimited');
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 500, quietBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : 'beat_limit', undefined);
  });
});

test('a save with no row never ends on beats', () => {
  withTwoAiBattle('aw-ai-only-beat-missing-', (battle) => {
    // A new match stores 30. An old save is that match with the row removed.
    dbRun("DELETE FROM game_config WHERE key = 'ai_only_beat_limit'");
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 500, quietBeatStreak: 0 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : 'beat_limit', undefined);
  });
});

test('quiet wins on the limit beat', () => {
  withTwoAiBattle('aw-ai-only-beat-quiet-', (battle) => {
    storeBeatLimit('20');
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 20, quietBeatStreak: 2 });
    const beat = applyAiOnlyTacticalBeat({ leadDraft: emptyPlan(), opposingDraft: emptyPlan() });
    assert.equal(beat.success ? beat.battle.aiOnlyEndReason : undefined, 'quiet');
  });
});

test('commander exit wins on the limit beat', () => {
  withTwoAiBattle('aw-ai-only-beat-exit-', (battle) => {
    storeBeatLimit('20');
    setActiveTacticalBattleSnapshotRef({ ...battle, tacticalTurnNumber: 20, quietBeatStreak: 0 });
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

test('an air drop shot down by anti-air is not a quiet beat', () => {
  withTwoAiBattle('aw-ai-only-drop-shot-down-', (battle) => {
    const lead = battle.leadPartyId!;
    const own = battle.subUnits.find((unit) => unit.player === lead);
    const enemy = battle.subUnits.find((unit) => unit.player === battle.opposingPartyId && unit.h3Index !== own?.h3Index);
    assert.ok(own && enemy, 'each seat needs a sub-unit on its own cell');
    const carrier = { ...own, id: 'drop-air', unitType: 'air' as const };
    const cargo = { ...own, id: 'drop-infantry', unitType: 'infantry' as const, embarkedOnSubUnitId: carrier.id };
    // Several defenders on the target, so the fixed match seed gives at least one anti-air hit.
    const defenders = Array.from({ length: 12 }, (_, index) => ({ ...enemy, id: `anti-air-${index}`, unitType: 'armor' as const }));
    setActiveTacticalBattleSnapshotRef({ ...battle, quietBeatStreak: 2, subUnits: [...battle.subUnits, carrier, cargo, ...defenders] });
    const beat = applyAiOnlyTacticalBeat({
      leadDraft: { ...emptyPlan(), airDropOrders: [{ unitId: carrier.id, targetH3Index: enemy.h3Index }] },
      opposingDraft: emptyPlan(),
    });
    assert.equal(beat.success, true);
    if (!beat.success) return;
    assert.equal(beat.battle.subUnits.some((unit) => unit.id === carrier.id), false, 'the drop must be shot down');
    assert.deepEqual(
      [beat.battle.lastBeatActivity?.leadShots, beat.battle.lastBeatActivity?.opposingShots, beat.battle.lastBeatActivity?.meleeFought],
      [0, 0, false],
    );
    assert.equal(beat.battle.quietBeatStreak, 0);
    assert.equal(beat.battle.aiOnlyEndReason, undefined);
  });
});
