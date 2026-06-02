import { getHexController, isDbReady } from './gameDb';
import { logDebug, logError } from './logger';

/**
 * Maximum distinct keys stored in `seenParityLogKeys` and `seenParityCheckKeys` before FIFO eviction.
 *
 * Purpose: Prevents unbounded memory growth in long-running sessions with many unique hex/context combos.
 * When to use: Referenced in `shouldEmitDedupedLog` and `shouldRunParityCheck`.
 * Expected outcome: Each set stays at most MAX_DEDUP_KEYS + 1 entries (one extra during the check).
 * Exceptions: None.
 */
const MAX_DEDUP_KEYS = 2000;

/**
 * Records composite keys for mismatch/error log lines already emitted to suppress repeat noise.
 *
 * Purpose: Prevents the same mismatch from flooding the log file across multiple AI turns.
 * When to use: Module-private; consulted and mutated only by `shouldEmitDedupedLog`.
 * Expected outcome: A given mismatch is logged exactly once per distinct (context, hexes, controllers) combination.
 * Exceptions: None.
 */
const seenParityLogKeys = new Set<string>();

/**
 * Dedup keys for `(h3Index, context)` pairs already parity-checked this turn.
 *
 * Purpose: Skips redundant `getHexController` DB reads when hot loops call the diagnostic repeatedly for the same hex.
 * When to use: Cleared at the start of each AI order request via `resetHexControllerParityCheckDedupForTurn`.
 * Expected outcome: First call per pair performs the DB read; repeats within the turn return before reading.
 * Exceptions: None.
 */
const seenParityCheckKeys = new Set<string>();

/**
 * Test-only counter for DB reads issued by `logHexControllerParityMismatch`.
 *
 * Purpose: Contract tests assert dedup without mocking `gameDb`.
 * When to use: Reset via `resetParityCheckDedupAndTestCountersForTests` before assertions.
 * Expected outcome: Increments once per first-seen `(h3Index, context)` per turn.
 * Exceptions: None.
 */
let parityCheckDbReadCountForTests = 0;

/**
 * Returns true the first time a given `key` is seen, then false for repeats (FIFO-bounded).
 *
 * Purpose: Single guard used for both mismatch and error dedup keys in `logHexControllerParityMismatch`.
 * When to use: Pass a composite key that encodes all fields that distinguish one log-worthy event from another.
 * Expected outcome: Returns true once per unique key; FIFO eviction keeps the set bounded at MAX_DEDUP_KEYS.
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
 * Returns true when this `(h3Index, context)` pair has not yet been parity-checked this turn.
 *
 * Purpose: Gates the expensive `getHexController` read while preserving first-occurrence detection.
 * When to use: Inside `logHexControllerParityMismatch` after `isDbReady()` succeeds.
 * Expected outcome: First call for a pair returns true and records the key; repeats return false.
 * Exceptions: None.
 */
function shouldRunParityCheck(h3Index: string, context: string): boolean {
  const key = `${h3Index}|${context}`;
  if (seenParityCheckKeys.has(key)) return false;
  seenParityCheckKeys.add(key);
  if (seenParityCheckKeys.size > MAX_DEDUP_KEYS) {
    const first = seenParityCheckKeys.values().next().value as string | undefined;
    if (first !== undefined) seenParityCheckKeys.delete(first);
  }
  return true;
}

/**
 * Clears per-turn parity-check dedup state at the start of an AI order request.
 *
 * Purpose: Ensures each turn re-checks every unique `(h3Index, context)` at least once.
 * When to use: From `requestOrdersFlow` when a new AI consultation begins.
 * Expected outcome: Subsequent hot-loop calls within the same request can dedup repeats again within that turn window.
 * Exceptions: None.
 */
export function resetHexControllerParityCheckDedupForTurn(): void {
  logDebug('snapshotDbParity resetHexControllerParityCheckDedupForTurn');
  seenParityCheckKeys.clear();
}

/**
 * Resets parity dedup keys and the test read counter between unit tests.
 *
 * Purpose: Test hook only.
 * When to use: Start of `snapshotDbParity.test.ts` cases.
 * Expected outcome: Next parity check behaves like a fresh turn for dedup purposes.
 * Exceptions: None.
 */
export function resetParityCheckDedupAndTestCountersForTests(): void {
  seenParityCheckKeys.clear();
  parityCheckDbReadCountForTests = 0;
}

/**
 * Returns how many `getHexController` reads parity checking performed since the last test reset.
 *
 * Purpose: Contract test for DB-read dedup without asserting cache internals.
 * When to use: After calling `logHexControllerParityMismatch` twice with the same pair.
 * Expected outcome: Count is 1 when dedup works; 2 after `resetHexControllerParityCheckDedupForTurn`.
 * Exceptions: None.
 */
export function getParityCheckDbReadCountForTests(): number {
  return parityCheckDbReadCountForTests;
}

/**
 * Issues a one-time-per-turn DB read to detect snapshot vs. live-DB controller divergence for a hex.
 *
 * Purpose: Diagnostic guard that catches AI turns where the in-memory snapshot drifts from the DB truth.
 * When to use: Call after any AI calculation that reads `snapshotController` from `IndexedState`; dedup
 * ensures each `(h3Index, context)` pair only reads from the DB once per turn.
 * Expected outcome: Logs an error at most once per mismatch key per session; silent when parity holds.
 * Exceptions: DB errors are caught and logged separately; never throws.
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
  if (!shouldRunParityCheck(args.h3Index, args.context)) return;
  try {
    parityCheckDbReadCountForTests += 1;
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
