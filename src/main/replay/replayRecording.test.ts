/**
 * Recording what the screen was given.
 *
 * Purpose: Every frame is followed by the all-sides snapshot and the player's snapshot, and every resolution stores its result.
 * When to use: `npm run build:main`, then `node dist/main/replay/replayRecording.test.js`.
 * Expected outcome: Snapshots carry weather and no hex list, a second call writes nothing, no secret is stored, and the recorder flag turns it all off.
 * Exceptions: None. The temporary matches are closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strategicStep } from '../../shared/matchRecording';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { getGameState, getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { upsertGameConfigValue } from '../gameDb/gameConfigRows';
import { MACHINE_LOCAL_CONFIG_KEYS } from '../gameDb/machineLocalConfigKeys';
import { handleGameReady, type ReadyResultMinimal } from '../gameIpcHandlers';
import { clearDeferredPlaybackConsultPending } from '../ipc/deferredResolutionPlaybackConsult';
import { forgetTurnOwnershipForTests } from '../matchStatistics/turnDifferences';
import { recordStepBoundary } from '../recorder/matchRecorder';
import { listMatchEventsOfType, listMatchRecords } from '../recorder/matchRecordStore';
import { withSeatedTempGameDb, withSeatedTempGameDbAsync } from '../testSupport/withSeatedTempGameDb';
import { recordReplayViewsIfNeeded, recordResolutionView } from './replayRecording';

/**
 * The largest listed home regions.
 *
 * Purpose: A global start needs regions that can hold opening units.
 * When to use: Before each seated start in this file.
 * Expected outcome: Up to `count` names.
 * Exceptions: None.
 */
function largestHomeRegions(count: number): string[] {
  return listScenarioHomeRegions()
    .map((name) => ({ name, hexes: getScenarioHomeRegionHexes(name).length }))
    .filter((region) => region.hexes > 0)
    .sort((left, right) => right.hexes - left.hexes || left.name.localeCompare(right.name))
    .slice(0, count)
    .map((region) => region.name);
}

/**
 * Match options with one human seat, fog of war, and weather.
 *
 * Purpose: Most cases need a player view and weather on the hexes.
 * When to use: `withSeatedTempGameDb`.
 * Expected outcome: Three seats, the first human.
 * Exceptions: None.
 */
function humanMatchOptions(): Parameters<typeof withSeatedTempGameDb>[1] {
  const regions = largestHomeRegions(3);
  return {
    gameMapId: 'global',
    fogOfWarEnabled: true,
    weatherBonusLevel: 'low',
    startMonth: 6,
    seats: [
      { kind: 'human', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
      { kind: 'ai', homeRegion: regions[2] },
    ],
  };
}

/**
 * The `view_snapshot` payloads written so far, with their visibility and step.
 *
 * Purpose: The cases compare what was stored without decoding by hand.
 * When to use: After a recording call.
 * Expected outcome: One entry per row, in write order.
 * Exceptions: None.
 */
function viewRows(): { view: string; stepKey: string; visibility: string; snapshot: Record<string, unknown>; seatId: string | null }[] {
  return listMatchEventsOfType(gameDbOps, 'view_snapshot').map((row) => {
    const payload = row.payload as { view: string; seatId: string | null; snapshot: Record<string, unknown> };
    return { view: payload.view, seatId: payload.seatId, stepKey: row.stepKey, visibility: row.visibility, snapshot: payload.snapshot };
  });
}

test('each frame gets an all-sides and a player snapshot, once, with weather and no hex list', () => {
  forgetTurnOwnershipForTests();
  withSeatedTempGameDb('aw-replay-record-', humanMatchOptions(), () => {
    recordStepBoundary(strategicStep(1), '1.0.0');
    recordReplayViewsIfNeeded();
    const first = viewRows();
    assert.deepEqual(first.map((row) => [row.view, row.stepKey, row.visibility]), [
      ['all', 's1', 'engine'],
      ['player', 's1', `seats:${HUMAN_SEAT_ID}`],
    ]);
    for (const row of first) assert.equal('hexes' in row.snapshot, false);
    assert.equal('visibleHexes' in first[0]!.snapshot, false);
    assert.equal('exploredHexes' in first[0]!.snapshot, false);
    assert.equal('staleHexes' in first[0]!.snapshot, false);
    assert.equal('visibleHexes' in first[1]!.snapshot, true);
    const expectedWeather = getGameState().hexes.filter((hex) => hex.weather !== undefined).length;
    assert.ok(expectedWeather > 0);
    assert.equal((first[0]!.snapshot.hexWeather as unknown[]).length, expectedWeather);

    recordReplayViewsIfNeeded();
    assert.equal(viewRows().length, 2);

    gameDbOps.run('UPDATE turn_state SET turn_number = 2 WHERE id = 1');
    recordStepBoundary(strategicStep(2), '1.0.0');
    recordReplayViewsIfNeeded();
    const later = viewRows();
    assert.deepEqual(later.slice(2).map((row) => [row.view, row.stepKey]), [['all', 's2'], ['player', 's2']]);
  });
});

test('a match with no human seat records only the all-sides view', () => {
  forgetTurnOwnershipForTests();
  const regions = largestHomeRegions(2);
  withSeatedTempGameDb('aw-replay-record-ai-', {
    gameMapId: 'global',
    seats: [
      { kind: 'ai', homeRegion: regions[0] },
      { kind: 'ai', homeRegion: regions[1] },
    ],
  }, () => {
    recordStepBoundary(strategicStep(1), '1.0.0');
    recordReplayViewsIfNeeded();
    assert.deepEqual(viewRows().map((row) => row.view), ['all']);
  });
});

test('no machine-local config value reaches a stored snapshot', () => {
  forgetTurnOwnershipForTests();
  withSeatedTempGameDb('aw-replay-record-secret-', humanMatchOptions(), () => {
    // Test value. Not a credential.
    const sentinel = 'SENTINEL-KEY-12345';
    for (const key of MACHINE_LOCAL_CONFIG_KEYS) upsertGameConfigValue(gameDbOps, key, sentinel);
    recordStepBoundary(strategicStep(1), '1.0.0');
    recordReplayViewsIfNeeded();
    const rows = viewRows();
    assert.equal(rows.length, 2);
    for (const row of rows) assert.equal(JSON.stringify(row.snapshot).includes(sentinel), false);
  });
});

test('a resolution view stores its kind and result at the given step, and a null step stores nothing', () => {
  forgetTurnOwnershipForTests();
  withSeatedTempGameDb('aw-replay-record-result-', humanMatchOptions(), () => {
    recordResolutionView(null, 'strategic', { success: true });
    assert.equal(listMatchEventsOfType(gameDbOps, 'resolution_view').length, 0);
    recordResolutionView(strategicStep(3), 'strategic', { success: true, note: '雪' });
    const rows = listMatchEventsOfType(gameDbOps, 'resolution_view');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.stepKey, 's3');
    assert.deepEqual(rows[0]?.payload, { kind: 'strategic', result: { success: true, note: '雪' } });
  });
});

