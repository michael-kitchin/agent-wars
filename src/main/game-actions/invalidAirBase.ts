/**
 * Removes air units that no longer have a valid friendly airport controller at their current hex.
 * Extracted from strategic ready resolution so melee-intercept finalize can share the same behavior.
 */

import { dbGetAll, dbRun, getHexController, getRes1InfrastructureForHex } from '../gameDb';
import { logDebug } from '../logger';
import type { CombatUnit } from '../combatUnitTypes';

/**
 * Deletes stranded air units and returns lightweight snapshots suitable for casualty accounting.
 *
 * Purpose: Keeps the air-base validity rule in one module for ready and melee-intercept completion paths.
 * When to use: After movement and combat phases when bases may have flipped or airports been destroyed.
 * Expected outcome: Invalid air rows are removed from `units`; returned entries describe what was deleted.
 * Exceptions: Database errors propagate to callers.
 */
export function destroyAirUnitsWithInvalidBase(): CombatUnit[] {
  logDebug('destroyAirUnitsWithInvalidBase', {});
  const rows = dbGetAll<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>(
    'SELECT id, player, unit_type, h3_index, display_order FROM units WHERE unit_type = ?',
    ['air']
  );
  const removed: CombatUnit[] = [];
  for (const row of rows) {
    const infra = getRes1InfrastructureForHex(row.h3_index);
    const controller = getHexController(row.h3_index);
    if (infra.airportCount > 0 && controller === row.player) continue;
    dbRun('DELETE FROM units WHERE id = ?', [row.id]);
    removed.push({
      id: row.id,
      player: row.player,
      unitType: row.unit_type,
      h3Index: row.h3_index,
      displayOrder: row.display_order ?? undefined,
    });
  }
  return removed;
}
