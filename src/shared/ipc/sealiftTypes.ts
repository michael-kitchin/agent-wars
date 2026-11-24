/**
 * Stack sealift UI classification for one hex.
 *
 * Purpose: Tells the renderer whether embark controls belong at a port, on open water, or not at all.
 * When to use: `SealiftStackState.contextMode` from strategic and tactical stack builders.
 * Expected outcome: `coastal_port` is a valid human embark hex (native coastal, land seaport with water or coast in or next to the hex, or controlled water seaport). `water` is open ocean or a water seaport the human does not control. `coastal_no_port` is coastal movement terrain that is not a valid embark hex. `port_no_sea_access` is a land seaport with no water or coast in or next to the hex: nothing boards there, and cargo may still debark. `unsupported` is missing or inland without a seaport.
 * Exceptions: None.
 */
export type SealiftContextMode = 'coastal_port' | 'coastal_no_port' | 'port_no_sea_access' | 'water' | 'unsupported';

/**
 * Documents the `SealiftLandUnitOption` interface as a named contract surface (export interface SealiftLandUnitOption).

 * Purpose: Supports maintainability by documenting why `SealiftLandUnitOption` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface SealiftLandUnitOption {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `unitType` member (unitType: 'infantry' | 'armor';).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: 'infantry' | 'armor';
}

/**
 * One cargo slot of a carrier, as the slot editor shows it.
 *
 * Purpose: Lets the renderer draw each slot, its occupant, and whether armor in the slot before also fills it.
 * When to use: `SealiftNavalRow.slots`.
 * Expected outcome: One entry per slot of the carrier, in `layoutCargoSlots` order.
 * Exceptions: None.
 */
