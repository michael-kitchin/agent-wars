/**
 * Small pure SQLite helpers shared by main-process DB open paths (`gameDb.ts`).
 */

import { logDebug } from '../logger';

/**
 * Ensures `turn_state` row id 1 exists after schema apply or recovery.
 *
 * Purpose: Keeps bootstrap DDL assumptions centralized so fresh DB, test open, and corrupt-recovery paths stay aligned.
 * When to use: Only from `gameDb` after a writable `db` handle is established.
 * Expected outcome: Default planning phase row exists when previously missing.
 * Exceptions: None; no-ops when `run`/`getOne` are not invoked with an open database (caller guards).
 */
export function ensureTurnStateRowWhenDbOpen(
  run: (sql: string, params?: unknown[]) => void,
  getOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T | undefined
): void {
  const row = getOne('SELECT 1 FROM turn_state WHERE id = 1');
  if (!row) {
    run('INSERT INTO turn_state (id, phase, turn_number) VALUES (1, ?, ?)', ['planning', 1]);
  }
}

/**
 * Resets a persisted `resolution` phase to `planning` after restart when melee-intercept resume state was lost.
 *
 * Purpose: Prevents the client from blocking `ready()` while SQLite still shows an impossible strategic resolution phase.
 * When to use: Once per successful open of an existing DB file in `initDatabase`, after `ensureTurnStateRow`.
 * Expected outcome: `turn_state.phase` becomes `planning` when it was `resolution`; otherwise unchanged.
 * Exceptions: None.
 */
export function repairStrandedStrategicResolutionPhaseWhenDbOpen(
  run: (sql: string, params?: unknown[]) => void,
  getOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T | undefined
): void {
  const row = getOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1');
  if (!row || row.phase !== 'resolution') return;
  run('UPDATE turn_state SET phase = ? WHERE id = 1', ['planning']);
  logDebug('gameDb repairStrandedStrategicResolutionPhaseOnDbBootstrap: reset phase planning after interrupted resolution', {
    priorPhase: row.phase,
  });
}
