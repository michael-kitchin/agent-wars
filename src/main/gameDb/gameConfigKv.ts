/**
 * `game_config` key/value helpers shared by game seeding, display-order allocation, and game-over flags.
 */

import type { BuildUnitType } from '../productionRules';
import { AI_ONLY_BEAT_LIMIT_CONFIG_KEY, aiOnlyBeatLimitFromStored, type AiOnlyBeatLimit } from '../../shared/aiOnlyBeatLimit';
import { aiOnlyBattlesFromStored, type AiOnlyBattleMode } from '../../shared/aiOnlyBattles';
import { SIGHT_CUES_CONFIG_KEY, STORED_SIGHT_CUES_WHEN_MISSING, sightCuesFromStored } from '../../shared/sightCueSettings';
import {
  DEFAULT_TURN_LIMIT,
  GAME_END_REASONS,
  TURN_LIMIT_OPTIONS,
  VICTORY_RULES,
  type GameEndReason,
  type VictorySettings,
} from '../../shared/victoryRules';
import { randomUUID } from 'node:crypto';
import { logDebug, logError, logTrace } from '../logger';
import { selectGameConfigValue, upsertGameConfigValue } from './gameConfigRows';

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
  const stored = selectGameConfigValue(ops, key);
  const current = stored !== undefined ? Number.parseInt(stored, 10) : 0;
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
  upsertGameConfigValue(ops, key, String(next));
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
  const stored = selectGameConfigValue(ops, key);
  const current = stored !== undefined ? Number.parseInt(stored, 10) : 0;
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
  upsertGameConfigValue(ops, key, String(next));
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
 * Expected outcome: The stored rule. An unknown or missing rule is last-side-standing with no turn limit. A missing row is logged at debug level, because no match has started yet. A stored value that is not a known rule is logged as an error.
 * Exceptions: None.
 */