export interface SealiftCargoSlot {
  /**
   * The land unit that starts in this slot.
   *
   * Contract: Null when the slot is empty or covered by armor.
   * When to use: Choosing the select's current value.
   * Expected outcome: A strategic unit id or a tactical sub-unit id, or null.
   * Exceptions: None.
   */
  unitId: string | null;
  /**
   * The armor unit in the slot before that also fills this slot.
   *
   * Contract: Null unless this slot is the second slot of an armor unit.
   * When to use: Drawing a disabled slot that names the armor.
   * Expected outcome: An armor unit id or null.
   * Exceptions: None.
   */
  coveredByUnitId: string | null;
  /**
   * Whether the slot's select is disabled.
   *
   * Contract: True when the row's controls are disabled or armor covers the slot.
   * When to use: Setting `select.disabled`.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  disabled: boolean;
  /**
   * Whether the slot's debark button is enabled.
   *
   * Contract: True when debark is allowed here and `unitId` is set.
   * When to use: Showing the debark button.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  debarkEnabled: boolean;
}

/**
 * One carrier in a stack and its cargo slots.
 *
 * Purpose: The renderer's whole view of one ship or air unit in the sealift section.
 * When to use: `SealiftStackState.navalRows`.
 * Expected outcome: `slots` holds `carrierCargoSlots(carrierUnitType)` entries.
 * Exceptions: None.
 */
export interface SealiftNavalRow {
  /**
   * The carrier's unit id.
   *
   * Contract: A strategic unit id or a tactical sub-unit id.
   * When to use: Naming the carrier in slot edits.
   * Expected outcome: A non-empty string.
   * Exceptions: None.
   */
  navalUnitId: string;
  /**
   * The carrier's unit type.
   *
   * Contract: `naval` or `air`.
   * When to use: Limiting an air unit's options to infantry.
   * Expected outcome: One of the two values.
   * Exceptions: None.
   */
  carrierUnitType: 'naval' | 'air';
  /**
   * The carrier's cargo slots.
   *
   * Contract: `carrierCargoSlots(carrierUnitType)` entries, in `layoutCargoSlots` order.
   * When to use: Drawing one control per slot.
   * Expected outcome: Four entries for a ship and two for an air unit.
   * Exceptions: None.
   */
  slots: SealiftCargoSlot[];
  /**
   * Whether every control on this carrier is disabled.
   *
   * Contract: True at sea, at a coastal hex without a port, and at a port without sea access.
   * When to use: Disabling the row.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  controlsDisabled: boolean;
}

/**
 * One slot edit from the stack popup.
 *
 * Purpose: One payload for strategic and tactical slot updates.
 * When to use: `updateSealiftSlot`, `updateTacticalSealiftSlot`, and the engine functions behind them.
 * Expected outcome: Names a hex, a carrier, a 1-based slot, and the unit to place there, or null to empty it.
 * Exceptions: None.
 */
export interface SealiftSlotEdit {
  /**
   * The stack's hex.
   *
   * Contract: An H3 index.
   * When to use: Locating the stack.
   * Expected outcome: A non-empty string.
   * Exceptions: None.
   */
  h3Index: string;
  /**
   * The carrier being edited.
   *
   * Contract: An id in the stack.
   * When to use: Choosing the carrier.
   * Expected outcome: A non-empty string.
   * Exceptions: None.
   */
  navalUnitId: string;
  /**
   * The slot being edited, counted from 1.
   *
   * Contract: An integer from 1 to `MAX_CARRIER_CARGO_SLOTS`. The engine checks it against the carrier's own slots.
   * When to use: Choosing the slot.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  slotIndex: number;
  /**
   * The land unit to place in the slot.
   *
   * Contract: Null empties the slot, which debarks its unit.
   * When to use: Embarking or debarking.
   * Expected outcome: A unit id or null.
   * Exceptions: None.
   */
  landUnitId: string | null;
}

/**
 * The reply to a slot edit.
 *
 * Purpose: Tells the renderer whether the edit applied and what the stack looks like now.
 * When to use: The result of `updateSealiftSlot`.
 * Expected outcome: `state` on success, `reason` on refusal.
 * Exceptions: None.
 */
export interface SealiftSlotEditResult {
  /**
   * Whether the edit applied.
   *
   * Contract: False carries a `reason`.
   * When to use: Branching on the reply.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  success: boolean;
  /**
   * Why the edit was refused.
   *
   * Contract: Present on refusal.
   * When to use: Showing the refusal.
   * Expected outcome: A sentence.
   * Exceptions: None.
   */
  reason?: string;
  /**
   * The stack after the edit.
   *
   * Contract: Present on success.
   * When to use: Redrawing the section.
   * Expected outcome: A `SealiftStackState`.
   * Exceptions: None.
   */
  state?: SealiftStackState;
}

/**
 * Documents the `SealiftStackState` interface as a named contract surface (export interface SealiftStackState).

 * Purpose: Supports maintainability by documenting why `SealiftStackState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface SealiftStackState {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `showSealiftSection` member (showSealiftSection: boolean;).

   * Contract: Describes stable behavior for callers of `showSealiftSection` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showSealiftSection: boolean;
    /**
   * Stack classification used with `controlsDisabled` for embark dropdowns.
 *
 * Contract: `coastal_port` means the human may embark here (native coastal, land seaport with water or coast in or next to the hex, or controlled water seaport). `water` means open ocean or a water seaport the human does not control. `port_no_sea_access` means a land seaport with no sea access, where nothing boards and debark stays allowed.
 * When to use: Debugging and tests; the renderer gates embark on `controlsDisabled`, not this field.
 * Expected outcome: Matches `getSealiftStackContextModeForHex` for the stack hex.
 * Exceptions: None.
   */
contextMode: SealiftContextMode;
    /**
   * Whether embark slot dropdowns are disabled for this stack.
 *
 * Contract: True for `water`, `coastal_no_port`, and `port_no_sea_access`; false for `coastal_port`.
 * When to use: Renderer sealift selects. Debark buttons use each slot's `debarkEnabled` instead.
 * Expected outcome: False at controlled water seaports so cargo can board.
 * Exceptions: None.
   */
controlsDisabled: boolean;
    /**
   * Specifies the contract for the `hasEmbarkedUnitsInStack` member (hasEmbarkedUnitsInStack: boolean;).

   * Contract: Describes stable behavior for callers of `hasEmbarkedUnitsInStack` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hasEmbarkedUnitsInStack: boolean;
    /**
   * Whether manual debark is permitted at this hex for the human player (coastal or controlled water seaport).

   * Contract: Mirrors `canManualDebarkFromHex(h3Index, HUMAN_SEAT_ID)` on stack state responses.
   * When to use: Renderer decides whether debark buttons may appear at water seaports.
   * Expected outcome: True when debark IPC may succeed; false on open ocean.
   * Exceptions: None.
   */
debarkAllowedAtHex: boolean;
    /**
   * Specifies the contract for the `navalRows` member (navalRows: SealiftNavalRow[];).

   * Contract: Describes stable behavior for callers of `navalRows` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
navalRows: SealiftNavalRow[];
    /**
   * Specifies the contract for the `landOptions` member (landOptions: SealiftLandUnitOption[];).

   * Contract: Describes stable behavior for callers of `landOptions` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
landOptions: SealiftLandUnitOption[];
}
