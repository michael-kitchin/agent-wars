/**
 * Reduces res4 naming city rows into single-line map labels for inspection overlays (scalerank 0..4 contract).
 */

import type { TerrainNamingCityRow, TerrainNamingRecordRes4 } from './terrainNamingLoad';

/**
 * Defines the `compareCitiesForMapOverlayTieBreak` function shape (function compareCitiesForMapOverlayTieBreak(a: TerrainNamingCityRow, b: TerrainNamingCityRow): number).

 * Purpose: Orders tied scalerank cities by descending population then ascending name for deterministic labels.
 * When to use: After filtering to the winning scalerank inside `reduceRes4CityOverlayLabelsByH3`.
 * Expected outcome: Negative when `a` should precede `b` in the joined label list.
 * Exceptions: None.
 */
function compareCitiesForMapOverlayTieBreak(a: TerrainNamingCityRow, b: TerrainNamingCityRow): number {
  const pa = a.population;
  const pb = b.population;
  if (pa !== null && pb !== null && pa !== pb) return pb - pa;
  if (pa !== null && pb === null) return -1;
  if (pa === null && pb !== null) return 1;
  return a.name.localeCompare(b.name);
}

/**
 * Defines the `reduceRes4CityOverlayLabelsByH3` function shape (export function reduceRes4CityOverlayLabelsByH3(records: ReadonlyArray<TerrainNamingRecordRes4>): Map<string, string>).

 * Purpose: Builds per-res4-hex display labels from naming cities using scalerank 0..4, lowest rank wins, `" / "` joins ties.
 * When to use: During terrain classification snapshot construction alongside naming tooltip maps.
 * Expected outcome: Map keys are res4 `h3_index` strings; values omit country/state grouping because overlays only need names.
 * Exceptions: None.
 */
export function reduceRes4CityOverlayLabelsByH3(records: ReadonlyArray<TerrainNamingRecordRes4>): Map<string, string> {
  const out = new Map<string, string>();
  for (const record of records) {
    const eligible = record.cities.filter(
      (c) => c.scalerank !== null && c.scalerank >= 0 && c.scalerank <= 4
    );
    if (eligible.length === 0) continue;
    let bestRank = Number.POSITIVE_INFINITY;
    for (const c of eligible) {
      const r = c.scalerank ?? Number.POSITIVE_INFINITY;
      if (r < bestRank) bestRank = r;
    }
    const winners = eligible.filter((c) => (c.scalerank ?? Number.POSITIVE_INFINITY) === bestRank);
    if (winners.length === 0) continue;
    winners.sort(compareCitiesForMapOverlayTieBreak);
    const label = winners.map((c) => c.name).join(' / ');
    if (label) out.set(record.h3_index, label);
  }
  return out;
}
