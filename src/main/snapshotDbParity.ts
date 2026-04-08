import { getHexController, isDbReady } from './gameDb';
import { logDebug, logError } from './logger';

const MAX_DEDUP_KEYS = 2000;
const seenParityLogKeys = new Set<string>();

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
 * Why this exists:
 *     Centralizes snapshot-vs-DB controller parity logging so prompt/briefing paths can keep using snapshot state while
 *     still surfacing control mismatches against authoritative DB reads.
 * When to use:
 *     Whenever logic intentionally uses snapshot `res1Control` for decisions and needs observability for potential drift.
 * What to expect:
 *     Emits error-level logs when DB control differs from the snapshot control for a hex, or when DB reads throw.
 *     Returns silently when DB is unavailable.
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
