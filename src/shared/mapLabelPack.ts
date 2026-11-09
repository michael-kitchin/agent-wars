/**
 * The place-name document.
 *
 * Purpose: Continents, countries, and states share one list of anchors.
 * When to use: After the main process returns the `map_labels` JSON.
 * Expected outcome: Features whose first anchor is the primary point. A bad document throws.
 * Exceptions: This module does not read files and does not log.
 */

import type { MapLabelKind } from './mapLabelRules';

const SCHEMA_VERSION = '1.0.0';
const LABEL_KINDS: readonly MapLabelKind[] = ['continent', 'country', 'state'];

/**
 * One stored label point.
 *
 * Purpose: Placement picks one of these per feature.
 * When to use: As an entry of `MapLabelFeature.anchors`. Index 0 is the primary point.
 * Expected outcome: Latitude, longitude, and the inscribed radius in metres.
 * Exceptions: None.
 */
export interface MapLabelAnchor {
  /**
   * Latitude in degrees.
   *
   * Contract: A number inside the Web Mercator limit.
   * When to use: The first element of a stored anchor.
   * Expected outcome: The point's latitude.
   * Exceptions: None.
   */
  readonly lat: number;
  /**
   * Longitude in degrees.
   *
   * Contract: A number.
   * When to use: The second element of a stored anchor.
   * Expected outcome: The point's longitude.
   * Exceptions: None.
   */
  readonly lng: number;
  /**
   * Inscribed radius in metres.
   *
   * Contract: A non-negative number.
   * When to use: The third element of a stored anchor. A fragment must be at least as tall as its text.
   * Expected outcome: Whole metres, as written by the pipeline.
   * Exceptions: None.
   */
  readonly radiusM: number;
}

/**
 * The longitude and latitude span of a feature's anchors.
 *
 * Purpose: A feature whose anchors miss the view is not measured.
 * When to use: Before placement.
 * Expected outcome: The minimum and maximum of the stored points. A feature that crosses longitude 180 spans the long way.
 * Exceptions: None.
 */
export interface MapLabelBounds {
  /**
   * Westernmost anchor longitude.
   *
   * Contract: A number, less than or equal to `east`.
   * When to use: Compared with the view.
   * Expected outcome: The smallest stored longitude.
   * Exceptions: None.
   */
  readonly west: number;
  /**
   * Southernmost anchor latitude.
   *
   * Contract: A number, less than or equal to `north`.
   * When to use: Compared with the view.
   * Expected outcome: The smallest stored latitude.
   * Exceptions: None.
   */
  readonly south: number;
  /**
   * Easternmost anchor longitude.
   *
   * Contract: A number.
   * When to use: Compared with the view.
   * Expected outcome: The largest stored longitude.
   * Exceptions: None.
   */
  readonly east: number;
  /**
   * Northernmost anchor latitude.
   *
   * Contract: A number.
   * When to use: Compared with the view.
   * Expected outcome: The largest stored latitude.
   * Exceptions: None.
   */
  readonly north: number;
}

/**
 * One named place.
 *
 * Purpose: Placement and painting both read this.
 * When to use: After `parseMapLabelPack`.
 * Expected outcome: At least one anchor. `bounds` covers every anchor.
 * Exceptions: None.
 */
export interface MapLabelFeature {
  /**
   * Stable id.
   *
   * Contract: A non-empty string. Continents start with `continent:`, countries with `adm0:`, states with `adm1:`.
   * When to use: Remembering which anchor was used last frame.
   * Expected outcome: The id from the document.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * Place-name kind.
   *
   * Contract: `continent`, `country`, or `state`.
   * When to use: With `visibleLabelKinds`.
   * Expected outcome: One of those three.
   * Exceptions: None.
   */
  readonly kind: MapLabelKind;
  /**
   * Name as stored.
   *
   * Contract: A string. The painter capitalizes it when the kind says so.
   * When to use: `labelDisplayText`.
   * Expected outcome: The document's name.
   * Exceptions: None.
   */
  readonly name: string;
  /**
   * Draw order within a kind. Smaller ranks go first.
   *
   * Contract: A number.
   * When to use: The placement sort.
   * Expected outcome: The document's rank.
   * Exceptions: None.
   */
  readonly rank: number;
  /**
   * Lowest zoom stored for this feature.
   *
   * Contract: A number. Continents are 0 and skip this test.
   * When to use: `labelFeatureIsCandidate`. A state is compared with `zoom + LABEL_MIN_ZOOM_SLACK`. A country is compared with its minimum plus `COUNTRY_LABEL_ZOOM_DELAY`.
   * Expected outcome: The document's minimum zoom.
   * Exceptions: None.
   */
  readonly minZoom: number;
  /**
   * Label points. The first is the primary anchor.
   *
   * Contract: A non-empty list.
   * When to use: Placement chooses one index.
   * Expected outcome: The document's anchors, in order.
   * Exceptions: None.
   */
  readonly anchors: readonly MapLabelAnchor[];
  /**
   * Span of `anchors`.
   *
   * Contract: Derived at parse time. Not a field of the JSON.
   * When to use: To skip a feature that cannot meet the view.
   * Expected outcome: The min and max of the anchor coordinates.
   * Exceptions: None.
   */
  readonly bounds: MapLabelBounds;
}

/**
 * The parsed place-name document.
 *
 * Purpose: The label layer holds one of these.
 * When to use: After a successful parse.
 * Expected outcome: Schema `1.0.0` and kind `map_labels`.
 * Exceptions: None.
 */
