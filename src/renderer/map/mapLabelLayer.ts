/**
 * Draws continent, country, state, and water names on their own canvas.
 *
 * Purpose: Names sit above the hillshade, coastline, and borders, and under the hex canvas, and follow the theme, the zoom, and the view.
 * When to use: Bind once after the main map exists. Resize with the hex canvas. Draw at the end of each frame.
 * Expected outcome: At most 150 land names and 40 water names, in the theme's face, with the previous anchor kept while it stays usable.
 *   Water names are italic and painted under the land names.
 * Exceptions: A missing document or a thrown load leaves the layer empty and logs once.
 */

import {
  labelDisplayText,
  labelKindOpacity,
  mapLabelStyleForView,
  visibleLabelKinds,
  visibleWaterLabelKinds,
  type MapLabelKindStyle,
} from '../../shared/mapLabelRules';
import { withoutStatesNamedForCities } from '../../shared/mapLabelCityNames';
import { parseMapLabelPack, type MapLabelFeature } from '../../shared/mapLabelPack';
import { chooseMapLabelAnchors, labelFeatureIsCandidate, placeMapLabels, type LabelPlacementInput, type PlacedMapLabel } from '../../shared/mapLabelPlacement';
import { nudgeBroadLabels, type LabelNudge, type NudgedMapLabel } from '../../shared/mapLabelNudge';
import { settleWaterLabels } from '../../shared/mapWaterLabelPlacement';
import { labelPaintColors, type MapLabelFontId, type MapTheme } from '../../shared/mapThemes';
import { WEB_MERCATOR_MAX_ABS_LAT, alignLongitudeToReference } from '../../shared/webMercator';
import { rendererSharedState as S } from '../core/state';
import { loadBasemapVectorText } from './vectorLayerGeometry';
import { mapAnnotationsUseDetailView } from './mapAnnotationView';
import { getVisibleCityNameKeys } from './visibleCityNames';
import { getMainLeafletMap } from './worldLeafletMap';

/**
 * Canvas fields this file sets when the renderer type baseline lacks them.
 *
 * Purpose: Letter spacing is part of the drawn style. The assignment has to typecheck either way.
 * When to use: Only for `letterSpacing` on the label context.
 * Expected outcome: A string such as `4.55px`.
 * Exceptions: None.
 */
interface SpacedLabelText {
  /**
   * Extra space between letters.
   *
   * Contract: A CSS length.
   * When to use: Before measuring and before drawing one kind.
   * Expected outcome: The kind's spacing times its size.
   * Exceptions: None.
   */
  letterSpacing: string;
}

/**
 * The main map methods the label pass reads.
 *
 * Purpose: The stored map type does not list the center or the size.
 * When to use: After casting `getMainLeafletMap()`.
 * Expected outcome: Zoom, bounds, center, size, and a container-pixel projection.
 * Exceptions: None.
 */
interface LabelHostMap {
  /**
   * Current zoom.
   *
   * Contract: Returns a number.
   * When to use: Once per frame, before choosing kinds.
   * Expected outcome: The main map zoom.
   * Exceptions: None.
   */
  getZoom: () => number;
  /**
   * Current geographic bounds.
   *
   * Contract: Returns the four edges.
   * When to use: Once per frame, to drop features that cannot meet the view.
   * Expected outcome: West, south, east, and north in degrees.
   * Exceptions: None.
   */
  getBounds: () => {
    getWest: () => number;
    getSouth: () => number;
    getEast: () => number;
    getNorth: () => number;
  };
  /**
   * Geographic center of the view.
   *
   * Contract: Returns latitude and longitude.
   * When to use: As the longitude reference for projection.
   * Expected outcome: The center already in the draw frame.
   * Exceptions: None.
   */
  getCenter: () => { lat: number; lng: number };
  /**
   * Size of the map in CSS pixels.
   *
   * Contract: Returns width as `x` and height as `y`.
   * When to use: As the placement view size.
   * Expected outcome: The container size.
   * Exceptions: None.
   */
  getSize: () => { x: number; y: number };
  /**
   * Projects a latitude and longitude to container pixels.
   *
   * Contract: Accepts the longitude it is given and does not wrap it.
   * When to use: After aligning that longitude to the view center.
   * Expected outcome: CSS pixels.
   * Exceptions: None.
   */
  latLngToContainerPoint: (point: { lat: number; lng: number }) => { x: number; y: number };
}

/** Parsed place names. Empty until the document loads, and empty again after a failed load. */
let labelFeatures: readonly MapLabelFeature[] = [];

