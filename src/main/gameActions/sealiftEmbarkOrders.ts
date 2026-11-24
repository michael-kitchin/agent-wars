/**
 * Embark orders from commanders and from battle commits, written to `unit_transport_assignments`.
 *
 * Purpose: Stores legal embark pairs for commanders and mirrors a battle's sub-unit embarks onto strategic parents.
 * When to use: Ready resolution and tactical commits.
 * Expected outcome: Only legal pairs are stored; others are skipped.
 * Exceptions: None.
 */
import type { EmbarkOrder } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { dbGetAll, dbGetOne, dbRun, isDbReady } from '../gameDb';
import { logDebug } from '../logger';
import { airliftEmbarkAllowed } from './airlift';
import { carrierAcceptsLandUnit } from '../../shared/carrierCargoRules';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { isLandUnitType } from '../../shared/landUnitType';
import { canPlayerEmbarkFromHex } from './sealiftHexEligibility';

/**
 * Writes human sealift rows for tactical sub-unit embark orders using strategic parent ids (no tactical hex co-location check).
 *
 * Purpose: Mirrors strategic slot assignment during tactical Ready commits while parent `units.h3_index` may still anchor at strategic; tactical validation already ensured legality on the snapshot.
 * When to use: After a successful human tactical commit or support-only apply that includes `embarkOrders` with tactical sub-unit ids.
 * Expected outcome: `unit_transport_assignments` rows updated for the involved land parents; other carriers lose exclusive claim on that land row via `DELETE` before insert.
 * Exceptions: None; skips silently when parent rows or types are missing or not human infantry/armor + naval.
 */
export function applyTacticalEmbarkCommittedOrdersToStrategicDb(
  orders: readonly EmbarkOrder[],
  resolveParentUnitIdForSubUnit: (subUnitId: string) => string | null
): void {
  logDebug('applyTacticalEmbarkCommittedOrdersToStrategicDb', { orderCount: orders.length });
  if (orders.length <= 0 || !isDbReady()) return;
  for (const order of orders) {
    const landParent = resolveParentUnitIdForSubUnit(order.unitId);
    const navalParent = resolveParentUnitIdForSubUnit(order.navalUnitId);
    if (!landParent || !navalParent) continue;
    const land = dbGetOne<{ unitType: string; player: string }>(
      'SELECT unit_type AS unitType, player FROM units WHERE id = ?',
      [landParent]
    );
    const naval = dbGetOne<{ unitType: string; player: string }>(
      'SELECT unit_type AS unitType, player FROM units WHERE id = ?',
      [navalParent]
    );
    if (!land || !naval) continue;
    if (land.player !== HUMAN_SEAT_ID || naval.player !== HUMAN_SEAT_ID) continue;
    if (naval.unitType === 'air') {
      if (land.unitType !== 'infantry') {
        logDebug('applyTacticalEmbarkCommittedOrdersToStrategicDb skip non-infantry on air', { landParent });
        continue;
      }
      const aboard = dbGetAll<{ unitType: string }>(
        `SELECT lu.unit_type AS unitType FROM unit_transport_assignments uta
         JOIN units lu ON lu.id = uta.land_unit_id
         WHERE uta.naval_unit_id = ? AND uta.land_unit_id != ?`,
        [navalParent, landParent]
      );
      if (!carrierAcceptsLandUnit({
        carrierUnitType: 'air',
        landUnitType: land.unitType,
        aboardUnitTypes: aboard.map((cargo) => cargo.unitType),
      })) {
        logDebug('applyTacticalEmbarkCommittedOrdersToStrategicDb skip extra infantry on air', { navalParent, landParent });
        continue;
      }
    } else if (!((isLandUnitType(land.unitType)) && naval.unitType === 'naval')) {
      continue;
    }
    dbRun('DELETE FROM unit_transport_assignments WHERE land_unit_id = ?', [landParent]);
    dbRun(
      'INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)',
      [landParent, navalParent]
    );
  }
}

/**
 * Clears strategic sealift rows for all human land parents with infantry/armor sub-units at a tactical hex, then applies sub-unit embark pairs.
 *
 * Purpose: Keeps `unit_transport_assignments` aligned with immediate tactical sealift UI edits, mirroring strategic `writeAssignmentsForHex` for that cohort.
 * When to use: Only after `projectTacticalSealiftSlotChange` succeeds in `applyTacticalSealiftSlotChangeInSession`.
 * Expected outcome: Prior parent-level assignments for those land units are removed; each valid `embarkPairs` row is written via `applyTacticalEmbarkCommittedOrdersToStrategicDb`.
 * Exceptions: None; skips all SQLite work when the database handle is missing.
 */
