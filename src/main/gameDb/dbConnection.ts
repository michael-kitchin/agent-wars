/**
 * Process-wide SQLite handle and the statement helpers that use it.
 *
 * Purpose: One connection so game persistence modules share `run`, `getOne`, and `getAll` without each holding a handle.
 * When to use: From `gameDb` and the gameDb access modules that moved out of it. Other code keeps the `gameDb` facade.
 * Expected outcome: Queries no-op when the handle is closed. `gameDbOps` is the guarded ops object those facades pass through.
 * Exceptions: `closeDbHandle` logs and swallows errors from `Database.close`.
 */

import Database from 'better-sqlite3';
import { logDebug, logError, logTrace } from '../logger';
import type { GuardedDbOps } from './dbOps';

/**
 * Documents the module-scope binding `db` (db: InstanceType<typeof Database> | null).

 * Purpose: Supports maintainability by documenting why `db` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let db: InstanceType<typeof Database> | null = null;

/**
 * Defines the `closeDbHandle` function shape (function closeDbHandle(): void).

 * Purpose: Supports maintainability by documenting why `closeDbHandle` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function closeDbHandle(): void {
  if (db) {
    try {
      db.close();
    } catch (err) {
      logError('gameDb closeDbHandle: error closing database', err);
    }
    db = null;
  }
}

/**
 * Defines the `run` function shape (function run(sql: string, params: unknown[] = []): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function run(sql: string, params: unknown[] = []): void {
  if (!db) return;
  db.prepare(sql).run(...(params as never[]));
}

/**
 * Defines the `getOne` function shape (function getOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined).

 * Purpose: Supports maintainability by documenting why `getOne` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  if (!db) return undefined;
  return db.prepare(sql).get(...(params as never[])) as T | undefined;
}

/**
 * Defines the `getAll` function shape (function getAll<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[]).

 * Purpose: Supports maintainability by documenting why `getAll` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAll<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  if (!db) return [];
  return db.prepare(sql).all(...(params as never[])) as T[];
}

/**
 * Returns the open SQLite handle.
 *
 * Purpose: Exposes the process-wide connection when a caller needs a `Database` method the statement helpers do not wrap.
 * When to use: From `gameDb` or a gameDb access module after `setDbHandle`, once the local `Database` variable is out of scope.
 * Expected outcome: The current handle, or null when closed.
 * Exceptions: None.
 */
export function getDbHandle(): InstanceType<typeof Database> | null {
  logTrace('gameDb getDbHandle');
  return db;
}

/**
 * Installs or clears the process-wide SQLite handle without closing it.
 *
 * Purpose: One assignment path for a database that the caller has already opened.
 * When to use: After `new Database`, once pragmas and validation have succeeded. Pass null only when the caller still owns the object and will close it. `closeDbHandle` clears the handle itself.
 * Expected outcome: Later readiness checks and statement helpers use `next`.
 * Exceptions: None.
 */
export function setDbHandle(next: InstanceType<typeof Database> | null): void {
  logDebug('gameDb setDbHandle', { open: next !== null });
  db = next;
}

/**
 * Reports whether a game database handle is open.
 *
 * Purpose: Shared `hasDb` predicate for guarded ops and readiness checks.
 * When to use: Before work that must no-op when the database is closed.
 * Expected outcome: True after `setDbHandle` receives a database, until `closeDbHandle` or a null assignment.
 * Exceptions: None.
 */
export function hasDbHandle(): boolean {
  logTrace('gameDb hasDbHandle');
  return db !== null;
}

/**
 * Guarded statement helpers bound to the process-wide handle.
 *
 * Purpose: Replaces inline `{ hasDb, run, getOne, getAll }` objects at gameDb call sites.
 * When to use: Any facade that used to build that object from the private handle.
 * Expected outcome: Same no-op-when-closed behavior as the previous literals.
 * Exceptions: None.
 */
export const gameDbOps: GuardedDbOps = { hasDb: hasDbHandle, run, getOne, getAll };
