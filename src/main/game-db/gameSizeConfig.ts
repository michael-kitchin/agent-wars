/**
 * Persist and read match size from `game_config`.
 */

import type { BuildUnitType } from '../productionRules';
import { logDebug, logTrace } from '../logger';
import { getMaxUnitsPerType, parseGameSize, type GameSize } from '../../shared/gameSize';
import type { GameConfigKvDbOps } from './gameConfigKv';

/**
 * `game_config` key for the match size that scales unit caps.
 *
 * Purpose: Distinct from `map_size` (always `world`) so size and geography keys cannot collide.
 * When to use: `persistGameSize` / `readPersistedGameSize` only.
 * Expected outcome: Stable string `game_size`.
 * Exceptions: None.
 */
export const GAME_SIZE_CONFIG_KEY = 'game_size';

/**
 * Writes a parsed match size into `game_config`.
 *
 * Purpose: Every new match must record a size, including Small, so Medium/Large cannot leak into the next game.
 * When to use: `resetGameForNewMatch` before `seedUnits`.
 * Expected outcome: One upserted row; invalid input stored as `small`.
 * Exceptions: No-op when `hasDb` is present and false.
 */
export function persistGameSize(ops: Pick<GameConfigKvDbOps, 'run'> & { hasDb?: () => boolean }, size: GameSize): void {
  const parsed = parseGameSize(size);
  logDebug('gameDb persistGameSize', { gameSize: parsed });
  if (ops.hasDb && !ops.hasDb()) return;
  ops.run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [GAME_SIZE_CONFIG_KEY, parsed]);
}

/**
 * Reads match size from `game_config`.
 *
 * Purpose: Production, snapshots, and seeding need the live cap multiplier for this match.
 * When to use: Snapshot assembly and any main-process cap check without a snapshot in hand.
 * Expected outcome: Parsed `GameSize`; missing DB, missing row, or garbage → `small`.
 * Exceptions: None; never throws.
 */
export function readPersistedGameSize(ops: GameConfigKvDbOps): GameSize {
  logTrace('gameDb readPersistedGameSize');
  if (ops.hasDb && !ops.hasDb()) return 'small';
  const row = ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [GAME_SIZE_CONFIG_KEY]);
  return parseGameSize(row?.value);
}

/**
 * Live per-type caps for the persisted match size.
 *
 * Purpose: Avoid repeating `getMaxUnitsPerType(readPersistedGameSize(ops))` at production and seeding call sites.
 * When to use: Main-process code that already has `game_config` ops.
 * Expected outcome: Small/Medium/Large cap table for the stored size.
 * Exceptions: None.
 */
export function readPersistedMaxUnitsPerType(ops: GameConfigKvDbOps): Readonly<Record<BuildUnitType, number>> {
  logTrace('gameDb readPersistedMaxUnitsPerType');
  return getMaxUnitsPerType(readPersistedGameSize(ops));
}
