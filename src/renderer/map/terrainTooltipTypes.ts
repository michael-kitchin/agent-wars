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
 * When to use: When passing res1/res4 tooltip fields between map wiring and the renderer.
 * Expected outcome: Callers agree on nullable summaries for mixed res4/res1 modes.
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
   * Specifies the contract for the `res1TerrainSummary` member (res1TerrainSummary: string | null;).

   * Contract: Describes stable behavior for callers of `res1TerrainSummary` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  res1TerrainSummary: string | null;
  /**
   * Specifies the contract for the `res1FeaturesSummary` member (res1FeaturesSummary: string | null;).

   * Contract: Describes stable behavior for callers of `res1FeaturesSummary` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  res1FeaturesSummary: string | null;
  /**
   * Res1 passability bucket for the parent hex when sampling res4; empty on res1-only tooltips.
   *
   * Contract: `land`, `water`, `coastal`, or `wetlands` from `gameState.hexes[].terrain`.
   * When to use: Passed to `computeTerrainEffectsLine` for res4 Effects line assembly.
   * Expected outcome: Empty string on res1 tooltips; populated under res4 pointer sampling.
   * Exceptions: None.
   */
  parentTerrain: string;
  /**
   * Res1 terrain kind for the parent hex when sampling res4; empty on res1-only tooltips.
   *
   * Contract: Parent `terrainKind` used for naval navigability in effects computation.
   * When to use: Paired with `parentTerrain` for res4 Effects line assembly.
   * Expected outcome: Empty string on res1 tooltips; parent kind string under res4 sampling.
   * Exceptions: None.
   */
  parentTerrainKind: string;
  /**
   * Whether the sampled res4 cell is a seaport facility.
   *
   * Contract: From `terrainInfraRes4Seaport` for res4 cells; false on res1 tooltips.
   * When to use: Effects line naval occupiability checks.
   * Expected outcome: True only when the hovered res4 child is marked seaport.
   * Exceptions: None.
   */
  isSeaport: boolean;
  /**
   * Whether explored res4 road side masks are active on the sampled cell.
   *
   * Contract: From global `res4RoadRailSidesByH3` when parent hex is explored.
   * When to use: Effects line transport movement bonus (rule 5).
   * Expected outcome: False on res1 tooltips or unexplored parents.
   * Exceptions: None.
   */
  hasRoad: boolean;
  /**
   * Whether explored res4 rail side masks are active on the sampled cell.
   *
   * Contract: From global `res4RoadRailSidesByH3` when parent hex is explored.
   * When to use: Effects line transport movement bonus (rule 5).
   * Expected outcome: False on res1 tooltips or unexplored parents.
   * Exceptions: None.
   */
  hasRail: boolean;
}

/**
 * Documents the `NamingLookupTarget` interface as a named contract surface (interface NamingLookupTarget).

 * Purpose: Supports maintainability by documenting why `NamingLookupTarget` exists.
 * When to use: When resolving which H3 cell and resolution to use for terrain naming lookups.
 * Expected outcome: Callers pass either res1 parent or res4 detail consistently.
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
