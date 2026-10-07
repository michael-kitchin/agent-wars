import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import { setLoadedStrategicFootprint } from '../shared/loadedStrategicFootprint';
import {
  allocateNextUnitDisplayOrder,
  allocateNextUnitIdOrdinal,
  closeGameDatabaseForTests,
  dbGetAll,
  dbGetOne,
  dbRun,
  isDbReady,
  openGameDatabaseAtPathForTests,
} from './gameDb';
import { persistRegionVsRegionScenarioState } from './gameDb/scenarioState';
import { seedUnits } from './gameDb/seeding/seedUnits';
import { installSideGroupHomes } from './regionScenario';
import type { UnitOrigin } from '../shared/unitOriginTypes';

/**
 * Five distinct resolution-1 cells: two homes and one hex that belongs to neither side.
 *
 * Purpose: Seeding must stay inside the chosen groups.
 * When to use: The fake-pack test.
 * Expected outcome: Human, AI, and outsider cells do not overlap.
 * Exceptions: Throws when H3 cannot find a sea neighbor.
 */
function packCells(): { humanLand: string; humanSea: string; aiLand: string; aiSea: string; outsider: string } {
  const humanLand = latLngToCell(48.8, 2.3, 1);
  const aiLand = latLngToCell(35.6, 139.7, 1);
  const outsider = latLngToCell(0, 20, 1);
  const humanSea = gridDisk(humanLand, 1).find((hex) => hex !== humanLand && hex !== aiLand && hex !== outsider);
  const aiSea = gridDisk(aiLand, 1).find(
    (hex) => hex !== aiLand && hex !== humanLand && hex !== humanSea && hex !== outsider
  );
  if (!humanSea || !aiSea) throw new Error('missing sea hex');
  return { humanLand, humanSea, aiLand, aiSea, outsider };
}

/**
 * Returns a birth origin that records only the spawn hex.
 *
 * Purpose: This test checks spawn hexes, not country lookup.
 * When to use: As `resolveBirthOrigin` while seeding the fake pack.
 * Expected outcome: The other origin fields are empty.
 * Exceptions: None.
 */
function originForHex(h3Index: string): UnitOrigin {
  return {
    birthH3Index: h3Index,
    birthTacticalH3Index: null,
    birthTerrainKind: null,
    birthIsUrban: false,
    birthCountryName: null,
    birthCountryCode: null,
    birthAreaId: null,
    birthAreaName: null,
    birthSubdivisionCode: null,
  };
}

test('units seeded for two side groups stay inside those groups', () => {
  const cells = packCells();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-side-seed-'));
  const filePath = path.join(directory, 'match.sqlite');
  const human = [cells.humanLand, cells.humanSea];
  const ai = [cells.aiLand, cells.aiSea];
  openGameDatabaseAtPathForTests(filePath);
  installSideGroupHomes([
    { id: 'west', displayName: 'West', hexes: human },
    { id: 'east', displayName: 'East', hexes: ai },
  ]);
  setLoadedStrategicFootprint([...human, ...ai, cells.outsider]);
  try {
    const insert = (h3Index: string, terrain: string, terrainKind: string) => {
      dbRun('INSERT INTO hexes (h3_index, terrain, terrain_kind, map_role) VALUES (?, ?, ?, ?)', [
        h3Index,
        terrain,
        terrainKind,
        terrain === 'water' ? 'sea' : 'member_land',
      ]);
    };
    insert(cells.humanLand, 'land', 'plains');
    insert(cells.humanSea, 'water', 'water');
    insert(cells.aiLand, 'land', 'plains');
    insert(cells.aiSea, 'water', 'water');
    insert(cells.outsider, 'land', 'plains');
    persistRegionVsRegionScenarioState({ run: dbRun }, { humanHomeRegion: 'West', aiHomeRegion: 'East' });
    seedUnits({
      run: dbRun,
      getOne: dbGetOne,
      getAll: dbGetAll,
      allocateNextUnitDisplayOrder,
      allocateNextUnitIdOrdinal,
      hasDb: isDbReady,
      resolveBirthOrigin: (_unitId, h3Index) => originForHex(h3Index),
    });
    const rows = dbGetAll<{ h3_index: string; player: string }>('SELECT h3_index, player FROM units');
    assert.ok(rows.length > 0);
    const humanSet = new Set(human);
    const aiSet = new Set(ai);
    for (const row of rows) {
      const allowed = row.player === 'human' ? humanSet : aiSet;
      assert.equal(allowed.has(row.h3_index), true, `${row.player} spawned on ${row.h3_index}`);
      assert.notEqual(row.h3_index, cells.outsider);
    }
  } finally {
    closeGameDatabaseForTests();
    installSideGroupHomes(null);
    setLoadedStrategicFootprint(null);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
