/**
 * Shared JSON file reads for terrain pack loaders.
 *
 * Purpose: One read, parse, log, and rethrow path so pack loaders do not repeat the same failure handling.
 * When to use: From terrain metadata, naming, and land-mass loaders that already validate the parsed value.
 * Expected outcome: Callers receive `unknown` JSON or the original read/parse error after it is logged.
 * Exceptions: Rethrows filesystem and `JSON.parse` errors.
 */

import * as fs from 'fs';
import { logError, logTrace } from './logger';

/**
 * Reads a UTF-8 file and parses it as JSON.
 *
 * Purpose: Keeps pack loaders on one failure message shape (`${logContext}: read/parse failed`).
 * When to use: Immediately before a pack-specific envelope parser.
 * Expected outcome: The parsed JSON value.
 * Exceptions: Rethrows the original error after `logError`.
 */
export function readJsonFileOrThrow(absPath: string, logContext: string): unknown {
  logTrace('jsonFileHelpers readJsonFileOrThrow', { absPath });
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf8')) as unknown;
  } catch (err) {
    logError(`${logContext}: read/parse failed`, err);
    throw err;
  }
}
