/**
 * Region-vs-region end-of-turn win evaluation (control + urban elimination).
 * Run: `node dist/main/gameActions/regionControlWinner.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  listScenarioHomeRegions,
  getScenarioHomeRegionHexes,
  setStrategicInfrastructureForHex,
  dbRun,
} from '../gameDb';
import { ZERO_STRATEGIC_INFRA_COUNTS } from '../testSupport/strategicTestFixtures';
import { withRegionVsRegionTempGameDb } from '../testSupport/withRegionVsRegionTempGameDb';
import { evaluateRegionControlWinnerAtEndOfTurn } from './regionControlWinner';

test('human wins by exclusive full control of AI home region', () => {
  withRegionVsRegionTempGameDb(() => {
    const regions = listScenarioHomeRegions();
    const humanR = regions[0]!;
    const aiR = regions[1] ?? regions[0]!;
    const aiHexes = getScenarioHomeRegionHexes(aiR);
    const humanHexes = getScenarioHomeRegionHexes(humanR);
    for (const h of aiHexes) {
      dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [h, 'human']);
    }
    for (const h of humanHexes) {
      dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [h, 'human']);
    }
    assert.strictEqual(evaluateRegionControlWinnerAtEndOfTurn(), 'human');
  });
});

test('human wins by urban elimination when AI home has zero urban and human home retains urban', () => {
  withRegionVsRegionTempGameDb(() => {
    const regions = listScenarioHomeRegions();
    const humanR = regions[0]!;
    const aiR = regions[1] ?? regions[0]!;
    const aiHexes = getScenarioHomeRegionHexes(aiR);
    const humanHexes = getScenarioHomeRegionHexes(humanR);
    assert.ok(aiHexes.length >= 1);
    assert.ok(humanHexes.length >= 1);
    for (const h of aiHexes) {
      setStrategicInfrastructureForHex(h, ZERO_STRATEGIC_INFRA_COUNTS);
    }
    dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [aiHexes[0]!, 'opponent']);
    for (let i = 1; i < aiHexes.length; i++) {
      dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [aiHexes[i]!, 'human']);
    }
    setStrategicInfrastructureForHex(humanHexes[0]!, { ...ZERO_STRATEGIC_INFRA_COUNTS, urbanHexCount: 1 });
    assert.strictEqual(evaluateRegionControlWinnerAtEndOfTurn(), 'human');
  });
});

test('returns null when both home regions have zero urban and neither side has exclusive full control', () => {
  withRegionVsRegionTempGameDb(() => {
    const regions = listScenarioHomeRegions();
    const humanR = regions[0]!;
    const aiR = regions[1] ?? regions[0]!;
    const aiHexes = getScenarioHomeRegionHexes(aiR);
    const humanHexes = getScenarioHomeRegionHexes(humanR);
    for (const h of [...aiHexes, ...humanHexes]) {
      setStrategicInfrastructureForHex(h, ZERO_STRATEGIC_INFRA_COUNTS);
    }
    const firstAi = aiHexes[0]!;
    for (const h of aiHexes) {
      dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [
        h,
        h === firstAi ? 'opponent' : 'human',
      ]);
    }
    for (const h of humanHexes) {
      dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [h, 'human']);
    }
    assert.strictEqual(evaluateRegionControlWinnerAtEndOfTurn(), null);
  });
});
