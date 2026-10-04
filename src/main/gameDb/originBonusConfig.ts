/**
 * Persist and read the optional bonus match flags, their levels, and the start month from `game_config`.
 */

import { logDebug, logTrace } from '../logger';
import { parseActiveBonusLevel, type ActiveBonusLevel } from '../../shared/bonusLevel';
import { ORIGIN_BONUS_OFF } from '../../shared/originBonusRules';
import { parseStartMonth } from '../../shared/weatherBonusRules';
import type { OriginBonusSettings } from '../../shared/originBonusTypes';
import type { GameConfigKvDbOps } from './gameConfigKv';

/**
 * `game_config` key for the country bonus flag.
 *
 * Purpose: Frozen persisted key; renaming it would silently turn the flag off in saved matches.
 * When to use: `persistOriginBonusSettings` / `readPersistedOriginBonusSettings` only.
 * Expected outcome: Stable string `country_bonus_enabled` with value `'1'` or `'0'`.
 * Exceptions: None.
 */
export const COUNTRY_BONUS_CONFIG_KEY = 'country_bonus_enabled';

/**
 * `game_config` key for the terrain bonus flag.
 *
 * Purpose: Frozen persisted key; renaming it would silently turn the flag off in saved matches.
 * When to use: `persistOriginBonusSettings` / `readPersistedOriginBonusSettings` only.
 * Expected outcome: Stable string `terrain_bonus_enabled` with value `'1'` or `'0'`.
 * Exceptions: None.
 */
export const TERRAIN_BONUS_CONFIG_KEY = 'terrain_bonus_enabled';

/**
 * `game_config` key for the weather bonus flag.
 *
 * Purpose: Frozen persisted key. A missing row means the flag is off.
 * When to use: `persistOriginBonusSettings` / `readPersistedOriginBonusSettings` only.
 * Expected outcome: Stable string `weather_bonus_enabled` with value `'1'` or `'0'`.
 * Exceptions: None.
 */
export const WEATHER_BONUS_CONFIG_KEY = 'weather_bonus_enabled';

/**
 * `game_config` key for the country bonus level.
 *
 * Purpose: Frozen persisted key. A missing row means low, which is how matches saved before levels existed play.
 * When to use: `persistOriginBonusSettings` / `readPersistedOriginBonusSettings` only.
 * Expected outcome: Stable string `country_bonus_level` with value `'low'` or `'high'`.
 * Exceptions: None.
 */
export const COUNTRY_BONUS_LEVEL_CONFIG_KEY = 'country_bonus_level';

/**
 * `game_config` key for the terrain bonus level.
 *
 * Purpose: Frozen persisted key. A missing row means low, which is how matches saved before levels existed play.
 * When to use: `persistOriginBonusSettings` / `readPersistedOriginBonusSettings` only.
 * Expected outcome: Stable string `terrain_bonus_level` with value `'low'` or `'high'`.
 * Exceptions: None.
 */
export const TERRAIN_BONUS_LEVEL_CONFIG_KEY = 'terrain_bonus_level';

/**
 * `game_config` key for the weather bonus level.
 *
 * Purpose: Frozen persisted key. A missing row means low, which is how matches saved before levels existed play.
 * When to use: `persistOriginBonusSettings` / `readPersistedOriginBonusSettings` only.
 * Expected outcome: Stable string `weather_bonus_level` with value `'low'` or `'high'`.
 * Exceptions: None.
 */
export const WEATHER_BONUS_LEVEL_CONFIG_KEY = 'weather_bonus_level';

/**
 * `game_config` key for the match start month.
 *
 * Purpose: Frozen persisted key. A missing or invalid row means January.
 * When to use: `persistOriginBonusSettings` / `readPersistedOriginBonusSettings` only.
 * Expected outcome: Stable string `start_month` with value `'1'` through `'12'`.
 * Exceptions: None.
 */