/** Anchor index used last time each feature was a candidate. */
const previousAnchors = new Map<string, number>();

/** Shift used last time each drawn land label was painted. A label that was not drawn is dropped. */
let previousNudges = new Map<string, LabelNudge>();

/**
 * Shift used last time each drawn water label was painted.
 *
 * Purpose: A water name keeps its spot while that spot stays clear.
 * When to use: The next frame's water pass. Replaced at the end of each frame, the same way `previousNudges` is.
 * Expected outcome: One shift per water name drawn this frame.
 * Exceptions: None.
 */
let previousWaterNudges: ReadonlyMap<string, LabelNudge> = new Map();

/** Measured boxes, keyed by theme, kind, size, and text. */
const measuredBoxes = new Map<string, { width: number; height: number }>();

/** Theme applied to the next draw. Null until the theme pass runs. */
let labelTheme: MapTheme | null = null;

/**
 * Loads the place-name document and the four font faces.
 *
 * Purpose: Names cannot be drawn until both the document and the faces are ready.
 * When to use: Once, from `wireInitCore`, after the main map exists.
 * Expected outcome: A later redraw paints names. A failure logs once and leaves the layer empty.
 * Exceptions: None. A missing document, a bad document, or a font rejection is logged and swallowed.
 */
export function bindMapLabelLayer(requestRedraw: () => void): void {
  void loadLabelDocument(requestRedraw);
}

/**
 * Sizes the label canvas to the same backing store as the hex canvas.
 *
 * Purpose: Names must cover the map and stay sharp at the device pixel ratio.
 * When to use: In `resizeAndRedraw`, after `S.canvasMetrics` is set.
 * Expected outcome: The canvas width and height are the CSS size times `dpr`.
 * Exceptions: None. A missing canvas does nothing.
 */
export function resizeMapLabelCanvas(metrics: { w: number; h: number; dpr: number }): void {
  const canvas = labelCanvas();
  if (!canvas) return;
  canvas.width = metrics.w * metrics.dpr;
  canvas.height = metrics.h * metrics.dpr;
  canvas.style.width = `${metrics.w}px`;
  canvas.style.height = `${metrics.h}px`;
}

/**
 * Remembers the theme the next draw should use.
 *
 * Purpose: Water, land, borders, and names change together.
 * When to use: From `applyActiveMapTheme`.
 * Expected outcome: The next `drawMapLabels` uses this theme's font and colors.
 * Exceptions: None.
 */
export function setMapLabelTheme(theme: MapTheme): void {
  labelTheme = theme;
}

/**
 * Clears the label canvas and paints the names for the current view.
 *
 * Purpose: The hex canvas does not own these names, so each frame draws them here.
 * When to use: At the end of `resizeAndRedraw` and `redraw`.
 * Expected outcome: A halo and a fill for each placed label, water names under land names, at that kind's opacity for the view.
 *   An empty canvas when the map or the document is missing.
 * Exceptions: None.
 */
export function drawMapLabels(): void {
  const canvas = labelCanvas();
  if (!canvas || canvas.width === 0 || canvas.height === 0) return;
  const ctx = canvas.getContext('2d');
  const metrics = S.canvasMetrics;
  if (!ctx || !metrics) return;
  ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
  ctx.clearRect(0, 0, metrics.w, metrics.h);
  // The smoke run reads this because a canvas has no DOM to inspect.
  canvas.dataset.drawnLabelKinds = '';
  const theme = labelTheme;
  const map = getMainLeafletMap() as LabelHostMap | null;
  if (!theme || !map || labelFeatures.length === 0) return;
  const tacticalView = mapAnnotationsUseDetailView();
  const frame = labelsForFrame(map, ctx, theme, tacticalView);
  const zoom = map.getZoom();
  const painted = [...frame.water, ...frame.land];
  for (const label of painted) {
    paintLabel(ctx, theme, label, mapLabelStyleForView(label.kind, zoom, tacticalView), labelKindOpacity(label.kind, zoom, tacticalView));
  }
  canvas.dataset.drawnLabelKinds = [...new Set(painted.map((label) => label.kind))].sort().join(',');
}

/**
 * Reads the document, waits for the faces, and asks for a redraw.
 *
 * Purpose: The bind call returns immediately. The redraw happens when the faces have settled.
 * When to use: Only from `bindMapLabelLayer`.
 * Expected outcome: `labelFeatures` holds the document, then `requestRedraw` runs. A failure clears the list.
 * Exceptions: None. The rejection is logged.
 */