export function syncStrategicSealiftFromTacticalHexEmbarkPairs(args: {
  battle: Pick<TacticalBattleSnapshot, 'subUnits'>;
  h3Index: string;
  embarkPairs: readonly EmbarkOrder[];
}): void {
  logDebug('syncStrategicSealiftFromTacticalHexEmbarkPairs', {
    h3Index: args.h3Index,
    pairCount: args.embarkPairs.length,
  });
  if (!isDbReady()) return;
  const landParents: string[] = [];
  for (const u of args.battle.subUnits) {
    if (u.h3Index !== args.h3Index || u.player !== HUMAN_SEAT_ID) continue;
    if (!isLandUnitType(u.unitType)) continue;
    landParents.push(u.parentUnitId);
  }
  const unique = [...new Set(landParents)];
  if (unique.length > 0) {
    const ph = unique.map(() => '?').join(', ');
    dbRun(`DELETE FROM unit_transport_assignments WHERE land_unit_id IN (${ph})`, unique);
  }
  applyTacticalEmbarkCommittedOrdersToStrategicDb(args.embarkPairs, (subId) => {
    const row = args.battle.subUnits.find((s) => s.id === subId);
    return row?.parentUnitId ?? null;
  });
}

/**
 * Stores embark orders for one owner when the land unit and the ship already share a hex.
 *
 * Purpose: Ready applies each non-human owner's embark list. The human embarks from the sealift popup, not from this call.
 * When to use: Once per owner, in seat order, with Neutral last.
 * Expected outcome: A legal pair is stored in `unit_transport_assignments`. A pair that fails a check is skipped.
 * Exceptions: Propagates SQLite errors.
 */
export function applyEmbarkOrdersForPlayer(orders: EmbarkOrder[], playerId: string): void {
  logDebug('sealift applyEmbarkOrdersForPlayer', { playerId, orderCount: orders.length });
  if (orders.length <= 0) return;
  for (const order of orders) {
    const land = dbGetOne<{ id: string; player: string; unitType: string; h3Index: string }>(
      'SELECT id, player, unit_type AS unitType, h3_index AS h3Index FROM units WHERE id = ?',
      [order.unitId]
    );
    const naval = dbGetOne<{ id: string; player: string; unitType: string; h3Index: string }>(
      'SELECT id, player, unit_type AS unitType, h3_index AS h3Index FROM units WHERE id = ?',
      [order.navalUnitId]
    );
    if (!land || !naval) continue;
    if (land.player !== playerId || naval.player !== playerId) continue;
    if (land.h3Index !== naval.h3Index) continue;
    const existingCargo = dbGetAll<{ unitType: string }>(
      `SELECT lu.unit_type AS unitType
       FROM unit_transport_assignments uta
       JOIN units lu ON lu.id = uta.land_unit_id
       WHERE uta.naval_unit_id = ?
         AND uta.land_unit_id != ?`,
      [order.navalUnitId, order.unitId]
    );
    if (naval.unitType === 'air') {
      if (!airliftEmbarkAllowed({
        landPlayer: land.player,
        landUnitType: land.unitType,
        landH3Index: land.h3Index,
        carrierPlayer: naval.player,
        carrierUnitType: naval.unitType,
        carrierH3Index: naval.h3Index,
        embarkedLandUnitTypes: existingCargo.map((cargo) => cargo.unitType),
      })) continue;
    } else {
      if (!(isLandUnitType(land.unitType)) || naval.unitType !== 'naval') continue;
      if (!canPlayerEmbarkFromHex(land.h3Index, playerId)) continue;
      if (!carrierAcceptsLandUnit({
        carrierUnitType: 'naval',
        landUnitType: land.unitType,
        aboardUnitTypes: existingCargo.map((cargo) => cargo.unitType),
      })) {
        logDebug('sealift applyEmbarkOrdersForPlayer skip full carrier', {
          unitId: order.unitId,
          navalUnitId: order.navalUnitId,
        });
        continue;
      }
    }

    dbRun(
      'INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)',
      [order.unitId, order.navalUnitId]
    );
  }
}
