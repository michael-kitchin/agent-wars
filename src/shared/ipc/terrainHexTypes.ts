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
 * Documents the `Res4TerrainOverrideRow` interface as a named contract surface (export interface Res4TerrainOverrideRow).

 * Purpose: Supports maintainability by documenting why `Res4TerrainOverrideRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface Res4TerrainOverrideRow {
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
 * Documents the `Res4CityOverlayRow` interface as a named contract surface (export interface Res4CityOverlayRow).

 * Purpose: Bundles a res4 hex key with the reduced city label shown only during map inspection while res4 is active.
 * When to use: IPC payloads from `game:getRes4CityOverlays` and renderer cache hydration.
 * Expected outcome: `label` is already filtered to scalerank 0..4 ties per the naming reduction contract.
 * Exceptions: None.
 */
export interface Res4CityOverlayRow {
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
 * Documents the `Res4RoadRailOverlayRow` interface as a named contract surface (export interface Res4RoadRailOverlayRow).

 * Purpose: Exposes boolean side masks for tactical road/rail glyphs aligned to the exported side ordering contract.
 * When to use: IPC payloads from `game:getRes4RoadRailOverlays` after startup load of `terrain_res4_road_rail_sides.json`.
 * Expected outcome: `roadSides` and `railSides` share equal length 5 or 6 and align index-by-index to canonical sides.
 * Exceptions: None.
 */
export interface Res4RoadRailOverlayRow {
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
 * Documents the `Res4TransportVectorOverlayRow` interface as a named contract surface (export interface Res4TransportVectorOverlayRow).

 * Purpose: Carries display-only road/rail polyline geometry for the optional Leaflet transport vector overlay.
 * When to use: IPC payloads from `game:getRes4TransportVectorOverlays` when `terrain_res4_road_rail_vectors.json` is bundled.
 * Expected outcome: `kind` selects styling (`road` or `rail`), and `points` contains ordered WGS84 `[lat, lng]` pairs.
 * Exceptions: None.
 */
export interface Res4TransportVectorOverlayRow {
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
