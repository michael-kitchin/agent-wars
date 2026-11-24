import { isLandUnitType } from '../../shared/landUnitType';
/**
 * Immediate tactical sealift slot edits (embark/debark/reassign) mirroring strategic `executeSealiftSlotUpdate` on the active snapshot.
 */

import type { EmbarkOrder, SealiftSlotEdit, SealiftStackState } from '../../shared/ipcTypes';
import { sealiftRowCargoIds } from '../../shared/sealiftStackState';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { canManualDebarkFromHex, syncStrategicSealiftFromTacticalHexEmbarkPairs } from '../gameActions/sealift';
import { applySealiftSlotEdit } from '../gameActions/sealiftSlotAssignment';
import { isDbReady } from '../gameDb';
import { getActiveTacticalBattleSnapshotRef, setActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import { writeTacticalBattleSnapshotToGameConfig } from './tacticalBattlePersistence';
import { validateTacticalHumanEmbarkOrder, canPlayerEmbarkFromTacticalHex } from './tacticalOpponentOrderValidation';
import {
  applyTacticalEmbarkPhaseOnBattle,
  tacticalBattleWithSyncedEmbarkCargo,
} from './tacticalStrategicOrderPhases';
import {
  buildTacticalSealiftStackStateFromSnapshot,
} from './tacticalSealiftStackState';
import { tacticalLogMutate, tacticalLogQuery } from './tacticalLogging';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';

/**
 * Clears human infantry/armor embark links for sub-units co-located at one tactical hex (draft for reassignment).
 *
 * Purpose: Matches strategic slot editor behavior that removes a land unit from all carriers before assigning it to the target row.
 * When to use: First step of `projectTacticalSealiftSlotChange` before sequential embark validation.
 * Expected outcome: Human land at `h3Index` has `embarkedOnSubUnitId` unset; other rows unchanged.
 * Exceptions: None.
 */
function clearHumanLandEmbarksAtHex(snap: TacticalBattleSnapshot, h3Index: string): TacticalBattleSnapshot {
  const subUnits = snap.subUnits.map((u) => {
    if (u.h3Index !== h3Index || u.player !== HUMAN_SEAT_ID) return u;
    if (!isLandUnitType(u.unitType)) return u;
    return { ...u, embarkedOnSubUnitId: undefined };
  });
  return { ...snap, subUnits };
}

/**
 * Turns each carrier's cargo into embark orders.
 *
 * Purpose: The tactical snapshot and the parent-level transport rows both take orders as unit and carrier pairs.
 * When to use: After a projected slot edit, and when syncing the strategic rows.
 * Expected outcome: One order per cargo id, carriers sorted by id and each carrier's ids in layout order.
 * Exceptions: None.
 */
function embarkOrdersFromTacticalCargo(cargoByCarrierId: ReadonlyMap<string, readonly string[]>): EmbarkOrder[] {
  const out: EmbarkOrder[] = [];
  const carrierIds = [...cargoByCarrierId.keys()].sort((a, b) => a.localeCompare(b));
  for (const navalUnitId of carrierIds) {
    for (const unitId of cargoByCarrierId.get(navalUnitId) ?? []) out.push({ unitId, navalUnitId });
  }
  return out;
}

export type TacticalSealiftSlotProjectResult =
  | { success: false; reason: string }
  | { success: true; battle: TacticalBattleSnapshot; state: SealiftStackState };

/**
 * Applies one sealift slot edit to a tactical snapshot clone and returns the next stack UI state (no persistence).
 *
 * Purpose: Pure projection for tests and for `applyTacticalSealiftSlotChangeInSession` before SQLite writes.
 * When to use: `applyTacticalSealiftSlotChangeInSession` and unit tests that assert embark/debark parity.
 * Expected outcome: Same success/failure reasons as strategic `executeSealiftSlotUpdate`, with sub-unit ids throughout.
 * Exceptions: None; returns `success: false` instead of throwing.
 */
export function projectTacticalSealiftSlotChange(
  snap: TacticalBattleSnapshot,
  args: SealiftSlotEdit
): TacticalSealiftSlotProjectResult {
  tacticalLogQuery('projectTacticalSealiftSlotChange', {
    h3Index: args.h3Index,
    navalUnitId: args.navalUnitId,
    slotIndex: args.slotIndex,
    hasLand: args.landUnitId != null && args.landUnitId.length > 0,
  });
  const footprint = new Set(snap.tacticalChildH3Indexes);
  if (!footprint.has(args.h3Index)) {
    return { success: false, reason: 'That stack is outside the tactical battle footprint.' };
  }
  const baseState = buildTacticalSealiftStackStateFromSnapshot(snap, args.h3Index);
  const navalIds = baseState.navalRows.map((r) => r.navalUnitId);
  if (!navalIds.includes(args.navalUnitId)) {
    return { success: false, reason: 'Selected naval unit is not in this stack.' };
  }
  const carrierIsAir = snap.subUnits.some((unit) => unit.id === args.navalUnitId && unit.unitType === 'air');
  const isDebark = args.landUnitId === null;
  if (isDebark) {
    if (!carrierIsAir && !canManualDebarkFromHex(args.h3Index, HUMAN_SEAT_ID)) {
      return { success: false, reason: 'Debark is not available at this location.' };
    }
  } else if (
    !carrierIsAir &&
    !canPlayerEmbarkFromTacticalHex(args.h3Index, HUMAN_SEAT_ID, snap.enclosingStrategicH3Index)
  ) {
    const atSea = baseState.contextMode === 'water';
    return {
      success: false,
      reason: atSea ? 'Sealift assignments cannot be changed while at sea.' : 'Embarkation requires a valid port.',
    };
  }
  const landKey = args.landUnitId?.trim() ?? '';
  if (carrierIsAir && landKey.length > 0) {
    const landType = baseState.landOptions.find((option) => option.unitId === landKey)?.unitType
      ?? snap.subUnits.find((unit) => unit.id === landKey)?.unitType;
    if (landType !== 'infantry') return { success: false, reason: 'An air unit can carry only infantry.' };
  }
  if (landKey.length > 0 && !baseState.landOptions.some((o) => o.unitId === landKey)) {
    return { success: false, reason: 'Selected land unit is not available for this stack.' };
  }

  const landTypeById = new Map(baseState.landOptions.map((o) => [o.unitId, o.unitType] as const));
  const outcome = applySealiftSlotEdit({
    edit: { navalUnitId: args.navalUnitId, slotIndex: args.slotIndex, landUnitId: landKey.length > 0 ? landKey : null },
    cargo: {
      carrierIds: navalIds,
      carrierTypeById: new Map(baseState.navalRows.map((row) => [row.navalUnitId, row.carrierUnitType] as const)),
      cargoByCarrierId: new Map(baseState.navalRows.map((row) => [row.navalUnitId, sealiftRowCargoIds(row)] as const)),
      landTypeById,
    },
  });
  if (!outcome.ok) return { success: false, reason: outcome.reason };
  const cargoByCarrierId = outcome.cargoByCarrierId;

  let acc = clearHumanLandEmbarksAtHex(snap, args.h3Index);
  const embarkOrders = embarkOrdersFromTacticalCargo(cargoByCarrierId);
  for (const e of embarkOrders) {
    const checked = validateTacticalHumanEmbarkOrder(e, acc.subUnits, snap.enclosingStrategicH3Index);
    if (!checked.valid) {
      return { success: false, reason: checked.reason };
    }
    acc = applyTacticalEmbarkPhaseOnBattle(acc, [e], HUMAN_SEAT_ID);
  }
  acc = tacticalBattleWithSyncedEmbarkCargo(acc);
  const state = buildTacticalSealiftStackStateFromSnapshot(acc, args.h3Index);
  return { success: true, battle: acc, state };
}

export type TacticalSealiftSlotSessionResult =
  | { success: false; reason: string }
  | { success: true; tacticalBattle: TacticalBattleSnapshot; state: SealiftStackState };

/**
 * Persists a tactical sealift slot edit to the active session and parent-level `unit_transport_assignments` when the DB is ready.
 *
 * Purpose: Strategic parity for stack callout sealift controls during tactical battles (immediate commit, not only on Ready).
 * When to use: `game:updateTacticalSealiftSlot` IPC from the renderer tactical sealift branch.
 * Expected outcome: Active snapshot and `game_config` JSON updated; SQLite transport rows match the projected slots for parents at the hex.
 * Exceptions: Logs and returns failure when no tactical session is active or projection fails.
 */
export function applyTacticalSealiftSlotChangeInSession(args: SealiftSlotEdit): TacticalSealiftSlotSessionResult {
  tacticalLogMutate('applyTacticalSealiftSlotChangeInSession', {
    h3Index: args.h3Index,
    navalUnitId: args.navalUnitId,
    slotIndex: args.slotIndex,
    hasLand: args.landUnitId != null && args.landUnitId.length > 0,
  });
  const snap = getActiveTacticalBattleSnapshotRef();
  if (!snap) return { success: false, reason: 'No tactical battle is active.' };
  const projected = projectTacticalSealiftSlotChange(snap, args);
  if (!projected.success) return projected;
  if (isDbReady()) {
    const embarkPairs = embarkOrdersFromTacticalCargo(
      new Map(projected.state.navalRows.map((row) => [row.navalUnitId, sealiftRowCargoIds(row)] as const))
    );
    syncStrategicSealiftFromTacticalHexEmbarkPairs({
      battle: projected.battle,
      h3Index: args.h3Index,
      embarkPairs,
    });
  }
  setActiveTacticalBattleSnapshotRef(projected.battle);
  writeTacticalBattleSnapshotToGameConfig(projected.battle);
  return { success: true, tacticalBattle: projected.battle, state: projected.state };
}