export function readVictorySettings(ops: GameConfigKvDbOps): VictorySettings {
  logTrace('gameConfigKv readVictorySettings');
  if (ops.hasDb && !ops.hasDb()) return { rule: 'last_side_standing', turnLimit: null };
  const ruleRaw = ops.getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'victory_rule'")?.value;
  const rule = VICTORY_RULES.find((item) => item === ruleRaw);
  if (!rule) {
    // No row is normal before the first match starts, when the snapshot is read at startup.
    if (ruleRaw === undefined) logDebug('readVictorySettings found no stored win rule');
    else logError('readVictorySettings found no known win rule', { ruleRaw });
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
 * Reads the AI-only battle choice stored for the current match.
 *
 * Purpose: An observed match uses this to decide whether one battle is offered. An old save has no row.
 * When to use: `getGameStateSnapshot` and the ready pipeline.
 * Expected outcome: The stored mode. A missing row or an unknown string is `none`.
 * Exceptions: None.
 */
export function readAiOnlyBattles(ops: GameConfigKvDbOps): AiOnlyBattleMode {
  logTrace('gameConfigKv readAiOnlyBattles');
  if (ops.hasDb && !ops.hasDb()) return 'none';
  const raw = ops.getOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'ai_only_battles'")?.value;
  const mode = aiOnlyBattlesFromStored(raw);
  logTrace('gameConfigKv readAiOnlyBattles result', { mode });
  return mode;
}

/**
 * Reads the beat limit stored for the current match.
 *
 * Purpose: An AI-only battle ends after this many completed beats. An old save has no row.
 * When to use: The game-state snapshot, which the header and the tactical prompt read, and the check after a beat resolves.
 * Expected outcome: The stored number. A closed database, a missing row, or `unlimited` is null.
 * Exceptions: None.
 */
export function readAiOnlyBeatLimit(ops: GameConfigKvDbOps): AiOnlyBeatLimit {
  logTrace('gameConfigKv readAiOnlyBeatLimit');
  if (ops.hasDb && !ops.hasDb()) {
    logTrace('gameConfigKv readAiOnlyBeatLimit result', { limit: null });
    return null;
  }
  const raw = selectGameConfigValue(ops, AI_ONLY_BEAT_LIMIT_CONFIG_KEY);
  const limit = aiOnlyBeatLimitFromStored(raw);
  logTrace('gameConfigKv readAiOnlyBeatLimit result', { limit });
  return limit;
}

/**
 * Reads whether this match draws sight lines during observed playback.
 *
 * Purpose: An observed match uses this to decide whether the opening stage runs. A missing row (an older save) is off.
 * When to use: The ready pipeline, before computing sight lines.
 * Expected outcome: `true` only when the stored row is `'1'`.
 * Exceptions: None.
 */
export function readSightCuesEnabled(ops: GameConfigKvDbOps): boolean {
  logTrace('gameConfigKv readSightCuesEnabled');
  if (ops.hasDb && !ops.hasDb()) return STORED_SIGHT_CUES_WHEN_MISSING;
  const raw = selectGameConfigValue(ops, SIGHT_CUES_CONFIG_KEY);
  const enabled = sightCuesFromStored(raw);
  logTrace('gameConfigKv readSightCuesEnabled result', { enabled });
  return enabled;
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

/**
 * `game_config` key for the id of the open match.
 *
 * Purpose: A recording file is named from this id, and a new match must not reuse the previous one.
 * When to use: Reading or writing the match id.
 * Expected outcome: The string `match_id`.
 * Exceptions: None.
 */
export const MATCH_ID_CONFIG_KEY = 'match_id';

/**
 * Reads the open match's id.
 *
 * Purpose: The export names the recording from the stored id.
 * When to use: When the caller only needs the id and must not create one.
 * Expected outcome: The stored id, or null when the row is missing or empty. The id itself is not logged.
 * Exceptions: Propagates a SQLite error.
 */
export function readMatchId(ops: GameConfigKvDbOps): string | null {
  if (ops.hasDb && !ops.hasDb()) {
    logTrace('gameConfigKv readMatchId', { found: false });
    return null;
  }
  const value = selectGameConfigValue(ops, MATCH_ID_CONFIG_KEY);
  const found = value !== undefined && value.length > 0;
  logTrace('gameConfigKv readMatchId', { found });
  return found ? value : null;
}

/**
 * Returns the open match's id, creating one when the row is missing.
 *
 * Purpose: A match that began in an earlier build gets an id the first time it is recorded.
 * When to use: `match_started`, and any caller that must have an id.
 * Expected outcome: The stored id, or a new UUID written with `upsertGameConfigValue`. The log says whether one was created, not the id.
 * Exceptions: Propagates a SQLite error.
 */
export function ensureMatchId(ops: GameConfigKvDbOps): string {
  const existing = readMatchId(ops);
  if (existing) {
    logDebug('gameConfigKv ensureMatchId', { created: false });
    return existing;
  }
  const created = randomUUID();
  upsertGameConfigValue(ops, MATCH_ID_CONFIG_KEY, created);
  logDebug('gameConfigKv ensureMatchId', { created: true });
  return created;
}

/**
 * `game_config` key for one run of the open match.
 *
 * Purpose: A second playthrough of the same match records to a different file.
 * When to use: Reading or writing the playthrough id.
 * Expected outcome: The string `playthrough_id`.
 * Exceptions: None.
 */
export const PLAYTHROUGH_ID_CONFIG_KEY = 'playthrough_id';

/**
 * Reads the open playthrough's id.
 *
 * Purpose: The export names the recording from this id and must not create one when the caller only wants to look.
 * When to use: When a missing row should stay missing.
 * Expected outcome: The stored id, or null when the row is missing or empty. The id itself is not logged.
 * Exceptions: Propagates a SQLite error.
 */
export function readPlaythroughId(ops: GameConfigKvDbOps): string | null {
  if (ops.hasDb && !ops.hasDb()) {
    logTrace('gameConfigKv readPlaythroughId', { found: false });
    return null;
  }
  const value = selectGameConfigValue(ops, PLAYTHROUGH_ID_CONFIG_KEY);
  const found = value !== undefined && value.length > 0;
  logTrace('gameConfigKv readPlaythroughId', { found });
  return found ? value : null;
}

/**
 * Returns the open playthrough's id, creating one when the row is missing.
 *
 * Purpose: A match from an earlier build gets an id the first time it is exported.
 * When to use: The recording export. A load that must start a new playthrough uses `storeNewPlaythroughId` instead.
 * Expected outcome: The stored id, unchanged when one is already present, or a new UUID. The log says whether one was created, not the id.
 * Exceptions: Propagates a SQLite error.
 */
export function ensurePlaythroughId(ops: GameConfigKvDbOps): string {
  const existing = readPlaythroughId(ops);
  if (existing) {
    logDebug('gameConfigKv ensurePlaythroughId', { created: false });
    return existing;
  }
  const created = randomUUID();
  upsertGameConfigValue(ops, PLAYTHROUGH_ID_CONFIG_KEY, created);
  logDebug('gameConfigKv ensurePlaythroughId', { created: true });
  return created;
}

/**
 * Replaces the open playthrough's id.
 *
 * Purpose: Loading a save starts a new playthrough, so the next recording does not replace the previous file.
 * When to use: After a new match id is stored, and after a load has opened the saved database of a match that is still being played. A loaded finished match keeps its id.
 * Expected outcome: A new UUID is stored. The id itself is not logged.
 * Exceptions: Propagates a SQLite error.
 */
export function storeNewPlaythroughId(ops: GameConfigKvDbOps): string {
  const created = randomUUID();
  upsertGameConfigValue(ops, PLAYTHROUGH_ID_CONFIG_KEY, created);
  logDebug('gameConfigKv storeNewPlaythroughId', { stored: true });
  return created;
}
