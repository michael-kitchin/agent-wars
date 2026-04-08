/**
 * Contract tests for durable SQLite (better-sqlite3): user_version, persistence across reopen,
 * New Game clears standing_orders and ai_memory, regenerates terrain, corrupt/wrong-version recovery in test mode.
 * Fails fast when the native addon is missing so persistence coverage cannot be silently skipped.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { gridDistance } from 'h3-js';
import { resolveAirStrikePhase } from './game-actions/airStrikeResolution';
import type { AirStrikeTargetType } from '../shared/ipcTypes';
import { AIR_STRIKE_RANGE_HEXES } from '../shared/tacticalRanges';

const INFRASTRUCTURE_SYNC_TRIGGER_NAMES = [
  'res4_sync_res1_after_delete',
  'res4_sync_res1_after_insert',
  'res4_sync_res1_after_update',
] as const;

function betterSqliteNativeAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3');
    const d = new Database(':memory:');
    d.close();
    return true;
  } catch {
    return false;
  }
}

// Database constructor from better-sqlite3 (required dynamically after native check).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function testFreshFileUserVersion(gameDb: typeof import('./gameDb'), Database: any): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.createFreshGameDatabaseAt(p);
    const d = new Database(p);
    gameDb.applyGameDbPragmas(d);
    gameDb.validateGameDatabaseOrThrow(d);
    const uv = d.pragma('user_version', { simple: true }) as number;
    assert.strictEqual(uv, gameDb.EXPECTED_USER_VERSION);
    d.close();
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testPersistenceTwoOpens(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.dbRun("INSERT OR REPLACE INTO game_config (key, value) VALUES ('map_size', 'small')");
    gameDb.closeGameDatabaseForTests();
    gameDb.openGameDatabaseAtPathForTests(p);
    const row = gameDb.dbGetOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'map_size'");
    assert.strictEqual(row?.value, 'small');
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testResetClearsStandingOrdersAndMemory(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.resetGameForNewMatch();
    gameDb.dbRun(
      `INSERT INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES ('opponent', 'opponent-armor-1', 'defend', '{}', NULL, 'holding', 1, '[]')`
    );
    gameDb.dbRun(
      `INSERT INTO ai_memory (player_id, key, content, tier, created_turn, tags) VALUES ('opponent', 'k', 'v', 'stored', 1, '[]')`
    );
    gameDb.resetGameForNewMatch();
    const so = gameDb.dbGetOne<{ c: number }>('SELECT COUNT(*) AS c FROM standing_orders');
    const mem = gameDb.dbGetOne<{ c: number }>('SELECT COUNT(*) AS c FROM ai_memory');
    assert.strictEqual(so?.c ?? -1, 0);
    assert.strictEqual(mem?.c ?? -1, 0);
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testResetRegeneratesTerrain(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.resetGameForNewMatch();
    gameDb.dbRun("UPDATE hexes SET terrain = 'land'");
    gameDb.resetGameForNewMatch();
    const water = gameDb.dbGetOne<{ c: number }>("SELECT COUNT(*) AS c FROM hexes WHERE terrain = 'water'");
    assert.ok((water?.c ?? 0) > 0, 'expected resetGameForNewMatch to reseed terrain with water hexes');
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testResetSeedsInfrastructureState(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.resetGameForNewMatch();
    const infraRows = gameDb.dbGetOne<{ c: number }>('SELECT COUNT(*) AS c FROM res1_infrastructure');
    const featureRows = gameDb.dbGetOne<{ c: number }>('SELECT COUNT(*) AS c FROM res4_feature_overrides');
    assert.ok((infraRows?.c ?? 0) > 0, 'expected resetGameForNewMatch to seed res1 infrastructure rows');
    assert.ok((featureRows?.c ?? 0) > 0, 'expected resetGameForNewMatch to seed res4 feature rows');
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testRendererRes4OverridesIncludeInfrastructureFeatureRows(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.resetGameForNewMatch();
    const rows = gameDb.getRes4TerrainOverridesForRendererFromGame();
    const airportRows = rows.filter((row) => row.isAirport === true).length;
    const seaportRows = rows.filter((row) => row.isSeaport === true).length;
    assert.ok(airportRows > 0, 'expected renderer override payload to include airport feature rows');
    assert.ok(seaportRows > 0, 'expected renderer override payload to include seaport feature rows');
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testSeededUnitsUseRegionalSpawnContracts(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    const regions = gameDb.listScenarioHomeRegions();
    assert.ok(regions.length > 0, 'expected at least one scenario home region');
    const humanRegion = regions[0]!;
    const aiRegion = regions[1] ?? regions[0]!;
    gameDb.resetGameForNewMatch({ humanHomeRegion: humanRegion, aiHomeRegion: aiRegion });
    const rows = gameDb.dbGetAll<{ h3Index: string; player: string; unitType: string; terrain: string; terrainKind: string }>(
      `SELECT u.h3_index AS h3Index, u.player AS player, u.unit_type AS unitType, h.terrain AS terrain, h.terrain_kind AS terrainKind
       FROM units u
       JOIN hexes h ON h.h3_index = u.h3_index`
    );
    assert.ok(rows.length > 0, 'expected resetGameForNewMatch to seed units');
    const humanRegionHexes = new Set(gameDb.getScenarioHomeRegionHexes(humanRegion));
    const aiRegionHexes = new Set(gameDb.getScenarioHomeRegionHexes(aiRegion));
    assert.ok(humanRegionHexes.size > 0, 'expected human region to map to at least one hex');
    assert.ok(aiRegionHexes.size > 0, 'expected AI region to map to at least one hex');
    const passableLandKinds = new Set(['plains', 'mountain', 'wetlands', 'coastal', 'desert', 'forest']);
    for (const row of rows) {
      const expectedRegionHexes = row.player === 'human' ? humanRegionHexes : aiRegionHexes;
      assert.ok(expectedRegionHexes.has(row.h3Index), `expected ${row.player} unit ${row.h3Index} to spawn in selected region`);
      if (row.unitType === 'naval') {
        assert.ok(row.terrain === 'water' || row.terrain === 'coastal', 'expected naval spawn on water/coastal terrain');
      } else if (row.unitType === 'infantry' || row.unitType === 'armor') {
        assert.ok(passableLandKinds.has(row.terrainKind), `expected land unit terrain kind to be passable land, got ${row.terrainKind}`);
      }
    }
    const humanState = gameDb.getGameStateForPlayer('human', { maskUnexploredTerrain: false });
    assert.strictEqual(humanState.scenarioId, 'region_vs_region');
    assert.strictEqual(humanState.humanHomeRegion, humanRegion);
    assert.strictEqual(humanState.aiHomeRegion, aiRegion);
    assert.deepStrictEqual(humanState.humanHomeRegionHexes, gameDb.getScenarioHomeRegionHexes(humanRegion));
    assert.deepStrictEqual(humanState.aiHomeRegionHexes, gameDb.getScenarioHomeRegionHexes(aiRegion));
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testScenarioHomeRegionListIsSortedUnique(gameDb: typeof import('./gameDb')): void {
  const regions = gameDb.listScenarioHomeRegions();
  assert.ok(regions.length > 0, 'expected non-empty scenario home region list');
  const sorted = [...regions].sort((a, b) => a.localeCompare(b));
  assert.deepStrictEqual(regions, sorted, 'expected scenario home regions to be sorted');
  assert.strictEqual(new Set(regions).size, regions.length, 'expected scenario home regions to be unique');
}

function testResetNormalizesInvalidScenarioHomeRegions(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.resetGameForNewMatch({
      humanHomeRegion: 'not-a-real-region',
      aiHomeRegion: '',
    });
    const state = gameDb.getGameStateForPlayer('human', { maskUnexploredTerrain: false });
    const regionOptions = gameDb.listScenarioHomeRegions();
    assert.strictEqual(state.scenarioId, 'region_vs_region');
    assert.ok(typeof state.humanHomeRegion === 'string' && regionOptions.includes(state.humanHomeRegion), 'expected normalized human home region');
    assert.ok(typeof state.aiHomeRegion === 'string' && regionOptions.includes(state.aiHomeRegion), 'expected normalized AI home region');
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testFogOfWarToggleVisibilityContract(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);

    // Fog disabled: human perspective should receive full-board visibility and full enemy roster.
    gameDb.resetGameForNewMatch({ fogOfWarEnabled: false });
    const fullState = gameDb.getGameState();
    const noFogHuman = gameDb.getGameStateForPlayer('human');
    const noFogOpponent = gameDb.getGameStateForPlayer('opponent');
    assert.strictEqual(noFogHuman.hexes.length, fullState.hexes.length);
    assert.strictEqual(noFogHuman.units.length, fullState.units.length);
    assert.strictEqual(noFogOpponent.units.length, fullState.units.length);
    assert.strictEqual(noFogHuman.fogOfWarEnabled, false);
    assert.strictEqual(noFogOpponent.fogOfWarEnabled, false);
    assert.strictEqual(noFogHuman.visibleHexes?.length ?? -1, fullState.hexes.length);
    assert.strictEqual(noFogHuman.exploredHexes?.length ?? -1, fullState.hexes.length);
    assert.strictEqual(noFogHuman.staleHexes?.length ?? -1, 0);

    // Fog enabled: map should still load, but human perspective should not exceed full-map visibility contract.
    gameDb.resetGameForNewMatch({ fogOfWarEnabled: true });
    const fogFullState = gameDb.getGameState();
    const fogHuman = gameDb.getGameStateForPlayer('human');
    const fogOpponent = gameDb.getGameStateForPlayer('opponent');
    assert.strictEqual(fogHuman.hexes.length, fogFullState.hexes.length);
    assert.strictEqual(fogHuman.fogOfWarEnabled, true);
    assert.strictEqual(fogOpponent.fogOfWarEnabled, true);
    assert.ok((fogHuman.visibleHexes?.length ?? 0) <= fogFullState.hexes.length);
    assert.ok((fogHuman.exploredHexes?.length ?? 0) <= fogFullState.hexes.length);
    assert.ok(fogHuman.units.length <= fogFullState.units.length);
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function testWrongUserVersionRecovers(gameDb: typeof import('./gameDb'), Database: any): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.createFreshGameDatabaseAt(p);
    gameDb.closeGameDatabaseForTests();
    const d = new Database(p);
    d.pragma('user_version = 99');
    d.close();
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.closeGameDatabaseForTests();
    const d2 = new Database(p);
    const uv = d2.pragma('user_version', { simple: true }) as number;
    assert.strictEqual(uv, gameDb.EXPECTED_USER_VERSION);
    d2.close();
    const backups = fs.readdirSync(dir).filter((f) => f.includes('.corrupt.'));
    assert.ok(backups.length >= 1, 'expected corrupt backup file');
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function getRes1CountsDerivedFromRes4(
  gameDb: typeof import('./gameDb'),
  h3Index: string
): { urbanHexCount: number; airportCount: number; seaportCount: number } {
  const row = gameDb.dbGetOne<{ urbanHexCount: number; airportCount: number; seaportCount: number }>(
    `SELECT COALESCE(SUM(CASE WHEN is_urban = 1 THEN 1 ELSE 0 END), 0) AS urbanHexCount,
            COALESCE(SUM(CASE WHEN is_airport = 1 THEN 1 ELSE 0 END), 0) AS airportCount,
            COALESCE(SUM(CASE WHEN is_seaport = 1 THEN 1 ELSE 0 END), 0) AS seaportCount
     FROM res4_feature_overrides
     WHERE parent_h3_index = ?`,
    [h3Index]
  );
  return {
    urbanHexCount: row?.urbanHexCount ?? 0,
    airportCount: row?.airportCount ?? 0,
    seaportCount: row?.seaportCount ?? 0,
  };
}

function assertRes1MatchesRes4RollupForHex(gameDb: typeof import('./gameDb'), h3Index: string): void {
  const expected = getRes1CountsDerivedFromRes4(gameDb, h3Index);
  const actual = gameDb.getRes1InfrastructureForHex(h3Index);
  assert.strictEqual(actual.urbanHexCount, expected.urbanHexCount);
  assert.strictEqual(actual.airportCount, expected.airportCount);
  assert.strictEqual(actual.seaportCount, expected.seaportCount);
}

function testOpenExistingDatabaseReconcilesRes1InfrastructureDrift(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.resetGameForNewMatch();
    const target = gameDb.dbGetOne<{ h3Index: string }>(
      `SELECT h3_index AS h3Index
       FROM res1_infrastructure
       WHERE seaport_count > 0 OR airport_count > 0 OR urban_hex_count > 0
       ORDER BY h3_index ASC
       LIMIT 1`
    );
    assert.ok(target?.h3Index, 'expected at least one infrastructure-bearing hex');
    gameDb.dbRun(
      'UPDATE res1_infrastructure SET urban_hex_count = 0, airport_count = 0, seaport_count = 0 WHERE h3_index = ?',
      [target!.h3Index]
    );
    gameDb.closeGameDatabaseForTests();

    gameDb.openGameDatabaseAtPathForTests(p);
    assertRes1MatchesRes4RollupForHex(gameDb, target!.h3Index);
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testRes1InfrastructureStaysInSyncWhenRes4FeaturesChange(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.resetGameForNewMatch();
    const targetRows = [
      gameDb.dbGetOne<{ h3Index: string; parentH3Index: string }>(
        'SELECT h3_index AS h3Index, parent_h3_index AS parentH3Index FROM res4_feature_overrides WHERE is_urban = 1 LIMIT 1'
      ),
      gameDb.dbGetOne<{ h3Index: string; parentH3Index: string }>(
        'SELECT h3_index AS h3Index, parent_h3_index AS parentH3Index FROM res4_feature_overrides WHERE is_airport = 1 LIMIT 1'
      ),
      gameDb.dbGetOne<{ h3Index: string; parentH3Index: string }>(
        'SELECT h3_index AS h3Index, parent_h3_index AS parentH3Index FROM res4_feature_overrides WHERE is_seaport = 1 LIMIT 1'
      ),
    ];
    assert.ok(targetRows[0], 'expected at least one urban res4 feature row');
    assert.ok(targetRows[1], 'expected at least one airport res4 feature row');
    assert.ok(targetRows[2], 'expected at least one seaport res4 feature row');

    gameDb.updateRes4FeatureOverrideRow(targetRows[0]!.h3Index, { isUrban: false, isRubble: true });
    gameDb.updateRes4FeatureOverrideRow(targetRows[1]!.h3Index, { isAirport: false, isRubble: true });
    gameDb.updateRes4FeatureOverrideRow(targetRows[2]!.h3Index, { isSeaport: false, isRubble: true });

    const touchedParents = [...new Set(targetRows.map((row) => row!.parentH3Index))];
    for (const parentH3Index of touchedParents) {
      assertRes1MatchesRes4RollupForHex(gameDb, parentH3Index);
    }
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testOpenExistingDatabaseInstallsInfrastructureSyncTriggers(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.resetGameForNewMatch();
    gameDb.dbRun('DROP TRIGGER IF EXISTS res4_sync_res1_after_insert');
    gameDb.dbRun('DROP TRIGGER IF EXISTS res4_sync_res1_after_delete');
    gameDb.dbRun('DROP TRIGGER IF EXISTS res4_sync_res1_after_update');
    gameDb.closeGameDatabaseForTests();

    gameDb.openGameDatabaseAtPathForTests(p);
    const triggerNames = gameDb.dbGetAll<{ name: string }>(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'trigger'
         AND name IN ('res4_sync_res1_after_insert', 'res4_sync_res1_after_delete', 'res4_sync_res1_after_update')
       ORDER BY name ASC`
    ).map((row) => row.name);
    assert.deepStrictEqual(triggerNames, INFRASTRUCTURE_SYNC_TRIGGER_NAMES);
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function findAirStrikeOriginAndTargetForInfrastructureType(
  gameDb: typeof import('./gameDb'),
  targetType: Exclude<AirStrikeTargetType, 'units'>
): { originH3Index: string; targetH3Index: string } {
  const targetWhereClause =
    targetType === 'urban'
      ? 'urban_hex_count > 0'
      : targetType === 'airport'
        ? 'airport_count > 0'
        : 'seaport_count > 0';
  const targetRows = gameDb.dbGetAll<{ h3Index: string }>(
    `SELECT h3_index AS h3Index
     FROM res1_infrastructure
     WHERE ${targetWhereClause}`
  );
  const originRows = gameDb.dbGetAll<{ h3Index: string }>(
    `SELECT h3_index AS h3Index
     FROM res1_infrastructure
     WHERE airport_count > 0`
  );
  for (const target of targetRows) {
    for (const origin of originRows) {
      try {
        if (gridDistance(origin.h3Index, target.h3Index) <= AIR_STRIKE_RANGE_HEXES) {
          return { originH3Index: origin.h3Index, targetH3Index: target.h3Index };
        }
      } catch {
        // Ignore invalid geometry pairs in tests.
      }
    }
  }
  throw new Error(`expected reachable ${targetType} target from an airport within strike range ${AIR_STRIKE_RANGE_HEXES}`);
}

function testAirStrikeInfrastructureDestructionPreservesRes1Res4Parity(
  gameDb: typeof import('./gameDb'),
  targetType: Exclude<AirStrikeTargetType, 'units'>
): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.resetGameForNewMatch();
    const { originH3Index, targetH3Index } = findAirStrikeOriginAndTargetForInfrastructureType(gameDb, targetType);
    gameDb.dbRun(
      'INSERT OR REPLACE INTO units (id, player, unit_type, h3_index, display_order) VALUES (?, ?, ?, ?, ?)',
      ['human-air-trigger-test', 'human', 'air', originH3Index, 1]
    );

    const next = () => 0;
    const result = resolveAirStrikePhase(
      [
        {
          unitId: 'human-air-trigger-test',
          targetH3Index,
          targetType,
        },
      ],
      next
    );
    const event = result.infrastructureDestroyedEvents.find((entry) => entry.h3Index === targetH3Index && entry.targetType === targetType);
    assert.ok(event, `expected infrastructure destruction event for ${targetType}`);
    assert.ok((event?.changedRubbleCount ?? 0) > 0, `expected rubble changes for ${targetType}`);
    assertRes1MatchesRes4RollupForHex(gameDb, targetH3Index);
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}


function run(): void {
  if (!betterSqliteNativeAvailable()) {
    throw new Error(
      'gameDb.test.ts failed: better-sqlite3 native module missing (run npm run rebuild:native or npm ci with build tools)'
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const gameDb = require('./gameDb') as typeof import('./gameDb');
  testFreshFileUserVersion(gameDb, Database);
  testPersistenceTwoOpens(gameDb);
  testResetClearsStandingOrdersAndMemory(gameDb);
  testResetRegeneratesTerrain(gameDb);
  testResetSeedsInfrastructureState(gameDb);
  testRendererRes4OverridesIncludeInfrastructureFeatureRows(gameDb);
  testScenarioHomeRegionListIsSortedUnique(gameDb);
  testResetNormalizesInvalidScenarioHomeRegions(gameDb);
  testOpenExistingDatabaseReconcilesRes1InfrastructureDrift(gameDb);
  testOpenExistingDatabaseInstallsInfrastructureSyncTriggers(gameDb);
  testRes1InfrastructureStaysInSyncWhenRes4FeaturesChange(gameDb);
  testAirStrikeInfrastructureDestructionPreservesRes1Res4Parity(gameDb, 'urban');
  testAirStrikeInfrastructureDestructionPreservesRes1Res4Parity(gameDb, 'airport');
  testAirStrikeInfrastructureDestructionPreservesRes1Res4Parity(gameDb, 'seaport');
  testSeededUnitsUseRegionalSpawnContracts(gameDb);
  testFogOfWarToggleVisibilityContract(gameDb);
  testWrongUserVersionRecovers(gameDb, Database);
  console.log('gameDb.test.ts passed');
}

run();