export const START_MONTH_CONFIG_KEY = 'start_month';

/**
 * Writes every bonus flag, level, and the start month for a new match.
 *
 * Purpose: Every new match records every row, so one match's choice cannot leak into the next.
 * When to use: `resetGameForNewMatch`, and tests that need a specific setting.
 * Expected outcome: Seven upserted rows: the three flags, the three levels (`'low'` when a level is missing, including for a bonus that is off), and the start month.
 * Exceptions: No-op when `hasDb` is present and false.
 */
export function persistOriginBonusSettings(
  ops: Pick<GameConfigKvDbOps, 'run'> & { hasDb?: () => boolean },
  settings: OriginBonusSettings
): void {
  logDebug('gameDb persistOriginBonusSettings', { ...settings });
  if (ops.hasDb && !ops.hasDb()) return;
  const upsert = 'INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)';
  ops.run(upsert, [COUNTRY_BONUS_CONFIG_KEY, settings.countryBonusEnabled ? '1' : '0']);
  ops.run(upsert, [TERRAIN_BONUS_CONFIG_KEY, settings.terrainBonusEnabled ? '1' : '0']);
  ops.run(upsert, [WEATHER_BONUS_CONFIG_KEY, settings.weatherBonusEnabled === true ? '1' : '0']);
  ops.run(upsert, [COUNTRY_BONUS_LEVEL_CONFIG_KEY, settings.countryBonusLevel ?? 'low']);
  ops.run(upsert, [TERRAIN_BONUS_LEVEL_CONFIG_KEY, settings.terrainBonusLevel ?? 'low']);
  ops.run(upsert, [WEATHER_BONUS_LEVEL_CONFIG_KEY, settings.weatherBonusLevel ?? 'low']);
  ops.run(upsert, [START_MONTH_CONFIG_KEY, String(parseStartMonth(settings.startMonth))]);
}

/**
 * Reads every bonus flag, level, and the start month for the current match.
 *
 * Purpose: Snapshots and combat resolution need the live flags and how strong each one is.
 * When to use: Snapshot assembly and main-process code that resolves dice.
 * Expected outcome: Each flag is true only when its row is exactly `'1'`; a missing database or row reads as off. A level is attached only next to a true flag, and a missing or unknown level row reads as low.
 * Exceptions: Missing or unexpected values never throw; SQLite errors from `getOne` propagate.
 */
export function readPersistedOriginBonusSettings(ops: Pick<GameConfigKvDbOps, 'getOne' | 'hasDb'>): OriginBonusSettings {
  logTrace('gameDb readPersistedOriginBonusSettings');
  if (ops.hasDb && !ops.hasDb()) return ORIGIN_BONUS_OFF;
  const valueOf = (key: string): string | undefined =>
    ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [key])?.value;
  const levelOf = (key: string): ActiveBonusLevel => parseActiveBonusLevel(valueOf(key));
  const countryBonusEnabled = valueOf(COUNTRY_BONUS_CONFIG_KEY) === '1';
  const terrainBonusEnabled = valueOf(TERRAIN_BONUS_CONFIG_KEY) === '1';
  const weatherBonusEnabled = valueOf(WEATHER_BONUS_CONFIG_KEY) === '1';
  return {
    countryBonusEnabled,
    terrainBonusEnabled,
    weatherBonusEnabled,
    ...(countryBonusEnabled ? { countryBonusLevel: levelOf(COUNTRY_BONUS_LEVEL_CONFIG_KEY) } : {}),
    ...(terrainBonusEnabled ? { terrainBonusLevel: levelOf(TERRAIN_BONUS_LEVEL_CONFIG_KEY) } : {}),
    ...(weatherBonusEnabled ? { weatherBonusLevel: levelOf(WEATHER_BONUS_LEVEL_CONFIG_KEY) } : {}),
    startMonth: parseStartMonth(valueOf(START_MONTH_CONFIG_KEY)),
  };
}
