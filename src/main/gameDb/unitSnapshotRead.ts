/**
 * Read-only mapping from `units` table rows to `GameStateSnapshot` unit shapes for snapshot assembly.
 *
 * Purpose: Isolates SQL row → domain mapping from `gameDb.ts` so snapshot readers stay small and testable.
 * When to use: From `gameDb.listUnitsForSnapshot` and any future snapshot builders that reuse the same SELECT shape.
 * Expected outcome: Stable field renames (`unit_type` → `unitType`, etc.) without touching mutation paths.
 * Exceptions: None; callers must pass a live `getAll` bound to the current DB handle.
 */

import { logTrace } from '../logger';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { UnitOrigin } from '../../shared/unitOriginTypes';
import { subdivisionCodeForAreaId } from '../unitOrigin/tacticalOriginAreas';

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
   * Current res0/strategic H3 index for the unit.
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
  /**
   * Birth strategic hex, or SQL null for rows inserted without origin data.
   *
   * Contract: Non-empty when the row has an origin.
   * When to use: Decides whether the snapshot unit gets an `origin`.
   * Expected outcome: Maps to `origin.birthH3Index`.
   * Exceptions: None.
   */
  birth_h3_index: string | null;
  /**
   * Birth tactical cell, or SQL null.
   *
   * Contract: A tactical child of `birth_h3_index` when set.
   * When to use: Maps to `origin.birthTacticalH3Index`.
   * Expected outcome: Preserved verbatim.
   * Exceptions: None.
   */
  birth_res_t_h3_index: string | null;
  /**
   * Birth terrain kind, or SQL null.
   *
   * Contract: A pipeline terrain kind when set.
   * When to use: Maps to `origin.birthTerrainKind`.
   * Expected outcome: Preserved verbatim.
   * Exceptions: None.
   */
  birth_terrain_kind: string | null;
  /**
   * 1 when the birth cell was intact urban, 0 when not, or SQL null when the row has no origin.
   *
   * Contract: Stored as an integer because SQLite has no boolean type.
   * When to use: Maps to `origin.birthIsUrban`.
   * Expected outcome: `true` only for `1`.
   * Exceptions: None.
   */
  birth_is_urban: number | null;
  /**
   * Birth country name, or SQL null.
   *
   * Contract: Canonical country name when set.
   * When to use: Maps to `origin.birthCountryName`.
   * Expected outcome: Preserved verbatim.
   * Exceptions: None.
   */
  birth_country_name: string | null;
  /**
   * Birth country ISO alpha-2 code, or SQL null.
   *
   * Contract: Two uppercase letters when set.
   * When to use: Maps to `origin.birthCountryCode`.
   * Expected outcome: Preserved verbatim.
   * Exceptions: None.
   */
  birth_country_code: string | null;
  /**
   * Birth area id, or SQL null.
   *
   * Contract: Country name on a global unit. Origin unit id on a regional unit.
   * When to use: Maps to `origin.birthAreaId`.
   * Expected outcome: Preserved verbatim.
   * Exceptions: None.
   */
  birth_area_id: string | null;
  /**
   * Birth area display name, or SQL null.
   *
   * Contract: Same as the country name on a global unit.
   * When to use: Maps to `origin.birthAreaName`.
   * Expected outcome: Preserved verbatim.
   * Exceptions: None.
   */
  birth_area_name: string | null;
}

/**
 * Maps a row's birth columns to a unit origin.
 *
 * Purpose: Keeps legacy rows (no birth hex) free of an `origin` field.
 * When to use: From `mapDbUnitSnapshotRow`.
 * Expected outcome: An origin when `birth_h3_index` is a non-empty string; otherwise `undefined`.
 * Exceptions: None.
 */
function unitOriginFromRow(row: DbUnitSnapshotRow): UnitOrigin | undefined {
  if (typeof row.birth_h3_index !== 'string' || row.birth_h3_index.length === 0) return undefined;
  return {
    birthH3Index: row.birth_h3_index,
    birthTacticalH3Index: row.birth_res_t_h3_index ?? null,
    birthTerrainKind: row.birth_terrain_kind ?? null,
    birthIsUrban: row.birth_is_urban === 1,
    birthCountryName: row.birth_country_name ?? null,
    birthCountryCode: row.birth_country_code ?? null,
    birthAreaId: row.birth_area_id ?? row.birth_country_name ?? null,
    birthAreaName: row.birth_area_name ?? row.birth_country_name ?? null,
    birthSubdivisionCode: subdivisionCodeForAreaId(row.birth_area_id ?? null),
  };
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
  const origin = unitOriginFromRow(row);
  if (origin) unit.origin = origin;
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
  const rows = getAll<DbUnitSnapshotRow>(
    `SELECT u.id,
            u.player,
            u.unit_type,
            u.h3_index,
            u.display_order,
            u.birth_h3_index,
            u.birth_res_t_h3_index,
            u.birth_terrain_kind,
            u.birth_is_urban,
            u.birth_country_name,
            u.birth_country_code,
            u.birth_area_id,
            u.birth_area_name,
            uta.naval_unit_id AS embarked_on_naval_unit_id
     FROM units u
     LEFT JOIN unit_transport_assignments uta ON uta.land_unit_id = u.id`
  );
  logTrace('gameDb unitSnapshotRead listUnitsForSnapshotWithGetAll', { rowCount: rows.length });
  return rows.map(mapDbUnitSnapshotRow);
}
