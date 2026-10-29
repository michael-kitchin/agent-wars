/**
 * Shared shapes for terrain hover tooltips and naming lookups used by the main map interaction layer.
 *
 * Purpose: Lets `mainMapInteractions.ts` type its dependency surface without importing `renderer.ts`.
 * When to use: Wherever pointer-derived terrain or naming state crosses the renderer or map modules.
 * Expected outcome: Structural types stay aligned with `renderer.ts` tooltip helpers.
 * Exceptions: None.
 */

/**
 * Documents the `TerrainTooltipState` interface as a named contract surface (interface TerrainTooltipState).

 * Purpose: Supports maintainability by documenting why `TerrainTooltipState` exists.
 * When to use: When passing strategic/tactical tooltip fields between map wiring and the renderer.
 * Expected outcome: Callers agree on nullable summaries for mixed tactical/strategic modes.
 * Exceptions: None.
 */
export interface TerrainTooltipState {
  /**
   * Specifies the contract for the `terrainKind` member (terrainKind: string;).

   * Contract: Describes stable behavior for callers of `terrainKind` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  terrainKind: string;
  /**
   * Specifies the contract for the `isUrban` member (isUrban: boolean;).

   * Contract: Describes stable behavior for callers of `isUrban` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  isUrban: boolean;
  /**
   * Specifies the contract for the `isRubble` member (isRubble: boolean;).

   * Contract: Describes stable behavior for callers of `isRubble` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  isRubble: boolean;
  /**
   * Specifies the contract for the `features` member (features: string[];).

   * Contract: Describes stable behavior for callers of `features` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  features: string[];
  /**
   * Specifies the contract for the `urbanHexCount` member (urbanHexCount: number | null;).

   * Contract: Describes stable behavior for callers of `urbanHexCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  urbanHexCount: number | null;
  /**
   * Specifies the contract for the `strategicTerrainSummary` member (strategicTerrainSummary: string | null;).

   * Contract: Describes stable behavior for callers of `strategicTerrainSummary` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  strategicTerrainSummary: string | null;
  /**
   * Specifies the contract for the `strategicFeaturesSummary` member (strategicFeaturesSummary: string | null;).

   * Contract: Describes stable behavior for callers of `strategicFeaturesSummary` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  strategicFeaturesSummary: string | null;
  /**
   * Strategic passability bucket for the parent hex when sampling tactical; empty on strategic-only tooltips.
   *
   * Contract: `land`, `water`, `coastal`, or `wetlands` from `gameState.hexes[].terrain`.
   * When to use: Passed to `computeTerrainEffectsLine` for tactical Effects line assembly.
   * Expected outcome: Empty string on strategic tooltips; populated under tactical pointer sampling.
   * Exceptions: None.
   */
  parentTerrain: string;
  /**
   * Strategic terrain kind for the parent hex when sampling tactical; empty on strategic-only tooltips.
   *
   * Contract: Parent `terrainKind` used for naval navigability in effects computation.
   * When to use: Paired with `parentTerrain` for tactical Effects line assembly.
   * Expected outcome: Empty string on strategic tooltips; parent kind string under tactical sampling.
   * Exceptions: None.
   */
  parentTerrainKind: string;
  /**
   * Whether the sampled tactical cell is a seaport facility.
   *
   * Contract: From `terrainInfraTacticalSeaport` for tactical cells; false on strategic tooltips.
   * When to use: Effects line naval occupiability checks.
   * Expected outcome: True only when the hovered tactical child is marked seaport.
   * Exceptions: None.
   */
  isSeaport: boolean;
  /**
   * Whether explored tactical road side masks are active on the sampled cell.
   *
   * Contract: From global `tacticalRoadRailSidesByH3` when parent hex is explored.
   * When to use: Effects line transport movement bonus (rule 5).
   * Expected outcome: False on strategic tooltips or unexplored parents.
   * Exceptions: None.
   */
  hasRoad: boolean;
  /**
   * Whether explored tactical rail side masks are active on the sampled cell.
   *
   * Contract: From global `tacticalRoadRailSidesByH3` when parent hex is explored.
   * When to use: Effects line transport movement bonus (rule 5).
   * Expected outcome: False on strategic tooltips or unexplored parents.
   * Exceptions: None.
   */
  hasRail: boolean;
  /**
   * Fortified city cells on this strategic hex.
   *
   * Contract: The hex tooltip names how much of the city is fortified.
   * When to use: When infrastructure glyphs are allowed and the count is above 0.
   * Expected outcome: Omitted when the hex is unexplored. Zero draws no line.
   * Exceptions: None.
   */
  fortifiedCount?: number;
  /**
   * Intact city cells on this strategic hex, fortified or not.
   *
   * Contract: The tooltip states the fortified count against the city that remains.
   * When to use: Together with `fortifiedCount`.
   * Expected outcome: Fortified plus still-fortifiable cells.
   * Exceptions: None.
   */
  intactCityCells?: number;
  /**
   * Whether the sampled cell itself is fortified.
   *
   * Contract: A cell tooltip says so in place of the plain Urban suffix.
   * When to use: Zoomed-in and battle cell tooltips.
   * Expected outcome: True only for a fortified intact city cell.
   * Exceptions: None.
   */
  isFortifiedCell?: boolean;
}

/**
 * Documents the `NamingLookupTarget` interface as a named contract surface (interface NamingLookupTarget).

 * Purpose: Supports maintainability by documenting why `NamingLookupTarget` exists.
 * When to use: When resolving which H3 cell and resolution to use for terrain naming lookups.
 * Expected outcome: Callers pass either strategic parent or tactical detail consistently.
 * Exceptions: None.
 */
export interface NamingLookupTarget {
  /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  h3Index: string;
  /**
   * Specifies the contract for the `resolution` member (resolution: 1 | 4;).

   * Contract: Describes stable behavior for callers of `resolution` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  resolution: 1 | 4;
}
