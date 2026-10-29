/**
 * Removes air units that no longer have a valid friendly airport controller at their current hex.
 * Extracted from strategic ready resolution so melee-intercept finalize can share the same behavior.
 *
 * **Contested hexes:** While two or more players still have combat-class units on the same strategic hex, `res_s_control`
 * intentionally does not flip to a sole owner; `getHexController` can still read the pre-fight owner. Skipping base
 * cleanup in that state prevents human (or opponent) air from being deleted as “stranded” immediately before a
 * Fight→tactical handoff when armor marches into an enemy-controlled co-occupied hex.
 */

import { dbGetAll, dbGetOne, dbRun, getHexController, getStrategicInfrastructureForHex } from '../gameDb';
import { logDebug } from '../logger';
import type { CombatUnit } from '../combatUnitTypes';

/**
 * Detects multi-player combat occupancy on a strategic hex so air-base cleanup can defer until the contest clears.
 *
 * Purpose: Mirrors `resolveStrategicControlAfterCombatAndMovement`’s “distinctPlayers” notion for infantry/armor/naval/air.
 * When to use: Only from `destroyAirUnitsWithInvalidBase` before applying the airport+controller strand rule.
 * Expected outcome: True when `COUNT(DISTINCT player) >= 2` among combat unit rows sharing `h3_index`, including missiles.
 * Exceptions: None; invalid `h3_index` yields false from empty counts.
 */
function hexHasMultiPlayerCombatPresence(h3Index: string): boolean {
  const row = dbGetOne<{ c: number }>(
    `SELECT COUNT(DISTINCT player) AS c
     FROM units
     WHERE h3_index = ? AND unit_type IN ('infantry', 'armor', 'naval', 'air', 'missile')`,
    [h3Index]
  );
  return (row?.c ?? 0) >= 2;
}

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
    if (hexHasMultiPlayerCombatPresence(row.h3_index)) {
      logDebug('destroyAirUnitsWithInvalidBase skip contested hex', { unitId: row.id, h3Index: row.h3_index });
      continue;
    }
    const infra = getStrategicInfrastructureForHex(row.h3_index);
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
