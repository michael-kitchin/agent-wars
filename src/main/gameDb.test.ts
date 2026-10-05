/**
 * Contract tests for durable SQLite (better-sqlite3): user_version, persistence across reopen,
 * New Game clears standing_orders and ai_memory, regenerates terrain, corrupt/wrong-version recovery in test mode.
 * Fails fast when the native addon is missing so persistence coverage cannot be silently skipped.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type Database from 'better-sqlite3';
import { gridDistance } from 'h3-js';
import { resolveAirStrikePhase } from './gameActions/airStrikeResolution';
import { noOriginHitBonus } from './originBonus/originHitBonusLookup';
import { noTerrainCover } from './terrainCover/terrainCoverLookup';
import type { AirStrikeTargetType } from '../shared/ipcTypes';
import { AIR_STRIKE_RANGE_HEXES } from '../shared/tacticalRanges';
import { parseStrategicUnitId } from '../shared/unitIds';

/**
 * Documents the module-scope binding `INFRASTRUCTURE_SYNC_TRIGGER_NAMES` (INFRASTRUCTURE_SYNC_TRIGGER_NAMES).

 * Purpose: Supports maintainability by documenting why `INFRASTRUCTURE_SYNC_TRIGGER_NAMES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const INFRASTRUCTURE_SYNC_TRIGGER_NAMES = [
  'res4_sync_res1_after_delete',
  'res4_sync_res1_after_insert',
  'res4_sync_res1_after_update',
] as const;

/**
 * Defines the `betterSqliteNativeAvailable` function shape (function betterSqliteNativeAvailable(): boolean).

 * Purpose: Supports maintainability by documenting why `betterSqliteNativeAvailable` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function betterSqliteNativeAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqliteDatabase = require('better-sqlite3');
    const d = new sqliteDatabase(':memory:');
    d.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Defines the `testFreshFileUserVersion` function shape (function testFreshFileUserVersion(gameDb: typeof import('./gameDb'), sqliteDatabaseCtor: typeof Database): void).

 * Purpose: Supports maintainability by documenting why `testFreshFileUserVersion` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testFreshFileUserVersion(gameDb: typeof import('./gameDb'), sqliteDatabaseCtor: typeof Database): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.createFreshGameDatabaseAt(p);
    const d = new sqliteDatabaseCtor(p);
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

/**
 * Defines the `testPersistenceTwoOpens` function shape (function testPersistenceTwoOpens(gameDb: typeof import('./gameDb')): void).

 * Purpose: Supports maintainability by documenting why `testPersistenceTwoOpens` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testResetClearsStandingOrdersAndMemory` function shape (function testResetClearsStandingOrdersAndMemory(gameDb: typeof import('./gameDb')): void).

 * Purpose: Supports maintainability by documenting why `testResetClearsStandingOrdersAndMemory` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testResetRegeneratesTerrain` function shape (function testResetRegeneratesTerrain(gameDb: typeof import('./gameDb')): void).

 * Purpose: Supports maintainability by documenting why `testResetRegeneratesTerrain` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testResetSeedsInfrastructureState` function shape (function testResetSeedsInfrastructureState(gameDb: typeof import('./gameDb')): void).

 * Purpose: Supports maintainability by documenting why `testResetSeedsInfrastructureState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testRendererRes4OverridesIncludeInfrastructureFeatureRows` function shape (function testRendererRes4OverridesIncludeInfrastructureFeatureRows(gameDb: typeof import('./gameDb')): void).

 * Purpose: Supports maintainability by documenting why `testRendererRes4OverridesIncludeInfrastructureFeatureRows` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testSeededUnitsUseRegionalSpawnContracts` function shape (function testSeededUnitsUseRegionalSpawnContracts(gameDb: typeof import('./gameDb')): void).

 * Purpose: Supports maintainability by documenting why `testSeededUnitsUseRegionalSpawnContracts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    const rows = gameDb.dbGetAll<{ h3Index: string; player: string; unitType: string; terrain: string; terrainKind: string; id: string }>(
      `SELECT u.id AS id, u.h3_index AS h3Index, u.player AS player, u.unit_type AS unitType, h.terrain AS terrain, h.terrain_kind AS terrainKind
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
      const parsed = parseStrategicUnitId(row.id);
      assert.ok(parsed, `expected compact unit id, got ${row.id}`);
      assert.strictEqual(parsed.player, row.player);
      assert.strictEqual(parsed.unitType, row.unitType);
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

/**
 * Defines the `testScenarioHomeRegionListIsSortedUnique` function shape (function testScenarioHomeRegionListIsSortedUnique(gameDb: typeof import('./gameDb')): void).

 * Purpose: Supports maintainability by documenting why `testScenarioHomeRegionListIsSortedUnique` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testScenarioHomeRegionListIsSortedUnique(gameDb: typeof import('./gameDb')): void {
  const regions = gameDb.listScenarioHomeRegions();
  assert.ok(regions.length > 0, 'expected non-empty scenario home region list');
  const sorted = [...regions].sort((a, b) => a.localeCompare(b));
  assert.deepStrictEqual(regions, sorted, 'expected scenario home regions to be sorted');
  assert.strictEqual(new Set(regions).size, regions.length, 'expected scenario home regions to be unique');
}

/**
 * Defines the `testResetNormalizesInvalidScenarioHomeRegions` function shape (function testResetNormalizesInvalidScenarioHomeRegions(gameDb: typeof import('./gameDb')): void).

 * Purpose: Supports maintainability by documenting why `testResetNormalizesInvalidScenarioHomeRegions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testFogOfWarToggleVisibilityContract` function shape (function testFogOfWarToggleVisibilityContract(gameDb: typeof import('./gameDb')): void).

 * Purpose: Supports maintainability by documenting why `testFogOfWarToggleVisibilityContract` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testHomeRegionVisibilityAndInitialControlContracts` function shape (function testHomeRegionVisibilityAndInitialControlContracts(gameDb: typeof import('./gameDb')): void).

 * Purpose: Supports maintainability by documenting why `testHomeRegionVisibilityAndInitialControlContracts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testHomeRegionVisibilityAndInitialControlContracts(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    const regions = gameDb.listScenarioHomeRegions();
    assert.ok(regions.length > 1, 'expected at least two scenario home regions for control-ownership contract checks');
    const humanHomeRegion = regions[0]!;
    const aiHomeRegion = regions[1]!;
    gameDb.resetGameForNewMatch({
      fogOfWarEnabled: true,
      humanHomeRegion,
      aiHomeRegion,
    });

    const humanState = gameDb.getGameStateForPlayer('human');
    const opponentState = gameDb.getGameStateForPlayer('opponent');
    const humanHomeHexes = new Set(humanState.humanHomeRegionHexes ?? []);
    const aiHomeHexes = new Set(humanState.aiHomeRegionHexes ?? []);
    const intersectingHexes = new Set(humanState.intersectingHomeRegionHexes ?? []);
    const humanVisible = new Set(humanState.visibleHexes ?? []);
    const opponentVisible = new Set(opponentState.visibleHexes ?? []);
    const controlsByHex = gameDb.getHexControlMap();

    for (const h3Index of humanHomeHexes) {
      assert.ok(humanVisible.has(h3Index), `expected human home-region hex to remain visible: ${h3Index}`);
    }
    for (const h3Index of aiHomeHexes) {
      assert.ok(opponentVisible.has(h3Index), `expected opponent home-region hex to remain visible: ${h3Index}`);
    }
    for (const h3Index of intersectingHexes) {
      assert.ok(humanVisible.has(h3Index), `expected intersecting home hex visible to human: ${h3Index}`);
      assert.ok(opponentVisible.has(h3Index), `expected intersecting home hex visible to opponent: ${h3Index}`);
    }

    for (const h3Index of humanHomeHexes) {
      if (aiHomeHexes.has(h3Index)) continue;
      assert.strictEqual(
        controlsByHex.get(h3Index),
        'human',
        `expected non-intersecting human home hex to initialize under human control: ${h3Index}`
      );
    }
    for (const h3Index of aiHomeHexes) {
      if (humanHomeHexes.has(h3Index)) continue;
      assert.strictEqual(
        controlsByHex.get(h3Index),
        'opponent',
        `expected non-intersecting opponent home hex to initialize under opponent control: ${h3Index}`
      );
    }

    const enemyUnitId = gameDb.dbGetOne<{ id: string }>("SELECT id FROM units WHERE player = 'opponent' ORDER BY id LIMIT 1")?.id;
    const forcedVisibleHumanHomeHex = [...humanHomeHexes][0];
    assert.ok(enemyUnitId, 'expected at least one opponent unit for forced-visibility contract');
    assert.ok(forcedVisibleHumanHomeHex, 'expected at least one human home-region hex');
    gameDb.dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [forcedVisibleHumanHomeHex!, enemyUnitId!]);
    gameDb.refreshFogOfWarIntelFromCurrentState();

    const refreshedHumanState = gameDb.getGameStateForPlayer('human');
    assert.ok(
      refreshedHumanState.units.some((unit) => unit.id === enemyUnitId),
      'expected enemy unit on always-visible human home hex to be visible to human player'
    );
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Defines the `testWrongUserVersionRecovers` function shape (function testWrongUserVersionRecovers(gameDb: typeof import('./gameDb'), sqliteDatabaseCtor: typeof Database): void).

 * Purpose: Supports maintainability by documenting why `testWrongUserVersionRecovers` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testWrongUserVersionRecovers(gameDb: typeof import('./gameDb'), sqliteDatabaseCtor: typeof Database): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.createFreshGameDatabaseAt(p);
    gameDb.closeGameDatabaseForTests();
    const d = new sqliteDatabaseCtor(p);
    d.pragma('user_version = 99');
    d.close();
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.closeGameDatabaseForTests();
    const d2 = new sqliteDatabaseCtor(p);
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

/**
 * Defines the `getRes1CountsDerivedFromRes4` function shape (function getRes1CountsDerivedFromRes4( gameDb: typeof import('./gameDb'), h3Index: string ): { urbanHexCount: number; airportCount: number; seaportCount:).

 * Purpose: Supports maintainability by documenting why `getRes1CountsDerivedFromRes4` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `assertRes1MatchesRes4RollupForHex` function shape (function assertRes1MatchesRes4RollupForHex(gameDb: typeof import('./gameDb'), h3Index: string): void).

 * Purpose: Supports maintainability by documenting why `assertRes1MatchesRes4RollupForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function assertRes1MatchesRes4RollupForHex(gameDb: typeof import('./gameDb'), h3Index: string): void {
  const expected = getRes1CountsDerivedFromRes4(gameDb, h3Index);
  const actual = gameDb.getRes1InfrastructureForHex(h3Index);
  assert.strictEqual(actual.urbanHexCount, expected.urbanHexCount);
  assert.strictEqual(actual.airportCount, expected.airportCount);
  assert.strictEqual(actual.seaportCount, expected.seaportCount);
}

/**
 * Defines the `testOpenExistingDatabaseReconcilesRes1InfrastructureDrift` function shape (function testOpenExistingDatabaseReconcilesRes1InfrastructureDrift(gameDb: typeof import('./gameDb')): void).

 * Purpose: Supports maintainability by documenting why `testOpenExistingDatabaseReconcilesRes1InfrastructureDrift` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testRes1InfrastructureStaysInSyncWhenRes4FeaturesChange` function shape (function testRes1InfrastructureStaysInSyncWhenRes4FeaturesChange(gameDb: typeof import('./gameDb')): void).

 * Purpose: Supports maintainability by documenting why `testRes1InfrastructureStaysInSyncWhenRes4FeaturesChange` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testOpenExistingDatabaseInstallsInfrastructureSyncTriggers` function shape (function testOpenExistingDatabaseInstallsInfrastructureSyncTriggers(gameDb: typeof import('./gameDb')): void).

 * Purpose: Supports maintainability by documenting why `testOpenExistingDatabaseInstallsInfrastructureSyncTriggers` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `findAirStrikeOriginAndTargetForInfrastructureType` function shape (function findAirStrikeOriginAndTargetForInfrastructureType( gameDb: typeof import('./gameDb'), targetType: Exclude<AirStrikeTargetType, 'units'> ): { ori).

 * Purpose: Supports maintainability by documenting why `findAirStrikeOriginAndTargetForInfrastructureType` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testAirStrikeInfrastructureDestructionPreservesRes1Res4Parity` function shape (function testAirStrikeInfrastructureDestructionPreservesRes1Res4Parity().

 * Purpose: Supports maintainability by documenting why `testAirStrikeInfrastructureDestructionPreservesRes1Res4Parity` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
      next,
      noOriginHitBonus,
      noTerrainCover
    );
    const event = result.infrastructureDestroyedEvents.find((entry) => entry.h3Index === targetH3Index && entry.targetType === targetType);
    assert.ok(event, `expected infrastructure destruction event for ${targetType}`);
    assert.ok((event?.changedRubbleCount ?? 0) > 0, `expected rubble changes for ${targetType}`);
    assert.deepStrictEqual(
      result.diceRolls.map((r) => [r.kind, r.anchorH3Index]),
      [
        ['airStrike', targetH3Index],
        ['infrastructureCounterFire', targetH3Index],
      ],
      'strike and counter-fire rolls are recorded on the target hex'
    );
    assertRes1MatchesRes4RollupForHex(gameDb, targetH3Index);
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}


/**
 * Verifies that `allocateNextUnitDisplayOrder` maintains independent per-player-per-type counters.
 *
 * Purpose: Regression guard for the fix where a shared counter caused opponent unit I to be labeled
 * "II Infantry" instead of "I Infantry" (human consumed ordinal 1 first).
 * When to use: After changes to `allocateNextUnitDisplayOrder` or `gameConfigKv.ts`.
 * Expected outcome: Human and opponent infantry sequences start at 1 independently; each increments its own counter.
 * Exceptions: None; uses temporary SQLite file under `os.tmpdir()`.
 */
