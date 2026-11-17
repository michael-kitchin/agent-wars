/**
 * Integration contracts for building ships at seaports with and without sea access on the seeded world map.
 * Run with: node dist/main/gameActions/navalSeaAccessProduction.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dbGetOne,
  dbRun,
  getKeepBuildingForHex,
  listBuildQueueRowsForHex,
  replaceBuildQueueForHex,
  setBuildProgressPointsForHex,
  setKeepBuildingForHex,
  setStrategicInfrastructureForHex,
} from '../gameDb';
import {
  addHexBuildQueueEntry,
  applyBuildQueueTemplateToHexes,
  getHexBuildQueue,
  updateHexBuildQueueEntry,
} from '../gameActions';
import { pruneBuildQueueForInfrastructureState } from './airStrikeResolution';
import { processProductionAfterControlResolution } from './controlAndProduction';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { listLandSeaportsBySeaAccess } from '../testSupport/seaAccessFixtures';
import { NAVAL_NO_SEA_ACCESS_REASON } from '../../shared/seaAccess';

/**
 * Gives the human a seaport hex with enough city cells to build ships.
 *
 * Purpose: Each case needs a controlled port with naval-sized production.
 * When to use: Inside `withTempGameDb`, once per case.
 * Expected outcome: `res_s_control` names the human, the hex has 60 urban cells and one seaport, and a human infantry stands there so production may run.
 * Exceptions: None.
 */
function giveHumanPort(h3Index: string): void {
  dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [h3Index, 'human']);
  setStrategicInfrastructureForHex(h3Index, { urbanHexCount: 60, airportCount: 0, seaportCount: 1 });
  dbRun("UPDATE units SET h3_index = ? WHERE id = (SELECT id FROM units WHERE player = 'human' AND unit_type = 'infantry' LIMIT 1)", [h3Index]);
}

/**
 * Counts the human's naval units.
 *
 * Purpose: Production tests compare the count before and after a pass.
 * When to use: Around `processProductionAfterControlResolution`.
 * Expected outcome: The number of rows in `units` for the human with type naval.
 * Exceptions: None.
 */
function humanNavalCount(): number {
  return dbGetOne<{ c: number }>("SELECT COUNT(*) AS c FROM units WHERE player = 'human' AND unit_type = 'naval'")?.c ?? 0;
}

test('naval is offered at a port with sea access and not at one without', () => {
  withTempGameDb('aw-sea-access-prod-', () => {
    const { dry, wet } = listLandSeaportsBySeaAccess();
    giveHumanPort(wet[0]!);
    giveHumanPort(dry[0]!);
    const wetQueue = getHexBuildQueue(wet[0]!, 'human');
    assert.equal(wetQueue.availableUnitTypes.includes('naval'), true);
    const dryQueue = getHexBuildQueue(dry[0]!, 'human');
    assert.equal(dryQueue.availableUnitTypes.includes('naval'), false);
    assert.equal(dryQueue.availableUnitTypes.includes('infantry'), true);
  });
});

test('changing a queue entry to naval at a port without sea access is refused with the reason', () => {
  withTempGameDb('aw-sea-access-prod-', () => {
    const port = listLandSeaportsBySeaAccess().dry[0]!;
    giveHumanPort(port);
    assert.equal(addHexBuildQueueEntry(port, 'human').success, true);
    const entry = getHexBuildQueue(port, 'human').entries[0]!;
    const result = updateHexBuildQueueEntry(port, entry.id, 'naval', 1, 'human');
    assert.equal(result.success, false);
    assert.equal(result.reason, NAVAL_NO_SEA_ACCESS_REASON);
  });
});

test('a naval row queued before the rule still builds, and an air strike keeps it', () => {
  withTempGameDb('aw-sea-access-prod-', () => {
    const port = listLandSeaportsBySeaAccess().dry[0]!;
    giveHumanPort(port);
    replaceBuildQueueForHex(port, [{ unitType: 'naval', remainingCount: 1 }]);
    pruneBuildQueueForInfrastructureState(port);
    assert.equal(listBuildQueueRowsForHex(port).length, 1);
    setBuildProgressPointsForHex(port, 500);
    const before = humanNavalCount();
    processProductionAfterControlResolution();
    assert.equal(humanNavalCount() - before, 1);
  });
});

test('Keep building naval is cleared at a port without sea access', () => {
  withTempGameDb('aw-sea-access-prod-', () => {
    const port = listLandSeaportsBySeaAccess().dry[0]!;
    giveHumanPort(port);
    setBuildProgressPointsForHex(port, 500);
    setKeepBuildingForHex(port, true, 'naval');
    const before = humanNavalCount();
    processProductionAfterControlResolution();
    assert.equal(getKeepBuildingForHex(port).keepBuilding, false);
    assert.equal(humanNavalCount(), before);
  });
});

test('applying a template at a port without sea access keeps its queued naval row and adds no new one', () => {
  withTempGameDb('aw-sea-access-prod-', () => {
    const port = listLandSeaportsBySeaAccess().dry[0]!;
    giveHumanPort(port);
    replaceBuildQueueForHex(port, [
      { unitType: 'naval', remainingCount: 2 },
      { unitType: 'infantry', remainingCount: 1 },
    ]);
    const result = applyBuildQueueTemplateToHexes(
      [port],
      [
        { unitType: 'naval', count: 5 },
        { unitType: 'infantry', count: 3 },
      ],
      'human'
    );
    assert.deepEqual(result.applied, [port]);
    const rows = listBuildQueueRowsForHex(port).map((row) => [row.unitType, row.remainingCount]);
    assert.deepEqual(rows, [
      ['naval', 2],
      ['infantry', 3],
    ]);
  });
});

test('applying a template with naval at a port without sea access and no queued naval adds none', () => {
  withTempGameDb('aw-sea-access-prod-', () => {
    const port = listLandSeaportsBySeaAccess().dry[0]!;
    giveHumanPort(port);
    const result = applyBuildQueueTemplateToHexes([port], [{ unitType: 'naval', count: 1 }], 'human');
    assert.equal(result.skipped[0]?.reason, NAVAL_NO_SEA_ACCESS_REASON);
    assert.equal(listBuildQueueRowsForHex(port).length, 0);
  });
});
