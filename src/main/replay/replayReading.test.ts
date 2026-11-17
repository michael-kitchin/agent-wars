/**
 * Reading the replay timeline and one step.
 *
 * Purpose: Replay hands back the recorded snapshot with its hexes restored, and what the two dialogs showed.
 * When to use: `npm run build:main`, then `node dist/main/replay/replayReading.test.js`.
 * Expected outcome: One step per turn, stored weather kept, dialogs rebuilt from the history, and a wrong record id refused.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strategicStep, tacticalStep } from '../../shared/matchRecording';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { getGameState, getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { setGameOutcomeWithOps } from '../gameDb/gameConfigKv';
import { forgetTurnOwnershipForTests } from '../matchStatistics/turnDifferences';
import { recordMatchEvent, recordStepBoundary } from '../recorder/matchRecorder';
import { listMatchEventsOfType, listMatchRecords } from '../recorder/matchRecordStore';
import { setActiveTacticalBattleSnapshotRef } from '../tacticalBattle/activeTacticalBattleRef';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { readReplayStep, readReplayTimeline } from './replayReading';
import { recordReplayViewsIfNeeded, recordResolutionView } from './replayRecording';

/**
 * Moves the match to a turn and records its boundary and view snapshots.
 *
 * Purpose: The cases drive the recorder by hand, one turn at a time.
 * When to use: Each turn in a case.
 * Expected outcome: A frame and the view snapshots at that turn.
 * Exceptions: None.
 */
function playTurn(turnNumber: number): void {
  gameDbOps.run('UPDATE turn_state SET turn_number = ? WHERE id = 1', [turnNumber]);
  recordStepBoundary(strategicStep(turnNumber), '1.0.0');
  recordReplayViewsIfNeeded();
}

/**
 * Runs a case on a seated match with a human seat, fog of war, and weather.
 *
 * Purpose: Every case here needs the same start.
 * When to use: Each test below.
 * Expected outcome: `runCase` sees the open match.
 * Exceptions: Propagates a case error after cleanup.
 */
function withHumanMatch(runCase: () => void): void {
  forgetTurnOwnershipForTests();
  const regions = listScenarioHomeRegions()
    .map((name) => ({ name, hexes: getScenarioHomeRegionHexes(name).length }))
    .filter((region) => region.hexes > 0)
    .sort((left, right) => right.hexes - left.hexes || left.name.localeCompare(right.name))
    .slice(0, 3)
    .map((region) => region.name);
  withSeatedTempGameDb('aw-replay-read-', {
    gameMapId: 'global',
    fogOfWarEnabled: true,
    weatherBonusLevel: 'low',
    startMonth: 6,
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
      { kind: 'ai', homeRegion: regions[2] },
    ],
  }, runCase);
}

/**
 * Writes the strategy and two messages one commander produced at a turn.
 *
 * Purpose: The dialog cases need history to rebuild.
 * When to use: After a turn's boundary.
 * Expected outcome: One strategy and two messages, one to the human and one to another commander.
 * Exceptions: None.
 */
function recordCommanderTalk(turnNumber: number): void {
  const step = strategicStep(turnNumber);
  const seatId = AI_SEAT_IDS[0];
  recordMatchEvent({ type: 'commander_strategy', step, visibility: { seats: [seatId] }, payload: { seatId, strategy: 'Hold the line.' } });
  recordMatchEvent({
    type: 'message_sent',
    step,
    visibility: { seats: [seatId, HUMAN_SEAT_ID] },
    payload: { messageId: 1, fromSeatId: seatId, toSeatId: HUMAN_SEAT_ID, text: 'To the player.' },
  });
  recordMatchEvent({
    type: 'message_sent',
    step,
    visibility: { seats: [seatId, AI_SEAT_IDS[1]] },
    payload: { messageId: 2, fromSeatId: seatId, toSeatId: AI_SEAT_IDS[1], text: 'To another commander.' },
  });
}