export interface MapLabelPack {
  /**
   * Schema of the JSON.
   *
   * Contract: `"1.0.0"`.
   * When to use: Confirming the parse accepted the document.
   * Expected outcome: The string `1.0.0`.
   * Exceptions: None.
   */
  readonly schemaVersion: '1.0.0';
  /**
   * Document name.
   *
   * Contract: `"map_labels"`.
   * When to use: Confirming the zip member is the place-name document.
   * Expected outcome: The string `map_labels`.
   * Exceptions: None.
   */
  readonly kind: 'map_labels';
  /**
   * Named places.
   *
   * Contract: The document order: continents, then countries, then states.
   * When to use: The placement input.
   * Expected outcome: One entry per stored feature.
   * Exceptions: None.
   */
  readonly features: readonly MapLabelFeature[];
}

/**
 * Parses the place-name JSON.
 *
 * Purpose: The painter should not read the pipeline's field names.
 * When to use: On the text from `map_labels`.
 * Expected outcome: A pack. Each feature has bounds around its anchors.
 * Exceptions: Throws `Error` naming `schema_version`, `kind`, or the bad feature field.
 *   Kind `"city"` is rejected.
 */
export function parseMapLabelPack(text: string): MapLabelPack {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error('map_labels is not an object');
  if (value.schema_version !== SCHEMA_VERSION) throw new Error('schema_version is not 1.0.0');
  if (value.kind !== 'map_labels') throw new Error('kind is not map_labels');
  if (!Array.isArray(value.features)) throw new Error('features is not an array');
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'map_labels',
    features: value.features.map((feature, index) => parseFeature(feature, index)),
  };
}

/**
 * Reads one feature and derives its bounds.
 *
 * Purpose: A bad kind or a missing anchor fails the whole document.
 * When to use: From `parseMapLabelPack`.
 * Expected outcome: A feature whose bounds cover every anchor.
 * Exceptions: Throws `Error` naming the feature index and the bad field.
 */
function parseFeature(value: unknown, index: number): MapLabelFeature {
  if (!isRecord(value)) throw new Error(`features ${index} is not an object`);
  const kind = value.kind;
  if (!isLabelKind(kind)) throw new Error(`features ${index} kind is not a place-name kind`);
  const anchors = parseAnchors(value.anchors, index);
  return {
    id: requireString(value.id, `features ${index} id`),
    kind,
    name: requireString(value.name, `features ${index} name`),
    rank: requireNumber(value.rank, `features ${index} rank`),
    minZoom: requireNumber(value.min_zoom, `features ${index} min_zoom`),
    anchors,
    bounds: boundsOf(anchors),
  };
}

/**
 * Reads the anchor list.
 *
 * Purpose: The first anchor is the primary point, so the order has to survive the parse.
 * When to use: From `parseFeature`.
 * Expected outcome: One anchor per stored triple. An empty list is rejected.
 * Exceptions: Throws `Error` naming the feature index.
 */
function parseAnchors(value: unknown, index: number): MapLabelAnchor[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`features ${index} anchors is empty`);
  return value.map((anchor, anchorIndex) => {
    if (!Array.isArray(anchor) || anchor.length < 3) {
      throw new Error(`features ${index} anchors ${anchorIndex} is not a triple`);
    }
    return {
      lat: requireNumber(anchor[0], `features ${index} anchors ${anchorIndex} lat`),
      lng: requireNumber(anchor[1], `features ${index} anchors ${anchorIndex} lng`),
      radiusM: requireNumber(anchor[2], `features ${index} anchors ${anchorIndex} radius`),
    };
  });
}

/**
 * Span of the anchors.
 *
 * Purpose: The view test needs a box and the JSON does not store one.
 * When to use: After the anchors have been read.
 * Expected outcome: The minimum and maximum latitude and longitude.
 * Exceptions: None. The caller has already rejected an empty list.
 */
function boundsOf(anchors: readonly MapLabelAnchor[]): MapLabelBounds {
  let west = anchors[0]!.lng;
  let east = west;
  let south = anchors[0]!.lat;
  let north = south;
  for (const anchor of anchors) {
    west = Math.min(west, anchor.lng);
    east = Math.max(east, anchor.lng);
    south = Math.min(south, anchor.lat);
    north = Math.max(north, anchor.lat);
  }
  return { west, south, east, north };
}

/**
 * Whether a value is one of the three place-name kinds.
 *
 * Purpose: A city or a typo must not become a label.
 * When to use: While parsing a feature.
 * Expected outcome: True only for continent, country, and state.
 * Exceptions: None.
 */
function isLabelKind(value: unknown): value is MapLabelKind {
  return typeof value === 'string' && LABEL_KINDS.some((kind) => kind === value);
}

/**
 * Whether a value is a plain object.
 *
 * Purpose: JSON objects arrive as `unknown`.
 * When to use: Before reading fields.
 * Expected outcome: True for objects that are not arrays.
 * Exceptions: None.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a string field.
 *
 * Purpose: Ids and names are required.
 * When to use: While parsing a feature.
 * Expected outcome: The string.
 * Exceptions: Throws `Error` naming `label` when the value is not a string.
 */
function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${label} is not a string`);
  return value;
}

/**
 * Reads a number field.
 *
 * Purpose: Ranks, zooms, and coordinates are required numbers.
 * When to use: While parsing a feature.
 * Expected outcome: The number.
 * Exceptions: Throws `Error` naming `label` when the value is not a finite number.
 */
function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} is not a number`);
  return value;
}
