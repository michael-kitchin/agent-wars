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
  writeCampaignLiftCancelledTurn,
  writeCampaignLiftLaunchedTurn,
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

test('a sea objective round-trips and an older row reads back without the new fields', () => {
  withTempGameDb('aw-campaign-memory-sea-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    const sea = {
      targetH3: 'T1',
      stagingH3: null,
      phase: 'assault' as const,
      source: 'engine' as const,
      chosenTurn: 4,
      approach: 'sea' as const,
      liftLaunchedTurn: 7,
      liftCancelledTurn: 8,
      skippedTargetH3: 'T0',
      skippedTurn: 3,
    };
    writeCampaignObjectiveForSeat(ops, 'a1', sea);
    assert.deepEqual(readCampaignObjectives(ops).get('a1'), sea);
    upsertGameConfigValue(
      ops,
      CAMPAIGN_OBJECTIVES_CONFIG_KEY,
      '{"a1":{"targetH3":"T","stagingH3":null,"phase":"assault","source":"engine","chosenTurn":1}}'
    );
    assert.deepEqual(Object.keys(readCampaignObjectives(ops).get('a1') ?? {}).sort(), [
      'chosenTurn',
      'phase',
      'source',
      'stagingH3',
      'targetH3',
    ]);
  });
});

test('an unknown approach or a half-written skip drops the entry', () => {
  withTempGameDb('aw-campaign-memory-bad-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    const base = '"targetH3":"T","stagingH3":null,"phase":"assault","source":"engine","chosenTurn":1';
    upsertGameConfigValue(ops, CAMPAIGN_OBJECTIVES_CONFIG_KEY, `{"a1":{${base},"approach":"air"}}`);
    assert.equal(readCampaignObjectives(ops).size, 0);
    upsertGameConfigValue(ops, CAMPAIGN_OBJECTIVES_CONFIG_KEY, `{"a1":{${base},"skippedTargetH3":"S"}}`);
    assert.equal(readCampaignObjectives(ops).size, 0);
  });
});

test('the lift launch turn is written for one seat and leaves the others alone', () => {
  withTempGameDb('aw-campaign-memory-lift-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    const row = { targetH3: 'T', stagingH3: null, phase: 'assault' as const, source: 'engine' as const, chosenTurn: 1 };
    writeCampaignObjectiveForSeat(ops, 'a1', row);
    writeCampaignObjectiveForSeat(ops, 'a2', row);
    writeCampaignLiftLaunchedTurn(ops, 'a1', 9);
    assert.equal(readCampaignObjectives(ops).get('a1')?.liftLaunchedTurn, 9);
    assert.deepEqual(readCampaignObjectives(ops).get('a2'), row);
    writeCampaignLiftLaunchedTurn(ops, 'a3', 9);
    assert.equal(readCampaignObjectives(ops).has('a3'), false);
  });
});

test('the lift cancel turn is written only for the cancelled target and a bad one drops the entry', () => {
  withTempGameDb('aw-campaign-memory-cancel-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    const row = { targetH3: 'T', stagingH3: null, phase: 'assault' as const, source: 'engine' as const, chosenTurn: 1 };
    writeCampaignObjectiveForSeat(ops, 'a1', row);
    writeCampaignObjectiveForSeat(ops, 'a2', row);
    writeCampaignLiftCancelledTurn(ops, 'a1', 12, 'T');
    writeCampaignLiftCancelledTurn(ops, 'a2', 12, 'OTHER');
    assert.deepEqual(readCampaignObjectives(ops).get('a1'), { ...row, liftCancelledTurn: 12 });
    assert.deepEqual(readCampaignObjectives(ops).get('a2'), row);
    const base = '"targetH3":"T","stagingH3":null,"phase":"assault","source":"engine","chosenTurn":1';
    upsertGameConfigValue(ops, CAMPAIGN_OBJECTIVES_CONFIG_KEY, `{"a1":{${base},"liftCancelledTurn":"soon"}}`);
    assert.equal(readCampaignObjectives(ops).size, 0);
  });
});
