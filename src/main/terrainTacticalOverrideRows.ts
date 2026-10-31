/**
 * Decides which tactical cells need an explicit terrain row.
 *
 * Purpose: Readers that lack a row use the parent's stored kind. Seeding can store a water-dominant parent as coastal, so a water child of that parent must keep its own row.
 * When to use: Once, while building the terrain classification snapshot, after classified kinds and land-mass records exist.
 * Expected outcome: One stored kind per strategic hex, and one override row per cell that must not inherit that kind.
 * Exceptions: `buildTacticalOverrideRows` throws when a cell's parent is missing from the stored-kind map.
 */

import { logDebug, logError } from './logger';
import type { PipelineTerrainKind } from '../shared/pipelineTerrain';
import {
  storedStrategicTerrainKind,
  type StrategicLandMassRecord,
} from '../shared/landTraversalStrategic';

/**
 * One tactical cell after classification, before the stored-parent comparison.
 *
 * Purpose: The override builder needs the cell, its parent, and the classified kind. It does not re-read metadata.
 * When to use: As the element type of the list passed to `buildTacticalOverrideRows`.
 * Expected outcome: `childKind` is the classifier result, including `water` for an all-water cell.
 * Exceptions: None.
 */
export type TacticalClassifiedCell = {
  /**
   * Tactical H3 index.
   *
   * Purpose: The key readers use to look up this cell's row.
   * When to use: As the override row's `h3Index` when a row is emitted.
   * Expected outcome: A non-empty cell id.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Strategic parent of `h3Index`.
   *
   * Purpose: Selects the stored kind this cell would inherit if it has no row.
   * When to use: The lookup key in the stored-kind map.
   * Expected outcome: A parent that map contains. A missing parent is an error.
   * Exceptions: None.
   */
  readonly parentH3: string;
  /**
   * Classified terrain kind of this cell.
   *
   * Purpose: The kind written on the row, and the kind compared with the parent's stored kind.
   * When to use: The comparison and the emitted `terrainKind`.
   * Expected outcome: A pipeline kind. Open water is `water`.
   * Exceptions: None.
   */
  readonly childKind: PipelineTerrainKind;
  /**
   * Whether the cell is an intact urban overlay.
   *
   * Purpose: Urban cells always get a row so the renderer can mark them even when the kind matches the parent.
   * When to use: The emit test, and copied onto the row.
   * Expected outcome: True only for an urban overlay cell.
   * Exceptions: None.
   */
  readonly isUrban: boolean;
};

/**
 * A tactical cell whose kind must not be inferred from its parent.
 *
 * Purpose: The snapshot, the renderer, and battle setup share this row shape.
 * When to use: The return value of `buildTacticalOverrideRows`.
 * Expected outcome: `terrainKind` is the cell's classified kind.
 * Exceptions: None.
 */
export type TacticalOverrideRow = {
  /**
   * Tactical H3 index.
   *
   * Purpose: Lookup key for the cell.
   * When to use: Indexing the row list by cell.
   * Expected outcome: The same id as the classified cell.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Classified kind to use instead of the parent's stored kind.
   *
   * Purpose: Keeps an open-water cell water when its parent was stored as coastal.
   * When to use: Any reader that prefers a row over the parent fallback.
   * Expected outcome: Equal to the cell's classified kind.
   * Exceptions: None.
   */
  readonly terrainKind: PipelineTerrainKind;
  /**
   * Whether the cell is an intact urban overlay.
   *
   * Purpose: Urban painting does not depend on a kind difference.
   * When to use: Copied from the classified cell.
   * Expected outcome: True when the cell is urban.
   * Exceptions: None.
   */
  readonly isUrban: boolean;
};

/**
 * Maps each classified strategic kind to the kind seeding would store.
 *
 * Purpose: The override comparison must use the same label the database stores, because readers fall back to that label.
 * When to use: Once per snapshot build, after `strategicKindByH3` and the land-mass map exist.
 * Expected outcome: One entry per input hex. `water` becomes `coastal` only when `storedStrategicTerrainKind` says so. Every other kind is unchanged.
 * Exceptions: None.
 */
export function buildStoredStrategicKindByH3(
  strategicKindByH3: ReadonlyMap<string, PipelineTerrainKind>,
  landMassByH3: ReadonlyMap<string, StrategicLandMassRecord>
): Map<string, PipelineTerrainKind> {
  logDebug('terrainTacticalOverrideRows buildStoredStrategicKindByH3', {
    strategicCount: strategicKindByH3.size,
  });
  const stored = new Map<string, PipelineTerrainKind>();
  for (const [h3, kind] of strategicKindByH3) {
    stored.set(h3, storedStrategicTerrainKind(kind, landMassByH3.get(h3) ?? null));
  }
  return stored;
}

/**
 * Selects tactical cells that need an explicit terrain row.
 *
 * Purpose: A missing row is read as the parent's stored kind. Seeding can relabel a water-dominant hex as coastal, so an open-water child of that hex must carry its own `water` row.
 * When to use: Once per snapshot build, with every classified tactical cell and the stored-kind map.
 * Expected outcome: A row when the classified kind differs from the parent's stored kind, and a row for every urban cell. The row's kind is the classified kind. A cell that matches a non-urban parent is omitted.
 * Exceptions: Throws when a cell's parent is absent from `storedParentKindByH3`. The error message names the child and the parent.
 */
export function buildTacticalOverrideRows(
  cells: readonly TacticalClassifiedCell[],
  storedParentKindByH3: ReadonlyMap<string, PipelineTerrainKind>
): TacticalOverrideRow[] {
  logDebug('terrainTacticalOverrideRows buildTacticalOverrideRows', { cellCount: cells.length });
  const rows: TacticalOverrideRow[] = [];
  for (const cell of cells) {
    const storedParentKind = storedParentKindByH3.get(cell.parentH3);
    if (storedParentKind === undefined) {
      const err = new Error(
        `terrain metadata: res4 child ${cell.h3Index} parent ${cell.parentH3} missing from res1 map`
      );
      logError('terrainTacticalOverrideRows buildTacticalOverrideRows: orphan res4 row', err);
      throw err;
    }
    if (cell.childKind !== storedParentKind || cell.isUrban) {
      rows.push({ h3Index: cell.h3Index, terrainKind: cell.childKind, isUrban: cell.isUrban });
    }
  }
  logDebug('terrainTacticalOverrideRows buildTacticalOverrideRows: done', { rowCount: rows.length });
  return rows;
}
