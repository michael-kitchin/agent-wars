import { logDebug, logError } from '../logger';
import { getScenarioHomeRegionHexes, resolveScenarioHomeRegions, resolveSideGroupHomeNames } from '../regionScenario';
import type { GuardedDbRunAndGetAllOps } from './dbOps';
import { persistGameSize } from './gameSizeConfig';
import { persistOriginBonusSettings } from './originBonusConfig';
import { parseBonusLevel, type BonusLevel } from '../../shared/bonusLevel';
import { parseGameSize, type GameSize } from '../../shared/gameSize';
import { originBonusSettingsFromLevels } from '../../shared/originBonusRules';
import { logHomeRegionControlParity } from './seeding/initialFlexAirSlot';
import { persistRegionVsRegionScenarioState } from './scenarioState';
import {
  assertRegionalSideGroupsDistinct,
  ensureGameMapLoaded,
  loadedGameMapId,
  requireGameMapId,
} from '../gameMap/loadGameMap';

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
  run('DELETE FROM res_s_control');
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
      run('INSERT INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [row.h3Index, row.solePlayer]);
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
    run('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [h3Index, 'human']);
    forcedHumanControlCount += 1;
  }
  for (const h3Index of aiHomeHexes) {
    if (humanHomeHexes.has(h3Index)) continue;
    run('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [h3Index, 'opponent']);
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
 * New-match choices from the new-game dialog.
 *
 * Purpose: One named shape shared by the `gameDb` facade and this module.
 * When to use: `resetGameForNewMatch` callers.
 * Expected outcome: Every field is optional; see each field for its default.
 * Exceptions: None.
 */
export interface ResetGameForNewMatchOptions {
  /**
   * Whether fog of war is on.
   *
   * Contract: Anything but `false` means on.
   * When to use: The new-game dialog's Fog of war checkbox.
   * Expected outcome: Persisted as `fog_of_war_enabled`.
   * Exceptions: None.
   */
  readonly fogOfWarEnabled?: boolean;
  /**
   * Requested human home region name.
   *
   * Contract: Resolved by `resolveScenarioHomeRegions`; missing or unknown picks a default.
   * When to use: The new-game dialog's region selector.
   * Expected outcome: Persisted in scenario state.
   * Exceptions: None.
   */
  readonly humanHomeRegion?: string;
  /**
   * Requested AI home region name.
   *
   * Contract: Resolved by `resolveScenarioHomeRegions`; missing or unknown picks a default.
   * When to use: The new-game dialog's region selector.
   * Expected outcome: Persisted in scenario state.
   * Exceptions: None.
   */
  readonly aiHomeRegion?: string;
  /**
   * Match size that scales unit caps.
   *
   * Contract: Parsed with `parseGameSize`; missing or invalid means Small.
   * When to use: The new-game dialog's size selector.
   * Expected outcome: Persisted as `game_size`.
   * Exceptions: None.
   */
  readonly gameSize?: GameSize;
  /**
   * How strong the origin bonus is.
   *
   * Contract: Parsed by `parseBonusLevel`; missing or unknown means off, so callers that predate the setting keep the old dice.
   * When to use: The new-game dialog's Origin bonus control.
   * Expected outcome: Persisted as `origin_bonus_enabled` and `origin_bonus_level`.
   * Exceptions: None.
   */
  readonly originBonusLevel?: BonusLevel;
  /**
   * How strong the terrain bonus is.
   *
   * Contract: Parsed by `parseBonusLevel`; missing or unknown means off, so callers that predate the setting keep the old dice.
   * When to use: The new-game dialog's Terrain bonus control.
   * Expected outcome: Persisted as `terrain_bonus_enabled` and `terrain_bonus_level`.
   * Exceptions: None.
   */
  readonly terrainBonusLevel?: BonusLevel;
  /**
   * How strong the weather bonus is.
   *
   * Contract: Parsed by `parseBonusLevel`; missing or unknown means off, so callers that predate the setting keep the old movement and dice.
   * When to use: The new-game dialog's Weather bonus control.
   * Expected outcome: Persisted as `weather_bonus_enabled` and `weather_bonus_level`.
   * Exceptions: None.
   */
  readonly weatherBonusLevel?: BonusLevel;
  /**
   * Calendar month of turn 1.
   *
   * Contract: Parsed by `parseStartMonth`. Missing or invalid means January.
   * When to use: The new-game dialog's start-month control.
   * Expected outcome: Persisted as `start_month`.
   * Exceptions: None.
   */
  readonly startMonth?: number;
  /**
   * How strong the tech bonus is.
   *
   * Contract: Parsed by `parseBonusLevel`; missing or unknown means off, so callers that predate the setting keep the old dice.
   * When to use: The new-game dialog's Tech control.
   * Expected outcome: Persisted as `tech_bonus_enabled` and `tech_bonus_level`.
   * Exceptions: None.
   */
  readonly techBonusLevel?: BonusLevel;
  /**
   * Map to start, or omitted for the global map.
   *
   * Contract: Missing or `global` keeps the world map. A catalog id starts that region.
   * When to use: The Regional tab's Start button.
   * Expected outcome: Persisted as `game_map_id` before hexes are seeded.
   * Exceptions: None.
   */
  readonly gameMapId?: string;
  /**
   * Human side group on a regional map.
   *
   * Contract: Required when `gameMapId` is regional. Ignored for the global map.
   * When to use: The Regional tab's human side selector.
   * Expected outcome: Resolved to that group's display name.
   * Exceptions: None.
   */
  readonly humanSideGroupId?: string;
  /**
   * AI side group on a regional map.
   *
   * Contract: Required when `gameMapId` is regional, and different from the human group.
   * When to use: The Regional tab's AI side selector.
   * Expected outcome: Resolved to that group's display name.
   * Exceptions: None.
   */
  readonly aiSideGroupId?: string;
}

/**
 * Wipes the current match and seeds a new one from the new-game choices.
 *
 * Purpose: The single reset path behind the new-game dialog, so every per-match table and setting starts clean.
 * When to use: Through the `gameDb` facade when the player starts a match.
 * Expected outcome: Persists fog, size, every bonus flag and level (missing levels mean off), and home regions; reseeds
 *   hexes, infrastructure, units, and control; clears orders, AI state, intel, and any tactical session; saves.
 *   No-op apart from logging when there is no database.
 * Exceptions: Propagates SQLite errors from `deps.run`.
 */
export function resetGameForNewMatch(deps: ResetGameDeps, options?: ResetGameForNewMatchOptions): void {
  const fogOfWarEnabled = options?.fogOfWarEnabled !== false;
  const gameSize = parseGameSize(options?.gameSize);
  const originBonusSettings = originBonusSettingsFromLevels({
    origin: parseBonusLevel(options?.originBonusLevel, 'off'),
    terrain: parseBonusLevel(options?.terrainBonusLevel, 'off'),
    weather: parseBonusLevel(options?.weatherBonusLevel, 'off'),
    startMonth: options?.startMonth,
    tech: parseBonusLevel(options?.techBonusLevel, 'off'),
  });
  logDebug('gameDb resetGameForNewMatch', {
    fogOfWarEnabled,
    gameSize,
    ...originBonusSettings,
    gameMapId: options?.gameMapId ?? null,
  });
  if (!deps.hasDb()) return;
  const mapId = requireGameMapId(options?.gameMapId);
  if (mapId !== 'global') {
    assertRegionalSideGroupsDistinct(mapId, options?.humanSideGroupId, options?.aiSideGroupId);
  }
  const previousMapId = loadedGameMapId();
  ensureGameMapLoaded(mapId);
  const { run } = deps;
  try {
  run('BEGIN');
  const homes = mapId === 'global'
    ? resolveScenarioHomeRegions(options)
    : resolveSideGroupHomeNames(options?.humanSideGroupId ?? '', options?.aiSideGroupId ?? '');
  logDebug('gameDb resetGameForNewMatch: map', { mapId, ...homes, previousMapId });
  run('DELETE FROM units');
  run('DELETE FROM hexes');
  run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', ['game_map_id', mapId]);
  run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', ['fog_of_war_enabled', fogOfWarEnabled ? '1' : '0']);
  persistGameSize({ run, hasDb: deps.hasDb }, gameSize);
  persistOriginBonusSettings({ run, hasDb: deps.hasDb }, originBonusSettings);
  persistRegionVsRegionScenarioState({ run }, homes);
  run("DELETE FROM game_config WHERE key = 'game_seed'");
  run("DELETE FROM game_config WHERE key LIKE 'unit_display_sequence_%'");
  // Identifier ordinals may restart at 1 because `DELETE FROM units` already ran above.
  run("DELETE FROM game_config WHERE key LIKE 'unit_id_sequence_%'");
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
  run("DELETE FROM game_config WHERE key = 'tactical_battle_snapshot_json_v1'");
  run('DELETE FROM standing_orders');
  run('DELETE FROM ai_memory');
  run('DELETE FROM player_hex_intel');
  run('DELETE FROM player_unit_intel');
  run('DELETE FROM res_s_control');
  run('DELETE FROM res_s_build_queue');
  run('DELETE FROM res_s_build_progress');
  seedInitialHexControlFromUnitOccupancy(deps);
  seedInitialHexControlFromHomeRegions(deps, homes);
  logHomeRegionControlParity(deps, new Set(getScenarioHomeRegionHexes(homes.humanHomeRegion)), new Set(getScenarioHomeRegionHexes(homes.aiHomeRegion)));
  deps.refreshFogOfWarIntelFromCurrentState();
  run('COMMIT');
  } catch (err) {
    try {
      run('ROLLBACK');
    } catch (rollbackErr) {
      logError('gameDb resetGameForNewMatch: rollback failed', rollbackErr);
    }
    logError('gameDb resetGameForNewMatch: failed after map load', err);
    if (previousMapId && previousMapId !== mapId) {
      try {
        ensureGameMapLoaded(previousMapId);
      } catch (restoreErr) {
        logError('gameDb resetGameForNewMatch: restore failed', restoreErr);
      }
    }
    throw err;
  }
  deps.saveDatabase();
}
