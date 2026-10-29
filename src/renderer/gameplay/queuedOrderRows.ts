/**
 * The groups of the Orders tab, in display order. This module keeps the orders the next Ready will send, as the
 * Orders tab last listed them: the Orders tab writes each group here when it redraws it, and other views, such as the
 * console header's count, read from here instead of rebuilding the lists, so every view shows the same rows.
 *
 * Purpose: Names the groups once for the lists, their counts, and readers.
 * When to use: Passing a group to `publishQueuedOrders`.
 * Expected outcome: Movement holds marches and ferries; the other groups hold their drafts.
 * Exceptions: None.
 */
export type QueuedOrderGroup = 'movement' | 'ranged' | 'strike' | 'launch';

/**
 * One queued order, as other views need it.
 *
 * Purpose: Lets a view name a unit's order and cancel it without knowing which list it came from.
 * When to use: Values passed to `publishQueuedOrders` and returned by `queuedOrderForUnit`.
 * Expected outcome: `detail` is the row's line under the unit name; `cancel` does what the row's × does.
 * Exceptions: None.
 */
export interface QueuedOrderSummary {
  /**
   * The unit or battle sub-unit the order belongs to.
   *
   * Contract: One summary per unit and group.
   * When to use: Matching an order to a selected unit.
   * Expected outcome: An id from the active theater.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * The row's line, such as `→ E5 · 1h`.
   *
   * Contract: Built by the shared order-line formatters.
   * When to use: Showing the order outside the Orders tab.
   * Expected outcome: Plain text.
   * Exceptions: None.
   */
  readonly detail: string;
  /**
   * Cancels this order, exactly as the row's × does.
   *
   * Contract: Refreshes the lists itself.
   * When to use: A cancel control outside the Orders tab.
   * Expected outcome: Only this unit's order is removed.
   * Exceptions: None.
   */
  readonly cancel: () => void;
}

/**
 * The last published rows of each group.
 *
 * Purpose: The single copy readers use.
 * When to use: Written by `publishQueuedOrders` only.
 * Expected outcome: A group never drawn yet counts as empty.
 * Exceptions: None.
 */
const ordersByGroup = new Map<QueuedOrderGroup, readonly QueuedOrderSummary[]>();

/**
 * Callbacks run after any group changes.
 *
 * Purpose: Views that show counts or orders refresh when the lists do.
 * When to use: Added by `onQueuedOrdersChanged`.
 * Expected outcome: Each runs once per publish.
 * Exceptions: None.
 */
const listeners: Array<() => void> = [];

/**
 * Records one group's rows and tells every listener.
 *
 * Purpose: Called by the Orders tab each time it redraws a group.
 * When to use: After the group's list element is filled.
 * Expected outcome: Readers see the new rows, and each listener runs once.
 * Exceptions: A listener that throws stops the later listeners.
 */
export function publishQueuedOrders(group: QueuedOrderGroup, orders: readonly QueuedOrderSummary[]): void {
  ordersByGroup.set(group, orders);
  for (const listener of listeners) listener();
}

/**
 * Counts the queued orders in every group.
 *
 * Purpose: The Orders badge and subtitle show this number.
 * When to use: From a listener or when the console header is drawn.
 * Expected outcome: The sum of the groups' last published lengths.
 * Exceptions: None.
 */
export function queuedOrderCount(): number {
  let count = 0;
  for (const orders of ordersByGroup.values()) count += orders.length;
  return count;
}

/**
 * Finds a unit's queued order.
 *
 * Purpose: Other views show a unit's order with the Orders tab's wording.
 * When to use: For each unit a view lists.
 * Expected outcome: The first match in Movement, then Ranged, then Strike, then Launch order, or null.
 * Exceptions: None.
 */
export function queuedOrderForUnit(unitId: string): QueuedOrderSummary | null {
  for (const group of ['movement', 'ranged', 'strike', 'launch'] as const) {
    const match = ordersByGroup.get(group)?.find((order) => order.unitId === unitId);
    if (match) return match;
  }
  return null;
}

/**
 * Adds a callback that runs whenever a group is published.
 *
 * Purpose: Keeps views that depend on the orders in step without the Orders tab knowing them.
 * When to use: Once per view, during renderer startup.
 * Expected outcome: The callback runs after every later publish.
 * Exceptions: None.
 */
export function onQueuedOrdersChanged(listener: () => void): void {
  listeners.push(listener);
}