function testUnitDisplayOrderIsIndependentPerPlayer(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-display-order-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    assert.strictEqual(gameDb.allocateNextUnitDisplayOrder('infantry', 'human'), 1, 'first human infantry ordinal must be 1');
    assert.strictEqual(gameDb.allocateNextUnitDisplayOrder('infantry', 'opponent'), 1, 'first opponent infantry ordinal must also start at 1');
    assert.strictEqual(gameDb.allocateNextUnitDisplayOrder('infantry', 'human'), 2, 'second human infantry ordinal must be 2');
    assert.strictEqual(gameDb.allocateNextUnitDisplayOrder('infantry', 'opponent'), 2, 'second opponent infantry ordinal must be 2');
    assert.strictEqual(gameDb.allocateNextUnitDisplayOrder('armor', 'human'), 1, 'human armor counter is independent of infantry');
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Verifies that compact unit-id ordinals stay independent per player and type, and restart on a new match.
 *
 * Purpose: Identifier numbers must not share a counter across sides or types, and a new match must
 * reissue ordinals from 1 after units have been deleted.
 * When to use: After changes to `allocateNextUnitIdOrdinal` or the `unit_id_sequence_%` reset.
 * Expected outcome: Human and opponent infantry start at 1 independently; armor is independent of
 * infantry; `resetGameForNewMatch` returns the next infantry ordinal to 1.
 * Exceptions: None; uses a temporary SQLite file under `os.tmpdir()`.
 */
function testUnitIdOrdinalIsIndependentPerPlayerAndResets(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-unit-id-ordinal-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    assert.strictEqual(gameDb.allocateNextUnitIdOrdinal('infantry', 'human'), 1, 'first human infantry id ordinal must be 1');
    assert.strictEqual(gameDb.allocateNextUnitIdOrdinal('infantry', 'opponent'), 1, 'first opponent infantry id ordinal must also start at 1');
    assert.strictEqual(gameDb.allocateNextUnitIdOrdinal('infantry', 'human'), 2, 'second human infantry id ordinal must be 2');
    assert.strictEqual(gameDb.allocateNextUnitIdOrdinal('infantry', 'opponent'), 2, 'second opponent infantry id ordinal must be 2');
    assert.strictEqual(gameDb.allocateNextUnitIdOrdinal('armor', 'human'), 1, 'human armor id ordinal is independent of infantry');
    gameDb.resetGameForNewMatch();
    const compactHumanInfantry = gameDb
      .dbGetAll<{ id: string }>("SELECT id FROM units WHERE player = 'human' AND unit_type = 'infantry'")
      .filter((row) => row.id.startsWith('h1-i'));
    assert.strictEqual(
      gameDb.allocateNextUnitIdOrdinal('infantry', 'human'),
      compactHumanInfantry.length + 1,
      'new match must restart id ordinals at 1, then continue after any compact infantry already seeded'
    );
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Verifies that compact unit-id ordinal allocation refuses to mint a fallback when the database is closed.
 *
 * Purpose: A hardcoded `1` on a closed handle would collide with existing `units.id` values on the next open.
 * When to use: After changes to `allocateNextUnitIdOrdinalWithOps`.
 * Expected outcome: Throws with a closed-database message.
 * Exceptions: None.
 */
function testAllocateNextUnitIdOrdinalThrowsWhenDatabaseClosed(gameDb: typeof import('./gameDb')): void {
  gameDb.closeGameDatabaseForTests();
  assert.throws(
    () => gameDb.allocateNextUnitIdOrdinal('infantry', 'human'),
    (err: unknown) => err instanceof Error && /not open/.test(err.message)
  );
}

/**
 * Defines the `testRendererRes4OverridesCacheReflectsDbChanges` function shape (function testRendererRes4OverridesCacheReflectsDbChanges(gameDb)).

 * Purpose: Asserts renderer override fetch contract (stable rows when DB unchanged; updated rows after flag mutation).
 * When to use: Regression guard after changes to `res4RendererOverrideCache.ts`.
 * Expected outcome: Consecutive fetches match before mutation; `isRubble` reflects DB update after `updateRes4FeatureOverrideRow`.
 * Exceptions: None; uses temporary SQLite file under `os.tmpdir()`.
 */
function testRendererRes4OverridesCacheReflectsDbChanges(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gamedb-cache-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.resetGameForNewMatch();
    const before = gameDb.getRes4TerrainOverridesForRendererFromGame();
    const again = gameDb.getRes4TerrainOverridesForRendererFromGame();
    assert.deepStrictEqual(before, again, 'unchanged DB must return equivalent rows');
    const target = before.find((row) => row.isUrban && !row.isRubble);
    assert.ok(target, 'expected an urban row to mutate for cache invalidation test');
    gameDb.updateRes4FeatureOverrideRow(target!.h3Index, { isRubble: true });
    const after = gameDb.getRes4TerrainOverridesForRendererFromGame();
    const updated = after.find((row) => row.h3Index === target!.h3Index);
    assert.strictEqual(updated?.isRubble, true, 'DB mutation must appear in subsequent fetch');
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  if (!betterSqliteNativeAvailable()) {
    throw new Error(
      'gameDb.test.ts failed: better-sqlite3 native module missing (run npm run rebuild:native or npm ci with build tools)'
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sqliteDatabase = require('better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const gameDb = require('./gameDb') as typeof import('./gameDb');
  testFreshFileUserVersion(gameDb, sqliteDatabase);
  testPersistenceTwoOpens(gameDb);
  testResetClearsStandingOrdersAndMemory(gameDb);
  testResetRegeneratesTerrain(gameDb);
  testResetSeedsInfrastructureState(gameDb);
  testRendererRes4OverridesIncludeInfrastructureFeatureRows(gameDb);
  testRendererRes4OverridesCacheReflectsDbChanges(gameDb);
  testUnitDisplayOrderIsIndependentPerPlayer(gameDb);
  testUnitIdOrdinalIsIndependentPerPlayerAndResets(gameDb);
  testAllocateNextUnitIdOrdinalThrowsWhenDatabaseClosed(gameDb);
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
  testHomeRegionVisibilityAndInitialControlContracts(gameDb);
  testWrongUserVersionRecovers(gameDb, sqliteDatabase);
  console.log('gameDb.test.ts passed');
}

run();
