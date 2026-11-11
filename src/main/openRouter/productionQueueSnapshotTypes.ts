/**
 * Queue rows returned by query_production for the production briefing.
 *
 * Purpose: The briefing table and the idle-hex check must read the same snapshot shape.
 * When to use: Import from the production briefing and from the idle-hex selector.
 * Expected outcome: The two snapshot interfaces, with the comments they had beside the table formatter.
 * Exceptions: None.
 */

/**
 * Documents the `ProductionQueueEntrySnapshot` interface as a named contract surface (interface ProductionQueueEntrySnapshot).

 * Purpose: Supports maintainability by documenting why `ProductionQueueEntrySnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ProductionQueueEntrySnapshot {
    /**
   * Specifies the contract for the `entryId` member (entryId?: unknown;).

   * Contract: Describes stable behavior for callers of `entryId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
entryId?: unknown;
    /**
   * Specifies the contract for the `queueIndex` member (queueIndex?: unknown;).

   * Contract: Describes stable behavior for callers of `queueIndex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
queueIndex?: unknown;
    /**
   * Specifies the contract for the `unitType` member (unitType?: unknown;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType?: unknown;
    /**
   * Specifies the contract for the `count` member (count?: unknown;).

   * Contract: Describes stable behavior for callers of `count` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
count?: unknown;
}

/**
 * Documents the `ControlledHexQueueSnapshot` interface as a named contract surface (interface ControlledHexQueueSnapshot).

 * Purpose: Supports maintainability by documenting why `ControlledHexQueueSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ControlledHexQueueSnapshot {
    /**
   * Specifies the contract for the `hex` member (hex?: unknown;).

   * Contract: Describes stable behavior for callers of `hex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hex?: unknown;
    /**
   * Specifies the contract for the `urbanHexCount` member (urbanHexCount?: unknown;).

   * Contract: Describes stable behavior for callers of `urbanHexCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urbanHexCount?: unknown;
    /**
   * Specifies the contract for the `airportCount` member (airportCount?: unknown;).

   * Contract: Describes stable behavior for callers of `airportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airportCount?: unknown;
    /**
   * Specifies the contract for the `seaportCount` member (seaportCount?: unknown;).

   * Contract: Describes stable behavior for callers of `seaportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seaportCount?: unknown;
  /**
   * Fortified city cells on a hex the commander controls.
   *
   * Contract: From `query_production`. Absent on another seat's hex.
   * When to use: The Fortified column.
   * Expected outcome: A non-negative count.
   * Exceptions: None.
   */
  fortifiedCount?: unknown;
  /**
   * Intact city cells that are not yet fortified.
   *
   * Contract: From `query_production`, paired with `fortifiedCount`.
   * When to use: The Fortified column's denominator.
   * Expected outcome: A non-negative count.
   * Exceptions: None.
   */
  fortifiableCount?: unknown;
  /**
   * Whether building is paused on this hex.
   *
   * Contract: True only when the queue cannot spend because the seat has no unit or fortification there.
   * When to use: The Building column.
   * Expected outcome: True, false, or absent.
   * Exceptions: None.
   */
  buildPaused?: unknown;
  /**
   * Why the next queued item is not spending.
   *
   * Contract: Reason texts from `QUEUE_PAUSE_REASON_TEXT`. Present on the requester's hexes only when at least one reason applies.
   * When to use: Grouping paused queues in the briefing.
   * Expected outcome: One or more reason texts, or absent.
   * Exceptions: None.
   */
  pausedReasons?: unknown;
  /**
   * Banked production points on the hex.
   *
   * Contract: Present on a hex the requester controls.
   * When to use: The paused-queue briefing, which totals points waiting in paused cells.
   * Expected outcome: A non-negative number, or absent.
   * Exceptions: None.
   */
  storedPoints?: unknown;
    /**
   * Specifies the contract for the `availableUnitTypes` member (availableUnitTypes?: unknown;).

   * Contract: Describes stable behavior for callers of `availableUnitTypes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
availableUnitTypes?: unknown;
    /**
   * Specifies the contract for the `entries` member (entries?: unknown;).

   * Contract: Describes stable behavior for callers of `entries` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
entries?: unknown;
}
