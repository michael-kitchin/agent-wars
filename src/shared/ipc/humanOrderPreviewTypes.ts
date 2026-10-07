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
/**
 * Structured terrain / transport hints for valid march (and tactical ranged) order previews shown as HTML tooltips.
 *
 * Purpose: Lets the renderer render comma-separated `Slower:` lists and a separate `Using: Road/Rail` line without re-walking paths.
 * When to use: Populate on each `HumanOrderPreviewResult` when `valid` and terrain throttles movement or infrastructure applies.
 * Expected outcome: `slower` contains title-case terrain tokens (typically sorted). A cell entered at the road or rail rate is left out of `slower`; the start cell's budget can still add Urban, Rubble, or Forest. `roadRail` is true when any step paid that rate, including a plains road and a road through urban.
 * Exceptions: Omitted entirely when no throttle applies; never set on invalid-only previews.
 */
export type OrderPreviewTerrainImpact = {
  readonly slower: readonly string[];
  readonly roadRail: boolean;
  /**
   * The path entered a cell on a road.
   *
   * Contract: Optional. True only when a step used the line rate and the destination cell had a road and no rail. Omitted when unknown.
   * When to use: The Using line. A true `roadRail` with both flags omitted still means an unspecified line.
   * Expected outcome: The road icon, without the rail icon.
   * Exceptions: None.
   */
  readonly road?: boolean;
  /**
   * The path entered a cell on a rail.
   *
   * Contract: Optional. True when a step used the line rate and the destination cell had a rail. Rail wins over a road on the same cell.
   * When to use: The Using line.
   * Expected outcome: The rail icon. A path can set both this and `road` when different steps used different lines.
   * Exceptions: None.
   */
  readonly rail?: boolean;
};

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
    /**
   * Optional title-case terrain word when this preview is **valid** but terrain throttles movement (e.g. `Forest`, `Urban`).
   *
   * Contract: Omitted or `null` on strategic marches (no strategic slowdowns) and when not applicable; never required with `valid: false`.
   * When to use: Tactical `buildTacticalMarchHoverPreview` and merged grouped envelopes; strategic `previewHumanMarchOrders` leaves it null.
   * Expected outcome: Plain-text aggregate for logs/sidebar; comma-separated when multiple terrains apply; renderer prefers `orderPreviewTerrainImpact` for tooltips.
   * Exceptions: None.
   */
slowerTerrainDisplayTitle?: string | null;
    /**
   * Terrain throttle + road/rail transport flags for HTML order-preview tooltips (`#order-slower-tooltip`).
   *
   * Contract: Present only when `valid` and at least one of `slower.length > 0` or `roadRail` is true. Strategic marches omit this.
   * When to use: Tactical `buildTacticalMarchHoverPreview` and merged grouped envelopes.
   * Expected outcome: The order-effects tooltip reads `slower` and `roadRail` for a battle march without recomputing the path.
   * Exceptions: None.
   */
orderPreviewTerrainImpact?: OrderPreviewTerrainImpact | null;
}

/**
 * Wrapper for tactical draft march previews that also exposes the committed tactical H3 path for stable overlay reuse.
 *
 * Purpose: Keeps `HumanOrderPreviewResult` unchanged for IPC while letting the renderer cache `pathH3Indexes` alongside lat/lng segments.
 * When to use: `buildTacticalMarchDraftDestinationPreview` return value; tactical pending-march row construction in the renderer.
 * Expected outcome: `preview` matches hover/draft segment styling; `pathH3Indexes` is the H3 chain used for `preview.segments` (null when unreachable).
 * Exceptions: None.
 */
export interface TacticalDraftPreviewResult {
  /**
   * Lat/lng segment preview for canvas drawing and sidebar validation messaging.
   *
   * Contract: Same `HumanOrderPreviewResult` shape as hover previews; segments reflect the committed or override H3 path.
   * When to use: Destructure from `buildTacticalMarchDraftDestinationPreview` for drawing and validation UI.
   * Expected outcome: `valid` and `segments` suitable for `drawTacticalPendingMarchPlanLines` without extra conversion.
   * Exceptions: None.
   */
  preview: HumanOrderPreviewResult;
  /**
   * Ordered tactical H3 indexes (inclusive endpoints) used to build `preview.segments`; null when unreachable.
   *
   * Contract: When non-null, indexes match the path used for segment generation; head is the planning origin cell.
   * When to use: Store on `TacticalPendingMarchRow.pathH3Indexes` at draft time or after continuation tail advance.
   * Expected outcome: Enables path-tail reuse via `findPathTailFromCurrentPosition` across tactical beats.
   * Exceptions: None.
   */
  pathH3Indexes: string[] | null;
}

