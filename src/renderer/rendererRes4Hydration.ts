/**
 * Renderer-side hydration of res4 overlay caches (city labels, road/rail side masks, optional vector rows).
 * When to use: After IPC payloads return from main alongside terrain override refresh; keeps `renderer.ts` slimmer.
 */

import { rendererSharedState as S } from './core/state';
import type { Res4CityOverlayRow, Res4RoadRailOverlayRow, Res4TransportVectorOverlayRow } from '../shared/ipcTypes';

/**
 * Writes res4 overlay rows into `rendererSharedState` maps used by canvas and Leaflet layers.
 * When to use: From `refreshRes4TerrainOverridesForRenderer` after parallel IPC fetches complete.
 * Expected outcome: Maps on `S` reflect the latest rows; empty inputs clear prior overlay state defensively.
 * Exceptions: None.
 */
export function applyRes4CityOverlayRows(
  cityRows: Res4CityOverlayRow[],
  roadRailRows: Res4RoadRailOverlayRow[],
  vectorRows: Res4TransportVectorOverlayRow[]
): void {
  const nextCities = new Map<string, string>();
  for (const row of cityRows) {
    if (row.label) nextCities.set(row.h3Index, row.label);
  }
  S.res4CityOverlayLabelByH3 = nextCities;
  const nextRoadRail = new Map<string, { roadSides: boolean[]; railSides: boolean[] }>();
  for (const row of roadRailRows) {
    nextRoadRail.set(row.h3Index, { roadSides: [...row.roadSides], railSides: [...row.railSides] });
  }
  S.res4RoadRailSidesByH3 = nextRoadRail;
  S.res4TransportVectorOverlayRows = vectorRows.map((row) => ({
    kind: row.kind,
    points: row.points.map((p) => [p[0], p[1]] as [number, number]),
  }));
}
