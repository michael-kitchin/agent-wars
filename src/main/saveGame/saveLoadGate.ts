/**
 * The flag that keeps a manual save, a manual load, and an automatic save from sharing one staging file.
 *
 * Purpose: Those three writes use `save-staging.agentwars`. The flag lives here so an automatic save can see it without importing the save and load pipeline.
 * When to use: At the start and end of a manual save or load, and at the start of an automatic save.
 * Expected outcome: At most one of those operations is inside its critical section.
 * Exceptions: None.
 */

import { logDebug, logTrace } from '../logger';

/** True from the start of a manual save or load until that call finishes. */
let operationInProgress = false;

/**
 * Reports whether a manual save or load is inside its critical section.
 *
 * Purpose: An automatic save returns immediately instead of using the same staging file.
 * When to use: Before an automatic save writes.
 * Expected outcome: True while `tryBeginSaveLoadOperation` has not been paired with `endSaveLoadOperation`.
 * Exceptions: None.
 */
export function isSaveOrLoadInProgress(): boolean {
  logTrace('saveLoadGate isSaveOrLoadInProgress', { operationInProgress });
  return operationInProgress;
}

/**
 * Marks a manual save or load as started.
 *
 * Purpose: A second click, or a save started while a load dialog is open, has to fail instead of sharing the staging file.
 * When to use: At the start of `runSaveGame` and `runLoadGame`.
 * Expected outcome: True when this call acquired the flag. False when another operation already holds it.
 * Exceptions: None.
 */
export function tryBeginSaveLoadOperation(): boolean {
  if (operationInProgress) {
    logDebug('saveLoadGate tryBeginSaveLoadOperation refused', { operationInProgress });
    return false;
  }
  operationInProgress = true;
  logDebug('saveLoadGate tryBeginSaveLoadOperation');
  return true;
}

/**
 * Clears the manual save or load flag.
 *
 * Purpose: The next save or load can start after this call returns, including when the call failed.
 * When to use: The `finally` of `runSaveGame` and `runLoadGame`.
 * Expected outcome: `isSaveOrLoadInProgress` is false.
 * Exceptions: None.
 */
export function endSaveLoadOperation(): void {
  operationInProgress = false;
  logDebug('saveLoadGate endSaveLoadOperation');
}
