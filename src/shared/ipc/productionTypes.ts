/**
 * Canonical deployment / build-queue iteration order: infantry, armor, naval, air.
 *
 * Purpose: Single source for cap ordering, availability filters, deployment UI, and OpenRouter tool enums.
 * When to use: Spread or copy when a mutable `BuildUnitType[]` is required; use `BuildUnitType` for typed elements.
 * Expected outcome: All game surfaces that list types in this order stay aligned.
 * Exceptions: None.
 */
export const ALL_BUILD_UNIT_TYPES = ['infantry', 'armor', 'naval', 'air'] as const;

/**
 * Union of deployable unit kinds used in production queues and deployment caps.
 *
 * Purpose: Typed alternative to raw strings for queue rows, IPC payloads, and DB columns.
 * When to use: Prefer over `string` wherever the value must be one of the four buildable types.
 * Expected outcome: Compile-time exhaustiveness when switching on `BuildUnitType`.
 * Exceptions: None.
 */
export type BuildUnitType = (typeof ALL_BUILD_UNIT_TYPES)[number];

/**
 * Narrows unknown or stringly-typed values (JSON, tools, IPC) to `BuildUnitType`.
 *
 * Purpose: Avoid duplicated string equality chains when validating external input.
 * When to use: Guards before indexing cap maps or queue operations keyed by unit type.
 * Expected outcome: TypeScript narrows `value` to `BuildUnitType` when `true`.
 * Exceptions: None; returns `false` for any non-matching value.
 */
export function isBuildUnitType(value: unknown): value is BuildUnitType {
  return value === 'infantry' || value === 'armor' || value === 'naval' || value === 'air';
}

/**
 * Documents the `Res1ProductionContextSnapshot` interface as a named contract surface (export interface Res1ProductionContextSnapshot).

 * Purpose: Supports maintainability by documenting why `Res1ProductionContextSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface Res1ProductionContextSnapshot {
    /**
   * Specifies the contract for the `urbanHexCount` member (urbanHexCount: number;).

   * Contract: Describes stable behavior for callers of `urbanHexCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urbanHexCount: number;
    /**
   * Specifies the contract for the `airportCount` member (airportCount: number;).

   * Contract: Describes stable behavior for callers of `airportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airportCount: number;
    /**
   * Specifies the contract for the `seaportCount` member (seaportCount: number;).

   * Contract: Describes stable behavior for callers of `seaportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seaportCount: number;
}

/**
 * Documents the `HexBuildQueueEntrySnapshot` interface as a named contract surface (export interface HexBuildQueueEntrySnapshot).

 * Purpose: Supports maintainability by documenting why `HexBuildQueueEntrySnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HexBuildQueueEntrySnapshot {
    /**
   * Specifies the contract for the `id` member (id: number;).

   * Contract: Describes stable behavior for callers of `id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
id: number;
    /**
   * Specifies the contract for the `queueIndex` member (queueIndex: number;).

   * Contract: Describes stable behavior for callers of `queueIndex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
queueIndex: number;
    /**
   * Specifies the contract for the `unitType` member (unitType: BuildUnitType;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: BuildUnitType;
    /**
   * Specifies the contract for the `count` member (count: number;).

   * Contract: Describes stable behavior for callers of `count` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
count: number;
}

/**
 * Documents the `HexBuildQueueSnapshot` interface as a named contract surface (export interface HexBuildQueueSnapshot).

 * Purpose: Supports maintainability by documenting why `HexBuildQueueSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HexBuildQueueSnapshot {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `controllerPlayerId` member (controllerPlayerId: string | null;).

   * Contract: Describes stable behavior for callers of `controllerPlayerId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
controllerPlayerId: string | null;
    /**
   * Specifies the contract for the `controlledByRequester` member (controlledByRequester: boolean;).

   * Contract: Describes stable behavior for callers of `controlledByRequester` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
controlledByRequester: boolean;
    /**
   * Specifies the contract for the `urbanHexCount` member (urbanHexCount: Res1ProductionContextSnapshot['urbanHexCount'];).

   * Contract: Describes stable behavior for callers of `urbanHexCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urbanHexCount: Res1ProductionContextSnapshot['urbanHexCount'];
    /**
   * Specifies the contract for the `storedPoints` member (storedPoints: number;).

   * Contract: Carry-over production points for this hex before the next urban capacity pulse is applied.
   * When to use: UI that simulates queue completion time or mirrors in-game production banked points.
   * Expected outcome: Non-negative integer matching `res1_build_progress.stored_points` for the same hex.
   * Exceptions: None.
   */
storedPoints: number;
    /**
   * Specifies the contract for the `airportCount` member (airportCount: Res1ProductionContextSnapshot['airportCount'];).

   * Contract: Describes stable behavior for callers of `airportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airportCount: Res1ProductionContextSnapshot['airportCount'];
    /**
   * Specifies the contract for the `seaportCount` member (seaportCount: Res1ProductionContextSnapshot['seaportCount'];).

   * Contract: Describes stable behavior for callers of `seaportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seaportCount: Res1ProductionContextSnapshot['seaportCount'];
    /**
   * Specifies the contract for the `availableUnitTypes` member (availableUnitTypes: BuildUnitType[];).

   * Contract: Describes stable behavior for callers of `availableUnitTypes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
availableUnitTypes: BuildUnitType[];
    /**
   * Specifies the contract for the `buildSectionVisible` member (buildSectionVisible: boolean;).

   * Contract: Describes stable behavior for callers of `buildSectionVisible` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
buildSectionVisible: boolean;
    /**
   * Specifies the contract for the `noBuildReason` member (noBuildReason: string | null;).

   * Contract: Describes stable behavior for callers of `noBuildReason` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
noBuildReason: string | null;
    /**
   * Specifies the contract for the `entries` member (entries: HexBuildQueueEntrySnapshot[];).

   * Contract: Describes stable behavior for callers of `entries` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
entries: HexBuildQueueEntrySnapshot[];
}
