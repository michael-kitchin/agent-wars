/**
 * Cargo lost with a destroyed carrier, and which carrier each cargo unit was aboard.
 */

import type { CombatUnit } from '../combatUnitTypes';
import { dbGetAll, dbRun } from '../gameDb';
import { logDebug } from '../logger';

/**
 * Cargo removed because its carrier was destroyed.
 *
 * Purpose: Loss notes credit cargo to whoever destroyed the carrier, so each lost cargo unit needs its carrier's id.
 * When to use: The result of `applyTransportLossForRemovedCarriers`.
 * Expected outcome: `cargo` is what the old cargo function returned, and `carrierIdByCargoId` has one entry per cargo unit.
 * Exceptions: None.
 */
export interface TransportCargoLoss {
  /**
   * Land units deleted with their carriers, described from the roster before the delete.
   *
   * Contract: One row per lost cargo unit, with the same fields the older cargo function returned.
   * When to use: Appended to the turn's removed units.
   * Expected outcome: Empty when no destroyed carrier held cargo.
   * Exceptions: None.
   */
  readonly cargo: CombatUnit[];
  /**
   * The carrier each lost cargo unit was aboard.
   *
   * Contract: Keys are the ids in `cargo`. Values are ids from the carriers passed in.
   * When to use: Attributing a cargo loss to its carrier's killer.
   * Expected outcome: One entry per cargo unit.
   * Exceptions: None.
   */
  readonly carrierIdByCargoId: ReadonlyMap<string, string>;
}

/**
 * Deletes the cargo of destroyed naval and air carriers and records which carrier held each unit.
 *
 * Purpose: A carrier lost at sea or in the air takes its embarked land units with it. Loss notes need the carrier link.
 * When to use: After the carrier rows are deleted. `applyTransportLossForRemovedNavalUnits` and the strategic transport outcome call it.
 * Expected outcome: Each assigned land unit row is deleted and each carrier's assignments are cleared.
 * Exceptions: Propagates database errors.
 */
export function applyTransportLossForRemovedCarriers(removedUnits: CombatUnit[]): TransportCargoLoss {
  const cargo: CombatUnit[] = [];
  const carrierIdByCargoId = new Map<string, string>();
  const removedCarriers = removedUnits.filter((unit) => unit.unitType === 'naval' || unit.unitType === 'air');
  for (const carrier of removedCarriers) {
    const assignments = dbGetAll<{ id: string; player: string; unitType: string; h3Index: string; displayOrder: number | null }>(
      `SELECT lu.id AS id,
              lu.player AS player,
              lu.unit_type AS unitType,
              lu.h3_index AS h3Index,
              lu.display_order AS displayOrder
       FROM unit_transport_assignments uta
       JOIN units lu ON lu.id = uta.land_unit_id
       WHERE uta.naval_unit_id = ?`,
      [carrier.id]
    );
    if (assignments.length <= 0) continue;
    for (const land of assignments) {
      dbRun('DELETE FROM units WHERE id = ?', [land.id]);
      cargo.push({
        id: land.id,
        player: land.player,
        unitType: land.unitType,
        h3Index: land.h3Index,
        displayOrder: typeof land.displayOrder === 'number' ? land.displayOrder : undefined,
      });
      carrierIdByCargoId.set(land.id, carrier.id);
    }
    dbRun('DELETE FROM unit_transport_assignments WHERE naval_unit_id = ?', [carrier.id]);
  }
  logDebug('transportCargoLoss applyTransportLossForRemovedCarriers', {
    carrierCount: removedCarriers.length,
    cargoCount: cargo.length,
  });
  return { cargo, carrierIdByCargoId };
}

/**
 * Joins several carrier maps into one.
 *
 * Purpose: A turn loses carriers in several phases, and loss attribution reads one map.
 * When to use: Combining the carrier maps of the air-strike, ranged, melee, and air-drop phases.
 * Expected outcome: One map with every entry. A later map wins for a repeated key.
 * Exceptions: None.
 */
export function mergeCarrierMaps(...maps: ReadonlyMap<string, string>[]): ReadonlyMap<string, string> {
  const merged = new Map<string, string>();
  for (const map of maps) {
    for (const [cargoId, carrierId] of map) merged.set(cargoId, carrierId);
  }
  logDebug('transportCargoLoss mergeCarrierMaps', { mapCount: maps.length, cargoCount: merged.size });
  return merged;
}
