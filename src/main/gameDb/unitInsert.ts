/**
 * The one product-code `INSERT INTO units`, including the birth origin columns.
 *
 * Purpose: Seeding and production insert units through one statement so the column list cannot drift.
 * When to use: Whenever product code creates a unit row.
 * Expected outcome: One row per call.
 * Exceptions: Propagates SQLite errors from the supplied `run`.
 */
import type { UnitOrigin } from '../../shared/unitOriginTypes';
import { logDebug } from '../logger';

/**
 * Column values for a new `units` row.
 *
 * Purpose: Names the insert's inputs instead of a positional parameter list.
 * When to use: Built by seeding and production right before `insertUnitRow`.
 * Expected outcome: Plain data.
 * Exceptions: None.
 */
export interface NewUnitRow {
  /**
   * Compact unit id, for example `h1-i3`.
   *
   * Contract: Unique in the match.
   * When to use: The `id` column.
   * Expected outcome: Primary key of the new row.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * Owning side.
   *
   * Contract: `human` or `opponent`.
   * When to use: The `player` column.
   * Expected outcome: Stored as given.
   * Exceptions: None.
   */
  readonly player: string;
  /**
   * Unit type.
   *
   * Contract: One of the `units.unit_type` CHECK values.
   * When to use: The `unit_type` column.
   * Expected outcome: Stored as given.
   * Exceptions: None.
   */
  readonly unitType: string;
  /**
   * Formation ordinal for display names.
   *
   * Contract: Positive integer from the display-order counter.
   * When to use: The `display_order` column.
   * Expected outcome: Drives `1st` / `I` style labels.
   * Exceptions: None.
   */
  readonly displayOrder: number;
  /**
   * The strategic hex the unit starts in.
   *
   * Contract: Must exist in `hexes`.
   * When to use: The `h3_index` column.
   * Expected outcome: The unit's current hex.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Birth metadata, or `null` to leave the birth columns empty.
   *
   * Contract: Drives the unit flag, and the origin bonus and terrain bonus when the match has them on.
   * When to use: The `birth_*` columns, including `birth_is_urban` (1 when the birth cell is intact urban).
   * Expected outcome: Each field maps to its column.
   * Exceptions: None.
   */
  readonly origin: UnitOrigin | null;
  /**
   * Strategic turn on which the unit was formed.
   *
   * Contract: 1 for a unit placed at match start. One more than the planning turn for a unit built during resolution, because the turn counter increments after production.
   * When to use: The `formed_turn` column.
   * Expected outcome: A positive integer stored as given.
   * Exceptions: None.
   */
  readonly formedTurn: number;
  /**
   * Whether the new unit is a mercenary.
   *
   * Contract: Absent or false writes 0. True writes 1. A mercenary missile is rejected by the table check.
   * When to use: A raised mercenary. Ordinary production omits it.
   * Expected outcome: The `is_mercenary` column.
   * Exceptions: None.
   */
  readonly isMercenary?: boolean;
}

/**
 * Inserts one unit row, including its birth origin columns.
 *
 * Purpose: Single insert statement for seeding and production.
 * When to use: After the id, display order, and origin are known.
 * Expected outcome: One new `units` row; birth columns are `NULL` when `origin` is `null`.
 * Exceptions: Propagates SQLite errors, including primary-key collisions.
 */
export function insertUnitRow(run: (sql: string, params?: unknown[]) => unknown, row: NewUnitRow): void {
  logDebug('unitInsert insertUnitRow', {
    id: row.id,
    h3Index: row.h3Index,
    birthTacticalH3Index: row.origin?.birthTacticalH3Index ?? null,
    birthCountryCode: row.origin?.birthCountryCode ?? null,
    formedTurn: row.formedTurn,
    isMercenary: row.isMercenary === true,
  });
  run(
    `INSERT INTO units (
       id, player, unit_type, display_order, h3_index,
       birth_h3_index, birth_res_t_h3_index, birth_terrain_kind, birth_is_urban, birth_country_name, birth_country_code,
       birth_area_id, birth_area_name, formed_turn, is_mercenary
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.player,
      row.unitType,
      row.displayOrder,
      row.h3Index,
      row.origin?.birthH3Index ?? null,
      row.origin?.birthTacticalH3Index ?? null,
      row.origin?.birthTerrainKind ?? null,
      row.origin == null ? null : row.origin.birthIsUrban ? 1 : 0,
      row.origin?.birthCountryName ?? null,
      row.origin?.birthCountryCode ?? null,
      row.origin?.birthAreaId ?? row.origin?.birthCountryName ?? null,
      row.origin?.birthAreaName ?? row.origin?.birthCountryName ?? null,
      row.formedTurn,
      row.isMercenary === true ? 1 : 0,
    ]
  );
}
