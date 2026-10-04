import { cellToLatLng } from 'h3-js';
import { LATLNG_DECIMAL_PLACES, getOrderedHexList } from '../mapData';
import { computeVisibleHexesForSide } from '../visibility';
import type { BuildUnitType } from '../productionRules';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import {
  computeContestedHomeRegionHexes,
  computeIntersectingHomeRegionHexes,
  getForcedVisibleHomeRegionHexesForPlayer,
} from '../../shared/homeRegionRules';
import { logDebug, logTrace } from '../logger';
import type { Res1InfrastructureRow } from './controlInfrastructure';
import type { GuardedDbOps } from './dbOps';
import { getScenarioHomeRegionHexes } from '../regionScenario';
import { loadScenarioState, REGION_VS_REGION_SCENARIO_ID } from './scenarioState';
import { readPersistedGameSize } from './gameSizeConfig';
import { readPersistedOriginBonusSettings } from './originBonusConfig';
import { calendarMonthName, parseStartMonth } from '../../shared/weatherBonusRules';
import { displayWeatherForHex, weatherTagsForBirthHex } from '../weather/weatherPackLoad';
import { getRes1MajorityCountryNamesFromSnapshot } from '../unitOrigin/res4BirthCountryCache';

/**
 * How many turns a last-known enemy position remains visible after contact is lost.
 *
 * Purpose: The prompt's fog-on staleness sentence must quote this number, not a copy of it.
 * When to use: Intel expiry in this module, and `buildIntelStalenessRule` in the prompt spec pack.
 * Expected outcome: A last-known row older than this window is dropped rather than shown as old.
 * Exceptions: None.
 */
export const STALE_INTEL_TURNS = 2;
/**
 * Documents the module-scope binding `FOG_PLAYERS` (FOG_PLAYERS).

 * Purpose: Supports maintainability by documenting why `FOG_PLAYERS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const FOG_PLAYERS = ['human', 'opponent'] as const;
/**
 * Documents the module-scope binding `FOG_OF_WAR_ENABLED_KEY` (FOG_OF_WAR_ENABLED_KEY).

 * Purpose: Supports maintainability by documenting why `FOG_OF_WAR_ENABLED_KEY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const FOG_OF_WAR_ENABLED_KEY = 'fog_of_war_enabled';
/**
 * Documents the `FogDbOps` type alias (type FogDbOps).

 * Purpose: Supports maintainability by documenting why `FogDbOps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type FogDbOps = GuardedDbOps;

/**
 * Documents the `FogDeps` interface as a named contract surface (interface FogDeps).

 * Purpose: Supports maintainability by documenting why `FogDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface FogDeps {
    /**
   * Specifies the contract for the `ops` member (ops: FogDbOps;).

   * Contract: Describes stable behavior for callers of `ops` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ops: FogDbOps;
    /**
   * Specifies the contract for the `listUnitsForSnapshot` member (listUnitsForSnapshot: () => GameStateSnapshot['units'];).

   * Contract: Describes stable behavior for callers of `listUnitsForSnapshot` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
listUnitsForSnapshot: () => GameStateSnapshot['units'];
    /**
   * Specifies the contract for the `listRes1InfrastructureRows` member (listRes1InfrastructureRows: () => Res1InfrastructureRow[];).

   * Contract: Describes stable behavior for callers of `listRes1InfrastructureRows` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
listRes1InfrastructureRows: () => Res1InfrastructureRow[];
}

/**
 * Defines the `withFogMetadata` function shape (function withFogMetadata(snapshot: GameStateSnapshot, fogOfWarEnabled: boolean): GameStateSnapshot).

 * Purpose: Supports maintainability by documenting why `withFogMetadata` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function withFogMetadata(snapshot: GameStateSnapshot, fogOfWarEnabled: boolean): GameStateSnapshot {
  return { ...snapshot, fogOfWarEnabled };
}

/**
 * Defines the `withScenarioMetadata` function shape (function withScenarioMetadata(snapshot: GameStateSnapshot, ops: FogDbOps): GameStateSnapshot).

 * Purpose: Supports maintainability by documenting why `withScenarioMetadata` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function withScenarioMetadata(snapshot: GameStateSnapshot, ops: FogDbOps): GameStateSnapshot {
  const scenario = loadScenarioState(ops);
  if (scenario.scenarioId !== REGION_VS_REGION_SCENARIO_ID) return snapshot;
  const humanHomeRegion = scenario.humanHomeRegion;
  const aiHomeRegion = scenario.aiHomeRegion;
  const humanHomeRegionHexes = getScenarioHomeRegionHexes(humanHomeRegion);
  const aiHomeRegionHexes = getScenarioHomeRegionHexes(aiHomeRegion);
  const intersectingHomeRegionHexes = computeIntersectingHomeRegionHexes(humanHomeRegionHexes, aiHomeRegionHexes);
  const contestedHomeRegionHexes = computeContestedHomeRegionHexes(
    snapshot.units,
    [...humanHomeRegionHexes, ...aiHomeRegionHexes]
  );
  return {
    ...snapshot,
    scenarioId: 'region_vs_region',
    humanHomeRegion,
    aiHomeRegion,
    humanHomeRegionHexes,
    aiHomeRegionHexes,
    intersectingHomeRegionHexes,
    contestedHomeRegionHexes,
  };
}

/**
 * Defines the `isFogOfWarEnabled` function shape (function isFogOfWarEnabled(ops: FogDbOps): boolean).

 * Purpose: Supports maintainability by documenting why `isFogOfWarEnabled` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isFogOfWarEnabled(ops: FogDbOps): boolean {
  const row = ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [FOG_OF_WAR_ENABLED_KEY]);
  if (!row?.value) return true;
  return row.value !== '0' && row.value.toLowerCase() !== 'false';
}

/**
 * Defines the `getCurrentTurnNumberFromDb` function shape (function getCurrentTurnNumberFromDb(ops: FogDbOps): number).

 * Purpose: Supports maintainability by documenting why `getCurrentTurnNumberFromDb` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getCurrentTurnNumberFromDb(ops: FogDbOps): number {
  const turnRow = ops.getOne<{ turnNumber: number }>('SELECT turn_number AS turnNumber FROM turn_state WHERE id = 1');
  return turnRow?.turnNumber ?? 1;
}

/**
 * Builds the unfiltered game-state snapshot from the database.
 *
 * Purpose: The base every player view, AI consultation, and renderer update starts from.
 * When to use: Through `getGameStateForPlayer` for player-facing views; directly only when omniscient state is intended.
 * Expected outcome: All hexes, units, turn, scenario, size, and both origin bonus flags. With the country bonus on,
 *   each hex also carries its majority `countryName` (`null` when it has none).
 * Exceptions: Propagates SQLite errors from `deps.ops`.
 */
