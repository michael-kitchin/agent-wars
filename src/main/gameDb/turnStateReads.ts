import type { DbReadOps } from './dbOps';
import { logTrace } from '../logger';

/**
 * Row shape for the singleton `turn_state` table (`id = 1`).
 *
 * Purpose: Names the phase and turn-number columns so callers do not re-declare the SQL result type at each site.
 * When to use: As the return type of `readTurnStateRow` and when comparing phase/turn after a read.
 * Expected outcome: `phase` is the stored phase string; `turn_number` is the stored integer turn.
 * Exceptions: None; this type does not validate values.
 */
export type TurnStateRow = { phase: string; turn_number: number };

/**
 * Reads the current strategic phase and turn number from SQLite.
 *
 * Purpose: One SQL string and row shape for every main-process reader of `turn_state`.
 * When to use: When a caller already has a `getOne` accessor (typically `dbGetOne`) and needs `turn_state` id 1.
 * Expected outcome: The matching row, or `undefined` when no row exists.
 * Exceptions: None; does not throw. SQL errors propagate from `getOne`.
 */
export function readTurnStateRow(getOne: DbReadOps['getOne']): TurnStateRow | undefined {
  logTrace('readTurnStateRow');
  return getOne<TurnStateRow>('SELECT phase, turn_number FROM turn_state WHERE id = 1');
}

/**
 * Reads the stored turn number, or 1 when the row is missing.
 *
 * Purpose: Every turn-number reader uses 1 for a missing row. `readTurnStateRow` already traces, so this adds no log line.
 * When to use: When the caller needs the turn and not the phase.
 * Expected outcome: The stored `turn_number`, or 1 when no row exists.
 * Exceptions: None. SQL errors propagate from `getOne`.
 */
export function readTurnNumberOrFirst(getOne: DbReadOps['getOne']): number {
  return readTurnStateRow(getOne)?.turn_number ?? 1;
}

/**
 * Reads the stored phase without choosing a default.
 *
 * Purpose: Callers choose their own default. `readTurnStateRow` already traces, so this adds no log line.
 * When to use: Action guards that allow the action use `?? 'planning'`. Guards that reject it compare with `!==`.
 * Expected outcome: The stored phase, or `undefined` when no row exists.
 * Exceptions: None. SQL errors propagate from `getOne`.
 */
export function readTurnPhase(getOne: DbReadOps['getOne']): string | undefined {
  return readTurnStateRow(getOne)?.phase;
}
