import { getHexController, isDbReady } from './gameDb';
import { logDebug, logError } from './logger';

/**
 * Documents the module-scope binding `MAX_DEDUP_KEYS` (MAX_DEDUP_KEYS).

 * Purpose: Supports maintainability by documenting why `MAX_DEDUP_KEYS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const MAX_DEDUP_KEYS = 2000;
/**
 * Documents the module-scope binding `seenParityLogKeys` (seenParityLogKeys).

 * Purpose: Supports maintainability by documenting why `seenParityLogKeys` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const seenParityLogKeys = new Set<string>();

/**
 * Defines the `shouldEmitDedupedLog` function shape (function shouldEmitDedupedLog(key: string): boolean).

 * Purpose: Supports maintainability by documenting why `shouldEmitDedupedLog` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function shouldEmitDedupedLog(key: string): boolean {
  if (seenParityLogKeys.has(key)) return false;
  seenParityLogKeys.add(key);
  if (seenParityLogKeys.size > MAX_DEDUP_KEYS) {
    const first = seenParityLogKeys.values().next().value as string | undefined;
    if (first !== undefined) seenParityLogKeys.delete(first);
  }
  return true;
}

/**
 * Defines the `logHexControllerParityMismatch` function shape (export function logHexControllerParityMismatch(args: { h3Index: string; snapshotController: string | null; context: string; unitId?: string; }): vo).

 * Purpose: Supports maintainability by documenting why `logHexControllerParityMismatch` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function logHexControllerParityMismatch(args: {
  h3Index: string;
  snapshotController: string | null;
  context: string;
  unitId?: string;
}): void {
  logDebug('snapshotDbParity logHexControllerParityMismatch', {
    context: args.context,
    h3Index: args.h3Index,
    unitId: args.unitId,
  });
  if (!isDbReady()) return;
  try {
    const dbController = getHexController(args.h3Index);
    if (dbController !== args.snapshotController) {
      const dedupKey = `${args.context}|mismatch|${args.h3Index}|${args.snapshotController ?? 'null'}|${dbController ?? 'null'}`;
      if (shouldEmitDedupedLog(dedupKey)) {
        logError(`${args.context}: snapshot res1Control differs from DB getHexController`, {
          h3Index: args.h3Index,
          unitId: args.unitId,
          snapshotController: args.snapshotController,
          dbController,
        });
      }
    }
  } catch (err) {
    const errText = String(err);
    const dedupKey = `${args.context}|error|${args.h3Index}|${errText}`;
    if (shouldEmitDedupedLog(dedupKey)) {
      logError(`${args.context}: getHexController parity check failed`, {
        h3Index: args.h3Index,
        unitId: args.unitId,
        err,
      });
    }
  }
}
