import { clearAttackMixOnNewGame } from '../attackMixReset';
import { logDebug, logError } from '../logger';
import { getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../regionScenario';
import type { GuardedDbRunAndGetAllOps } from './dbOps';
import { persistGameSize } from './gameSizeConfig';
import { persistOriginBonusSettings } from './originBonusConfig';
import { parseBonusLevel, type BonusLevel } from '../../shared/bonusLevel';
import { parseGameSize, type GameSize } from '../../shared/gameSize';
import { originBonusSettingsFromLevels } from '../../shared/originBonusRules';
import { logHomeRegionControlParity } from './seeding/initialFlexAirSlot';
import { persistRegionVsRegionScenarioId } from './scenarioState';
import { replaceSeatRoster } from './seatRosterStore';
import { resolveNewMatchSeats, type ResolvedNewMatchSeat } from './seatResolution';
import { createSeededRng } from '../seededRng';
import { DEFAULT_DOCTRINE, DOCTRINES, type Doctrine, type SeatCommander, type SeatRecord } from '../../shared/seatRoster';
import { victorySettingsForMapKind } from '../../shared/victoryRules';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import {
  ensureGameMapLoaded,
  loadedGameMapId,
  requireGameMapId,
} from '../gameMap/loadGameMap';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';

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
function seedInitialHexControlFromHomeRegions(deps: ResetGameDeps, seats: readonly SeatRecord[]): void {
  const { run } = deps;
  logDebug('gameDb seedInitialHexControlFromHomeRegions', { seatCount: seats.length });
  const ownersByHex = new Map<string, string[]>();
  for (const seat of seats) {
    for (const h3Index of getScenarioHomeRegionHexes(seat.homeRegion)) {
      const owners = ownersByHex.get(h3Index) ?? [];
      owners.push(seat.seatId);
      ownersByHex.set(h3Index, owners);
    }
  }
  let forcedControlCount = 0;
  let sharedHexCount = 0;
  for (const [h3Index, owners] of ownersByHex) {
    if (owners.length !== 1) {
      sharedHexCount += 1;
      continue;
    }
    run('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [h3Index, owners[0]]);
    forcedControlCount += 1;
  }
  logDebug('gameDb seedInitialHexControlFromHomeRegions: done', { forcedControlCount, sharedHexCount });
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
   * Requested length of a global match.
   *
   * Contract: Used only when the map is global. A value outside 20, 30, 40, and 50 becomes 30.
   * When to use: The new-game dialog's turn-limit control.
   * Expected outcome: Stored as `turn_limit`. A regional match stores no turn limit.
   * Exceptions: None.
   */
  readonly turnLimit?: number;
  /**
   * Match seed to store instead of a random one.
   *
   * Contract: A finite number is stored as `game_seed` before units are seeded. Omitted keeps the random seed.
   * When to use: When a start must repeat a doctrine draw. Combat uses the same stored seed.
   * Expected outcome: `seedGameSeedIfMissing` leaves the stored value in place. Each random commander draws from it.
   * Exceptions: None.
   */
  readonly gameSeed?: number;
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
   * One entry per side, in row order.
   *
   * Contract: Each entry is a human or AI seat. Blank homes take the first free listed home.
   * When to use: A start that names two to four sides.
   * Expected outcome: Those sides are the roster. Absent builds one human seat and one AI seat.
   * Exceptions: None.
   */
  readonly seats?: readonly NewGameSeatInput[];
}

/**
 * A human seat and one AI seat when the start did not name sides.
 *
 * Purpose: A reset with no seat list still starts two sides on homes that can hold the opening army.
 * When to use: `resetGameForNewMatch` when `options.seats` is absent.
 * Expected outcome: Global homes are the first two listed regions other than Antarctica. A regional map ignores those names and takes the first two side groups.
 * Exceptions: None. An empty region list leaves the names blank for the resolver.
 */
function defaultTwoSeatInputs(): NewGameSeatInput[] {
  const names = listScenarioHomeRegions();
  const preferred = names.filter((name) => name.trim().toLowerCase() !== 'antarctica');
  const humanHome = preferred[0] ?? names[0] ?? '';
  const aiHome = preferred.find((name) => name !== humanHome)
    ?? names.find((name) => name !== humanHome)
    ?? humanHome;
  logDebug('gameDb defaultTwoSeatInputs', { humanHome, aiHome });
  return [
    { kind: HUMAN_SEAT_ID, homeRegion: humanHome },
    { kind: 'ai', homeRegion: aiHome },
  ];
}

/**
 * Doctrine drawn for one random commander.
 *
 * Purpose: The same match seed and seat order always pick the same doctrine.
 * When to use: After `game_seed` has been stored, once per AI seat whose choice is random.
 * Expected outcome: One of `DOCTRINES`. Balanced is included; the choice stays `'random'`.
 * Exceptions: None.
 */
export function drawDoctrineForSeat(gameSeed: number, seatOrder: number): Doctrine {
  const rng = createSeededRng((gameSeed + seatOrder * 104729) >>> 0);
  const doctrine = DOCTRINES[Math.floor(rng() * DOCTRINES.length)] ?? DEFAULT_DOCTRINE;
  logDebug('gameDb drawDoctrineForSeat', { seatOrder, doctrine });
  return doctrine;
}

/**
 * Stores the drawn doctrine of every random commander.
 *
 * Purpose: The prompt teaches the draw. The choice stays random so the snapshot can hide it until the match is over.
 * When to use: `resetGameForNewMatch`, after the match seed exists.
 * Expected outcome: Each random AI seat's `doctrine` column is the draw. Named choices are left as stored.
 * Exceptions: None. A missing seed draws from 0.
 */
function drawRandomDoctrines(deps: ResetGameDeps): void {
  const rows = deps.getAll<{ value: string }>("SELECT value FROM game_config WHERE key = 'game_seed'");
  const parsed = Number.parseInt(rows[0]?.value ?? '', 10);
  const gameSeed = Number.isNaN(parsed) ? 0 : parsed;
  const seats = deps.getAll<{ seat_id: string; seat_order: number; doctrine_choice: string }>(
    'SELECT seat_id, seat_order, doctrine_choice FROM seats WHERE kind = ? AND doctrine_choice = ?',
    ['ai', 'random']
  );
  logDebug('gameDb drawRandomDoctrines', { gameSeed, count: seats.length });
  for (const seat of seats) {
    const doctrine = drawDoctrineForSeat(gameSeed, seat.seat_order);
    deps.run('UPDATE seats SET doctrine = ? WHERE seat_id = ?', [doctrine, seat.seat_id]);
  }
}

/**
 * Stores the commander for one new AI seat.
 *
 * Purpose: A missing commander stays Balanced with no model. Random stays a choice and plays Balanced until a draw replaces it.
 * When to use: While turning a resolved seat into a roster row.
 * Expected outcome: A `SeatCommander`. The human seat does not call this.
 * Exceptions: None.
 */
function commanderForNewAiSeat(input: NewGameSeatInput['commander'] | null): SeatCommander {
  if (!input) {
    return { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced', doctrine: DEFAULT_DOCTRINE };
  }
  return {
    modelId: input.modelId,
    reasoningEffort: input.reasoningEffort,
    doctrineChoice: input.doctrineChoice,
    doctrine: input.doctrineChoice === 'random' ? DEFAULT_DOCTRINE : input.doctrineChoice,
  };
}

/**
 * Copies a resolved seat into the row that is stored.
 *
 * Purpose: The human row has no commander. Each AI row gets the commander from the input.
 * When to use: After `resolveNewMatchSeats`.
 * Expected outcome: A `SeatRecord` whose outcome fields are still empty.
 * Exceptions: None.
 */
function seatRecordFromResolved(seat: ResolvedNewMatchSeat): SeatRecord {
  const { commanderInput, ...stored } = seat;
  return {
    ...stored,
    commander: seat.kind === HUMAN_SEAT_ID ? null : commanderForNewAiSeat(commanderInput),
  };
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
  clearAttackMixOnNewGame();
  logDebug('gameDb resetGameForNewMatch', {
    fogOfWarEnabled,
    gameSize,
    ...originBonusSettings,
    gameMapId: options?.gameMapId ?? null,
  });
  if (!deps.hasDb()) return;
  const mapId = requireGameMapId(options?.gameMapId);
  const previousMapId = loadedGameMapId();
  ensureGameMapLoaded(mapId);
  const { run } = deps;
  let began = false;
  try {
  const mapKind = mapId === 'global' ? 'global' : 'regional';
  const resolved = resolveNewMatchSeats({
    mapKind,
    seats: options?.seats ?? defaultTwoSeatInputs(),
  }).map(seatRecordFromResolved);
  logDebug('gameDb resetGameForNewMatch: map', {
    mapId,
    previousMapId,
    seatIds: resolved.map((seat) => seat.seatId),
  });
  run('BEGIN');
  began = true;
  run('DELETE FROM units');
  run('DELETE FROM hexes');
  run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', ['game_map_id', mapId]);
  run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', ['fog_of_war_enabled', fogOfWarEnabled ? '1' : '0']);
  const victory = victorySettingsForMapKind(mapKind, options?.turnLimit);
  run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', ['victory_rule', victory.rule]);
  if (victory.turnLimit === null) {
    run("DELETE FROM game_config WHERE key = 'turn_limit'");
  } else {
    run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', ['turn_limit', String(victory.turnLimit)]);
  }
  persistGameSize({ run, hasDb: deps.hasDb }, gameSize);
  persistOriginBonusSettings({ run, hasDb: deps.hasDb }, originBonusSettings);
  persistRegionVsRegionScenarioId({ run });
  run('DELETE FROM seats');
  replaceSeatRoster({ run }, resolved);
  run("DELETE FROM game_config WHERE key = 'game_seed'");
  if (typeof options?.gameSeed === 'number' && Number.isFinite(options.gameSeed)) {
    run("INSERT INTO game_config (key, value) VALUES ('game_seed', ?)", [String(options.gameSeed >>> 0)]);
  }
  run("DELETE FROM game_config WHERE key LIKE 'unit_display_sequence_%'");
  // Identifier ordinals may restart at 1 because `DELETE FROM units` already ran above.
  run("DELETE FROM game_config WHERE key LIKE 'unit_id_sequence_%'");
  deps.seedGameSeedIfMissing();
  drawRandomDoctrines(deps);
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
  run("DELETE FROM game_config WHERE key LIKE 'ai_tool_limit_exceeded_last_turn_%'");
  run('DELETE FROM ai_callback_subscriptions');
  run('DELETE FROM ai_pending_orders');
  run('DELETE FROM ai_combat_since_consultation');
  run('DELETE FROM ai_loss_events_since_consultation');
  run("DELETE FROM game_config WHERE key LIKE 'ai_last_consultation_turn_%'");
  run("DELETE FROM game_config WHERE key LIKE 'fog_new_contacts_%'");
  run("DELETE FROM game_config WHERE key = 'tactical_battle_snapshot_json_v1'");
  run('DELETE FROM standing_orders');
  run('DELETE FROM ai_memory');
  run('DELETE FROM player_hex_intel');
  run('DELETE FROM player_unit_intel');
  run('DELETE FROM res_s_control');
  run('DELETE FROM res_s_build_queue');
  run('DELETE FROM res_s_build_progress');
  seedInitialHexControlFromUnitOccupancy(deps);
  seedInitialHexControlFromHomeRegions(deps, resolved);
  logHomeRegionControlParity(deps, resolved.map((seat) => ({
    seatId: seat.seatId,
    hexes: new Set(getScenarioHomeRegionHexes(seat.homeRegion)),
  })));
  deps.refreshFogOfWarIntelFromCurrentState();
  run('COMMIT');
  } catch (err) {
    if (began) {
      try {
        run('ROLLBACK');
      } catch (rollbackErr) {
        logError('gameDb resetGameForNewMatch: rollback failed', rollbackErr);
      }
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
