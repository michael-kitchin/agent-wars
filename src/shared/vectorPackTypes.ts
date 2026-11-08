/**
 * Shapes of the four basemap vector documents.
 *
 * Purpose: The main process reads the JSON and the renderer draws it. Both sides share these names.
 * When to use: Parsing a vector zip, and choosing which document to ask for.
 * Expected outcome: Types only. This module does not read files.
 * Exceptions: None.
 */

/**
 * Document names, in the order a full build writes them.
 *
 * Purpose: The pack check and the reader both walk this list.
 * When to use: When asserting every vector zip, or when rejecting an unknown request.
 * Expected outcome: Coastlines, the edge mask, borders, then labels.
 * Exceptions: None.
 */
export const BASEMAP_VECTOR_NAMES = ['coastlines', 'coast_edge_mask', 'admin_borders', 'map_labels'] as const;

/**
 * One vector document name.
 *
 * Purpose: An IPC request and a file name share this union.
 * When to use: As the argument of the vector read.
 * Expected outcome: A member of `BASEMAP_VECTOR_NAMES`.
 * Exceptions: None.
 */
export type BasemapVectorName = (typeof BASEMAP_VECTOR_NAMES)[number];

/**
 * One quantized line or ring: `[lat0, lng0, dLat, dLng, ...]`.
 *
 * Purpose: Deltas keep the zip small. The first pair is absolute.
 * When to use: Inside a cell. Pass it to `decodePart` before drawing.
 * Expected outcome: An even-length list of quantum integers. A ring is not closed.
 * Exceptions: None.
 */
export type EncodedPart = readonly number[];

/**
 * One zoom band of lines.
 *
 * Purpose: A coarse band covers the world in large cells. A fine band covers it in small ones.
 * When to use: Picking the band for the current zoom.
 * Expected outcome: `maxZoom` is null on the last band.
 * Exceptions: None.
 */
export interface VectorLod {
  /**
   * Lowest zoom that draws this band.
   *
   * Contract: A number. The next band starts at `maxZoom`.
   * When to use: Compared with the map zoom.
   * Expected outcome: Included when `minZoom <= zoom`.
   * Exceptions: None.
   */
  readonly minZoom: number;
  /**
   * First zoom that draws the next band.
   *
   * Contract: A number, or null when this band has no successor.
   * When to use: Compared with the map zoom.
   * Expected outcome: Included when `maxZoom` is null or `zoom < maxZoom`.
   * Exceptions: None.
   */
  readonly maxZoom: number | null;
  /**
   * Cell size, in degrees.
   *
   * Contract: A positive number. 360 means one cell for the world.
   * When to use: With `visibleCellRefs`.
   * Expected outcome: The keys in `cells` use this size.
   * Exceptions: None.
   */
  readonly cellDeg: number;
  /**
   * Parts stored under `"<row>:<col>"`.
   *
   * Contract: Each part is an `EncodedPart`.
   * When to use: After choosing the cells in view.
   * Expected outcome: Missing keys mean that cell has no line.
   * Exceptions: None.
   */
  readonly cells: Readonly<Record<string, readonly EncodedPart[]>>;
}

/**
 * The coastline document.
 *
 * Purpose: The hairline and its coarser stand-ins.
 * When to use: After reading `coastlines`.
 * Expected outcome: Bands in zoom order. The last band's `maxZoom` is null.
 * Exceptions: None.
 */
export interface CoastlinePack {
  /**
   * Schema of the JSON.
   *
   * Contract: `"1.0.0"`.
   * When to use: A parse rejects any other value.
   * Expected outcome: The string `1.0.0`.
   * Exceptions: None.
   */
  readonly schemaVersion: '1.0.0';
  /**
   * Document name.
   *
   * Contract: `"coastlines"`.
   * When to use: Confirming the zip member is the coastline document.
   * Expected outcome: The string `coastlines`.
   * Exceptions: None.
   */
  readonly kind: 'coastlines';
  /**
   * Degrees per stored integer.
   *
   * Contract: The value written by the pipeline, `0.00001`.
   * When to use: `decodePart`.
   * Expected outcome: A positive number.
   * Exceptions: None.
   */
  readonly quantumDeg: number;
  /**
   * Zoom bands, coarse first.
   *
   * Contract: Each band uses the coastline lod shape.
   * When to use: `coastlineLodForZoom`.
   * Expected outcome: One band matches a given zoom.
   * Exceptions: None.
   */
  readonly lods: readonly VectorLod[];
}