test('the timeline has one player-view step per turn, in order, keeping the first snapshot except on the last turn', () => {
  withHumanMatch(() => {
    playTurn(1);
    playTurn(2);
    const turn2 = listMatchEventsOfType(gameDbOps, 'view_snapshot').filter((row) => row.turnNumber === 2);
    for (const row of turn2) recordMatchEvent({ type: 'view_snapshot', step: strategicStep(2), visibility: row.visibility === 'engine' ? 'engine' : { seats: [HUMAN_SEAT_ID] }, payload: row.payload });
    const playerIds = (): number[] =>
      listMatchRecords(gameDbOps).filter((row) => row.recordType === 'view_snapshot' && row.visibility !== 'engine').map((row) => row.recordId);
    let timeline = readReplayTimeline();
    assert.equal(timeline.view, 'player');
    assert.deepEqual(timeline.steps.map((step) => step.turnNumber), [1, 2]);
    assert.equal(timeline.steps[1]?.recordId, playerIds().at(-1));
    playTurn(3);
    timeline = readReplayTimeline();
    assert.deepEqual(timeline.steps.map((step) => step.turnNumber), [1, 2, 3]);
    assert.equal(timeline.steps[1]?.recordId, playerIds()[1]);
  });
});

test('a step restores the hex list and keeps its stored weather, with none on hexes it had none for', () => {
  withHumanMatch(() => {
    playTurn(1);
    const stored = listMatchEventsOfType(gameDbOps, 'view_snapshot').find((row) => row.visibility !== 'engine');
    const storedWeather = new Map((stored?.payload as { snapshot: { hexWeather: [string, string][] } }).snapshot.hexWeather);
    assert.ok(storedWeather.size > 0);
    playTurn(2);
    const step = readReplayStep(readReplayTimeline().steps[0]!.recordId);
    assert.ok(step);
    assert.equal(step.snapshot.turnNumber, 1);
    assert.equal(step.snapshot.hexes.length, getGameState().hexes.length);
    assert.equal('hexWeather' in step.snapshot, false);
    for (const hex of step.snapshot.hexes) assert.equal(hex.weather, storedWeather.get(hex.h3Index));

    const droppedHex = [...storedWeather.keys()][0]!;
    const trimmed = { ...(stored!.payload as { snapshot: Record<string, unknown> }) };
    const remaining = [...storedWeather.entries()].filter(([h3]) => h3 !== droppedHex);
    recordMatchEvent({
      type: 'view_snapshot',
      step: strategicStep(3),
      visibility: { seats: [HUMAN_SEAT_ID] },
      payload: { ...trimmed, snapshot: { ...trimmed.snapshot, hexWeather: remaining } },
    });
    const last = readReplayTimeline().steps.at(-1)!;
    const lastView = readReplayStep(last.recordId);
    assert.equal(last.turnNumber, 3);
    assert.equal(lastView?.snapshot.hexes.find((hex) => hex.h3Index === droppedHex)?.weather, undefined);
  });
});

test('the first step has no result and no earlier view, and the next has both', () => {
  withHumanMatch(() => {
    playTurn(1);
    recordResolutionView(strategicStep(1), 'strategic', { success: true, marker: 'turn-1-result' });
    playTurn(2);
    const [first, second] = readReplayTimeline().steps;
    const firstView = readReplayStep(first!.recordId);
    assert.equal(firstView?.resolution, null);
    assert.equal(firstView?.visibleHexesBefore, null);
    const secondView = readReplayStep(second!.recordId);
    assert.deepEqual(secondView?.resolution, { success: true, marker: 'turn-1-result' });
    const stored = readReplayStep(first!.recordId)?.snapshot.visibleHexes;
    assert.deepEqual(secondView?.visibleHexesBefore, stored);
  });
});

