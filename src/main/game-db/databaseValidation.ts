/**
 * SQLite bootstrap validation for the game database: required tables and user_version checks.
 *
 * Purpose: Keeps `gameDb.ts` slimmer while preserving a single place for schema presence checks used at open time.
 * When to use: From `gameDb` open paths after pragmas are applied; tests may call validation directly with an in-memory DB.
 * Expected outcome: Throws with a clear message when the file is missing tables or the wrong `user_version`.
 * Exceptions: Throws `Error` when validation fails.
 */

import Database from 'better-sqlite3';
import { logDebug } from '../logger';

/**
 * Documents the module-scope binding `GAME_DB_REQUIRED_TABLES` (GAME_DB_REQUIRED_TABLES).

 * Purpose: Lists tables that must exist before the app treats the DB as usable; kept here next to validation logic.
 * When to use: Referenced only by validation and documentation; bump alongside schema migrations.
 * Expected outcome: Matches tables created by the canonical schema DDL for the current user_version.
 * Exceptions: None.
 */
export const GAME_DB_REQUIRED_TABLES = [
  'hexes',
  'units',
  'turn_state',
  'pending_orders',
  'pending_ranged_orders',
  'pending_air_orders',
  'pending_ferry_orders',
  'unit_transport_assignments',
  'game_config',
  'ai_memory',
  'standing_orders',
  'ai_callback_subscriptions',
  'ai_pending_orders',
  'ai_combat_since_consultation',
  'ai_loss_events_since_consultation',
  'player_hex_intel',
  'player_unit_intel',
  'res1_control',
  'res1_build_queue',
  'res1_build_progress',
  'res1_infrastructure',
  'res4_feature_overrides',
] as const;

/**
 * Applies performance and integrity pragmas expected for the game SQLite handle.
 *
 * Purpose: Centralizes pragma setup so open and recovery paths stay consistent.
 * When to use: Immediately after opening a `better-sqlite3` handle for the game DB.
 * Expected outcome: Memory journal, foreign keys on, deferred FKs on, synchronous off.
 * Exceptions: None; pragma failures surface from better-sqlite3.
 */
export function applyGameDbPragmas(database: InstanceType<typeof Database>): void {
  logDebug('gameDb databaseValidation applyGameDbPragmas', {
    journalMode: 'MEMORY',
    foreignKeys: true,
    deferForeignKeys: true,
    synchronous: 'OFF',
  });
  database.pragma('journal_mode = MEMORY');
  database.pragma('foreign_keys = ON');
  database.pragma('defer_foreign_keys = ON');
  database.pragma('synchronous = OFF');
}

/**
 * Validates `user_version` and presence of required tables; throws if the DB is not a supported game file.
 *
 * Purpose: Fail fast on corrupt, partial, or wrong-generation SQLite files before gameplay reads/writes.
 * When to use: After schema application or when attaching to an existing on-disk baseline file.
 * Expected outcome: Returns void when `user_version` matches `expectedUserVersion` and every required table exists.
 * Exceptions: Throws `Error` with a diagnostic message when a check fails.
 */
export function validateGameDatabaseOrThrow(
  database: InstanceType<typeof Database>,
  expectedUserVersion: number
): void {
  const uv = database.pragma('user_version', { simple: true }) as number;
  if (uv !== expectedUserVersion) {
    throw new Error(`Invalid user_version: expected ${expectedUserVersion}, got ${uv}`);
  }
  for (const t of GAME_DB_REQUIRED_TABLES) {
    const row = database.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(t);
    if (!row) throw new Error(`Missing required table: ${t}`);
  }
  logDebug('gameDb databaseValidation validateGameDatabaseOrThrow', {
    expectedUserVersion,
    actualUserVersion: uv,
    requiredTableCount: GAME_DB_REQUIRED_TABLES.length,
  });
}
