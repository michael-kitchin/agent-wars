/**
 * A renderer counter that moves when New opens and when Start is clicked.
 *
 * Purpose: A Ready, battle exit, or battle start that is still awaiting IPC must not write the old match back
 * after the player has already asked for a new one.
 * When to use: Capture `currentRendererMatchEpoch` before an await, and return before any later renderer write
 * when `rendererMatchEpochCurrent` is false.
 * Expected outcome: The counter increases only through `advanceRendererMatchEpoch`.
 * Exceptions: None.
 */

let rendererMatchEpoch = 0;

/**
 * Moves the renderer match epoch forward.
 *
 * Purpose: Opening New and clicking Start each retire in-flight renderer handlers.
 * When to use: At the start of opening the new-game overlay, and at the start of the Start click.
 * Expected outcome: The new count. Two increases are fine; handlers only check inequality.
 * Exceptions: None.
 */
export function advanceRendererMatchEpoch(): number {
  rendererMatchEpoch += 1;
  return rendererMatchEpoch;
}

/**
 * The renderer match epoch right now.
 *
 * Purpose: A handler captures this before its first await.
 * When to use: Ready, tactical exit, and starting a battle.
 * Expected outcome: The current count.
 * Exceptions: None.
 */
export function currentRendererMatchEpoch(): number {
  return rendererMatchEpoch;
}

/**
 * True when `captured` is still the current epoch.
 *
 * Purpose: A stale handler must not clear a newer Ready's in-flight flag or apply an old snapshot.
 * When to use: After every await in those handlers, and in Ready's `finally`.
 * Expected outcome: False after `advanceRendererMatchEpoch` has run since `captured`.
 * Exceptions: None.
 */
export function rendererMatchEpochCurrent(captured: number): boolean {
  return captured === rendererMatchEpoch;
}