async function loadLabelDocument(requestRedraw: () => void): Promise<void> {
  try {
    const text = await loadBasemapVectorText('map_labels');
    if (text == null) return;
    labelFeatures = parseMapLabelPack(text).features;
    await document.fonts.load('600 13px "Agent Wars Map Sans"');
    await document.fonts.load('400 13px "Agent Wars Map Sans"');
    await document.fonts.load('600 13px "Agent Wars Map Serif"');
    await document.fonts.load('400 13px "Agent Wars Map Serif"');
    await document.fonts.load('italic 400 13px "Agent Wars Map Sans"');
    await document.fonts.load('italic 400 13px "Agent Wars Map Serif"');
    requestRedraw();
  } catch (error) {
    labelFeatures = [];
    console.error('[agent-wars] map labels failed', error);
  }
}

/**
 * Chooses the labels for one frame and updates the anchor and shift memory.
 *
 * Purpose: Placement is shared. This function supplies the view, the projection, and the measurement. The tactical flag is read once by the caller, because that read can change the flag.
 * When to use: From `drawMapLabels`, after the canvas is clear.
 * Expected outcome: Land labels, shifted off the smaller names, and water labels that found a clear spot.
 *   `tacticalView` chooses the kinds and the country size. The zoom chooses the continent size from the country zoom up.
 *   A state whose name matches a city recorded for this frame is not a candidate. Water names do not use that city test.
 *   Anchor memory stores the chosen anchor for every placed land name and every water name that chose an anchor, including a water name the shift then omits. An id that is a candidate in neither pass is dropped. Shift memory keeps only names drawn this frame.
 * Exceptions: None.
 */
function labelsForFrame(
  map: LabelHostMap,
  ctx: CanvasRenderingContext2D,
  theme: MapTheme,
  tacticalView: boolean,
): { readonly land: readonly NudgedMapLabel[]; readonly water: readonly NudgedMapLabel[] } {
  const zoom = map.getZoom();
  const bounds = map.getBounds();
  const view = {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  };
  const kinds = visibleLabelKinds(zoom, tacticalView);
  const candidates = withoutStatesNamedForCities(
    labelFeatures.filter((feature) => labelFeatureIsCandidate(feature, kinds, zoom) && featureMeetsView(feature, view)),
    getVisibleCityNameKeys(),
  );
  const size = map.getSize();
  const center = map.getCenter();
  const placement = {
    zoom,
    viewSize: { width: size.x, height: size.y },
    project: (lat: number, lng: number) => map.latLngToContainerPoint({
      lat: clampLatitude(lat),
      lng: alignLongitudeToReference(lng, center.lng),
    }),
    measure: (feature: MapLabelFeature) => measureLabel(ctx, theme, feature, zoom, tacticalView),
    previousAnchors,
  };
  const placed = placeMapLabels({ ...placement, features: candidates, kinds });
  const nudged = nudgeBroadLabels(placed, { viewSize: placement.viewSize, previousNudges });
  previousNudges = new Map(nudged.map((label) => [label.featureId, label.nudge]));
  const water = waterLabelsForFrame({ zoom, tacticalView, view, placement, landLabels: nudged });
  for (const label of placed) previousAnchors.set(label.featureId, label.anchorIndex);
  for (const label of water.placed) previousAnchors.set(label.featureId, label.anchorIndex);
  const candidateIds = new Set([...candidates, ...water.candidates].map((feature) => feature.id));
  for (const id of [...previousAnchors.keys()]) {
    if (!candidateIds.has(id)) previousAnchors.delete(id);
  }
  previousWaterNudges = new Map(water.settled.map((label) => [label.featureId, label.nudge]));
  return { land: nudged, water: water.settled };
}

/**
 * The geographic edges of one view.
 *
 * Purpose: Both label passes share one bounds test.
 * When to use: `featureMeetsView`.
 * Expected outcome: West, south, east, and north in degrees.
 * Exceptions: None.
 */
interface LabelGeographicView {
  /**
   * Western edge in degrees.
   *
   * Contract: A number.
   * When to use: The longitude overlap test.
   * Expected outcome: The view's west edge.
   * Exceptions: None.
   */
  readonly west: number;
  /**
   * Southern edge in degrees.
   *
   * Contract: A number.
   * When to use: The latitude overlap test.
   * Expected outcome: The view's south edge.
   * Exceptions: None.
   */
  readonly south: number;
  /**
   * Eastern edge in degrees.
   *
   * Contract: A number. It may be less than `west` when the view crosses the antimeridian.
   * When to use: The longitude overlap test.
   * Expected outcome: The view's east edge.
   * Exceptions: None.
   */
  readonly east: number;
  /**
   * Northern edge in degrees.
   *
   * Contract: A number.
   * When to use: The latitude overlap test.
   * Expected outcome: The view's north edge.
   * Exceptions: None.
   */
  readonly north: number;
}

