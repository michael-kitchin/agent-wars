import { gridDisk } from 'h3-js';
import { logTrace } from '../logger';
import { hasSeaAccess, type SeaAccessTerrain } from '../../shared/seaAccess';
import { gameDbOps } from './dbConnection';
import type { DbReadOps } from './dbOps';

/**
 * Row shape of the terrain read behind `hexHasSeaAccess`.
 *
 * Purpose: Names the columns of the one query so the Map built from them is typed.
 * When to use: Only inside this file.
 * Expected outcome: `terrainKind` is null when the stored column is null.
 * Exceptions: None.
 */
type SeaAccessTerrainRow = { h3Index: string; terrain: string; terrainKind: string | null } & Record<string, unknown>;

/**
 * Reads whether a hex has sea access from the open match.
 *
 * Purpose: The main-process answer to the sea access rule. It reads the true native terrain of the hex and its neighbors, never a viewer's fog-masked terrain and never seaport-promoted terrain. The answer never changes during a match.
 * When to use: Any main-process code that judges a naval build, a naval mercenary raise, or boarding. A test with a hand-built snapshot and no database passes its own check to the functions that accept one, because with no open database this returns false.
 * Expected outcome: True when the hex or a cell of `gridDisk(h3Index, 1)` is water or coast. False when none is, when the database is closed, or when the id is not a cell.
 * Exceptions: None. SQL errors propagate from `getAll`.
 */
export function hexHasSeaAccess(h3Index: string, ops: Pick<DbReadOps, 'getAll'> = gameDbOps): boolean {
  let disk: string[];
  try {
    disk = gridDisk(h3Index, 1);
  } catch {
    logTrace('hexHasSeaAccess', { h3Index, seaAccess: false });
    return false;
  }
  const placeholders = disk.map(() => '?').join(', ');
  const rows = ops.getAll<SeaAccessTerrainRow>(
    `SELECT h3_index AS h3Index, terrain, terrain_kind AS terrainKind FROM hexes WHERE h3_index IN (${placeholders})`,
    disk
  );
  const byId = new Map<string, SeaAccessTerrain>();
  for (const row of rows) byId.set(row.h3Index, { terrain: row.terrain, terrainKind: row.terrainKind ?? undefined });
  const seaAccess = hasSeaAccess(h3Index, (h) => byId.get(h));
  logTrace('hexHasSeaAccess', { h3Index, seaAccess });
  return seaAccess;
}

/**
 * Tells whether naval is refused at a hex for sea access alone.
 *
 * Purpose: Lets queue and tool code choose the sea-access reason over the generic one. It reads true terrain, as `hexHasSeaAccess` does, and never changes during a match.
 * When to use: When a naval queue change is about to be refused and the reason matters.
 * Expected outcome: True when the hex has at least one seaport (`res_s_infrastructure.seaport_count`) and `hexHasSeaAccess` is false. False otherwise, and false with no open database.
 * Exceptions: None. SQL errors propagate from `getOne` and `getAll`.
 */
export function navalBlockedBySeaAccess(
  h3Index: string,
  ops: Pick<DbReadOps, 'getOne' | 'getAll'> = gameDbOps
): boolean {
  const infra = ops.getOne<{ seaportCount: number } & Record<string, unknown>>(
    'SELECT seaport_count AS seaportCount FROM res_s_infrastructure WHERE h3_index = ?',
    [h3Index]
  );
  const blocked = (infra?.seaportCount ?? 0) > 0 && !hexHasSeaAccess(h3Index, ops);
  logTrace('navalBlockedBySeaAccess', { h3Index, blocked });
  return blocked;
}
