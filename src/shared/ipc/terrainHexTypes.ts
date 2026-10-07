/**
 * Documents the `HexNamingTooltipLineRequest` interface as a named contract surface (export interface HexNamingTooltipLineRequest).

 * Purpose: Supports maintainability by documenting why `HexNamingTooltipLineRequest` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HexNamingTooltipLineRequest {
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

/**
 * Documents the `HexContinentNamesRequest` interface as a named contract surface (export interface HexContinentNamesRequest).

 * Purpose: Supports maintainability by documenting why `HexContinentNamesRequest` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HexContinentNamesRequest {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
}

/**
 * Documents the `TacticalTerrainOverrideRow` interface as a named contract surface (export interface TacticalTerrainOverrideRow).

 * Purpose: Supports maintainability by documenting why `TacticalTerrainOverrideRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface TacticalTerrainOverrideRow {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
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
   * Specifies the contract for the `isAirport` member (isAirport?: boolean;).

   * Contract: Describes stable behavior for callers of `isAirport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isAirport?: boolean;
    /**
   * Specifies the contract for the `isSeaport` member (isSeaport?: boolean;).

   * Contract: Describes stable behavior for callers of `isSeaport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isSeaport?: boolean;
    /**
   * Specifies the contract for the `isRubble` member (isRubble?: boolean;).

   * Contract: Describes stable behavior for callers of `isRubble` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isRubble?: boolean;
}

/**
 * Documents the `TacticalCityOverlayRow` interface as a named contract surface (export interface TacticalCityOverlayRow).

 * Purpose: Bundles a tactical hex key with the reduced city label shown only during map inspection while tactical is active.
 * When to use: IPC payloads from `game:getTacticalCityOverlays` and renderer cache hydration.
 * Expected outcome: `label` is already filtered to scalerank 0..4 ties per the naming reduction contract.
 * Exceptions: None.
 */
export interface TacticalCityOverlayRow {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `label` member (label: string;).

   * Contract: Describes stable behavior for callers of `label` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
label: string;
}

/**
 * Documents the `TacticalRoadRailOverlayRow` interface as a named contract surface (export interface TacticalRoadRailOverlayRow).

 * Purpose: Exposes boolean side masks for tactical road/rail glyphs aligned to the exported side ordering contract.
 * When to use: IPC payloads from `game:getTacticalRoadRailOverlays` after startup load of `terrain_res4_road_rail_sides.json`.
 * Expected outcome: `roadSides` and `railSides` share equal length 5 or 6 and align index-by-index to canonical sides.
 * Exceptions: None.
 */
export interface TacticalRoadRailOverlayRow {
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `roadSides` member (roadSides: boolean[];).

   * Contract: Describes stable behavior for callers of `roadSides` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
roadSides: boolean[];
    /**
   * Specifies the contract for the `railSides` member (railSides: boolean[];).

   * Contract: Describes stable behavior for callers of `railSides` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
railSides: boolean[];
}

/**
 * Documents the `TacticalTransportVectorOverlayRow` interface as a named contract surface (export interface TacticalTransportVectorOverlayRow).

 * Purpose: Carries display-only road/rail polyline geometry for the optional Leaflet transport vector overlay.
 * When to use: IPC payloads from `game:getTacticalTransportVectorOverlays` when `terrain_res4_road_rail_vectors.json` is bundled.
 * Expected outcome: `kind` selects styling (`road` or `rail`), and `points` contains ordered WGS84 `[lat, lng]` pairs.
 * Exceptions: None.
 */
export interface TacticalTransportVectorOverlayRow {
    /**
   * Specifies the contract for the `kind` member (kind: 'road' | 'rail';).

   * Contract: Route class used for visual styling only.
   * When to use: Renderer chooses stroke widths/colors for each polyline.
   * Expected outcome: Always `'road'` or `'rail'`.
   * Exceptions: None.
   */
kind: 'road' | 'rail';
    /**
   * Specifies the contract for the `points` member (points: [number, number][];).

   * Contract: Ordered WGS84 `[lat, lng]` tuples for one polyline with at least two points.
   * When to use: Passed directly to Leaflet `polyline` factories.
   * Expected outcome: Every tuple contains finite numeric latitude and longitude.
   * Exceptions: None.
   */
points: [number, number][];
}

/**
 * One strategic hex and the generated urban-cell count that sets the tech tier of units born there.
 *
 * Purpose: The renderer classifies a hex without using the live production count, which air strikes can lower.
 * When to use: IPC payloads from `game:getStrategicBaselineUrbanHexCounts`.
 * Expected outcome: `urbanHexCount` is an integer of at least 1. Hexes that produce nothing are absent.
 * Exceptions: None.
 */
export interface StrategicBaselineUrbanHexCountRow {
  /**
   * Strategic hex this count belongs to.
   *
   * Contract: The parent hex id used by tooltips and the build popup.
   * When to use: As the map key after hydration.
   * Expected outcome: A non-empty strategic H3 index.
   * Exceptions: None.
   */
  h3Index: string;
  /**
   * Generated urban tactical cells inside the hex.
   *
   * Contract: The baseline used to classify Basic and Advanced. It does not fall when cities are destroyed.
   * When to use: `formatProducedUnitTechLineHtml`.
   * Expected outcome: An integer of at least 1.
   * Exceptions: None.
   */
  urbanHexCount: number;
}