export function getGameStateSnapshot(deps: FogDeps): GameStateSnapshot {
  const { ops } = deps;
  logTrace('getGameState');
  if (!ops.hasDb()) {
    return { hexes: [], units: [], phase: 'planning', turnNumber: 1, pendingOrders: [] };
  }

  const hexCount = ops.getOne<{ c: number }>('SELECT COUNT(*) AS c FROM hexes');
  const hasHexes = !!hexCount && hexCount.c > 0;
  const ordered = hasHexes ? getOrderedHexList() : [];
  const originBonusSettings = readPersistedOriginBonusSettings(ops);
  const countryNames = originBonusSettings.countryBonusEnabled ? getRes1MajorityCountryNamesFromSnapshot() : null;
  const hexRows: GameStateSnapshot['hexes'] = ordered.map((h3Index) => {
    const row = ops.getOne<{ terrain: string; terrain_kind: string }>('SELECT terrain, terrain_kind FROM hexes WHERE h3_index = ?', [h3Index]);
    return {
      h3Index,
      terrain: row?.terrain ?? 'land',
      terrainKind: row?.terrain_kind ?? 'plains',
      ...(countryNames ? { countryName: countryNames.get(h3Index) ?? null } : {}),
    };
  });
  const unitRows = deps.listUnitsForSnapshot();
  const turnRow = ops.getOne<{ phase: string; turnNumber: number }>('SELECT phase, turn_number AS turnNumber FROM turn_state WHERE id = 1');
  const orderRows = ops.getAll<{ unitId: string; toH3Index: string }>('SELECT unit_id AS unitId, to_h3_index AS toH3Index FROM pending_orders');
  const gameOverRow = ops.getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'game_over'");
  const winnerRow = ops.getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'winner'");
  const controlRows = ops.getAll<{ h3Index: string; controllerPlayerId: string | null }>(
    'SELECT h3_index AS h3Index, controller_player_id AS controllerPlayerId FROM res1_control'
  );
  const queueTotalRows = ops.getAll<{
    h3Index: string;
    queuedUnits: number;
    nextUnitType: BuildUnitType | null;
    nextRemainingCount: number | null;
    storedPoints: number;
  }>(
    `SELECT q.h3_index AS h3Index,
            COALESCE(SUM(q.remaining_count), 0) AS queuedUnits,
            (
              SELECT qh.unit_type
              FROM res1_build_queue qh
              WHERE qh.h3_index = q.h3_index
              ORDER BY qh.queue_index ASC, qh.id ASC
              LIMIT 1
            ) AS nextUnitType,
            (
              SELECT qh.remaining_count
              FROM res1_build_queue qh
              WHERE qh.h3_index = q.h3_index
              ORDER BY qh.queue_index ASC, qh.id ASC
              LIMIT 1
            ) AS nextRemainingCount,
            COALESCE(
              (
                SELECT p.stored_points
                FROM res1_build_progress p
                WHERE p.h3_index = q.h3_index
              ),
              0
            ) AS storedPoints
     FROM res1_build_queue q
     GROUP BY q.h3_index`
  );
  const infrastructureRows = deps.listRes1InfrastructureRows();
  const gameOver = gameOverRow?.value === '1';
  const winner = winnerRow?.value ?? undefined;
  const weatherOn = originBonusSettings.weatherBonusEnabled === true;
  const startMonth = parseStartMonth(originBonusSettings.startMonth);
  const turnNumber = turnRow?.turnNumber ?? 1;
  const originFlags = {
    countryBonusEnabled: originBonusSettings.countryBonusEnabled,
    terrainBonusEnabled: originBonusSettings.terrainBonusEnabled,
    ...(originBonusSettings.countryBonusEnabled ? { countryBonusLevel: originBonusSettings.countryBonusLevel ?? 'low' } : {}),
    ...(originBonusSettings.terrainBonusEnabled ? { terrainBonusLevel: originBonusSettings.terrainBonusLevel ?? 'low' } : {}),
  };
  const snapshot = {
    hexes: weatherOn
      ? hexRows.map((hex) => ({ ...hex, weather: displayWeatherForHex(hex.h3Index, turnNumber, startMonth) }))
      : hexRows,
    units: weatherOn
      ? unitRows.map((unit) => ({ ...unit, weatherTags: weatherTagsForBirthHex(unit.origin?.birthH3Index) }))
      : unitRows,
    phase: turnRow?.phase ?? 'planning',
    turnNumber,
    pendingOrders: orderRows,
    res1Control: controlRows,
    res1BuildQueueTotals: queueTotalRows,
    res1Infrastructure: infrastructureRows,
    gameOver: gameOver || undefined,
    winner,
    gameSize: readPersistedGameSize(ops),
    ...originFlags,
    ...(weatherOn
      ? {
          weatherBonusEnabled: true as const,
          weatherBonusLevel: originBonusSettings.weatherBonusLevel ?? 'low',
          startMonth,
          monthName: calendarMonthName(turnNumber, startMonth),
        }
      : {}),
  };
  return withFogMetadata(withScenarioMetadata(snapshot, ops), isFogOfWarEnabled(ops));
}