test('a turn with two snapshots gives the next step the fog of its newest one, while the timeline keeps its first', () => {
  withHumanMatch(() => {
    playTurn(1);
    const firstPlayer = listMatchEventsOfType(gameDbOps, 'view_snapshot').find((row) => row.visibility !== 'engine');
    const stored = firstPlayer!.payload as { snapshot: Record<string, unknown> };
    recordMatchEvent({
      type: 'view_snapshot',
      step: strategicStep(1),
      visibility: { seats: [HUMAN_SEAT_ID] },
      payload: { ...stored, snapshot: { ...stored.snapshot, visibleHexes: ['after-the-battle'] } },
    });
    playTurn(2);
    const [first, second] = readReplayTimeline().steps;
    assert.equal(first?.recordId, firstPlayer!.recordId);
    assert.deepEqual(readReplayStep(second!.recordId)?.visibleHexesBefore, ['after-the-battle']);
  });
});

test('a damaged newest snapshot gives the next step the fog of the timeline snapshot, and with that damaged too, no fog', () => {
  withHumanMatch(() => {
    playTurn(1);
    const firstPlayer = listMatchEventsOfType(gameDbOps, 'view_snapshot').find((row) => row.visibility !== 'engine');
    const stored = firstPlayer!.payload as { snapshot: Record<string, unknown> };
    recordMatchEvent({
      type: 'view_snapshot',
      step: strategicStep(1),
      visibility: { seats: [HUMAN_SEAT_ID] },
      payload: { ...stored, snapshot: { ...stored.snapshot, visibleHexes: ['after-the-battle'] } },
    });
    gameDbOps.run(
      `UPDATE match_records SET payload = X'00FF' WHERE record_id = (SELECT MAX(record_id) FROM match_records WHERE record_type = 'view_snapshot')`
    );
    playTurn(2);
    const second = readReplayTimeline().steps[1]!;
    assert.deepEqual(readReplayStep(second.recordId)?.visibleHexesBefore, stored.snapshot.visibleHexes);
    gameDbOps.run(`UPDATE match_records SET payload = X'00FF' WHERE record_id = ?`, [firstPlayer!.recordId]);
    assert.deepEqual(readReplayStep(second.recordId)?.visibleHexesBefore, []);
  });
});

test('dispatches hold the strategy and every message, before and after the match ends', () => {
  withHumanMatch(() => {
    playTurn(1);
    playTurn(2);
    recordCommanderTalk(2);
    const playerSteps = readReplayTimeline().steps;
    assert.deepEqual(readReplayStep(playerSteps[0]!.recordId)?.dispatches, []);
    const live = readReplayStep(playerSteps[1]!.recordId)?.dispatches ?? [];
    assert.equal(live.length, 1);
    assert.equal(live[0]?.seatId, AI_SEAT_IDS[0]);
    assert.equal(live[0]?.strategy, 'Hold the line.');
    assert.deepEqual(live[0]?.messages.map((message) => [message.toSeatId, message.text]), [
      [HUMAN_SEAT_ID, 'To the player.'],
      [AI_SEAT_IDS[1], 'To another commander.'],
    ]);
    assert.equal(live[0]?.turnNumber, 2);

    setGameOutcomeWithOps(gameDbOps, { winnerSeatId: HUMAN_SEAT_ID, endReason: 'ended_by_human' });
    const finished = readReplayTimeline();
    assert.equal(finished.view, 'all');
    const after = readReplayStep(finished.steps[1]!.recordId)?.dispatches;
    assert.deepEqual(after, live);
  });
});

test('a damaged message row is skipped and the step still loads with the rest of its dispatch', () => {
  withHumanMatch(() => {
    playTurn(1);
    playTurn(2);
    recordCommanderTalk(2);
    gameDbOps.run(
      `UPDATE match_records SET payload = X'00FF' WHERE record_id = (SELECT MAX(record_id) FROM match_records WHERE record_type = 'message_sent')`
    );
    const step = readReplayStep(readReplayTimeline().steps[1]!.recordId);
    assert.ok(step);
    assert.equal(step.dispatches[0]?.strategy, 'Hold the line.');
    assert.deepEqual(step.dispatches[0]?.messages.map((message) => message.text), ['To the player.']);
  });
});

