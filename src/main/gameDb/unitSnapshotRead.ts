/**
 * Read-only mapping from `units` table rows to `GameStateSnapshot` unit shapes for snapshot assembly.
 *
 * Purpose: Isolates SQL row → domain mapping from `gameDb.ts` so snapshot readers stay small and testable.
 * When to use: From `gameDb.listUnitsForSnapshot` and any future snapshot builders that reuse the same SELECT shape.
 * Expected outcome: Stable field renames (`unit_type` → `unitType`, etc.) without touching mutation paths.
 * Exceptions: None; callers must pass a live `getAll` bound to the current DB handle.
 */

import { logDebug, logTrace } from '../logger';
import type { GameStateSnapshot } from '../../shared/ipcTypes';

/**
 * Raw `units` table row shape used when listing units for strategic snapshots.
 *
 * Purpose: Documents the SELECT column contract for `listUnitsForSnapshotWithGetAll`.
 * When to use: Only as the generic argument to `getAll` for the canonical units listing query.
 * Expected outcome: All listed columns are present for each returned row.
 * Exceptions: None.
 */
interface DbUnitSnapshotRow extends Record<string, unknown> {
  /**
   * Primary key string for the unit row.
   *
   * Contract: Non-empty stable id aligned with `units.id`.
   * When to use: Maps to `GameStateSnapshot.units[].id`.
   * Expected outcome: Preserved verbatim in the snapshot unit.
   * Exceptions: None.
   */
  id: string;
  /**
   * Owning player id for the unit row.
   *
   * Contract: `'human'` or `'opponent'` in normal games; stored as plain text in SQLite.
   * When to use: Maps to `GameStateSnapshot.units[].player`.
   * Expected outcome: Preserved verbatim.
   * Exceptions: None.
   */
  player: string;
  /**
   * Tactical unit type label from the database.
   *
   * Contract: Matches combat unit type strings enforced elsewhere (infantry, armor, …).
   * When to use: Maps to `GameStateSnapshot.units[].unitType`.
   * Expected outcome: Preserved verbatim.
   * Exceptions: None.
   */
  unit_type: string;
  /**
   * Current res0/res1 H3 index for the unit.
   *
   * Contract: Valid H3 index string for the active map resolution.
   * When to use: Maps to `GameStateSnapshot.units[].h3Index`.
   * Expected outcome: Preserved verbatim.
   * Exceptions: None.
   */
  h3_index: string;
  /**
   * Optional display ordering hint from the database.
   *
   * Contract: Integer or SQL null when unset.
   * When to use: Maps to optional `displayOrder` on snapshot units.
   * Expected outcome: Numbers pass through; null/undefined omit `displayOrder`.
   * Exceptions: None.
   */
  display_order: number | null;
  /**
   * Naval carrier id when this land unit has an active sealift assignment.
   *
   * Contract: SQL null when not embarked; maps to optional `embarkedOnNavalUnitId` on snapshot units.
   * When to use: LEFT JOIN from `unit_transport_assignments` in the canonical units listing query.
   * Expected outcome: Present on strategic snapshots for renderer selection guards.
   * Exceptions: None.
   */
  embarked_on_naval_unit_id: string | null;
}

/**
 * Maps a single `units` row into the renderer/main-process snapshot unit representation.
 *
 * Purpose: Single place for snake_case → camelCase normalization for unit listings.
 * When to use: After fetching rows with the canonical units SELECT.
 * Expected outcome: One snapshot unit object per row.
 * Exceptions: None.
 */
function mapDbUnitSnapshotRow(row: DbUnitSnapshotRow): GameStateSnapshot['units'][number] {
  const unit: GameStateSnapshot['units'][number] = {
    id: row.id,
    player: row.player,
    unitType: row.unit_type,
    h3Index: row.h3_index,
    displayOrder: typeof row.display_order === 'number' ? row.display_order : undefined,
  };
  if (typeof row.embarked_on_naval_unit_id === 'string' && row.embarked_on_naval_unit_id.length > 0) {
    unit.embarkedOnNavalUnitId = row.embarked_on_naval_unit_id;
  }
  return unit;
}

/**
 * Loads all units from the database and maps them into snapshot unit objects.
 *
 * Purpose: Implements `gameDb.listUnitsForSnapshot` read path outside the monolithic façade file.
 * When to use: Through `listUnitsForSnapshot` only unless tests inject a custom `getAll`.
 * Expected outcome: Ordered by SQL default; same length as rows returned by the SELECT.
 * Exceptions: None.
 */
export function listUnitsForSnapshotWithGetAll(
  getAll: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
): GameStateSnapshot['units'] {
  logTrace('gameDb unitSnapshotRead listUnitsForSnapshotWithGetAll');
  const rows = getAll<DbUnitSnapshotRow>(
    `SELECT u.id,
            u.player,
            u.unit_type,
            u.h3_index,
            u.display_order,
            uta.naval_unit_id AS embarked_on_naval_unit_id
     FROM units u
     LEFT JOIN unit_transport_assignments uta ON uta.land_unit_id = u.id`
  );
  logDebug('gameDb unitSnapshotRead listUnitsForSnapshotWithGetAll', { rowCount: rows.length });
  return rows.map(mapDbUnitSnapshotRow);
}
