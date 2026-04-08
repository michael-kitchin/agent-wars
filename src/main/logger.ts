/**
 * Simple logging for the main process. Use for debug (invocations), error (exceptions), trace (getters).
 * Does not check log level before calling; avoid building large strings inline in log calls.
 * All log lines are also appended to debug.log (created if missing).
 * Each line is prefixed with an ISO 8601 timestamp (e.g. 2025-03-18T19:45:30.123Z).
 */

import * as fs from 'fs';
import * as path from 'path';

const PREFIX = '[agent-wars]';

type LogLevel = 'error' | 'debug' | 'trace';

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

const LOG_LEVEL: LogLevel = resolveLogLevel();
const MAX_LOG_FLUSH_BATCH_LINES = 200;
const pendingLogLines: string[] = [];
let logFlushScheduled = false;
let logFlushInFlight = false;

function iso8601(): string {
  return new Date().toISOString();
}

function getDebugLogPath(): string {
  return path.join(process.cwd(), 'debug.log');
}

function formatLine(level: string, message: string, args: unknown[]): string {
  const argsStr = args.length > 0 ? ' ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') : '';
  return `[${iso8601()}] ${PREFIX} [${level}] ${message}${argsStr}`;
}

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

function scheduleLogFlush(): void {
  if (logFlushScheduled) return;
  logFlushScheduled = true;
  setImmediate(flushPendingLogLines);
}

function appendToDebugLog(level: string, message: string, args: unknown[]): void {
  pendingLogLines.push(formatLine(level, message, args) + '\n');
  scheduleLogFlush();
}

export function logDebug(message: string, ...args: unknown[]): void {
  const head = `[${iso8601()}] ${PREFIX} [DEBUG] ${message}`;
  console.log(head, ...args);
  appendToDebugLog('DEBUG', message, args);
}

export function logError(message: string, ...args: unknown[]): void {
  const head = `[${iso8601()}] ${PREFIX} [ERROR] ${message}`;
  console.error(head, ...args);
  appendToDebugLog('ERROR', message, args);
}

export function logTrace(message: string, ...args: unknown[]): void {
  if (LOG_LEVEL !== 'trace') return;
  const head = `[${iso8601()}] ${PREFIX} [TRACE] ${message}`;
  console.log(head, ...args);
  appendToDebugLog('TRACE', message, args);
}