test('the recorder flag turns replay recording off', () => {
  forgetTurnOwnershipForTests();
  withSeatedTempGameDb('aw-replay-record-off-', humanMatchOptions(), () => {
    recordStepBoundary(strategicStep(1), '1.0.0');
    const before = process.env.AGENT_WARS_DISABLE_RECORDER;
    process.env.AGENT_WARS_DISABLE_RECORDER = '1';
    try {
      recordReplayViewsIfNeeded();
      recordResolutionView(strategicStep(1), 'strategic', {});
    } finally {
      if (before === undefined) delete process.env.AGENT_WARS_DISABLE_RECORDER;
      else process.env.AGENT_WARS_DISABLE_RECORDER = before;
    }
    assert.equal(viewRows().length, 0);
    assert.equal(listMatchEventsOfType(gameDbOps, 'resolution_view').length, 0);
  });
});

test('a finished Ready stores its result before the closing frame', async () => {
  forgetTurnOwnershipForTests();
  await withSeatedTempGameDbAsync('aw-replay-record-ready-', humanMatchOptions(), async () => {
    const state = getGameState();
    const deps = {
      getGameState: () => state,
      getGameStateForPlayer: () => state,
      getSelectedModel: () => 'test-model',
      hasKey: () => false,
      getToolNamesForEnabledGroups: () => ['planning'],
      defaultGroupIds: ['planning'],
      appVersion: 'test',
      requestOrders: async () => ({ success: false as const, error: 'not called' }),
      ready: (): ReadyResultMinimal & { success: boolean } => {
        gameDbOps.run('UPDATE turn_state SET turn_number = turn_number + 1 WHERE id = 1');
        return { success: true, aiOrderCount: 0 };
      },
    };
    try {
      const result = await handleGameReady({ enabledToolGroups: ['planning'] }, deps as never);
      assert.equal(result.success, true);
    } finally {
      clearDeferredPlaybackConsultPending();
    }
    const records = listMatchRecords(gameDbOps);
    const resultRow = records.find((row) => row.recordType === 'resolution_view');
    const closingFrame = records.filter((row) => row.kind === 'frame').at(-1);
    assert.ok(resultRow && closingFrame);
    assert.equal(resultRow.stepKey, `s${state.turnNumber}`);
    assert.ok(resultRow.recordId < closingFrame.recordId);
    assert.ok(records.some((row) => row.recordType === 'view_snapshot' && row.recordId > closingFrame.recordId));
  });
});

