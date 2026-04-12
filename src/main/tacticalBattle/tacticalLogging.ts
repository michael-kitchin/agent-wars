/**
 * Centralized tactical logging helpers so mutating vs read-only paths stay aligned with strict log-level policy.
 */

import { logDebug, logError, logTrace } from '../logger';

/**
 * Emits a debug-level tactical log for mutating operations (session changes, successful order apply, etc.).
 *
 * Contract: Delegates to `logDebug`; message strings should remain stable for log-based triage.
 * When to use: Any tactical code path that installs, clears, or mutates authoritative tactical session state.
 * Expected outcome: Log line emitted at debug level when global log configuration allows.
 * Exceptions: None.
 */
export function tacticalLogMutate(message: string, ...args: unknown[]): void {
  logDebug(message, ...args);
}

/**
 * Emits a trace-level tactical log for read-only queries, validators, and pure snapshot projections.
 *
 * Contract: Delegates to `logTrace`; avoid constructing large strings inline in the argument list.
 * When to use: Tactical distance checks, validation entry, skip diagnostics, and snapshot builders that do not mutate session globals.
 * Expected outcome: Log line emitted at trace level when enabled.
 * Exceptions: None.
 */
export function tacticalLogQuery(message: string, ...args: unknown[]): void {
  logTrace(message, ...args);
}

/**
 * Emits an error-level tactical log for caught exceptions and invariant failures that should surface in `debug.log`.
 *
 * Contract: Delegates to `logError`; include structured context (ids, battle ids) without dumping entire snapshots unless necessary.
 * When to use: Tactical `catch` blocks and defensive failures that must not crash the main process.
 * Expected outcome: Error line emitted for triage.
 * Exceptions: None.
 */
export function tacticalLogError(message: string, ...args: unknown[]): void {
  logError(message, ...args);
}