/**
 * The inputs the water pass reads besides the loaded document.
 *
 * Purpose: Keeps `waterLabelsForFrame` within the argument limit.
 * When to use: From `labelsForFrame` after land names are final.
 * Expected outcome: The zoom, the view, the shared projection, and the land labels that will be painted.
 * Exceptions: None.
 */
interface WaterPassInput {
  /**
   * Map zoom.
   *
   * Contract: A number.
   * When to use: Choosing water kinds and candidates.
   * Expected outcome: The zoom already read for the land pass.
   * Exceptions: None.
   */
  readonly zoom: number;
  /**
   * Whether names use the detail view.
   *
   * Contract: The flag already read for this frame.
   * When to use: `visibleWaterLabelKinds`.
   * Expected outcome: The same flag the land pass used.
   * Exceptions: None.
   */
  readonly tacticalView: boolean;
  /**
   * Geographic edges of the view.
   *
   * Contract: The four edges already read for this frame.
   * When to use: `featureMeetsView`.
   * Expected outcome: The same box the land pass used.
   * Exceptions: None.
   */
  readonly view: LabelGeographicView;
  /**
   * Projection, measurement, and anchor memory shared with the land pass.
   *
   * Contract: Everything `placeMapLabels` needs except the features and the kinds.
   * When to use: `chooseMapLabelAnchors`.
   * Expected outcome: The same projection the land names used.
   * Exceptions: None.
   */
  readonly placement: Omit<LabelPlacementInput, 'features' | 'kinds'>;
  /**
   * Land labels as they will be painted.
   *
   * Contract: Centers after the land shift. This pass does not move them.
   * When to use: `settleWaterLabels`.
   * Expected outcome: The land names for this frame.
   * Exceptions: None.
   */
  readonly landLabels: readonly NudgedMapLabel[];
}

/**
 * Chooses and shifts the water names for one frame.
 *
 * Purpose: Water names are placed after land names, and a same-kind overlap is moved rather than dropped first.
 * When to use: From `labelsForFrame`, after `nudgeBroadLabels`.
 * Expected outcome: The water candidates, the anchors that were chosen, and the names that found a clear spot.
 * Exceptions: None.
 */
function waterLabelsForFrame(input: WaterPassInput): {
  readonly candidates: readonly MapLabelFeature[];
  readonly placed: readonly PlacedMapLabel[];
  readonly settled: readonly NudgedMapLabel[];
} {
  const waterKinds = visibleWaterLabelKinds(input.zoom, input.tacticalView);
  const candidates = labelFeatures.filter((feature) => (
    labelFeatureIsCandidate(feature, waterKinds, input.zoom) && featureMeetsView(feature, input.view)
  ));
  const placed = chooseMapLabelAnchors({ ...input.placement, features: candidates, kinds: waterKinds });
  const settled = settleWaterLabels(placed, {
    viewSize: input.placement.viewSize,
    landLabels: input.landLabels,
    previousNudges: previousWaterNudges,
  });
  return { candidates, placed, settled };
}

/**
 * Whether a feature's anchors meet the view.
 *
 * Purpose: Both passes skip a feature that cannot be seen.
 * When to use: After the kind test.
 * Expected outcome: True when longitude and latitude both overlap the view.
 * Exceptions: None.
 */
function featureMeetsView(feature: MapLabelFeature, view: LabelGeographicView): boolean {
  return longitudeMeets(feature, view.west, view.east) && latitudeMeets(feature, view.south, view.north);
}

/**
 * Whether any copy of the feature's longitudes meets the view.
 *
 * Purpose: A view past the antimeridian still contains the places drawn there.
 * When to use: After the kind test.
 * Expected outcome: True when the feature shifted by -360, 0, or 360 degrees overlaps the view's longitude span.
 * Exceptions: None.
 */
function longitudeMeets(feature: MapLabelFeature, west: number, east: number): boolean {
  const viewWest = west;
  const viewEast = east < west ? east + 360 : east;
  return [-360, 0, 360].some((shift) => (
    feature.bounds.east + shift >= viewWest && feature.bounds.west + shift <= viewEast
  ));
}

/**
 * Whether the feature's latitudes meet the view.
 *
 * Purpose: Longitude wrapping does not apply to latitude.
 * When to use: With `longitudeMeets`.
 * Expected outcome: True when the ranges overlap.
 * Exceptions: None.
 */
