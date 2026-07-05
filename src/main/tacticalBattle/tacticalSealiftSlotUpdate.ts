/**
 * Immediate tactical sealift slot edits (embark/debark/reassign) mirroring strategic `updateSealiftSlotImpl` on the active snapshot.
 */

import type { EmbarkOrder, SealiftStackState } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { canManualDebarkFromHex, syncStrategicSealiftFromTacticalHexEmbarkPairs } from '../game-actions/sealift';
import { isDbReady } from '../gameDb';
import { getActiveTacticalBattleSnapshotRef, setActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import { writeTacticalBattleSnapshotToGameConfig } from './tacticalBattlePersistence';
import { validateTacticalHumanEmbarkOrder, canPlayerEmbarkFromTacticalRes4Hex } from './tacticalOpponentOrderValidation';
import {
  applyTacticalEmbarkPhaseOnBattle,
  tacticalBattleWithSyncedEmbarkCargo,
} from './tacticalStrategicOrderPhases';
import {
  buildTacticalSealiftStackStateFromSnapshot,
  normalizeTacticalSealiftSlots,
} from './tacticalSealiftStackState';
import { tacticalLogMutate, tacticalLogQuery } from './tacticalLogging';

type SealiftSlots = { slot1UnitId: string | null; slot2UnitId: string | null };

/**
 * Clears human infantry/armor embark links for sub-units co-located at one tactical res4 hex (draft for reassignment).
 *
 * Purpose: Matches strategic slot editor behavior that removes a land unit from all carriers before assigning it to the target row.
 * When to use: First step of `projectTacticalSealiftSlotChange` before sequential embark validation.
 * Expected outcome: Human land at `h3Index` has `embarkedOnSubUnitId` unset; other rows unchanged.
 * Exceptions: None.
 */
function clearHumanLandEmbarksAtHex(snap: TacticalBattleSnapshot, h3Index: string): TacticalBattleSnapshot {
  const subUnits = snap.subUnits.map((u) => {
    if (u.h3Index !== h3Index || u.player !== 'human') return u;
    if (u.unitType !== 'infantry' && u.unitType !== 'armor') return u;
    return { ...u, embarkedOnSubUnitId: undefined };
  });
  return { ...snap, subUnits };
}

/**
 * Lists embark pairs from a normalized tactical slot map in deterministic carrier/slot order.
 *
 * Purpose: Supplies `EmbarkOrder` rows for validation and strategic DB sync in a stable sequence.
 * When to use: After slot normalization in `projectTacticalSealiftSlotChange`.
 * Expected outcome: At most two orders per naval id; slot1 precedes slot2; naval ids sorted lexicographically.
 * Exceptions: None.
 */
function embarkOrdersFromTacticalSlots(slotsByNavalId: Map<string, SealiftSlots>): EmbarkOrder[] {
  const out: EmbarkOrder[] = [];
  const navalIds = [...slotsByNavalId.keys()].sort((a, b) => a.localeCompare(b));
  for (const navalUnitId of navalIds) {
    const s = slotsByNavalId.get(navalUnitId);
    if (!s) continue;
    if (s.slot1UnitId) out.push({ unitId: s.slot1UnitId, navalUnitId });
    if (s.slot2UnitId) out.push({ unitId: s.slot2UnitId, navalUnitId });
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
 * Expected outcome: Same success/failure reasons as strategic `updateSealiftSlotImpl`, with sub-unit ids throughout.
 * Exceptions: None; returns `success: false` instead of throwing.
 */
export function projectTacticalSealiftSlotChange(
  snap: TacticalBattleSnapshot,
  args: { h3Index: string; navalUnitId: string; slotIndex: 1 | 2; landUnitId: string | null }
): TacticalSealiftSlotProjectResult {
  tacticalLogQuery('projectTacticalSealiftSlotChange', {
    h3Index: args.h3Index,
    navalUnitId: args.navalUnitId,
    slotIndex: args.slotIndex,
    hasLand: args.landUnitId != null && args.landUnitId.length > 0,
  });
  const footprint = new Set(snap.res4ChildH3Indexes);
  if (!footprint.has(args.h3Index)) {
    return { success: false, reason: 'That stack is outside the tactical battle footprint.' };
  }
  const baseState = buildTacticalSealiftStackStateFromSnapshot(snap, args.h3Index);
  const navalIds = baseState.navalRows.map((r) => r.navalUnitId);
  if (!navalIds.includes(args.navalUnitId)) {
    return { success: false, reason: 'Selected naval unit is not in this stack.' };
  }
  const isDebark = args.landUnitId === null;
  if (isDebark) {
    if (!canManualDebarkFromHex(args.h3Index, 'human')) {
      return { success: false, reason: 'Debark is not available at this location.' };
    }
  } else if (baseState.contextMode === 'water') {
    return { success: false, reason: 'Sealift assignments cannot be changed while at sea.' };
  }
  const landKey = args.landUnitId?.trim() ?? '';
  if (landKey.length > 0 && !canPlayerEmbarkFromTacticalRes4Hex(args.h3Index, 'human')) {
    return { success: false, reason: 'Embarkation requires a valid port.' };
  }
  if (landKey.length > 0 && !baseState.landOptions.some((o) => o.unitId === landKey)) {
    return { success: false, reason: 'Selected land unit is not available for this stack.' };
  }

  const landTypeById = new Map(baseState.landOptions.map((o) => [o.unitId, o.unitType] as const));
  const slotsByNavalId = new Map<string, SealiftSlots>(
    baseState.navalRows.map((row) => [
      row.navalUnitId,
      { slot1UnitId: row.slot1UnitId, slot2UnitId: row.slot2UnitId },
    ])
  );

  if (landKey.length > 0) {
    for (const slots of slotsByNavalId.values()) {
      if (slots.slot1UnitId === landKey) slots.slot1UnitId = null;
      if (slots.slot2UnitId === landKey) slots.slot2UnitId = null;
    }
  }

  const targetSlots = slotsByNavalId.get(args.navalUnitId);
  if (!targetSlots) return { success: false, reason: 'Selected naval unit is not available.' };
  const targetKey = args.slotIndex === 1 ? 'slot1UnitId' : 'slot2UnitId';
  targetSlots[targetKey] = landKey.length > 0 ? landKey : null;
  if (
    args.slotIndex === 2 &&
    landKey.length > 0 &&
    targetSlots.slot1UnitId &&
    landTypeById.get(targetSlots.slot1UnitId) === 'armor'
  ) {
    return { success: false, reason: 'This naval unit already carries armor and has no second slot.' };
  }

  normalizeTacticalSealiftSlots(navalIds, slotsByNavalId, landTypeById);

  let acc = clearHumanLandEmbarksAtHex(snap, args.h3Index);
  const embarkOrders = embarkOrdersFromTacticalSlots(slotsByNavalId);
  for (const e of embarkOrders) {
    const checked = validateTacticalHumanEmbarkOrder(e, acc.subUnits);
    if (!checked.valid) {
      return { success: false, reason: checked.reason };
    }
    acc = applyTacticalEmbarkPhaseOnBattle(acc, [e], 'human');
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
export function applyTacticalSealiftSlotChangeInSession(args: {
  h3Index: string;
  navalUnitId: string;
  slotIndex: 1 | 2;
  landUnitId: string | null;
}): TacticalSealiftSlotSessionResult {
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
    const embarkPairs = embarkOrdersFromTacticalSlots(
      new Map(
        projected.state.navalRows.map((row) => [
          row.navalUnitId,
          { slot1UnitId: row.slot1UnitId, slot2UnitId: row.slot2UnitId },
        ])
      )
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