/**
 * One mask cell: water polygons and the land that fills the rest of the cell.
 *
 * Purpose: Past native zoom the stretched tiles blur. These polygons redraw the edge.
 * When to use: When the map zoom is above the native tile zoom.
 * Expected outcome: Each polygon is an outer ring followed by its holes.
 * Exceptions: None.
 */
export interface CoastEdgeMaskCell {
  /**
   * Water polygons in this cell.
   *
   * Contract: Each polygon is an outer ring followed by holes. Each ring is an `EncodedPart`.
   * When to use: Filling water above the tiles.
   * Expected outcome: Empty when the cell has no water piece worth storing.
   * Exceptions: None.
   */
  readonly water: readonly (readonly EncodedPart[])[];
  /**
   * Land polygons in this cell.
   *
   * Contract: The cell rectangle minus the water, encoded the same way as `water`.
   * When to use: Filling land under the tiles, past native zoom.
   * Expected outcome: Stays inside the same cell as `water`.
   * Exceptions: None.
   */
  readonly land: readonly (readonly EncodedPart[])[];
}

/**
 * The coast edge-mask document.
 *
 * Purpose: Crisp land and water past the zoom the tiles were built for.
 * When to use: After reading `coast_edge_mask`.
 * Expected outcome: Cells are 2°. Missing cells are empty or nearly all water.
 * Exceptions: None.
 */
export interface CoastEdgeMaskPack {
  /**
   * Schema of the JSON.
   *
   * Contract: `"1.0.0"`.
   * When to use: A parse rejects any other value.
   * Expected outcome: The string `1.0.0`.
   * Exceptions: None.
   */
  readonly schemaVersion: '1.0.0';
  /**
   * Document name.
   *
   * Contract: `"coast_edge_mask"`.
   * When to use: Confirming the zip member is the mask.
   * Expected outcome: The string `coast_edge_mask`.
   * Exceptions: None.
   */
  readonly kind: 'coast_edge_mask';
  /**
   * Degrees per stored integer.
   *
   * Contract: The value written by the pipeline.
   * When to use: `decodePart`.
   * Expected outcome: A positive number.
   * Exceptions: None.
   */
  readonly quantumDeg: number;
  /**
   * Cell size, in degrees.
   *
   * Contract: `2`.
   * When to use: `visibleCellRefs`.
   * Expected outcome: The keys in `cells` use this size.
   * Exceptions: None.
   */
  readonly cellDeg: number;
  /**
   * Mask polygons by cell key.
   *
   * Contract: A missing key means the cell was empty or almost entirely water.
   * When to use: For each visible cell.
   * Expected outcome: Water and land rings for that cell.
   * Exceptions: None.
   */
  readonly cells: Readonly<Record<string, CoastEdgeMaskCell>>;
}

/**
 * Border group names. Disputed lines are a separate group so they can be dashed.
 *
 * Purpose: One Leaflet layer per group.
 * When to use: Choosing which groups the current zoom draws.
 * Expected outcome: Country, disputed country, state, disputed state.
 * Exceptions: None.
 */
export const ADMIN_BORDER_GROUP_IDS = ['country', 'country_disputed', 'state', 'state_disputed'] as const;

/**
 * One border group name.
 *
 * Purpose: The id stored in the document and the id the renderer asks for.
 * When to use: Indexing `AdminBorderPack.groups`.
 * Expected outcome: A member of `ADMIN_BORDER_GROUP_IDS`.
 * Exceptions: None.
 */
export type AdminBorderGroupId = (typeof ADMIN_BORDER_GROUP_IDS)[number];

/**
 * One border group and its zoom bands.
 *
 * Purpose: National and state borders simplify at different zooms.
 * When to use: After parsing `admin_borders`.
 * Expected outcome: `lods` is empty when the document omitted this group.
 * Exceptions: None.
 */
