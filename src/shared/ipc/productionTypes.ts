/**
 * Canonical deployment / build-queue iteration order: infantry, armor, naval, air, missile.
 *
 * Purpose: Single source for cap ordering, availability filters, deployment UI, and OpenRouter tool enums.
 * When to use: Spread or copy when a mutable `BuildUnitType[]` is required; use `BuildUnitType` for typed elements.
 * Expected outcome: All game surfaces that list types in this order stay aligned.
 * Exceptions: None.
 */
export const ALL_BUILD_UNIT_TYPES = ['infantry', 'armor', 'naval', 'air', 'missile'] as const;

/**
 * Union of deployable unit kinds used in production queues and deployment caps.
 *
 * Purpose: Typed alternative to raw strings for queue rows, IPC payloads, and DB columns.
 * When to use: Prefer over `string` wherever the value must be one of the buildable types.
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
  return typeof value === 'string' && (ALL_BUILD_UNIT_TYPES as readonly string[]).includes(value);
}

/**
 * Queue order: the five unit types, then a fortification, then credits.
 *
 * Purpose: Menus, templates, and eligibility lists share one order.
 * When to use: Anywhere a build queue offers items, including a fortification or a credits purchase.
 * Expected outcome: Unit types stay in cap order. `fortification` follows them. `credits` is last.
 * Exceptions: None.
 */
export const ALL_BUILD_QUEUE_ITEM_TYPES = [...ALL_BUILD_UNIT_TYPES, 'fortification', 'credits'] as const;

/**
 * A build-queue row: a unit type, a fortification, or a credits purchase.
 *
 * Purpose: Queue rows are not limited to units. A fortification and a credits purchase are not `BuildUnitType` values.
 * When to use: Queue snapshots, templates, Keep building, and production spend.
 * Expected outcome: Exhaustive switches cover the five unit types, `fortification`, and `credits`.
 * Exceptions: None.
 */
export type BuildQueueItemType = (typeof ALL_BUILD_QUEUE_ITEM_TYPES)[number];

/**
 * Narrows unknown input to a build-queue item.
 *
 * Purpose: IPC and stored Keep-building values can name a fortification or a credits purchase.
 * When to use: Before accepting a queue type from JSON or the database.
 * Expected outcome: TypeScript narrows `value` to `BuildQueueItemType` when `true`.
 * Exceptions: None. Returns false for any other value.
 */
export function isBuildQueueItemType(value: unknown): value is BuildQueueItemType {
  return typeof value === 'string' && (ALL_BUILD_QUEUE_ITEM_TYPES as readonly string[]).includes(value);
}

/**
 * Documents the `StrategicProductionContextSnapshot` interface as a named contract surface (export interface StrategicProductionContextSnapshot).

 * Purpose: Supports maintainability by documenting why `StrategicProductionContextSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface StrategicProductionContextSnapshot {
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
   * Specifies the contract for the `unitType` member (unitType: BuildQueueItemType;).

   * Contract: A unit type or a fortification.
   * When to use: Reading one queue row.
   * Expected outcome: One `BuildQueueItemType`.
   * Exceptions: None.
   */
unitType: BuildQueueItemType;
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
   * Specifies the contract for the `urbanHexCount` member (urbanHexCount: StrategicProductionContextSnapshot['urbanHexCount'];).

   * Contract: Describes stable behavior for callers of `urbanHexCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urbanHexCount: StrategicProductionContextSnapshot['urbanHexCount'];
    /**
   * Specifies the contract for the `storedPoints` member (storedPoints: number;).

   * Contract: Carry-over production points for this hex before the next urban capacity pulse is applied.
   * When to use: UI that simulates queue completion time or mirrors in-game production banked points.
   * Expected outcome: Non-negative integer matching `res_s_build_progress.stored_points` for the same hex.
   * Exceptions: None.
   */
storedPoints: number;
    /**
   * Specifies the contract for the `airportCount` member (airportCount: StrategicProductionContextSnapshot['airportCount'];).

   * Contract: Describes stable behavior for callers of `airportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airportCount: StrategicProductionContextSnapshot['airportCount'];
    /**
   * Specifies the contract for the `seaportCount` member (seaportCount: StrategicProductionContextSnapshot['seaportCount'];).

   * Contract: Describes stable behavior for callers of `seaportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seaportCount: StrategicProductionContextSnapshot['seaportCount'];
    /**
   * Specifies the contract for the `availableUnitTypes` member (availableUnitTypes: BuildQueueItemType[];).

   * Contract: Every item this hex can queue.
   * When to use: Build menus and eligibility checks.
   * Expected outcome: Unit types first, then `fortification` when an intact city cell remains.
   * Exceptions: None.
   */
