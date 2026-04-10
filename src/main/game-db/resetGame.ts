import { logDebug } from '../logger';
import { getScenarioHomeRegionHexes, resolveScenarioHomeRegions } from '../regionScenario';
import type { GuardedDbRunAndGetAllOps } from './dbOps';
import { logHomeRegionControlParity } from './seeding/initialFlexAirSlot';
import { persistRegionVsRegionScenarioState } from './scenarioState';

/**
 * Documents the `ResetGameDeps` interface as a named contract surface (interface ResetGameDeps extends GuardedDbRunAndGetAllOps).

 * Purpose: Supports maintainability by documenting why `ResetGameDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface ResetGameDeps extends GuardedDbRunAndGetAllOps {
    /**
   * Specifies the contract for the `clearGameOver` member (clearGameOver: () => void;).

   * Contract: Describes stable behavior for callers of `clearGameOver` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clearGameOver: () => void;
    /**
   * Specifies the contract for the `seedGameSeedIfMissing` member (seedGameSeedIfMissing: () => void;).

   * Contract: Describes stable behavior for callers of `seedGameSeedIfMissing` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seedGameSeedIfMissing: () => void;
    /**
   * Specifies the contract for the `seedHexesFromTerrainMetadata` member (seedHexesFromTerrainMetadata: () => void;).

   * Contract: Describes stable behavior for callers of `seedHexesFromTerrainMetadata` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seedHexesFromTerrainMetadata: () => void;
    /**
   * Specifies the contract for the `seedInfrastructureStateFromMetadata` member (seedInfrastructureStateFromMetadata: () => void;).

   * Contract: Describes stable behavior for callers of `seedInfrastructureStateFromMetadata` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seedInfrastructureStateFromMetadata: () => void;
    /**
   * Specifies the contract for the `seedUnits` member (seedUnits: () => void;).

   * Contract: Describes stable behavior for callers of `seedUnits` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seedUnits: () => void;
    /**
   * Specifies the contract for the `refreshFogOfWarIntelFromCurrentState` member (refreshFogOfWarIntelFromCurrentState: () => void;).

   * Contract: Describes stable behavior for callers of `refreshFogOfWarIntelFromCurrentState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshFogOfWarIntelFromCurrentState: () => void;
    /**
   * Specifies the contract for the `saveDatabase` member (saveDatabase: () => void;).

   * Contract: Describes stable behavior for callers of `saveDatabase` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
saveDatabase: () => void;
}

/**
 * Defines the `seedInitialHexControlFromUnitOccupancy` function shape (function seedInitialHexControlFromUnitOccupancy(deps: ResetGameDeps): void).

 * Purpose: Supports maintainability by documenting why `seedInitialHexControlFromUnitOccupancy` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function seedInitialHexControlFromUnitOccupancy(deps: ResetGameDeps): void {
  const { run, getAll } = deps;
  logDebug('gameDb seedInitialHexControlFromUnitOccupancy');
  run('DELETE FROM res1_control');
  const rows = getAll<{ h3Index: string; distinctPlayers: number; solePlayer: string | null }>(
    `SELECT h3_index AS h3Index,
            COUNT(DISTINCT player) AS distinctPlayers,
            CASE WHEN COUNT(DISTINCT player) = 1 THEN MIN(player) ELSE NULL END AS solePlayer
     FROM units
     WHERE unit_type IN ('infantry', 'armor', 'naval')
     GROUP BY h3_index`
  );
  for (const row of rows) {
    if (row.distinctPlayers === 1 && row.solePlayer) {
      run('INSERT INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [row.h3Index, row.solePlayer]);
    }
  }
}

/**
 * Defines the `seedInitialHexControlFromHomeRegions` function shape (function seedInitialHexControlFromHomeRegions().

 * Purpose: Supports maintainability by documenting why `seedInitialHexControlFromHomeRegions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function seedInitialHexControlFromHomeRegions(
  deps: ResetGameDeps,
  options: { humanHomeRegion: string; aiHomeRegion: string }
): void {
  const { run } = deps;
  const humanHomeHexes = new Set(getScenarioHomeRegionHexes(options.humanHomeRegion));
  const aiHomeHexes = new Set(getScenarioHomeRegionHexes(options.aiHomeRegion));
  let forcedHumanControlCount = 0;
  let forcedOpponentControlCount = 0;
  let intersectingHexCount = 0;

  for (const h3Index of humanHomeHexes) {
    if (aiHomeHexes.has(h3Index)) {
      intersectingHexCount += 1;
      continue;
    }
    run('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [h3Index, 'human']);
    forcedHumanControlCount += 1;
  }
  for (const h3Index of aiHomeHexes) {
    if (humanHomeHexes.has(h3Index)) continue;
    run('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [h3Index, 'opponent']);
    forcedOpponentControlCount += 1;
  }
  logDebug('gameDb seedInitialHexControlFromHomeRegions', {
    humanHomeRegion: options.humanHomeRegion,
    aiHomeRegion: options.aiHomeRegion,
    humanHomeHexCount: humanHomeHexes.size,
    aiHomeHexCount: aiHomeHexes.size,
    forcedHumanControlCount,
    forcedOpponentControlCount,
    intersectingHexCount,
  });
}

/**
 * Defines the `resetGameForNewMatch` function shape (export function resetGameForNewMatch( deps: ResetGameDeps, options?: { fogOfWarEnabled?: boolean; humanHomeRegion?: string; aiHomeRegion?: string } ): vo).

 * Purpose: Supports maintainability by documenting why `resetGameForNewMatch` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resetGameForNewMatch(
  deps: ResetGameDeps,
  options?: { fogOfWarEnabled?: boolean; humanHomeRegion?: string; aiHomeRegion?: string }
): void {
  const fogOfWarEnabled = options?.fogOfWarEnabled !== false;
  const { humanHomeRegion, aiHomeRegion } = resolveScenarioHomeRegions(options);
  logDebug('gameDb resetGameForNewMatch', { fogOfWarEnabled, humanHomeRegion, aiHomeRegion });
  if (!deps.hasDb()) return;
  const { run } = deps;
  run('DELETE FROM units');
  run('DELETE FROM hexes');
  run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('map_size', 'world')");
  run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', ['fog_of_war_enabled', fogOfWarEnabled ? '1' : '0']);
  persistRegionVsRegionScenarioState({ run }, { humanHomeRegion, aiHomeRegion });
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
  seedInitialHexControlFromHomeRegions(deps, { humanHomeRegion, aiHomeRegion });
  logHomeRegionControlParity(deps, new Set(getScenarioHomeRegionHexes(humanHomeRegion)), new Set(getScenarioHomeRegionHexes(aiHomeRegion)));
  deps.refreshFogOfWarIntelFromCurrentState();
  deps.saveDatabase();
}