function latitudeMeets(feature: MapLabelFeature, south: number, north: number): boolean {
  return feature.bounds.north >= south && feature.bounds.south <= north;
}

/**
 * Keeps a latitude on the Web Mercator map.
 *
 * Purpose: Leaflet cannot project a latitude past the cutoff.
 * When to use: Immediately before `latLngToContainerPoint`.
 * Expected outcome: A latitude within `WEB_MERCATOR_MAX_ABS_LAT`.
 * Exceptions: None.
 */
function clampLatitude(lat: number): number {
  return Math.max(-WEB_MERCATOR_MAX_ABS_LAT, Math.min(WEB_MERCATOR_MAX_ABS_LAT, lat));
}

/**
 * Measures one name, reusing an earlier measurement of the same theme, kind, size, and text.
 *
 * Purpose: Measuring thousands of names on every frame is wasted work.
 * When to use: As the `measure` callback.
 * Expected outcome: The text width and the view's font size as the height. A width measured at 13 px is not reused at 19.5 px, and one measured at 18 px is not reused at 27 px.
 * Exceptions: None.
 */
function measureLabel(
  ctx: CanvasRenderingContext2D,
  theme: MapTheme,
  feature: MapLabelFeature,
  zoom: number,
  tacticalView: boolean,
): { width: number; height: number } {
  const text = labelDisplayText(feature);
  const style = mapLabelStyleForView(feature.kind, zoom, tacticalView);
  const key = `${theme.id}|${feature.kind}|${style.sizePx}|${text}`;
  const cached = measuredBoxes.get(key);
  if (cached) return cached;
  applyLabelFont(ctx, theme, style);
  const box = { width: ctx.measureText(text).width, height: style.sizePx };
  measuredBoxes.set(key, box);
  return box;
}

/**
 * Sets the font, spacing, and alignment for one kind.
 *
 * Purpose: Measuring and painting must use the same font or the boxes will not match the glyphs.
 * When to use: Before `measureText`, `strokeText`, and `fillText`.
 * Expected outcome: The theme's family, the style's italic or normal keyword, the style's size and weight, and centered middle alignment.
 * Exceptions: None.
 */
function applyLabelFont(ctx: CanvasRenderingContext2D, theme: MapTheme, style: MapLabelKindStyle): void {
  const family = theme.labelFont === 'sans' ? 'Agent Wars Map Sans' : 'Agent Wars Map Serif';
  const fallback = fallbackFamily(theme.labelFont);
  ctx.font = `${style.fontStyle} ${style.weight} ${style.sizePx}px "${family}", ${fallback}`;
  (ctx as CanvasRenderingContext2D & SpacedLabelText).letterSpacing = `${style.letterSpacingEm * style.sizePx}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
}

/**
 * The generic family used when a bundled face has not loaded.
 *
 * Purpose: A missing face should still look sans or serif.
 * When to use: As the end of the canvas font string.
 * Expected outcome: `system-ui, sans-serif` or `Georgia, serif`.
 * Exceptions: None.
 */
function fallbackFamily(font: MapLabelFontId): string {
  return font === 'sans' ? 'system-ui, sans-serif' : 'Georgia, serif';
}

/**
 * Strokes the halo and then fills the name.
 *
 * Purpose: The halo stays a fixed outline. The fill opacity is what separates the local name from the broader one.
 * When to use: Once per placed label.
 * Expected outcome: A round halo in the kind's halo color, at the kind's halo width and not faded by the label opacity, then the kind's fill at `opacity`.
 *   A water kind uses the theme's water ink and water halo. A land kind uses the land ink and land halo.
 * Exceptions: None.
 */
function paintLabel(
  ctx: CanvasRenderingContext2D,
  theme: MapTheme,
  label: PlacedMapLabel,
  style: MapLabelKindStyle,
  opacity: number,
): void {
  applyLabelFont(ctx, theme, style);
  const colors = labelPaintColors(theme, label.kind);
  ctx.save();
  ctx.lineWidth = style.haloWidthPx;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colors.halo;
  ctx.strokeText(label.text, label.x, label.y);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = colors.fill;
  ctx.fillText(label.text, label.x, label.y);
  ctx.restore();
}

/**
 * The label canvas, when the page has one.
 *
 * Purpose: Resize and draw share the lookup.
 * When to use: At the start of either call.
 * Expected outcome: The canvas, or null before the page has it.
 * Exceptions: None.
 */
function labelCanvas(): HTMLCanvasElement | null {
  const canvas = document.getElementById('map-label-overlay');
  return canvas instanceof HTMLCanvasElement ? canvas : null;
}
