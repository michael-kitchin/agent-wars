/**
 * Documents the `HumanStandingOrderSnapshot` interface as a named contract surface (export interface HumanStandingOrderSnapshot).

 * Purpose: Supports maintainability by documenting why `HumanStandingOrderSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HumanStandingOrderSnapshot {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `status` member (status: string;).

   * Contract: Describes stable behavior for callers of `status` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
status: string;
    /**
   * Specifies the contract for the `destinationH3Index` member (destinationH3Index: string | null;).

   * Contract: Describes stable behavior for callers of `destinationH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
destinationH3Index: string | null;
    /**
   * Specifies the contract for the `turnsRemaining` member (turnsRemaining: number;).

   * Contract: Describes stable behavior for callers of `turnsRemaining` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnsRemaining: number;
    /**
   * Specifies the contract for the `nextMoveH3Index` member (nextMoveH3Index: string | null;).

   * Contract: Describes stable behavior for callers of `nextMoveH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
nextMoveH3Index: string | null;
    /**
   * Specifies the contract for the `routeSegments` member (routeSegments?: { turn: number; hexes: [number, number][] }[];).

   * Contract: Describes stable behavior for callers of `routeSegments` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
routeSegments?: { turn: number; hexes: [number, number][] }[];
}

/**
 * Documents the `HumanOrderPreviewSegment` interface as a named contract surface (export interface HumanOrderPreviewSegment).

 * Purpose: Supports maintainability by documenting why `HumanOrderPreviewSegment` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HumanOrderPreviewSegment {
    /**
   * Specifies the contract for the `turn` member (turn: number;).

   * Contract: Describes stable behavior for callers of `turn` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turn: number;
    /**
   * Specifies the contract for the `hexes` member (hexes: [number, number][];).

   * Contract: Describes stable behavior for callers of `hexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexes: [number, number][];
}

/**
 * Documents the `HumanOrderPreviewResult` interface as a named contract surface (export interface HumanOrderPreviewResult).

 * Purpose: Supports maintainability by documenting why `HumanOrderPreviewResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HumanOrderPreviewResult {
    /**
   * Specifies the contract for the `valid` member (valid: boolean;).

   * Contract: Describes stable behavior for callers of `valid` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
valid: boolean;
    /**
   * Specifies the contract for the `showInvalidMarker` member (showInvalidMarker: boolean;).

   * Contract: Describes stable behavior for callers of `showInvalidMarker` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showInvalidMarker: boolean;
    /**
   * Specifies the contract for the `invalidReason` member (invalidReason?: string;).

   * Contract: Describes stable behavior for callers of `invalidReason` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
invalidReason?: string;
    /**
   * Specifies the contract for the `arrowLatLng` member (arrowLatLng?: [number, number];).

   * Contract: Describes stable behavior for callers of `arrowLatLng` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
arrowLatLng?: [number, number];
    /**
   * Specifies the contract for the `segments` member (segments: HumanOrderPreviewSegment[];).

   * Contract: Describes stable behavior for callers of `segments` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
segments: HumanOrderPreviewSegment[];
}

/**
 * Documents the `HumanOrderGroupPreviewUnitResult` interface as a named contract surface (export interface HumanOrderGroupPreviewUnitResult).

 * Purpose: Supports maintainability by documenting why `HumanOrderGroupPreviewUnitResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HumanOrderGroupPreviewUnitResult {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `preview` member (preview: HumanOrderPreviewResult;).

   * Contract: Describes stable behavior for callers of `preview` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
preview: HumanOrderPreviewResult;
}

/**
 * Documents the `HumanOrderGroupPreviewResult` interface as a named contract surface (export interface HumanOrderGroupPreviewResult).

 * Purpose: Supports maintainability by documenting why `HumanOrderGroupPreviewResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HumanOrderGroupPreviewResult {
    /**
   * Specifies the contract for the `validForAll` member (validForAll: boolean;).

   * Contract: Describes stable behavior for callers of `validForAll` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
validForAll: boolean;
    /**
   * Specifies the contract for the `showInvalidMarker` member (showInvalidMarker: boolean;).

   * Contract: Describes stable behavior for callers of `showInvalidMarker` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showInvalidMarker: boolean;
    /**
   * Specifies the contract for the `invalidReason` member (invalidReason?: string;).

   * Contract: Describes stable behavior for callers of `invalidReason` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
invalidReason?: string;
    /**
   * Specifies the contract for the `slowestMovementRange` member (slowestMovementRange: number;).

   * Contract: Describes stable behavior for callers of `slowestMovementRange` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
slowestMovementRange: number;
    /**
   * Specifies the contract for the `previews` member (previews: HumanOrderGroupPreviewUnitResult[];).

   * Contract: Describes stable behavior for callers of `previews` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
previews: HumanOrderGroupPreviewUnitResult[];
}
