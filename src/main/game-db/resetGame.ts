import { logDebug } from '../logger';
import type { GuardedDbRunAndGetAllOps } from './dbOps';

interface ResetGameDeps extends GuardedDbRunAndGetAllOps {
  clearGameOver: () => void;
  seedGameSeedIfMissing: () => void;
  seedHexesFromTerrainMetadata: () => void;
  seedInfrastructureStateFromMetadata: () => void;
  seedUnits: () => void;
  refreshFogOfWarIntelFromCurrentState: () => void;
  saveDatabase: () => void;
}

function seedInitialHexControlFromUnitOccupancy(deps: ResetGameDeps): void {
  const { run, getAll } = deps;
  logDebug('gameDb seedInitialHexControlFromUnitOccupancy');
  run('DELETE FROM res1_control');
  const rows = getAll<{ h3Index: string; distinctPlayers: number; solePlayer: string | null }>(
    `SELECT h3_index AS h3Index,
            COUNT(DISTINCT player) AS distinctPlayers,
            CASE WHEN COUNT(DISTINCT player) = 1 THEN MIN(player) ELSE NULL END AS solePlayer
     FROM units
     GROUP BY h3_index`
  );
  for (const row of rows) {
    if (row.distinctPlayers === 1 && row.solePlayer) {
      run('INSERT INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [row.h3Index, row.solePlayer]);
    }
  }
}

/**
 * Why this exists:
 *     Re-initializes all runtime game tables for a clean new match with optional fog toggle.
 * When to use:
 *     New-game flow after user confirmation and before returning first planning snapshot.
 * What to expect:
 *     Clears per-match transient state, reseeds map/units/control, refreshes fog intel, and persists immediately.
 */
export function resetGameForNewMatch(deps: ResetGameDeps, options?: { fogOfWarEnabled?: boolean }): void {
  const fogOfWarEnabled = options?.fogOfWarEnabled !== false;
  logDebug('gameDb resetGameForNewMatch', { fogOfWarEnabled });
  if (!deps.hasDb()) return;
  const { run } = deps;
  run('DELETE FROM units');
  run('DELETE FROM hexes');
  run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('map_size', 'world')");
  run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', ['fog_of_war_enabled', fogOfWarEnabled ? '1' : '0']);
  run("DELETE FROM game_config WHERE key = 'game_seed'");
  run("DELETE FROM game_config WHERE key LIKE 'unit_display_sequence_%'");
  deps.seedGameSeedIfMissing();
  deps.seedHexesFromTerrainMetadata();
  deps.seedInfrastructureStateFromMetadata();
  deps.seedUnits();
  run('DELETE FROM pending_orders');
  run('DELETE FROM pending_ranged_orders');
  run('DELETE FROM pending_air_orders');
  run('DELETE FROM pending_ferry_orders');
  run('DELETE FROM unit_transport_assignments');
  run('UPDATE turn_state SET phase = ?, turn_number = 1 WHERE id = 1', ['planning']);
  deps.clearGameOver();
  run('DELETE FROM game_config WHERE key = ?', ['ai_tool_limit_exceeded_last_turn']);
  run('DELETE FROM ai_callback_subscriptions');
  run('DELETE FROM ai_pending_orders');
  run('DELETE FROM ai_combat_since_consultation');
  run('DELETE FROM ai_loss_events_since_consultation');
  run("DELETE FROM game_config WHERE key = 'ai_last_consultation_turn'");
  run("DELETE FROM game_config WHERE key IN ('fog_new_contacts_human', 'fog_new_contacts_opponent')");
  run('DELETE FROM standing_orders');
  run('DELETE FROM ai_memory');
  run('DELETE FROM player_hex_intel');
  run('DELETE FROM player_unit_intel');
  run('DELETE FROM res1_control');
  run('DELETE FROM res1_build_queue');
  run('DELETE FROM res1_build_progress');
  seedInitialHexControlFromUnitOccupancy(deps);
  deps.refreshFogOfWarIntelFromCurrentState();
  deps.saveDatabase();
}
