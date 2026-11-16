/**
 * Loss notes store who was responsible when an attribution context is given.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePlayerLossSummaryJson } from '../../shared/lossSummaryJson';
import { isAttributedLossesRecord } from '../../shared/lossHistory';
import { strategicStep } from '../../shared/matchRecording';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { getRecentTurnNotes } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { buildStrategicLossAttributionContext } from '../lossAttribution/strategicLossAttribution';
import { listMatchEventsOfType } from '../recorder/matchRecordStore';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { captureTurnLossNoteFromResolution, type CaptureTurnLossNoteArgs } from './captureTurnLossNote';

const SEAT = AI_SEAT_IDS[0];
const VICTIM = { id: 'a1-i1', player: SEAT, unitType: 'infantry', h3Index: 'hX' };
const KILLER = { id: 'h1-a1', player: 'human', unitType: 'armor', h3Index: 'hY' };

/**
 * Captures one strategic ranged loss and returns the stored own-loss summary.
 *
 * Purpose: Both cases differ only in the attribution argument.
 * When to use: Every test below.
 * Expected outcome: The parsed own-loss summary of the first AI seat for turn 1.
 * Exceptions: None.
 */
function captureAndRead(emptyContext: boolean) {
  const base: Omit<CaptureTurnLossNoteArgs, 'attribution'> = {
    scope: 'strategic',
    battleId: '',
    turnNumber: 1,
    historyStep: strategicStep(1),
    historySource: 'strategicTurn',
    killsByDirectFire: [{ victimId: VICTIM.id, killerIds: [KILLER.id] }],
    removedUnits: [VICTIM],
  };
  const attribution = buildStrategicLossAttributionContext({
    kills: [], killsByDirectFire: emptyContext ? undefined : base.killsByDirectFire, killsByReturnFire: undefined, removedUnits: [VICTIM],
    combatUnitsBefore: emptyContext ? [] : [KILLER], combatUnitsAfter: emptyContext ? [] : [KILLER], airStrikeMoves: [], airStrikeVictimIds: [], airDropMoves: [],
    missileLaunches: [], airStrikeInfrastructureEvents: [], missileInfrastructureEvents: [], controlTransitions: [],
    baseLossUnitIds: [], controllerBeforeControlByHex: new Map(), carrierIdByCargoId: new Map(),
  });
  captureTurnLossNoteFromResolution({ ...base, attribution });
  const row = getRecentTurnNotes(SEAT, 'strategic', '', 2)[0];
  assert.ok(row, 'a note row was written');
  return parsePlayerLossSummaryJson(row.aiLossJson);
}

test('a captured ranged loss stores the responsible side, killer types, and hex', () => {
  withSeatedTempGameDb('aw-capture-loss-', { fogOfWarEnabled: false }, () => {
    const lost = captureAndRead(false).ranged[0];
    assert.deepEqual(lost?.attribution?.responsibleOwnerIds, ['human']);
    assert.deepEqual(lost?.attribution?.killerUnits, [{ unitId: 'h1-a1', unitType: 'armor' }]);
    assert.equal(lost?.attribution?.lossH3Index, 'hX');
  });
});

test('a capture whose context knows no killers stores an unknown responsible side', () => {
  withSeatedTempGameDb('aw-capture-loss-none-', { fogOfWarEnabled: false }, () => {
    const lost = captureAndRead(true).ranged[0];
    assert.ok(lost);
    assert.equal(lost.attribution?.responsibleOwnerIds, null);
  });
});

test('a strategic capture also records one attributed-losses event, and the recorder flag only stops the event', () => {
  withSeatedTempGameDb('aw-capture-loss-history-', { fogOfWarEnabled: false }, () => {
    captureAndRead(false);
    const events = listMatchEventsOfType(gameDbOps, 'losses_attributed');
    assert.equal(events.length, 1);
    assert.equal(events[0]?.stepKey, 's1');
    assert.equal(events[0]?.visibility, 'engine');
    const payload = events[0]?.payload;
    assert.ok(isAttributedLossesRecord(payload));
    assert.equal(payload.source, 'strategicTurn');
    const lost = payload.byOwner[SEAT]?.ranged[0];
    assert.equal(lost?.unitId, 'a1-i1');
    assert.equal(lost?.attribution?.ownerId, SEAT);
    assert.deepEqual(lost?.attribution?.responsibleOwnerIds, [HUMAN_SEAT_ID]);
    assert.deepEqual(lost?.attribution?.killerUnits.map((unit) => unit.unitId), ['h1-a1']);
  });
  withSeatedTempGameDb('aw-capture-loss-history-off-', { fogOfWarEnabled: false }, () => {
    process.env.AGENT_WARS_DISABLE_RECORDER = '1';
    try {
      const lost = captureAndRead(false).ranged[0];
      assert.ok(lost, 'the note is still written');
      assert.equal(listMatchEventsOfType(gameDbOps, 'losses_attributed').length, 0);
    } finally {
      delete process.env.AGENT_WARS_DISABLE_RECORDER;
    }
  });
});
