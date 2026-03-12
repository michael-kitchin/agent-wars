/**
 * Simple logging for the main process. Use for debug (invocations), error (exceptions), trace (getters).
 * Does not check log level before calling; avoid building large strings inline in log calls.
 */

const PREFIX = '[agent-wars]';

export function logDebug(message: string, ...args: unknown[]): void {
  console.log(`${PREFIX} [DEBUG] ${message}`, ...args);
}

export function logError(message: string, ...args: unknown[]): void {
  console.error(`${PREFIX} [ERROR] ${message}`, ...args);
}

export function logTrace(message: string, ...args: unknown[]): void {
  console.log(`${PREFIX} [TRACE] ${message}`, ...args);
}