test('a frame, an unknown id, and a snapshot of the other view are refused', () => {
  withHumanMatch(() => {
    playTurn(1);
    const frame = listMatchRecords(gameDbOps).find((row) => row.kind === 'frame');
    const allSnapshot = listMatchEventsOfType(gameDbOps, 'view_snapshot').find((row) => row.visibility === 'engine');
    assert.equal(readReplayStep(frame!.recordId), null);
    assert.equal(readReplayStep(99999), null);
    assert.equal(readReplayStep(allSnapshot!.recordId), null);
  });
});

/**
 * Opens a battle in memory and records the boundary and view snapshots of one of its beats.
 *
 * Purpose: The battle cases drive the recorder by hand, one beat at a time, with sub-units the snapshot carries.
 * When to use: Each beat in a battle case.
 * Expected outcome: A frame and the view snapshots at that beat, whose battle session lists `subUnitIds`.
 * Exceptions: None.
 */
function playBeat(battleId: string, beat: number, subUnitIds: readonly string[]): void {
  setActiveTacticalBattleSnapshotRef({
    battleId,
    tacticalTurnNumber: beat,
    subUnits: subUnitIds.map((id) => ({ id })),
  } as unknown as TacticalBattleSnapshot);
  recordStepBoundary(tacticalStep(1, battleId, beat), '1.0.0');
  recordReplayViewsIfNeeded();
}

test('with a battle open the timeline holds only that battle, each beat carries the beat before it, and a strategic turn is refused', () => {
  withHumanMatch(() => {
    try {
      playTurn(1);
      playBeat('tb-old', 1, ['old-a']);
      playBeat('tb-old', 2, ['old-a']);
      playBeat('tb-new', 1, ['a-s1', 'b-s1']);
      recordResolutionView(tacticalStep(1, 'tb-new', 1), 'tactical', { success: true, marker: 'beat-1-result' });
      playBeat('tb-new', 2, ['a-s1']);
      recordResolutionView(tacticalStep(1, 'tb-new', 2), 'tactical', { success: true, marker: 'beat-2-result' });
      playBeat('tb-new', 3, ['a-s1']);
      const timeline = readReplayTimeline();
      assert.equal(timeline.scope, 'tactical');
      assert.deepEqual(timeline.steps.map((step) => [step.scope, step.beatNumber]), [['tactical', 1], ['tactical', 2], ['tactical', 3]]);
      const [first, second, third] = timeline.steps.map((step) => readReplayStep(step.recordId));
      assert.equal(first?.resolution, null);
      assert.deepEqual(second?.resolution, { success: true, marker: 'beat-1-result' });
      assert.deepEqual(third?.resolution, { success: true, marker: 'beat-2-result' });
      assert.equal(first?.subUnitsBefore, null);
      assert.deepEqual(second?.subUnitsBefore?.map((unit) => unit.id), ['a-s1', 'b-s1']);
      assert.deepEqual(third?.subUnitsBefore?.map((unit) => unit.id), ['a-s1']);
      const strategicRecord = listMatchEventsOfType(gameDbOps, 'view_snapshot').find((row) => row.scope === 'strategic' && row.visibility !== 'engine');
      assert.equal(readReplayStep(strategicRecord!.recordId), null);
      const oldBeat = listMatchEventsOfType(gameDbOps, 'view_snapshot').find((row) => row.battleId === 'tb-old' && row.visibility !== 'engine');
      assert.equal(readReplayStep(oldBeat!.recordId), null);
    } finally {
      setActiveTacticalBattleSnapshotRef(null);
    }
  });
});

test('with no battle open the timeline is strategic and holds no beat', () => {
  withHumanMatch(() => {
    try {
      playTurn(1);
      playBeat('tb-closed', 1, ['x-s1']);
    } finally {
      setActiveTacticalBattleSnapshotRef(null);
    }
    playTurn(2);
    const timeline = readReplayTimeline();
    assert.equal(timeline.scope, 'strategic');
    assert.deepEqual(timeline.steps.map((step) => [step.scope, step.turnNumber]), [['strategic', 1], ['strategic', 2]]);
    const beat = listMatchEventsOfType(gameDbOps, 'view_snapshot').find((row) => row.scope === 'tactical' && row.visibility !== 'engine');
    assert.equal(readReplayStep(beat!.recordId), null);
  });
});
