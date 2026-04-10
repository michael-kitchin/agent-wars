/**
 * Simple logging for the main process. Use for debug (invocations), error (exceptions), trace (getters).
 * Does not check log level before calling; avoid building large strings inline in log calls.
 * All log lines are also appended to debug.log (created if missing).
 * Each line is prefixed with an ISO 8601 timestamp (e.g. 2025-03-18T19:45:30.123Z).
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Documents the module-scope binding `PREFIX` (PREFIX).

 * Purpose: Supports maintainability by documenting why `PREFIX` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const PREFIX = '[agent-wars]';

/**
 * Documents the `LogLevel` type alias (type LogLevel).

 * Purpose: Supports maintainability by documenting why `LogLevel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type LogLevel = 'error' | 'debug' | 'trace';

/**
 * Defines the `resolveLogLevel` function shape (function resolveLogLevel(): LogLevel).

 * Purpose: Supports maintainability by documenting why `resolveLogLevel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function resolveLogLevel(): LogLevel {
  // Default to "debug" so TRACE logs are quiet by default.
  // Enable trace with either:
  // - AGENT_WARS_LOG_LEVEL=trace
  // - AGENT_WARS_TRACE_LOG=1
  const envLevel = process.env.AGENT_WARS_LOG_LEVEL?.toLowerCase().trim();
  if (envLevel === 'trace' || envLevel === 'debug' || envLevel === 'error') return envLevel;
  if (process.env.AGENT_WARS_TRACE_LOG === '1') return 'trace';
  return 'debug';
}

/**
 * Documents the module-scope binding `LOG_LEVEL` (LOG_LEVEL: LogLevel).

 * Purpose: Supports maintainability by documenting why `LOG_LEVEL` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const LOG_LEVEL: LogLevel = resolveLogLevel();
/**
 * Documents the module-scope binding `MAX_LOG_FLUSH_BATCH_LINES` (MAX_LOG_FLUSH_BATCH_LINES).

 * Purpose: Supports maintainability by documenting why `MAX_LOG_FLUSH_BATCH_LINES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const MAX_LOG_FLUSH_BATCH_LINES = 200;
/**
 * Documents the module-scope binding `pendingLogLines` (pendingLogLines: string[]).

 * Purpose: Supports maintainability by documenting why `pendingLogLines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const pendingLogLines: string[] = [];
/**
 * Documents the module-scope binding `logFlushScheduled` (logFlushScheduled).

 * Purpose: Supports maintainability by documenting why `logFlushScheduled` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let logFlushScheduled = false;
/**
 * Documents the module-scope binding `logFlushInFlight` (logFlushInFlight).

 * Purpose: Supports maintainability by documenting why `logFlushInFlight` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let logFlushInFlight = false;

/**
 * Defines the `iso8601` function shape (function iso8601(): string).

 * Purpose: Supports maintainability by documenting why `iso8601` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function iso8601(): string {
  return new Date().toISOString();
}

/**
 * Defines the `getDebugLogPath` function shape (function getDebugLogPath(): string).

 * Purpose: Supports maintainability by documenting why `getDebugLogPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getDebugLogPath(): string {
  return path.join(process.cwd(), 'debug.log');
}

/**
 * Defines the `formatLine` function shape (function formatLine(level: string, message: string, args: unknown[]): string).

 * Purpose: Supports maintainability by documenting why `formatLine` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatLine(level: string, message: string, args: unknown[]): string {
  const argsStr = args.length > 0 ? ' ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') : '';
  return `[${iso8601()}] ${PREFIX} [${level}] ${message}${argsStr}`;
}

/**
 * Defines the `flushPendingLogLines` function shape (function flushPendingLogLines(): void).

 * Purpose: Supports maintainability by documenting why `flushPendingLogLines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function flushPendingLogLines(): void {
  if (logFlushInFlight || pendingLogLines.length === 0) {
    logFlushScheduled = false;
    return;
  }
  logFlushInFlight = true;
  logFlushScheduled = false;
  const batch = pendingLogLines.splice(0, MAX_LOG_FLUSH_BATCH_LINES).join('');
  fs.appendFile(getDebugLogPath(), batch, (err) => {
    // Keep runtime resilient if debug log file is unavailable.
    if (err) {
      // Intentionally ignored.
    }
    logFlushInFlight = false;
    if (pendingLogLines.length > 0) scheduleLogFlush();
  });
}

/**
 * Defines the `scheduleLogFlush` function shape (function scheduleLogFlush(): void).

 * Purpose: Supports maintainability by documenting why `scheduleLogFlush` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function scheduleLogFlush(): void {
  if (logFlushScheduled) return;
  logFlushScheduled = true;
  setImmediate(flushPendingLogLines);
}

/**
 * Defines the `appendToDebugLog` function shape (function appendToDebugLog(level: string, message: string, args: unknown[]): void).

 * Purpose: Supports maintainability by documenting why `appendToDebugLog` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function appendToDebugLog(level: string, message: string, args: unknown[]): void {
  pendingLogLines.push(formatLine(level, message, args) + '\n');
  scheduleLogFlush();
}

/**
 * Defines the `logDebug` function shape (export function logDebug(message: string, ...args: unknown[]): void).

 * Purpose: Supports maintainability by documenting why `logDebug` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function logDebug(message: string, ...args: unknown[]): void {
  const head = `[${iso8601()}] ${PREFIX} [DEBUG] ${message}`;
  console.log(head, ...args);
  appendToDebugLog('DEBUG', message, args);
}

/**
 * Defines the `logError` function shape (export function logError(message: string, ...args: unknown[]): void).

 * Purpose: Supports maintainability by documenting why `logError` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function logError(message: string, ...args: unknown[]): void {
  const head = `[${iso8601()}] ${PREFIX} [ERROR] ${message}`;
  console.error(head, ...args);
  appendToDebugLog('ERROR', message, args);
}

/**
 * Defines the `logTrace` function shape (export function logTrace(message: string, ...args: unknown[]): void).

 * Purpose: Supports maintainability by documenting why `logTrace` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function logTrace(message: string, ...args: unknown[]): void {
  if (LOG_LEVEL !== 'trace') return;
  const head = `[${iso8601()}] ${PREFIX} [TRACE] ${message}`;
  console.log(head, ...args);
  appendToDebugLog('TRACE', message, args);
}
