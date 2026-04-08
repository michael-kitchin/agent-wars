import { cellToLatLng } from 'h3-js';
import { LATLNG_DECIMAL_PLACES, getOrderedHexList } from '../mapData';
import { computeVisibleHexesForSide } from '../visibility';
import type { BuildUnitType } from '../productionRules';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { logDebug, logTrace } from '../logger';
import type { Res1InfrastructureRow } from './controlInfrastructure';
import type { GuardedDbOps } from './dbOps';
import { getScenarioHomeRegionHexes } from '../regionScenario';
import { loadScenarioState, REGION_VS_REGION_SCENARIO_ID } from './scenarioState';

const STALE_INTEL_TURNS = 2;
const FOG_PLAYERS = ['human', 'opponent'] as const;
const FOG_OF_WAR_ENABLED_KEY = 'fog_of_war_enabled';
type FogDbOps = GuardedDbOps;

interface FogDeps {
  ops: FogDbOps;
  listUnitsForSnapshot: () => GameStateSnapshot['units'];
  listRes1InfrastructureRows: () => Res1InfrastructureRow[];
}

function withFogMetadata(snapshot: GameStateSnapshot, fogOfWarEnabled: boolean): GameStateSnapshot {
  return { ...snapshot, fogOfWarEnabled };
}

function withScenarioMetadata(snapshot: GameStateSnapshot, ops: FogDbOps): GameStateSnapshot {
  const scenario = loadScenarioState(ops);
  if (scenario.scenarioId !== REGION_VS_REGION_SCENARIO_ID) return snapshot;
  const humanHomeRegion = scenario.humanHomeRegion;
  const aiHomeRegion = scenario.aiHomeRegion;
  return {
    ...snapshot,
    scenarioId: 'region_vs_region',
    humanHomeRegion,
    aiHomeRegion,
    humanHomeRegionHexes: getScenarioHomeRegionHexes(humanHomeRegion),
    aiHomeRegionHexes: getScenarioHomeRegionHexes(aiHomeRegion),
  };
}

function isFogOfWarEnabled(ops: FogDbOps): boolean {
  const row = ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [FOG_OF_WAR_ENABLED_KEY]);
  if (!row?.value) return true;
  return row.value !== '0' && row.value.toLowerCase() !== 'false';
}

function getCurrentTurnNumberFromDb(ops: FogDbOps): number {
  const turnRow = ops.getOne<{ turnNumber: number }>('SELECT turn_number AS turnNumber FROM turn_state WHERE id = 1');
  return turnRow?.turnNumber ?? 1;
}

export function getGameStateSnapshot(deps: FogDeps): GameStateSnapshot {
  const { ops } = deps;
  logTrace('getGameState');
  if (!ops.hasDb()) {
    return { hexes: [], units: [], phase: 'planning', turnNumber: 1, pendingOrders: [] };
  }

  const hexCount = ops.getOne<{ c: number }>('SELECT COUNT(*) AS c FROM hexes');
  const hasHexes = !!hexCount && hexCount.c > 0;
  const ordered = hasHexes ? getOrderedHexList() : [];
  const hexRows: { h3Index: string; terrain: string; terrainKind: string }[] = ordered.map((h3Index) => {
    const row = ops.getOne<{ terrain: string; terrain_kind: string }>('SELECT terrain, terrain_kind FROM hexes WHERE h3_index = ?', [h3Index]);
    return { h3Index, terrain: row?.terrain ?? 'land', terrainKind: row?.terrain_kind ?? 'plains' };
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
  const snapshot = {
    hexes: hexRows,
    units: unitRows,
    phase: turnRow?.phase ?? 'planning',
    turnNumber: turnRow?.turnNumber ?? 1,
    pendingOrders: orderRows,
    res1Control: controlRows,
    res1BuildQueueTotals: queueTotalRows,
    res1Infrastructure: infrastructureRows,
    gameOver: gameOver || undefined,
    winner,
  };
  return withFogMetadata(withScenarioMetadata(snapshot, ops), isFogOfWarEnabled(ops));
}

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
  const ownOccupiedHexes = new Set(state.units.filter((u) => u.player === playerId).map((u) => u.h3Index));
  for (const h3 of ownOccupiedHexes) {
    ops.run(`INSERT OR IGNORE INTO player_hex_intel (player_id, h3_index, seen_state, last_seen_turn) VALUES (?, ?, 'visible', ?)`, [playerId, h3, currentTurn]);
  }
  for (const h3 of traversedHexes ?? []) {
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
  const visibleHexList = state.hexes.map((h) => h.h3Index).filter((h3) => visibleHexes.has(h3));
  const exploredRows = ops.getAll<{ h3_index: string }>('SELECT h3_index FROM player_hex_intel WHERE player_id = ?', [playerId]);
  const exploredHexes = new Set(exploredRows.map((r) => r.h3_index));
  const staleHexes = [...exploredHexes].filter((h3) => !visibleHexes.has(h3));
  const filteredHexes = options?.maskUnexploredTerrain === false
    ? state.hexes
    : state.hexes.map((h) => (exploredHexes.has(h.h3Index) ? h : { ...h, terrain: 'unknown', terrainKind: 'unknown' }));
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
