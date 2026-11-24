import { dbGetAll, dbGetOne, dbRun, listUnitsForSnapshot } from '../gameDb';
import { describeDestroyedBattleParents } from '../tacticalBattle/destroyedBattleParents';
import type { DestroyedBattleParent } from '../../shared/destroyedBattleParent';
import type { CombatUnit } from '../combatUnitTypes';
import { logDebug, logTrace } from '../logger';
import { rememberStrategicHexBeforeMove } from '../strategicUnitPreviousHex';
import { applyTransportLossForRemovedCarriers, type TransportCargoLoss } from './transportCargoLoss';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';

export { canManualDebarkFromHex, canPlayerEmbarkFromHex, getSealiftStackContextModeForHex } from './sealiftHexEligibility';
export { executeSealiftSlotUpdate, readSealiftStackState } from './sealiftStackPopup';
export { applyEmbarkOrdersForPlayer, applyTacticalEmbarkCommittedOrdersToStrategicDb, syncStrategicSealiftFromTacticalHexEmbarkPairs } from './sealiftEmbarkOrders';

/**
 * Defines the `getEmbarkedNavalForLandUnit` function shape (export function getEmbarkedNavalForLandUnit(unitId: string): string | null).

 * Purpose: Supports maintainability by documenting why `getEmbarkedNavalForLandUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getEmbarkedNavalForLandUnit(unitId: string): string | null {
  logTrace('sealift getEmbarkedNavalForLandUnit', { unitId });
  const row = dbGetOne<{ navalUnitId: string }>(
    'SELECT naval_unit_id AS navalUnitId FROM unit_transport_assignments WHERE land_unit_id = ?',
    [unitId]
  );
  return row?.navalUnitId ?? null;
}

/**
 * Returns whether a land unit currently has an active sealift assignment row.
 *
 * Purpose: Shared predicate for movement validation, Ready filtering, and selection guards.
 * When to use: Before accepting independent march orders for infantry or armor.
 * Expected outcome: True when `unit_transport_assignments` contains the unit id.
 * Exceptions: None.
 */
export function isEmbarkedLandUnit(unitId: string): boolean {
  logTrace('sealift isEmbarkedLandUnit', { unitId });
  return getEmbarkedNavalForLandUnit(unitId) !== null;
}

/**
 * Returns the naval carrier hex for an embarked land unit, or null when not embarked.
 *
 * Purpose: Supports stay-aboard movement validation and Ready pipeline skip logic.
 * When to use: When comparing a movement destination to the carrier position.
 * Expected outcome: Carrier `h3_index` when assigned; otherwise null.
 * Exceptions: None.
 */
export function getEmbarkedNavalH3IndexForLandUnit(unitId: string): string | null {
  logTrace('sealift getEmbarkedNavalH3IndexForLandUnit', { unitId });
  const row = dbGetOne<{ navalH3Index: string }>(
    `SELECT nu.h3_index AS navalH3Index
     FROM unit_transport_assignments uta
     JOIN units nu ON nu.id = uta.naval_unit_id
     WHERE uta.land_unit_id = ?`,
    [unitId]
  );
  return row?.navalH3Index ?? null;
}

/**
 * Clears the sealift assignment for one land unit without moving it (manual or LLM debark).
 *
 * Purpose: Single debark primitive for stack popup, LLM `disembark` ingest, and tests.
 * When to use: When cargo should become co-located independent land at the current hex.
 * Expected outcome: Assignment row removed; land unit row unchanged.
 * Exceptions: None.
 */
export function clearEmbarkAssignmentForLandUnit(unitId: string): void {
  logDebug('sealift clearEmbarkAssignmentForLandUnit', { unitId });
  dbRun('DELETE FROM unit_transport_assignments WHERE land_unit_id = ?', [unitId]);
}

/**
 * Lists land unit ids with active sealift assignments co-located at a hex.
 *
 * Purpose: Stack popup non-selectable filtering when sealift UI is loading or absent.
 * When to use: Renderer stack callout after fetching sealift state or as fallback from game snapshot.
 * Expected outcome: Distinct human land unit ids assigned to naval units at `h3Index`.
 * Exceptions: None.
 */
export function getEmbarkedLandUnitIdsAtHex(h3Index: string): string[] {
  logTrace('sealift getEmbarkedLandUnitIdsAtHex', { h3Index });
  const rows = dbGetAll<{ landUnitId: string }>(
    `SELECT uta.land_unit_id AS landUnitId
     FROM unit_transport_assignments uta
     JOIN units lu ON lu.id = uta.land_unit_id
     JOIN units nu ON nu.id = uta.naval_unit_id
     WHERE lu.h3_index = ?
       AND nu.h3_index = ?`,
    [h3Index, h3Index]
  );
  return rows.map((row) => row.landUnitId);
}

