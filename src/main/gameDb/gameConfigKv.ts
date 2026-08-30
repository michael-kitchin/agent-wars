/**
 * `game_config` key/value helpers shared by game seeding, display-order allocation, and game-over flags.
 */

import type { BuildUnitType } from '../productionRules';
import { logDebug, logError, logTrace } from '../logger';

/**
 * Minimal DB surface for `game_config` reads and writes without importing `gameDb.ts`.
 *
 * Contract: `run`/`getOne` must target the same SQLite file as the active game session.
 * When to use: Passed from `gameDb` closures that already hold validated `db` handles.
 * Expected outcome: Mutations persist immediately (auto-commit) matching legacy `gameDb` behavior.
 * Exceptions: None; callers must ensure `hasDb` reflects connection lifetime when provided.
 */
export type GameConfigKvDbOps = {
  hasDb?: () => boolean;
  run: (sql: string, params?: unknown[]) => void;
  getOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T | undefined;
};

/**
 * Builds the `game_config` key used to monotonically allocate per-player-per-type unit display order.
 *
 * Purpose: Keeps the key naming scheme centralized for tests and migrations.
 * When to use: From `allocateNextUnitDisplayOrderWithOps` only.
 * Expected outcome: Stable string keys `unit_display_sequence_<player>_<unitType>`, one sequence per side per type.
 * Exceptions: None.
 */
function unitDisplaySequenceKey(unitType: BuildUnitType, player: string): string {
  return `unit_display_sequence_${player}_${unitType}`;
}

/**
 * Builds the `game_config` key used to monotonically allocate compact unit-id ordinals.
 *
 * Purpose: Keeps identifier numbering independent of `display_order` so a display-order bug
 * cannot mint a duplicate primary key.
 * When to use: From `allocateNextUnitIdOrdinalWithOps` only.
 * Expected outcome: Stable keys `unit_id_sequence_<player>_<unitType>`, one sequence per side per type.
 * Exceptions: None.
 */
function unitIdSequenceKey(unitType: BuildUnitType, player: string): string {
  return `unit_id_sequence_${player}_${unitType}`;
}

/**
 * Inserts a random `game_seed` row when missing so combat RNG stays deterministic per match.
 *
 * Purpose: Extracted from `gameDb.seedGameSeedIfMissing` without changing SQL or randomness source.
 * When to use: During `resetGameForNewMatch` and first-open paths that call the façade helper.
 * Expected outcome: No-op when a row already exists; otherwise inserts a 31-bit seed string.
 * Exceptions: None.
 */
export function seedGameSeedIfMissingWithOps(ops: GameConfigKvDbOps): void {
  logDebug('gameDb seedGameSeedIfMissingWithOps', {});
  if (ops.hasDb && !ops.hasDb()) return;
  const row = ops.getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'game_seed'");
  if (row) return;
  const seed = Math.floor(Math.random() * 2 ** 31);
  ops.run("INSERT INTO game_config (key, value) VALUES ('game_seed', ?)", [String(seed)]);
}

/**
 * Allocates the next monotonic display order for a given player and buildable unit type using `game_config` counters.
 *
 * Purpose: Ensures each side's formation ordinals start at 1 independently (human: 1st, 2nd…; opponent: I, II…).
 * When to use: Unit insertion during seeding and production pipelines; always pass the owning player.
 * Expected outcome: Returns `1` when DB is absent; otherwise increments the per-player-per-type stored counter and returns it.
 * Exceptions: None.
 */
export function allocateNextUnitDisplayOrderWithOps(ops: GameConfigKvDbOps, unitType: BuildUnitType, player: string): number {
  logDebug('gameDb allocateNextUnitDisplayOrder', { unitType, player });
  if (ops.hasDb && !ops.hasDb()) return 1;
  const key = unitDisplaySequenceKey(unitType, player);
  const row = ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [key]);
  const current = row ? Number.parseInt(row.value, 10) : 0;
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
  ops.run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [key, String(next)]);
  return next;
}

/**
 * Allocates the next compact unit-id ordinal for a given player and buildable unit type.
 *
 * Purpose: Identifier numbers must stay unique even if display-order allocation fails or is skipped.
 * When to use: Unit insertion during seeding and production; always pass the owning player.
 * Expected outcome: Increments the per-player-per-type stored counter and returns the next positive integer.
 * Exceptions: Throws when the game database is not open. Unlike display-order allocation, this never
 * returns a hardcoded `1` on a closed handle, because that would duplicate `units.id`.
 */
export function allocateNextUnitIdOrdinalWithOps(ops: GameConfigKvDbOps, unitType: BuildUnitType, player: string): number {
  logDebug('gameDb allocateNextUnitIdOrdinal', { unitType, player });
  if (ops.hasDb && !ops.hasDb()) {
    const err = new Error('Cannot allocate a unit id ordinal: the game database is not open');
    logError('gameDb allocateNextUnitIdOrdinal: database not open', err);
    throw err;
  }
  const key = unitIdSequenceKey(unitType, player);
  const row = ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [key]);
  const current = row ? Number.parseInt(row.value, 10) : 0;
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
  ops.run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [key, String(next)]);
  return next;
}

/**
 * Reads the persisted `game_seed` used for deterministic combat RNG chaining.
 *
 * Purpose: Matches legacy `getGameSeed` trace and parsing semantics.
 * When to use: Strategic `ready` pipeline and any feature needing replay-stable dice roots.
 * Expected outcome: `0` when DB is closed or row missing/invalid.
 * Exceptions: None.
 */
export function getGameSeedWithOps(ops: GameConfigKvDbOps): number {
  logTrace('gameDb getGameSeedWithOps');
  if (ops.hasDb && !ops.hasDb()) return 0;
  const row = ops.getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'game_seed'");
  if (!row) return 0;
  const n = parseInt(row.value, 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Persists game-over flag and winner id into `game_config` for snapshot readers.
 *
 * Purpose: Extracted from `setGameOver` with identical SQL statements.
 * When to use: Region control and victory resolution paths in the main process.
 * Expected outcome: `game_over` and `winner` keys are upserted.
 * Exceptions: None.
 */
export function setGameOverWithOps(ops: GameConfigKvDbOps, winner: string): void {
  logDebug('gameDb setGameOverWithOps', { winner });
  if (ops.hasDb && !ops.hasDb()) return;
  ops.run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('game_over', '1')");
  ops.run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('winner', ?)", [winner]);
}

/**
 * Clears persisted game-over keys so a new match starts from a clean config namespace.
 *
 * Purpose: Extracted from `clearGameOver` with identical SQL.
 * When to use: `resetGameForNewMatch` and similar full resets.
 * Expected outcome: `game_over` and `winner` rows removed when present.
 * Exceptions: None.
 */
export function clearGameOverWithOps(ops: GameConfigKvDbOps): void {
  logDebug('gameDb clearGameOverWithOps', {});
  if (ops.hasDb && !ops.hasDb()) return;
  ops.run("DELETE FROM game_config WHERE key IN ('game_over', 'winner')");
}
