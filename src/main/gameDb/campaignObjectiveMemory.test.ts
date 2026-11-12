/**
 * Campaign objective row: per-seat round trip and a bad entry.
 * Run with: node dist/main/gameDb/campaignObjectiveMemory.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dbGetOne, dbRun } from '../gameDb';
import { upsertGameConfigValue } from './gameConfigRows';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import {
  CAMPAIGN_OBJECTIVES_CONFIG_KEY,
  readCampaignObjectives,
  writeCampaignObjectiveForSeat,
} from './campaignObjectiveMemory';

test('campaign objectives round-trip per seat and tolerate a bad row', () => {
  withTempGameDb('aw-campaign-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    const first = {
      targetH3: 'T1',
      stagingH3: 'S1',
      phase: 'assemble' as const,
      source: 'engine' as const,
      chosenTurn: 4,
    };
    const second = {
      targetH3: 'T2',
      stagingH3: null,
      phase: 'assault' as const,
      source: 'commander' as const,
      chosenTurn: 9,
    };
    writeCampaignObjectiveForSeat(ops, 'a1', first);
    writeCampaignObjectiveForSeat(ops, 'a2', second);
    assert.deepEqual(readCampaignObjectives(ops).get('a1'), first);
    assert.deepEqual(readCampaignObjectives(ops).get('a2'), second);
    writeCampaignObjectiveForSeat(ops, 'a1', null);
    assert.deepEqual([...readCampaignObjectives(ops).keys()], ['a2']);
    upsertGameConfigValue(
      ops,
      CAMPAIGN_OBJECTIVES_CONFIG_KEY,
      '{"a1":{"targetH3":7},"a2":{"targetH3":"T2","stagingH3":null,"phase":"assault","source":"commander","chosenTurn":9}}'
    );
    assert.equal(readCampaignObjectives(ops).has('a1'), false);
    assert.deepEqual(readCampaignObjectives(ops).get('a2'), second);
    upsertGameConfigValue(
      ops,
      CAMPAIGN_OBJECTIVES_CONFIG_KEY,
      '{"a1":{"targetH3":"T","stagingH3":"","phase":"assemble","source":"engine","chosenTurn":1}}'
    );
    assert.equal(readCampaignObjectives(ops).size, 0);
  });
});