/**
 * Defines the `isEmbarkedLandUnitOnWater` function shape (export function isEmbarkedLandUnitOnWater(unitId: string): boolean).

 * Purpose: Supports maintainability by documenting why `isEmbarkedLandUnitOnWater` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isEmbarkedLandUnitOnWater(unitId: string): boolean {
  const row = dbGetOne<{ terrain: string }>(
    `SELECT hx.terrain AS terrain
     FROM unit_transport_assignments uta
     JOIN units lu ON lu.id = uta.land_unit_id
     JOIN hexes hx ON hx.h3_index = lu.h3_index
     WHERE uta.land_unit_id = ?`,
    [unitId]
  );
  return row?.terrain === 'water';
}

/**
 * Clears sealift assignment when a non-human land unit receives an independent movement order off its carrier.
 *
 * Purpose: Commanders auto-debark before marching. The human must debark manually instead.
 * When to use: Ready pipeline immediately before applying movement.
 * Expected outcome: Assignment row removed when cargo of any owner other than the human would move independently.
 * Exceptions: None. Humans, units that are not embarked, and stay-aboard orders are unchanged.
 */
export function autoDebarkNonHumanLandUnitIfMovingIndependently(unitId: string, toH3Index: string): void {
  const row = dbGetOne<{ player: string }>('SELECT player FROM units WHERE id = ?', [unitId]);
  if (!row || row.player === HUMAN_SEAT_ID) return;
  if (!isEmbarkedLandUnit(unitId)) return;
  const carrierHex = getEmbarkedNavalH3IndexForLandUnit(unitId);
  if (!carrierHex || toH3Index === carrierHex) return;
  logDebug('sealift autoDebarkNonHumanLandUnitIfMovingIndependently', { unitId, toH3Index, carrierHex, player: row.player });
  clearEmbarkAssignmentForLandUnit(unitId);
}

/**
 * Returns whether an independent movement order for an embarked human land unit should be skipped at Ready resolution.
 *
 * Purpose: Human cargo cannot march independently until manual debark. Other owners are handled by `autoDebarkNonHumanLandUnitIfMovingIndependently`.
 * When to use: Ready pipeline after opponent auto-debark, before applying `UPDATE units SET h3_index` for each movement order.
 * Expected outcome: True when human cargo would move independently off its carrier; false for opponents, stay-aboard no-ops, and non-embarked units.
 * Exceptions: None.
 */
export function shouldSkipEmbarkedLandIndependentMove(unitId: string, toH3Index: string): boolean {
  const row = dbGetOne<{ player: string }>('SELECT player FROM units WHERE id = ?', [unitId]);
  if (row?.player !== HUMAN_SEAT_ID) return false;
  if (!isEmbarkedLandUnit(unitId)) return false;
  const carrierHex = getEmbarkedNavalH3IndexForLandUnit(unitId);
  if (!carrierHex) return true;
  if (toH3Index === carrierHex) return false;
  logDebug('sealift shouldSkipEmbarkedLandIndependentMove', { unitId, toH3Index, carrierHex });
  return true;
}