/**
 * Defines the `refreshFogOfWarIntelForPlayer` function shape (function refreshFogOfWarIntelForPlayer( deps: FogDeps, state: GameStateSnapshot, playerId: string, currentTurn: number, traversedHexes: Set<strin).

 * Purpose: Supports maintainability by documenting why `refreshFogOfWarIntelForPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function refreshFogOfWarIntelForPlayer(
  deps: FogDeps,
  state: GameStateSnapshot,
  playerId: string,
  currentTurn: number,
  traversedHexes: Set<string> | undefined
): void {
  const { ops } = deps;
  logDebug('gameDb refreshFogOfWarIntelForPlayer', { playerId, currentTurn });
  const mapHexSet = new Set(state.hexes.map((h) => h.h3Index));
  const visibleHexes = computeVisibleHexesForSide(state, playerId, mapHexSet);
  const forcedVisibleHomeHexes = getForcedVisibleHomeRegionHexesForPlayer(
    state,
    playerId === 'human' ? 'human' : 'opponent',
    mapHexSet
  );
  for (const h3 of forcedVisibleHomeHexes) visibleHexes.add(h3);
  logDebug('gameDb refreshFogOfWarIntelForPlayer: forced home-region visibility', {
    playerId,
    forcedVisibleHexCount: forcedVisibleHomeHexes.size,
  });
  const ownOccupiedHexes = new Set(state.units.filter((u) => u.player === playerId).map((u) => u.h3Index));
  for (const h3 of ownOccupiedHexes) {
    ops.run(`INSERT OR IGNORE INTO player_hex_intel (player_id, h3_index, seen_state, last_seen_turn) VALUES (?, ?, 'visible', ?)`, [playerId, h3, currentTurn]);
  }
  for (const h3 of forcedVisibleHomeHexes) {
    ops.run(`INSERT OR IGNORE INTO player_hex_intel (player_id, h3_index, seen_state, last_seen_turn) VALUES (?, ?, 'visible', ?)`, [playerId, h3, currentTurn]);
    ops.run(`UPDATE player_hex_intel SET seen_state = 'visible', last_seen_turn = ? WHERE player_id = ? AND h3_index = ?`, [currentTurn, playerId, h3]);
  }
  for (const h3 of traversedHexes ?? []) {
    if (!mapHexSet.has(h3)) continue;
    ops.run(`INSERT OR IGNORE INTO player_hex_intel (player_id, h3_index, seen_state, last_seen_turn) VALUES (?, ?, 'visible', ?)`, [playerId, h3, currentTurn]);
    ops.run(`UPDATE player_hex_intel SET seen_state = 'visible', last_seen_turn = ? WHERE player_id = ? AND h3_index = ?`, [currentTurn, playerId, h3]);
  }
  // Persist every hex currently in unit vision disks (armor/naval radius > 1, etc.) so `exploredHexes` drives terrain
  // and production overlays, not only own-occupancy cells and march trajectories.
  for (const h3 of visibleHexes) {
    if (!mapHexSet.has(h3)) continue;
    ops.run(`INSERT OR IGNORE INTO player_hex_intel (player_id, h3_index, seen_state, last_seen_turn) VALUES (?, ?, 'visible', ?)`, [playerId, h3, currentTurn]);
    ops.run(`UPDATE player_hex_intel SET seen_state = 'visible', last_seen_turn = ? WHERE player_id = ? AND h3_index = ?`, [currentTurn, playerId, h3]);
  }
  const exploredRows = ops.getAll<{ h3_index: string; last_seen_turn: number | null }>('SELECT h3_index, last_seen_turn FROM player_hex_intel WHERE player_id = ?', [playerId]);
  for (const row of exploredRows) {
    if (visibleHexes.has(row.h3_index)) ops.run(`UPDATE player_hex_intel SET seen_state = 'visible', last_seen_turn = ? WHERE player_id = ? AND h3_index = ?`, [currentTurn, playerId, row.h3_index]);
    else ops.run(`UPDATE player_hex_intel SET seen_state = 'stale' WHERE player_id = ? AND h3_index = ?`, [playerId, row.h3_index]);
  }
  const enemyUnits = state.units.filter((u) => u.player !== playerId);
  const enemyById = new Map(enemyUnits.map((u) => [u.id, u]));
  const existingIntelRows = ops.getAll<{ enemy_unit_id: string }>('SELECT enemy_unit_id FROM player_unit_intel WHERE player_id = ?', [playerId]);
  const existingIntelIds = new Set(existingIntelRows.map((r) => r.enemy_unit_id));
  const newContactIds: string[] = [];
  const currentEnemyHexes = new Set<string>();
  for (const enemy of enemyUnits) {
    if (!visibleHexes.has(enemy.h3Index)) continue;
    if (!existingIntelIds.has(enemy.id)) newContactIds.push(enemy.id);
    currentEnemyHexes.add(enemy.h3Index);
    ops.run(
      `INSERT INTO player_unit_intel (player_id, enemy_unit_id, last_known_h3_index, intel_state, last_seen_turn, stale_until_turn)
       VALUES (?, ?, ?, 'current', ?, ?)
       ON CONFLICT(player_id, enemy_unit_id) DO UPDATE SET
         last_known_h3_index = excluded.last_known_h3_index,
         intel_state = 'current',
         last_seen_turn = excluded.last_seen_turn,
         stale_until_turn = excluded.stale_until_turn`,
      [playerId, enemy.id, enemy.h3Index, currentTurn, currentTurn + STALE_INTEL_TURNS]
    );
  }
  const intelRows = ops.getAll<{ enemy_unit_id: string; last_known_h3_index: string; stale_until_turn: number | null }>(
    'SELECT enemy_unit_id, last_known_h3_index, stale_until_turn FROM player_unit_intel WHERE player_id = ?',
    [playerId]
  );
  for (const row of intelRows) {
    const enemy = enemyById.get(row.enemy_unit_id);
    if (enemy && visibleHexes.has(enemy.h3Index)) continue;
    if (currentEnemyHexes.has(row.last_known_h3_index)) {
      ops.run('DELETE FROM player_unit_intel WHERE player_id = ? AND enemy_unit_id = ?', [playerId, row.enemy_unit_id]);
      continue;
    }
    if (visibleHexes.has(row.last_known_h3_index) && (!enemy || enemy.h3Index !== row.last_known_h3_index)) {
      ops.run('DELETE FROM player_unit_intel WHERE player_id = ? AND enemy_unit_id = ?', [playerId, row.enemy_unit_id]);
      continue;
    }
    const staleUntil = row.stale_until_turn ?? Number.MIN_SAFE_INTEGER;
    if (currentTurn > staleUntil) {
      ops.run('DELETE FROM player_unit_intel WHERE player_id = ? AND enemy_unit_id = ?', [playerId, row.enemy_unit_id]);
      continue;
    }
    ops.run(`UPDATE player_unit_intel SET intel_state = 'stale' WHERE player_id = ? AND enemy_unit_id = ?`, [playerId, row.enemy_unit_id]);
  }
  ops.run(`INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)`, [`fog_new_contacts_${playerId}`, JSON.stringify(newContactIds)]);
}

/**
 * Defines the `refreshFogOfWarIntelFromCurrentState` function shape (export function refreshFogOfWarIntelFromCurrentState( deps: FogDeps, options?: { traversedHexesByPlayer?: Partial<Record<'human' | 'opponent', string[]>>).

 * Purpose: Supports maintainability by documenting why `refreshFogOfWarIntelFromCurrentState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function refreshFogOfWarIntelFromCurrentState(
  deps: FogDeps,
  options?: { traversedHexesByPlayer?: Partial<Record<'human' | 'opponent', string[]>> }
): void {
  const { ops } = deps;
  logDebug('gameDb refreshFogOfWarIntelFromCurrentState', {
    humanTraversed: options?.traversedHexesByPlayer?.human?.length ?? 0,
    opponentTraversed: options?.traversedHexesByPlayer?.opponent?.length ?? 0,
  });
  if (!ops.hasDb()) return;
  if (!isFogOfWarEnabled(ops)) {
    ops.run('DELETE FROM player_hex_intel');
    ops.run('DELETE FROM player_unit_intel');
    ops.run("DELETE FROM game_config WHERE key IN ('fog_new_contacts_human', 'fog_new_contacts_opponent')");
    return;
  }
  const state = getGameStateSnapshot(deps);
  const currentTurn = getCurrentTurnNumberFromDb(ops);
  for (const playerId of FOG_PLAYERS) {
    refreshFogOfWarIntelForPlayer(deps, state, playerId, currentTurn, new Set(options?.traversedHexesByPlayer?.[playerId] ?? []));
  }
}

/**
 * Defines the `consumeFogNewContactsForPlayer` function shape (export function consumeFogNewContactsForPlayer(ops: FogDbOps, playerId: 'human' | 'opponent'): string[]).

 * Purpose: Supports maintainability by documenting why `consumeFogNewContactsForPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function consumeFogNewContactsForPlayer(ops: FogDbOps, playerId: 'human' | 'opponent'): string[] {
  logDebug('gameDb consumeFogNewContactsForPlayer', { playerId });
  if (!ops.hasDb()) return [];
  const key = `fog_new_contacts_${playerId}`;
  const row = ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [key]);
  ops.run('DELETE FROM game_config WHERE key = ?', [key]);
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Defines the `getGameStateForPlayer` function shape (export function getGameStateForPlayer( deps: FogDeps, playerId: 'human' | 'opponent', options?: { maskUnexploredTerrain?: boolean } ): GameStateSnapsh).

 * Purpose: Supports maintainability by documenting why `getGameStateForPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getGameStateForPlayer(
  deps: FogDeps,
  playerId: 'human' | 'opponent',
  options?: { maskUnexploredTerrain?: boolean }
): GameStateSnapshot {
  const { ops } = deps;
  logTrace('gameDb getGameStateForPlayer', { playerId });
  const state = getGameStateSnapshot(deps);
  const fogEnabled = isFogOfWarEnabled(ops);
  if (!ops.hasDb()) return withFogMetadata({ ...state, playerPerspective: playerId }, fogEnabled);
  if (!fogEnabled) {
    const allHexes = state.hexes.map((h) => h.h3Index);
    const enemyIntel = state.units.filter((u) => u.player !== playerId).map((u) => {
      const [lat, lng] = cellToLatLng(u.h3Index);
      return {
        unitId: u.id,
        lastKnownH3Index: u.h3Index,
        lastKnownLatLng: [Number(lat.toFixed(LATLNG_DECIMAL_PLACES)), Number(lng.toFixed(LATLNG_DECIMAL_PLACES))] as [number, number],
        intelState: 'current' as const,
        lastSeenTurn: state.turnNumber,
        staleUntilTurn: state.turnNumber + STALE_INTEL_TURNS,
      };
    });
    return withFogMetadata({ ...state, visibleHexes: allHexes, exploredHexes: allHexes, staleHexes: [], enemyIntel, playerPerspective: playerId }, false);
  }
  const mapHexSet = new Set(state.hexes.map((h) => h.h3Index));
  const visibleHexes = computeVisibleHexesForSide(state, playerId, mapHexSet);
  const forcedVisibleHomeHexes = getForcedVisibleHomeRegionHexesForPlayer(state, playerId, mapHexSet);
  for (const h3 of forcedVisibleHomeHexes) visibleHexes.add(h3);
  const visibleHexList = state.hexes.map((h) => h.h3Index).filter((h3) => visibleHexes.has(h3));
  const exploredRows = ops.getAll<{ h3_index: string }>('SELECT h3_index FROM player_hex_intel WHERE player_id = ?', [playerId]);
  const exploredHexes = new Set(exploredRows.map((r) => r.h3_index));
  for (const h3 of forcedVisibleHomeHexes) exploredHexes.add(h3);
  const staleHexes = [...exploredHexes].filter((h3) => !visibleHexes.has(h3));
  const filteredHexes = options?.maskUnexploredTerrain === false
    ? state.hexes
    : state.hexes.map((h) => {
        if (exploredHexes.has(h.h3Index)) return h;
        const hidden = { ...h, terrain: 'unknown' as const, terrainKind: 'unknown' };
        delete hidden.weather;
        return hidden;
      });
  const filteredUnits = state.units.filter((u) => u.player === playerId || visibleHexes.has(u.h3Index));
  const intelRows = ops.getAll<{
    enemy_unit_id: string;
    last_known_h3_index: string;
    intel_state: 'current' | 'stale';
    last_seen_turn: number;
    stale_until_turn: number;
  }>(
    `SELECT enemy_unit_id, last_known_h3_index, intel_state, last_seen_turn, stale_until_turn
     FROM player_unit_intel WHERE player_id = ? ORDER BY enemy_unit_id`,
    [playerId]
  );
  const enemyIntel = intelRows.map((row) => {
    const [lat, lng] = cellToLatLng(row.last_known_h3_index);
    return {
      unitId: row.enemy_unit_id,
      lastKnownH3Index: row.last_known_h3_index,
      lastKnownLatLng: [Number(lat.toFixed(LATLNG_DECIMAL_PLACES)), Number(lng.toFixed(LATLNG_DECIMAL_PLACES))] as [number, number],
      intelState: row.intel_state,
      lastSeenTurn: row.last_seen_turn,
      staleUntilTurn: row.stale_until_turn,
    };
  });
  return withFogMetadata({
    ...state,
    hexes: filteredHexes,
    units: filteredUnits,
    visibleHexes: visibleHexList,
    exploredHexes: [...exploredHexes],
    staleHexes,
    enemyIntel,
    playerPerspective: playerId,
  }, true);
}