availableUnitTypes: BuildQueueItemType[];
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
  /**
   * Whether Keep building is armed for this hex.
   *
   * Contract: True when the hex should auto-refill after the queue empties.
   * When to use: Build popup checkbox state and engine same-turn refill.
   * Expected outcome: Matches `res_s_build_progress.keep_building` for the hex.
   * Exceptions: None.
   */
  keepBuilding: boolean;
  /**
   * Unit type used for Keep-building refill when armed.
   *
   * Contract: Last valid standing unit type, or null when Keep building is off.
   * When to use: Checkbox labeling/diagnostics and engine refill.
   * Expected outcome: Matches `res_s_build_progress.keep_building_unit_type`, or null when disarmed.
   * Exceptions: None.
   */
  keepBuildingUnitType: BuildQueueItemType | null;
  /**
   * Whether production is paused on this hex.
   *
   * Contract: Present and true only when the requester controls the hex and cannot build there. Omitted otherwise.
   * When to use: The build popup's paused note. Edits stay allowed.
   * Expected outcome: True, or absent.
   * Exceptions: None.
   */
  buildPaused?: boolean;
}

/**
 * Result of setting Keep building on one or more production hexes.
 *
 * Purpose: Best-effort batch arm/disarm matching multi-hex template apply style.
 * When to use: Build popup checkbox changes for single- or multi-hex selection.
 * Expected outcome: `success` is false only when at least one hex failed validation/persistence.
 * Exceptions: None.
 */
export interface SetHexesKeepBuildingResult {
  /**
   * True when every requested hex applied without a hard failure.
   *
   * Contract: Failures populate `failed`; successful hexes populate `applied`.
   * When to use: Deciding whether to toast an error after a checkbox change.
   * Expected outcome: False iff `failed.length > 0`.
   * Exceptions: None.
   */
  success: boolean;
  /**
   * Optional top-level reason (e.g. empty hex list).
   *
   * Contract: Present for call-level validation failures before per-hex work.
   * When to use: Error messaging when nothing could be attempted.
   * Expected outcome: Undefined when per-hex processing ran.
   * Exceptions: None.
   */
  reason?: string;
  /**
   * Hexes whose standing order was successfully updated.
   *
   * Contract: Stable request order among successes.
   * When to use: Refreshing snapshots after a batch write.
   * Expected outcome: H3 indexes that accepted the Keep-building mutation.
   * Exceptions: None.
   */
  applied: string[];
  /**
   * Hexes that rejected the mutation.
   *
   * Contract: Each entry includes an actionable reason.
   * When to use: Error toast / diagnostics; does not roll back siblings.
   * Expected outcome: Zero or more failure records.
   * Exceptions: None.
   */
  failed: Array<{ h3Index: string; reason: string }>;
}

/**
 * One ordered row in a queue template applied across multiple production hexes.
 *
 * Purpose: Keeps batch build-queue writes independent of per-hex database entry ids.
 * When to use: Renderer multi-hex queue editing and the corresponding IPC action.
 * Expected outcome: The backend preserves row order while filtering unavailable types per hex.
 * Exceptions: Counts are normalized to the configured build-count range by the backend.
 */
export interface BuildQueueTemplateEntry {
  /**
   * Buildable unit kind requested for this template row.
   *
   * Contract: A unit type or a fortification.
   * When to use: Identifying the row to filter and persist per selected hex.
   * Expected outcome: Eligible hexes receive this item in template order.
   * Exceptions: None.
   */
  unitType: BuildQueueItemType;
  /**
   * Remaining unit count requested for each eligible selected hex.
   *
   * Contract: Numeric input is normalized to the configured production count range by the backend.
   * When to use: Specifying how many units each eligible hex should retain in this row.
   * Expected outcome: A per-hex remaining count from one through 99.
   * Exceptions: None.
   */
  count: number;
}

