/**
 * Documents the `SealiftContextMode` type alias (export type SealiftContextMode).

 * Purpose: Supports maintainability by documenting why `SealiftContextMode` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type SealiftContextMode = 'coastal_port' | 'coastal_no_port' | 'water' | 'unsupported';

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
 * Documents the `SealiftNavalRow` interface as a named contract surface (export interface SealiftNavalRow).

 * Purpose: Supports maintainability by documenting why `SealiftNavalRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface SealiftNavalRow {
    /**
   * Specifies the contract for the `navalUnitId` member (navalUnitId: string;).

   * Contract: Describes stable behavior for callers of `navalUnitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
navalUnitId: string;
    /**
   * Specifies the contract for the `slot1UnitId` member (slot1UnitId: string | null;).

   * Contract: Describes stable behavior for callers of `slot1UnitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
slot1UnitId: string | null;
    /**
   * Specifies the contract for the `slot2UnitId` member (slot2UnitId: string | null;).

   * Contract: Describes stable behavior for callers of `slot2UnitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
slot2UnitId: string | null;
    /**
   * Specifies the contract for the `slot2Disabled` member (slot2Disabled: boolean;).

   * Contract: Describes stable behavior for callers of `slot2Disabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
slot2Disabled: boolean;
    /**
   * Specifies the contract for the `controlsDisabled` member (controlsDisabled: boolean;).

   * Contract: Describes stable behavior for callers of `controlsDisabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
controlsDisabled: boolean;
    /**
   * Specifies the contract for the `debarkSlot1Enabled` member (debarkSlot1Enabled: boolean;).

   * Contract: Describes stable behavior for callers of `debarkSlot1Enabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
debarkSlot1Enabled: boolean;
    /**
   * Specifies the contract for the `debarkSlot2Enabled` member (debarkSlot2Enabled: boolean;).

   * Contract: Describes stable behavior for callers of `debarkSlot2Enabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
debarkSlot2Enabled: boolean;
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
   * Specifies the contract for the `contextMode` member (contextMode: SealiftContextMode;).

   * Contract: Describes stable behavior for callers of `contextMode` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
contextMode: SealiftContextMode;
    /**
   * Specifies the contract for the `controlsDisabled` member (controlsDisabled: boolean;).

   * Contract: Describes stable behavior for callers of `controlsDisabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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

   * Contract: Mirrors `canManualDebarkFromHex(h3Index, 'human')` on stack state responses.
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
