/**
 * Read-only helpers for map-wide hex index queries used outside unit snapshot assembly.
 *
 * Purpose: Keeps simple `hexes`-table reads out of `gameDb.ts` so the façade stays focused on wiring.
 * When to use: From `gameDb.getMapHexSet` and any future callers that need the full hex id set with injected `getAll`.
 * Expected outcome: Same `Set` contents as a direct `SELECT h3_index FROM hexes` over the active database.
 * Exceptions: None; callers must pass a live `getAll` bound to the current DB handle.
 */

import { logTrace } from '../logger';

/**
 * Loads every `hexes.h3_index` value into a deduplicated set for map-wide membership checks.
 *
 * Purpose: Single implementation for building the strategic map hex set from SQLite rows.
 * When to use: When validating or iterating all board hexes without loading full terrain payloads.
 * Expected outcome: One entry per distinct `h3_index` returned by the query (duplicates collapsed by `Set`).
 * Exceptions: None.
 */
export function getMapHexSetWithGetAll(
  getAll: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
): Set<string> {
  logTrace('gameDb mapHexRead getMapHexSetWithGetAll');
  const rows = getAll<{ h3_index: string }>('SELECT h3_index FROM hexes');
  return new Set(rows.map((r) => r.h3_index));
}
