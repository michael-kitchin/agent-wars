/**
 * National and state borders on the main map.
 *
 * Purpose: Borders appear with the names of the same level. Disputed lines are a separate dashed layer so a solid line can draw over them.
 * When to use: Bind once after the maps exist. Sync on pan, zoom, and from the map frame, because the tactical flag can change without a zoom change.
 * Expected outcome: Four line layers in one pane. State lines are under national lines. A world view draws none.
 * Exceptions: A missing or rejected document logs one error and leaves the borders empty.
 */

import type { MapTheme } from '../../shared/mapThemes';
import { adminBorderGroupsForView, borderLineOpacity } from '../../shared/adminBorderRules';
import { coastlineLodForZoom, parseAdminBorderPack, visibleCellRefs } from '../../shared/vectorPackDecode';
import type { AdminBorderGroupId, AdminBorderPack, VectorViewBounds } from '../../shared/vectorPackTypes';
import { getActiveMapTheme } from './activeMapTheme';
import {
  createBucketedVectorLayer,
  type BucketedVectorLayer,
  type VectorCell,
  type VectorHostMap,
  type VectorLeaflet,
  type VectorPathStyle,
} from './bucketedVectorLayer';
import { VECTOR_CELL_CAP, loadBasemapVectorText, noteVectorCellCap, vectorLines } from './vectorLayerGeometry';

/**
 * Draw order. Later layers sit above earlier ones, so a national line wins where it meets a state line.
 *
 * Purpose: One pane holds four canvases. DOM order is the stacking order.
 * When to use: When creating the layers.
 * Expected outcome: State, disputed state, country, disputed country.
 * Exceptions: None.
 */
const BORDER_DRAW_ORDER: readonly AdminBorderGroupId[] = [
  'state',
  'state_disputed',
  'country',
  'country_disputed',
];

/**
 * Pixel width of one group.
 *
 * Purpose: National borders read heavier than state borders. A disputed line keeps its level's width.
 * When to use: The path style for that group.
 * Expected outcome: 1.25 for a country group and 1 for a state group.
 * Exceptions: None.
 */
function borderWeight(id: AdminBorderGroupId): number {
  return id === 'country' || id === 'country_disputed' ? 1.25 : 1;
}

/**
 * Dash pattern for one group.
 *
 * Purpose: Disputed and indefinite lines are dotted. Other state lines are a longer dash. National lines are solid.
 * When to use: The path style for that group.
 * Expected outcome: `1 3` for a disputed group, `4 3` for state, and null for country.
 * Exceptions: None.
 */
function borderDash(id: AdminBorderGroupId): string | null {
  if (id === 'country_disputed' || id === 'state_disputed') return '1 3';
  if (id === 'state') return '4 3';
  return null;
}

/**
 * Theme color for one group.
 *
 * Purpose: Both levels share one opaque ink. `borderLineOpacity` is what makes a state line quieter.
 * When to use: The path style for that group.
 * Expected outcome: The theme's state color for a state group, including a disputed state line. The country color for a country group.
 * Exceptions: None.
 */
function borderColor(theme: MapTheme, id: AdminBorderGroupId): string {
  return id === 'state' || id === 'state_disputed' ? theme.stateBorderColor : theme.countryBorderColor;
}

let borderPack: AdminBorderPack | null = null;
let bound = false;
let mainMap: VectorHostMap | null = null;
let readTacticalView: () => boolean = () => false;
const borderLayers: Array<{ id: AdminBorderGroupId; layer: BucketedVectorLayer }> = [];

/**
 * Line cells for one border group at the current zoom.
 *
 * Purpose: Each group has its own zoom bands. A group with no band at this zoom draws nothing.
 * When to use: As that group's layer source.
 * Expected outcome: Visible cells of the matching band. The cap logs once.
 * Exceptions: None. A missing pack or band returns an empty list.
 */
function borderCells(id: AdminBorderGroupId, view: VectorViewBounds, zoom: number): readonly VectorCell[] {
  const pack = borderPack;
  const group = pack?.groups.find((candidate) => candidate.id === id);
  if (!pack || !group) return [];
  const lod = coastlineLodForZoom(group, zoom);
  if (!lod) return [];
  const lodIndex = group.lods.indexOf(lod);
  const refs = visibleCellRefs(view, lod.cellDeg, VECTOR_CELL_CAP);
  noteVectorCellCap(refs.length);
  return refs.map((ref) => ({
    cacheKey: `${lodIndex}|${ref.key}|${ref.lngOffset}`,
    build: () => vectorLines(lod.cells[ref.key] ?? [], pack.quantumDeg, ref.lngOffset),
  }));
}

