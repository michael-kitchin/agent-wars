import { cellToParent } from 'h3-js';

const WORLD_H3_RESOLUTION = 1;

export interface Res4OverlayInfrastructureRow {
  h3Index: string;
  terrainKind: string;
  isUrban: boolean;
  isAirport?: boolean;
  isSeaport?: boolean;
  isRubble?: boolean;
}

export interface Res4OverlayEntry {
  terrainKind: string;
  isUrban: boolean;
  isAirport: boolean;
  isSeaport: boolean;
  isRubble: boolean;
}

export interface InfrastructureOverlayStateSnapshot {
  res4TerrainOverridesByH3: Map<string, Res4OverlayEntry>;
  terrainInfraRes1Airport: Set<string>;
  terrainInfraRes1Seaport: Set<string>;
  terrainInfraRes4Airport: Set<string>;
  terrainInfraRes4Seaport: Set<string>;
}

/**
 * Why this exists:
 *     Builds renderer infrastructure-overlay state from live res4 override rows in one place.
 * When to use:
 *     Renderer startup and post-resolution refreshes after `game:getRes4TerrainOverrides`.
 * What to expect:
 *     Returns synchronized res1/res4 airport/seaport glyph sets and res4 terrain override lookup.
 */
export function deriveInfrastructureOverlayState(
  rows: Res4OverlayInfrastructureRow[]
): InfrastructureOverlayStateSnapshot {
  const res4TerrainOverridesByH3 = new Map(
    rows.map((r) => [
      r.h3Index,
      {
        terrainKind: r.terrainKind,
        isUrban: !!r.isUrban,
        isAirport: !!r.isAirport,
        isSeaport: !!r.isSeaport,
        isRubble: !!r.isRubble,
      },
    ])
  );
  const terrainInfraRes4Airport = new Set(rows.filter((row) => !!row.isAirport).map((row) => row.h3Index));
  const terrainInfraRes4Seaport = new Set(rows.filter((row) => !!row.isSeaport).map((row) => row.h3Index));
  const terrainInfraRes1Airport = new Set<string>();
  const terrainInfraRes1Seaport = new Set<string>();
  for (const row of rows) {
    if (!row.isAirport && !row.isSeaport) continue;
    const parentH3 = cellToParent(row.h3Index, WORLD_H3_RESOLUTION);
    if (row.isAirport) terrainInfraRes1Airport.add(parentH3);
    if (row.isSeaport) terrainInfraRes1Seaport.add(parentH3);
  }
  return {
    res4TerrainOverridesByH3,
    terrainInfraRes1Airport,
    terrainInfraRes1Seaport,
    terrainInfraRes4Airport,
    terrainInfraRes4Seaport,
  };
}
