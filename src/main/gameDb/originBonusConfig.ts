/**
 * Persist and read the origin bonus match flags from `game_config`.
 */

import { logDebug, logTrace } from '../logger';
import { ORIGIN_BONUS_OFF } from '../../shared/originBonusRules';
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
 * Writes both origin bonus flags for a new match.
 *
 * Purpose: Every new match records both flags, so one match's choice cannot leak into the next.
 * When to use: `resetGameForNewMatch`, and tests that need a specific setting.
 * Expected outcome: Two upserted rows with `'1'` or `'0'`.
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
}

/**
 * Reads both origin bonus flags for the current match.
 *
 * Purpose: Snapshots and combat resolution need the live flags.
 * When to use: Snapshot assembly and main-process code that resolves dice.
 * Expected outcome: Each flag is true only when its row is exactly `'1'`; a missing database or row reads as off.
 * Exceptions: Missing or unexpected values never throw; SQLite errors from `getOne` propagate.
 */
export function readPersistedOriginBonusSettings(ops: Pick<GameConfigKvDbOps, 'getOne' | 'hasDb'>): OriginBonusSettings {
  logTrace('gameDb readPersistedOriginBonusSettings');
  if (ops.hasDb && !ops.hasDb()) return ORIGIN_BONUS_OFF;
  const isOn = (key: string): boolean =>
    ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [key])?.value === '1';
  return {
    countryBonusEnabled: isOn(COUNTRY_BONUS_CONFIG_KEY),
    terrainBonusEnabled: isOn(TERRAIN_BONUS_CONFIG_KEY),
  };
}