/**
 * Supplies the tactical-view flag without this module reading the map module that owns it.
 *
 * Purpose: The tactical helper reads the main map. Importing it here would cycle through the module that binds these layers.
 * When to use: Once, before `bindAdminBorderLayers`, with `mapAnnotationsUseDetailView`.
 * Expected outcome: Later syncs use this reader. Until it is set, the view is treated as not tactical.
 * Exceptions: None.
 */
export function setAdminBorderTacticalReader(reader: () => boolean): void {
  readTacticalView = reader;
}

/**
 * Attaches the four border layers to the main map.
 *
 * Purpose: The minimap does not draw borders.
 * When to use: Once, after the coastline layers are bound.
 * Expected outcome: The pane exists, the document loads in the background, and view events sync visibility. A second call does nothing.
 * Exceptions: None.
 */
export function bindAdminBorderLayers(leaflet: VectorLeaflet, main: VectorHostMap): void {
  if (bound) return;
  bound = true;
  mainMap = main;
  for (const id of BORDER_DRAW_ORDER) {
    const layer = createBucketedVectorLayer({
      map: main,
      leaflet,
      paneName: 'basemapBorders',
      paneZIndex: 270,
      shape: 'line',
    });
    layer.setSource((view, zoom) => borderCells(id, view, zoom));
    borderLayers.push({ id, layer });
  }
  applyAdminBorderTheme(getActiveMapTheme());
  main.on?.('moveend', syncAdminBorderLayers);
  main.on?.('zoomend', syncAdminBorderLayers);
  syncAdminBorderLayers();
  void loadBorders();
}

/**
 * Loads the border document.
 *
 * Purpose: The lines are not in the renderer bundle.
 * When to use: Once, from `bindAdminBorderLayers`.
 * Expected outcome: A parsed pack redraws the groups that the current view allows. Null or a bad document logs one error.
 * Exceptions: None. Failures are logged.
 */
async function loadBorders(): Promise<void> {
  const text = await loadBasemapVectorText('admin_borders');
  if (text == null) return;
  try {
    borderPack = parseAdminBorderPack(JSON.parse(text));
  } catch (error) {
    console.error('[agent-wars] admin borders document rejected', error);
    return;
  }
  syncAdminBorderLayers();
}

/**
 * Shows the groups that belong with the names for this view and hides the rest.
 *
 * Purpose: A pan can change the view without a scene redraw, and a scene redraw can change the tactical flag without a zoom change.
 * When to use: On `moveend`, `zoomend`, and from both map-frame paint paths.
 * Expected outcome: Groups from `adminBorderGroupsForView` are enabled. The others drop their canvases. An unbound map does nothing.
 * Exceptions: None. A reader that throws logs one error and leaves the layers as they were.
 */
export function syncAdminBorderLayers(): void {
  if (!mainMap) return;
  let groups: readonly AdminBorderGroupId[];
  try {
    groups = adminBorderGroupsForView(mainMap.getZoom?.() ?? 0, readTacticalView());
  } catch (error) {
    console.error('[agent-wars] admin border visibility failed', error);
    return;
  }
  const visible = new Set(groups);
  for (const entry of borderLayers) entry.layer.setEnabled(visible.has(entry.id));
}

/**
 * Paints each border group in the active theme.
 *
 * Purpose: A theme change recolors borders without rebuilding them.
 * When to use: From `applyActiveMapTheme`.
 * Expected outcome: Country groups use the country color at `NATIONAL_BORDER_OPACITY`. State groups use the state color at `STATE_BORDER_OPACITY`. Width and dash stay with the group.
 * Exceptions: None.
 */
export function applyAdminBorderTheme(theme: MapTheme): void {
  for (const entry of borderLayers) {
    const style: VectorPathStyle = {
      color: borderColor(theme, entry.id),
      weight: borderWeight(entry.id),
      dashArray: borderDash(entry.id),
      smoothFactor: 0.5,
      seamWeightPx: null,
      opacity: borderLineOpacity(entry.id),
    };
    entry.layer.setStyle(style);
  }
}