/**
 * Human tactical pending march row stored in renderer state before Ready commit.
 *
 * Purpose: Holds destination plus optional cached path data so beat-to-beat overlays do not replan from scratch.
 * When to use: `S.tacticalPendingMarches` entries during an active tactical battle.
 * Expected outcome: `pathH3Indexes` and `cachedSegments` are populated when a draft route is first computed or advanced along a continuation tail.
 * Exceptions: None.
 */
export interface TacticalPendingMarchRow {
  /**
   * Specifies the contract for the `subUnitId` member (subUnitId: string;).
   *
   * Contract: Describes stable behavior for callers of `subUnitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  subUnitId: string;
  /**
   * Specifies the contract for the `destinationH3Index` member (destinationH3Index: string;).
   *
   * Contract: Describes stable behavior for callers of `destinationH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  destinationH3Index: string;
  /**
   * Committed tactical H3 path from unit origin to destination for stable display across beats.
   *
   * Contract: Inclusive endpoints; head must match unit `h3Index` for cached segment reuse in the renderer.
   * When to use: Populated at draft commit and advanced via `buildTacticalPendingMarchRowsFromContinuations`.
   * Expected outcome: Optional until first successful preview; omitted when route is unreachable.
   * Exceptions: None.
   */
  pathH3Indexes?: string[];
  /**
   * Precomputed lat/lng segments matching `pathH3Indexes`; used by `drawTacticalPendingMarchPlanLines` without replanning.
   *
   * Contract: Same turn-split segment shape as tactical hover previews; paired with `pathH3Indexes` when present.
   * When to use: Renderer draw path when `pathH3Indexes[0]` equals the sub-unit current cell.
   * Expected outcome: Avoids repeated `planTacticalMarch` calls during redraw and beat transitions.
   * Exceptions: None.
   */
  cachedSegments?: HumanOrderPreviewSegment[];
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
   * Specifies the contract for the `originH3Index` member (originH3Index?: string;).

   * Contract: When set, the firing unit's committed H3 cell for support-style hover (ranged / air) so the renderer can stroke preview lines without re-resolving `unitId` against a possibly stale `GameStateSnapshot`.
   * When to use: Only rows produced for `renderAsSupportTargeting` hover envelopes from `refreshHoverRoutePreview`.
   * Expected outcome: Matches the same cell the main process used when validating the hovered target.
   * Exceptions: None.
   */
originH3Index?: string;
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
    /**
   * Aggregated slow-terrain label for grouped march hover when any representative preview is terrain-throttled.
   *
   * Contract: First non-null `preview.slowerTerrainDisplayTitle` among `previews` order, or explicit envelope override. Strategic grouped previews omit this.
   * When to use: Renderer `publishHoverRoutePreview` for tactical march modes after `buildHumanOrderGroupPreviewEnvelope`.
   * Expected outcome: Title-case words, comma-separated when merged across origins; `null` when no row is slowed or the preview is strategic.
   * Exceptions: None.
   */
slowerTerrainDisplayTitle?: string | null;
    /**
   * Merged `orderPreviewTerrainImpact` across grouped march previews (union of `slower`, OR of `roadRail`).
   *
   * Contract: Same shape as per-row `HumanOrderPreviewResult.orderPreviewTerrainImpact`; omitted when nothing applies or the preview is strategic.
   * When to use: After `buildHumanOrderGroupPreviewEnvelope` for tactical grouped hovers.
   * Expected outcome: Superset of contributing rows for tooltip HTML; null on strategic grouped previews.
   * Exceptions: None.
   */
orderPreviewTerrainImpact?: OrderPreviewTerrainImpact | null;
}