/**
 * Defines the `syncEmbarkedLandUnitPositionsWithNaval` function shape (export function syncEmbarkedLandUnitPositionsWithNaval(): void).

 * Purpose: Supports maintainability by documenting why `syncEmbarkedLandUnitPositionsWithNaval` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function syncEmbarkedLandUnitPositionsWithNaval(): void {
  const rows = dbGetAll<{ landUnitId: string; navalH3Index: string; landH3Index: string }>(
    `SELECT lu.id AS landUnitId,
            lu.h3_index AS landH3Index,
            nu.h3_index AS navalH3Index
     FROM unit_transport_assignments uta
     JOIN units lu ON lu.id = uta.land_unit_id
     JOIN units nu ON nu.id = uta.naval_unit_id`
  );
  for (const row of rows) {
    if (row.landH3Index === row.navalH3Index) continue;
    rememberStrategicHexBeforeMove(row.landUnitId, row.landH3Index, row.navalH3Index);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [row.navalH3Index, row.landUnitId]);
  }
}

/**
 * Defines the `deleteTransportAssignmentsForRemovedUnits` function shape (export function deleteTransportAssignmentsForRemovedUnits(unitIds: string[]): void).

 * Purpose: Supports maintainability by documenting why `deleteTransportAssignmentsForRemovedUnits` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function deleteTransportAssignmentsForRemovedUnits(unitIds: string[]): void {
  if (unitIds.length <= 0) return;
  const placeholders = unitIds.map(() => '?').join(', ');
  dbRun(
    `DELETE FROM unit_transport_assignments
     WHERE land_unit_id IN (${placeholders}) OR naval_unit_id IN (${placeholders})`,
    [...unitIds, ...unitIds]
  );
}

/**
 * Applies sealift transport cleanup after strategic unit rows are deleted from combat (ranged, melee, or tactical parent deletes).
 *
 * Purpose: Centralizes the paired `applyTransportLossForRemovedNavalUnits` + `deleteTransportAssignmentsForRemovedUnits` sequence used by Ready resolution and tactical DB parity.
 * When to use: After callers issue `DELETE FROM units` for every id in `removedUnitIds`, passing the same units as `CombatUnit` rows captured before deletion.
 * Expected outcome: Returns any extra land units removed because a deleted naval or air carrier held embarked cargo, with the carrier each one was aboard.
 * Exceptions: None; delegates to existing helpers without additional validation.
 */
export function applyTransportOutcomeForRemovedStrategicUnits(
  removedUnitIds: string[],
  removedUnits: CombatUnit[]
): TransportCargoLoss {
  logDebug('applyTransportOutcomeForRemovedStrategicUnits', {
    removedUnitCount: removedUnitIds.length,
    removedCombatRowCount: removedUnits.length,
  });
  const transportLosses = applyTransportLossForRemovedCarriers(removedUnits);
  deleteTransportAssignmentsForRemovedUnits(removedUnitIds);
  if (transportLosses.cargo.length > 0) {
    deleteTransportAssignmentsForRemovedUnits(transportLosses.cargo.map((unit) => unit.id));
  }
  return transportLosses;
}

/**
 * Deletes one strategic `units` parent row and runs the standard transport follow-up (naval sink / assignment cleanup).
 *
 * Purpose: Lets tactical air-vs-units resolution mirror strategic strike DB effects without duplicating transport edge-case logic at each callsite.
 * When to use: When a tactical strike eliminates an entire strategic parent stack identified by `parentUnitId` and the row may still exist in SQLite.
 * Expected outcome: The parent, and any land unit removed because that parent was a naval carrier, each described from the roster before the delete. An empty list when the parent row is already gone. Transport tables stay consistent with `applyTransportOutcomeForRemovedStrategicUnits`.
 * Exceptions: None. A missing parent deletes nothing more.
 */
export function deleteStrategicParentUnitAndApplyTransportOutcome(parentUnitId: string): DestroyedBattleParent[] {
  logDebug('deleteStrategicParentUnitAndApplyTransportOutcome', { parentUnitId });
  const roster = listUnitsForSnapshot();
  const parent = roster.find((unit) => unit.id === parentUnitId);
  if (!parent) {
    logDebug('deleteStrategicParentUnitAndApplyTransportOutcome missing row', { parentUnitId });
    return [];
  }
  const removed = parent.unitType === 'naval' || parent.unitType === 'air'
    ? [parent, ...roster.filter((unit) => unit.embarkedOnCarrierUnitId === parent.id)]
    : [parent];
  const described = describeDestroyedBattleParents(removed, roster);
  const cu: CombatUnit = {
    id: parent.id,
    player: parent.player,
    unitType: parent.unitType,
    h3Index: parent.h3Index,
    displayOrder: parent.displayOrder,
  };
  dbRun('DELETE FROM units WHERE id = ?', [parentUnitId]);
  applyTransportOutcomeForRemovedStrategicUnits([parentUnitId], [cu]);
  return described;
}

/**
 * Deletes the cargo of destroyed naval and air carriers and returns the lost cargo rows.
 *
 * Purpose: Keeps the older cargo-only call shape for callers that do not need the carrier link.
 * When to use: After the carrier rows are deleted, in strategic and tactical resolution.
 * Expected outcome: The same rows as `applyTransportLossForRemovedCarriers(...).cargo`.
 * Exceptions: Propagates database errors.
 */
export function applyTransportLossForRemovedNavalUnits(removedUnits: CombatUnit[]): CombatUnit[] {
  return applyTransportLossForRemovedCarriers(removedUnits).cargo;
}
