/**
 * Main-process logging with configurable minimum severity via `AGENT_WARS_LOG_LEVEL`.
 *
 * Purpose: Emits structured lines to the console and `debug.log` while respecting a runtime threshold so noisy debug/trace stays off in normal runs.
 * When to use: `logError` for failures, `logInfo` for operational milestones, `logDebug` for troubleshooting, `logTrace` for per-call getter-style noise.
 * Expected outcome: Lines include an ISO 8601 timestamp prefix; `logError` always records; other levels honor the resolved threshold.
 * Exceptions: Does not check level before evaluating `message`/`args` at the call site—avoid building large strings inline in hot paths.
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
 * Ordered severities for threshold filtering (higher numeric value = higher importance).
 *
 * Purpose: A single comparison implements “show this level and everything above it” while keeping `trace` the most verbose tier.
 * When to use: Only inside `isSeverityEnabled` and `resolveLogLevel` normalization.
 * Expected outcome: `trace` < `debug` < `info` < `error`.
 * Exceptions: None.
 */
const SEVERITY_RANK: Record<'trace' | 'debug' | 'info' | 'error', number> = {
  trace: 10,
  debug: 20,
  info: 30,
  error: 40,
};

/**
 * Documents the `LogLevel` type alias (type LogLevel).

 * Purpose: Names the supported `AGENT_WARS_LOG_LEVEL` values and internal threshold state.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Four severities; `info` is the default threshold.
 * Exceptions: None.
 */
type LogLevel = keyof typeof SEVERITY_RANK;

/**
 * Defines the `resolveLogLevel` function shape (function resolveLogLevel(): LogLevel).

 * Purpose: Reads `AGENT_WARS_LOG_LEVEL` (and legacy `AGENT_WARS_TRACE_LOG`) once at module load.
 * When to use: Initialization of `LOG_LEVEL` only.
 * Expected outcome: `info` when unset or invalid; `trace` when `AGENT_WARS_TRACE_LOG=1` or level is `trace`.
 * Exceptions: None.
 */
function resolveLogLevel(): LogLevel {
  const envLevel = process.env.AGENT_WARS_LOG_LEVEL?.toLowerCase().trim();
  if (envLevel === 'trace' || envLevel === 'debug' || envLevel === 'info' || envLevel === 'error') {
    return envLevel;
  }
  if (process.env.AGENT_WARS_TRACE_LOG === '1') {
    return 'trace';
  }
  return 'info';
}

/**
 * Documents the module-scope binding `LOG_LEVEL` (LOG_LEVEL: LogLevel).

 * Purpose: Minimum severity emitted for non-error channels; `logError` always passes.
 * When to use: Evaluated by `isSeverityEnabled` for trace/debug/info filtering.
 * Expected outcome: Matches `resolveLogLevel()` at cold start.
 * Exceptions: None.
 */
const LOG_LEVEL: LogLevel = resolveLogLevel();

/**
 * Defines the `isSeverityEnabled` function shape (function isSeverityEnabled(level: Exclude<LogLevel, 'error'> | 'error'): boolean).

 * Purpose: Central gate so console and file append stay consistent.
 * When to use: Before formatting non-error log lines.
 * Expected outcome: True when the message severity is at or above the configured threshold (errors still emit when threshold is `error`).
 * Exceptions: None.
 */
function isSeverityEnabled(level: LogLevel): boolean {
  return SEVERITY_RANK[level] >= SEVERITY_RANK[LOG_LEVEL];
}

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
 * Defines the `logTrace` function shape (export function logTrace(message: string, ...args: unknown[]): void).

 * Purpose: Supports maintainability by documenting why `logTrace` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Emitted only when the configured threshold is `trace`.
 * Exceptions: None.
 */
export function logTrace(message: string, ...args: unknown[]): void {
  if (!isSeverityEnabled('trace')) return;
  const head = `[${iso8601()}] ${PREFIX} [TRACE] ${message}`;
  console.log(head, ...args);
  appendToDebugLog('TRACE', message, args);
}

/**
 * Defines the `logDebug` function shape (export function logDebug(message: string, ...args: unknown[]): void).

 * Purpose: Supports maintainability by documenting why `logDebug` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Emitted when threshold is `trace` or `debug`.
 * Exceptions: None.
 */
export function logDebug(message: string, ...args: unknown[]): void {
  if (!isSeverityEnabled('debug')) return;
  const head = `[${iso8601()}] ${PREFIX} [DEBUG] ${message}`;
  console.log(head, ...args);
  appendToDebugLog('DEBUG', message, args);
}

/**
 * Defines the `logInfo` function shape (export function logInfo(message: string, ...args: unknown[]): void).

 * Purpose: Supports maintainability by documenting why `logInfo` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Emitted at the default `info` threshold and any more-verbose setting.
 * Exceptions: None.
 */
export function logInfo(message: string, ...args: unknown[]): void {
  if (!isSeverityEnabled('info')) return;
  const head = `[${iso8601()}] ${PREFIX} [INFO] ${message}`;
  console.log(head, ...args);
  appendToDebugLog('INFO', message, args);
}

/**
 * Defines the `logError` function shape (export function logError(message: string, ...args: unknown[]): void).

 * Purpose: Supports maintainability by documenting why `logError` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Always emitted regardless of `AGENT_WARS_LOG_LEVEL`.
 * Exceptions: None.
 */
export function logError(message: string, ...args: unknown[]): void {
  const head = `[${iso8601()}] ${PREFIX} [ERROR] ${message}`;
  console.error(head, ...args);
  appendToDebugLog('ERROR', message, args);
}