export interface AdminBorderGroup {
  /**
   * Group name.
   *
   * Contract: One of the four `AdminBorderGroupId` values.
   * When to use: Matching a layer to its lines.
   * Expected outcome: The disputed groups may be empty.
   * Exceptions: None.
   */
  readonly id: AdminBorderGroupId;
  /**
   * Zoom bands for this group.
   *
   * Contract: The coastline lod shape. Empty when the group was absent.
   * When to use: The same way as `CoastlinePack.lods`.
   * Expected outcome: One band matches a zoom, or the list is empty.
   * Exceptions: None.
   */
  readonly lods: readonly VectorLod[];
}

/**
 * The border document.
 *
 * Purpose: National and state lines, with disputed lines kept apart.
 * When to use: After reading `admin_borders`.
 * Expected outcome: All four groups, in `ADMIN_BORDER_GROUP_IDS` order.
 * Exceptions: None.
 */
export interface AdminBorderPack {
  /**
   * Schema of the JSON.
   *
   * Contract: `"1.0.0"`.
   * When to use: A parse rejects any other value.
   * Expected outcome: The string `1.0.0`.
   * Exceptions: None.
   */
  readonly schemaVersion: '1.0.0';
  /**
   * Document name.
   *
   * Contract: `"admin_borders"`.
   * When to use: Confirming the zip member is the border document.
   * Expected outcome: The string `admin_borders`.
   * Exceptions: None.
   */
  readonly kind: 'admin_borders';
  /**
   * Degrees per stored integer.
   *
   * Contract: The value written by the pipeline.
   * When to use: `decodePart`.
   * Expected outcome: A positive number.
   * Exceptions: None.
   */
  readonly quantumDeg: number;
  /**
   * The four groups, missing ones included as empty.
   *
   * Contract: Order is country, country_disputed, state, state_disputed.
   * When to use: Building one layer per group.
   * Expected outcome: Length 4. An unknown id never appears.
   * Exceptions: None.
   */
  readonly groups: readonly AdminBorderGroup[];
}

/**
 * Longitude and latitude span of the map view.
 *
 * Purpose: Cell lookup needs the edges, not a Leaflet object.
 * When to use: `visibleCellRefs`. West may be greater than east when the view crosses the antimeridian.
 * Expected outcome: Degrees. East may be past 180 when the camera is shifted.
 * Exceptions: None.
 */
export interface VectorViewBounds {
  /**
   * Western edge, in degrees.
   *
   * Contract: A longitude. It may be outside ±180.
   * When to use: The low end of the span when it is less than `east`.
   * Expected outcome: Unchanged by the lookup.
   * Exceptions: None.
   */
  readonly west: number;
  /**
   * Southern edge, in degrees.
   *
   * Contract: A latitude.
   * When to use: Clamped to the Web Mercator limit before a row is chosen.
   * Expected outcome: Unchanged by the lookup.
   * Exceptions: None.
   */
  readonly south: number;
  /**
   * Eastern edge, in degrees.
   *
   * Contract: A longitude. Smaller than `west` means the span crosses the antimeridian.
   * When to use: The high end of the span.
   * Expected outcome: Unchanged by the lookup.
   * Exceptions: None.
   */
  readonly east: number;
  /**
   * Northern edge, in degrees.
   *
   * Contract: A latitude.
   * When to use: Clamped to the Web Mercator limit before a row is chosen.
   * Expected outcome: Unchanged by the lookup.
   * Exceptions: None.
   */
  readonly north: number;
}

/**
 * One cell to draw, and the longitude shift that puts it on the copy of the world in view.
 *
 * Purpose: A battle across the antimeridian needs the same cell drawn on two copies.
 * When to use: The result of `visibleCellRefs`. Pass `lngOffset` to `decodePart`.
 * Expected outcome: `key` is `"<row>:<col>"` inside ±180. `lngOffset` is -360, 0, or 360.
 * Exceptions: None.
 */
export interface VectorCellRef {
  /**
   * Cell key inside ±180.
   *
   * Contract: `"<row>:<col>"`.
   * When to use: Indexing a lod's `cells`.
   * Expected outcome: The key `vectorCellKey` would return for a longitude in that cell.
   * Exceptions: None.
   */
  readonly key: string;
  /**
   * Added to every decoded longitude.
   *
   * Contract: -360, 0, or 360.
   * When to use: `decodePart`.
   * Expected outcome: The line sits on the world copy the view is looking at.
   * Exceptions: None.
   */
  readonly lngOffset: number;
}
