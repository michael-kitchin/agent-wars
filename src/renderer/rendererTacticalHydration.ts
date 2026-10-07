/**
 * Renderer-side hydration of tactical overlay caches (city labels, road/rail side masks, optional vector rows).
 * When to use: After IPC payloads return from main alongside terrain override refresh; keeps `renderer.ts` slimmer.
 */

import { rendererSharedState as S } from './core/state';
import type {
  StrategicBaselineUrbanHexCountRow,
  TacticalCityOverlayRow,
  TacticalRoadRailOverlayRow,
  TacticalTransportVectorOverlayRow,
} from '../shared/ipcTypes';

/**
 * Writes tactical overlay rows into `rendererSharedState` maps used by canvas and Leaflet layers.
 * When to use: From `refreshTacticalTerrainOverridesForRenderer` after parallel IPC fetches complete.
 * Expected outcome: Maps on `S` reflect the latest rows; empty inputs clear prior overlay state defensively.
 * Exceptions: None.
 */
export function applyTacticalCityOverlayRows(
  cityRows: TacticalCityOverlayRow[],
  roadRailRows: TacticalRoadRailOverlayRow[],
  vectorRows: TacticalTransportVectorOverlayRow[]
): void {
  const nextCities = new Map<string, string>();
  for (const row of cityRows) {
    if (row.label) nextCities.set(row.h3Index, row.label);
  }
  S.tacticalCityOverlayLabelByH3 = nextCities;
  const nextRoadRail = new Map<string, { roadSides: boolean[]; railSides: boolean[] }>();
  for (const row of roadRailRows) {
    nextRoadRail.set(row.h3Index, { roadSides: [...row.roadSides], railSides: [...row.railSides] });
  }
  S.tacticalRoadRailSidesByH3 = nextRoadRail;
  S.tacticalTransportVectorOverlayRows = vectorRows.map((row) => ({
    kind: row.kind,
    points: row.points.map((p) => [p[0], p[1]] as [number, number]),
  }));
}

/**
 * Stores the generated urban-cell count for each producing strategic hex.
 *
 * Purpose: Later tooltips and the build popup read this map instead of the live production count.
 * When to use: After `game:getStrategicBaselineUrbanHexCounts` returns, including a reload of static overlays.
 * Expected outcome: The map holds positive integers only. An empty payload clears the previous map. Cached tooltip HTML is dropped so a hover from before this load is not reused.
 * Exceptions: None.
 */
export function applyStrategicBaselineUrbanHexCounts(rows: StrategicBaselineUrbanHexCountRow[]): void {
  const next = new Map<string, number>();
  for (const row of rows) {
    if (!row.h3Index || !Number.isFinite(row.urbanHexCount)) continue;
    const count = Math.trunc(row.urbanHexCount);
    if (count <= 0) continue;
    next.set(row.h3Index, count);
  }
  S.baselineUrbanHexCountByStrategicH3 = next;
  S.terrainTooltipHtmlByContentKey.clear();
}

/**
 * Reads the generated urban-cell count for one strategic hex.
 *
 * Purpose: A hex missing from the baseline map produces no units, so its tech line stays off.
 * When to use: The strategic hex tooltip and the single-hex build popup.
 * Expected outcome: The stored count, or 0 when the hex is absent or the map has not loaded.
 * Exceptions: None.
 */
export function baselineUrbanHexCountForStrategicHex(h3Index: string): number {
  const count = S.baselineUrbanHexCountByStrategicH3.get(h3Index);
  return count == null || !Number.isFinite(count) ? 0 : count;
}