/**
 * A template row omitted from one hex because that hex cannot build its unit type.
 *
 * Purpose: Makes partial eligibility explicit for diagnostics without treating it as an error.
 * When to use: Batch apply results; the renderer normally represents this through N-of-M labels.
 * Expected outcome: Identifies the affected hex, type, and stable explanation.
 * Exceptions: Skips do not make the overall operation fail.
 */
export interface BuildQueueTemplateSkip {
  /**
   * Hex that did not receive the template row.
   *
   * Contract: Identifies one requested selected hex.
   * When to use: Correlating a skip with renderer eligibility summaries or diagnostics.
   * Expected outcome: The skipped hex's H3 index.
   * Exceptions: None.
   */
  h3Index: string;
  /**
   * Unit type unavailable at the affected hex.
   *
   * Contract: Identifies the template row filtered from this hex.
   * When to use: Explaining partial eligibility.
   * Expected outcome: One build-queue item.
   * Exceptions: None.
   */
  unitType: BuildQueueItemType;
  /**
   * Human-readable eligibility explanation.
   *
   * Contract: Describes why the row was intentionally omitted rather than failed.
   * When to use: Diagnostics; normal renderer UX uses N-of-M labels instead.
   * Expected outcome: A non-empty explanation.
   * Exceptions: None.
   */
  reason: string;
}

/**
 * A hex-level validation or persistence failure during best-effort template application.
 *
 * Purpose: Lets callers report hard failures while preserving successful sibling writes.
 * When to use: Batch apply results when one selected hex cannot be edited.
 * Expected outcome: Identifies the failed hex and actionable reason.
 * Exceptions: None.
 */
export interface BuildQueueTemplateFailure {
  /**
   * Hex whose queue was not replaced.
   *
   * Contract: Identifies one requested selected hex.
   * When to use: Correlating a hard failure with selection state.
   * Expected outcome: The failed hex's H3 index.
   * Exceptions: None.
   */
  h3Index: string;
  /**
   * Human-readable validation or persistence failure.
   *
   * Contract: Explains why no queue write occurred for this hex.
   * When to use: Error toast selection and diagnostics.
   * Expected outcome: A non-empty actionable explanation.
   * Exceptions: None.
   */
  reason: string;
}

/**
 * Result of applying one ordered build-queue template to multiple hexes.
 *
 * Purpose: Separates successful writes, intentional eligibility skips, and hard failures.
 * When to use: Main-to-renderer response for multi-hex build queue synchronization.
 * Expected outcome: `success` is false only when at least one hard failure occurred.
 * Exceptions: Empty selections return a hard failure and no applied hexes.
 */
export interface ApplyBuildQueueTemplateResult {
  /**
   * Indicates whether every requested hex avoided a hard failure.
   *
   * Contract: Eligibility skips do not make this value false.
   * When to use: Choosing whether to show a hard-error toast.
   * Expected outcome: False exactly when `failed` is non-empty or the request is invalid.
   * Exceptions: None.
   */
  success: boolean;
  /**
   * Hexes whose queue was replaced.
   *
   * Contract: Includes successful replacement with an empty eligibility-filtered queue.
   * When to use: Deciding whether renderer game state needs refresh.
   * Expected outcome: Stable request-order H3 indexes without duplicates.
   * Exceptions: None.
   */
  applied: string[];
  /**
   * Eligibility-filtered rows intentionally omitted from individual hexes.
   *
   * Contract: Contains no hard validation or persistence failures.
   * When to use: Diagnostics and eligibility reconciliation.
   * Expected outcome: Zero or more per-hex template-row skips.
   * Exceptions: None.
   */
  skipped: BuildQueueTemplateSkip[];
  /**
   * Hexes not changed because validation or persistence failed.
   *
   * Contract: Successful siblings may still appear in `applied`.
   * When to use: Reporting best-effort batch failures.
   * Expected outcome: Zero or more actionable per-hex failures.
   * Exceptions: None.
   */
  failed: BuildQueueTemplateFailure[];
  /**
   * Optional top-level explanation for a request-wide validation failure.
   *
   * Contract: Omitted for ordinary per-hex outcomes.
   * When to use: Invalid requests such as an empty selected-hex list.
   * Expected outcome: A concise explanation when present.
   * Exceptions: None.
   */
  reason?: string;
}
