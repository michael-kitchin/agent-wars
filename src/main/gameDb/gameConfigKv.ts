/**
 * `game_config` key/value helpers shared by game seeding, display-order allocation, and game-over flags.
 */

import type { BuildUnitType } from '../productionRules';
import {
  DEFAULT_TURN_LIMIT,
  GAME_END_REASONS,
  TURN_LIMIT_OPTIONS,
  VICTORY_RULES,
  type GameEndReason,
  type VictorySettings,
} from '../../shared/victoryRules';
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
 * Reads the win rule and turn limit stored for the current match.
 *
 * Purpose: The snapshot and the end-of-turn check need the settings written at the start of the match.
 * When to use: `getGameStateSnapshot` and any later reader of `victory_rule`.
 * Expected outcome: The stored rule. An unknown or missing rule is last-side-standing with no turn limit.
 * Exceptions: None.
 */
export function readVictorySettings(ops: GameConfigKvDbOps): VictorySettings {
  logTrace('gameConfigKv readVictorySettings');
  if (ops.hasDb && !ops.hasDb()) return { rule: 'last_side_standing', turnLimit: null };
  const ruleRaw = ops.getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'victory_rule'")?.value;
  const rule = VICTORY_RULES.find((item) => item === ruleRaw);
  if (!rule) {
    logError('readVictorySettings found no known win rule', { ruleRaw: ruleRaw ?? null });
    return { rule: 'last_side_standing', turnLimit: null };
  }
  if (rule === 'last_side_standing') return { rule, turnLimit: null };
  const parsed = Number.parseInt(
    ops.getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'turn_limit'")?.value ?? '',
    10
  );
  const turnLimit = (TURN_LIMIT_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_TURN_LIMIT;
  logTrace('gameConfigKv readVictorySettings result', { rule, turnLimit });
  return { rule, turnLimit };
}

/**
 * Clears persisted game-over keys so a new match starts from a clean config namespace.
 *
 * Purpose: A new match must not inherit the previous winner or end reason.
 * When to use: `resetGameForNewMatch` and similar full resets.
 * Expected outcome: `game_over`, `winner`, and `game_end_reason` rows are removed when present.
 * Exceptions: None. A closed database returns without writing.
 */
export function clearGameOverWithOps(ops: GameConfigKvDbOps): void {
  logDebug('gameDb clearGameOverWithOps', {});
  if (ops.hasDb && !ops.hasDb()) return;
  ops.run("DELETE FROM game_config WHERE key IN ('game_over', 'winner', 'game_end_reason')");
}

/**
 * Records that the match is over, who won, and why.
 *
 * Purpose: A tie stores an empty winner. The end reason distinguishes last side standing, the turn limit, a mutual wipe, and the human ending the match.
 * When to use: `recordEndOfTurnOutcome` when `gameOver` is true.
 * Expected outcome: `game_over` is 1, `winner` is the seat id or empty, and `game_end_reason` is the reason.
 * Exceptions: None. A closed database returns without writing.
 */
export function setGameOutcomeWithOps(
  ops: GameConfigKvDbOps,
  outcome: { winnerSeatId: string | null; endReason: GameEndReason }
): void {
  logDebug('gameConfigKv setGameOutcomeWithOps', { winnerSeatId: outcome.winnerSeatId, endReason: outcome.endReason });
  if (ops.hasDb && !ops.hasDb()) return;
  ops.run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('game_over', '1')");
  ops.run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('winner', ?)", [outcome.winnerSeatId ?? '']);
  ops.run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('game_end_reason', ?)", [outcome.endReason]);
}

/**
 * Reads why the current match ended.
 *
 * Purpose: The snapshot shows the stored reason, including a match the human ended.
 * When to use: `getGameStateSnapshot`.
 * Expected outcome: A known reason, or undefined when the match is still going or the stored value is unknown.
 * Exceptions: None.
 */
export function readGameEndReason(ops: GameConfigKvDbOps): GameEndReason | undefined {
  logTrace('gameConfigKv readGameEndReason');
  if (ops.hasDb && !ops.hasDb()) return undefined;
  const raw = ops.getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'game_end_reason'")?.value;
  const reason = GAME_END_REASONS.find((item) => item === raw);
  if (raw && !reason) logError('readGameEndReason found an unknown reason', { raw });
  return reason;
}
