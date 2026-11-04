/**
 * Sealift stack UI state derived from the active tactical snapshot (sub-unit ids) instead of strategic `units` rows.
 */

import type { SealiftLandUnitOption, SealiftStackState } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { emptySealiftStackState } from '../../shared/sealiftStackState';
import {
  buildSealiftNavalRows,
  buildSealiftSlotsByNavalId,
  buildSealiftStackState,
  normalizeSealiftSlots,
} from '../gameActions/sealiftSlotAssignment';
import { canManualDebarkFromHex, getSealiftStackContextModeForHex } from '../gameActions/sealift';
import { getActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import { tacticalLogQuery } from './tacticalLogging';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';

/**
 * Returns sealift UI state for one tactical stack hex from the committed tactical snapshot (human sub-units only).
 *
 * Purpose: Enables the renderer stack callout during tactical battles while `updateSealiftSlot` is blocked on the strategic path.
 * When to use: `gameActions.getTacticalSealiftStackState` IPC when `isTacticalBattleActive()` and the hex lies in the tactical footprint.
 * Expected outcome: Same `SealiftStackState` shape as strategic sealift, but `unitId` fields reference tactical **sub-unit** ids.
 * Exceptions: None; returns `showSealiftSection: false` when no session, hex outside the battle, or the stack has no human sealift-relevant units.
 */
export function getTacticalSealiftStackStateForHex(h3Index: string): SealiftStackState {
  tacticalLogQuery('getTacticalSealiftStackStateForHex', { h3Index });
  const empty = emptySealiftStackState(h3Index);
  const snap = getActiveTacticalBattleSnapshotRef();
  if (!snap) return empty;
  const footprint = new Set(snap.tacticalChildH3Indexes);
  if (!footprint.has(h3Index)) return empty;
  return buildTacticalSealiftStackStateFromSnapshot(snap, h3Index);
}

/**
 * Builds `SealiftStackState` rows for human mixed land/naval stacks at one tactical hex.
 *
 * Purpose: Shared implementation for tactical sealift IPC without coupling sealift DB assignment readers to sub-unit ids.
 * When to use: `getTacticalSealiftStackStateForHex` and tactical sealift slot IPC after session and footprint guards succeed.
 * Expected outcome: Populated `navalRows` / `landOptions` when human infantry or armor shares a cell with human naval units.
 * Exceptions: None.
 */
export function buildTacticalSealiftStackStateFromSnapshot(snap: TacticalBattleSnapshot, h3Index: string): SealiftStackState {
  const at = snap.subUnits.filter((u) => u.h3Index === h3Index && u.player === HUMAN_SEAT_ID);
  const navalSubs = at.filter((u) => u.unitType === 'naval').sort((a, b) => a.id.localeCompare(b.id));
  const infantryPresent = at.some((unit) => unit.unitType === 'infantry');
  const airSubs = at
    .filter((unit) => unit.unitType === 'air')
    .filter(
      (unit) =>
        infantryPresent || at.some((land) => land.unitType === 'infantry' && land.embarkedOnSubUnitId === unit.id)
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const landSubs = at.filter((u) => u.unitType === 'infantry' || u.unitType === 'armor');
  const visibleLand = navalSubs.length > 0 ? landSubs : landSubs.filter((unit) => unit.unitType === 'infantry');
  const landOptions: SealiftLandUnitOption[] = visibleLand
    .map((u) => ({ unitId: u.id, unitType: u.unitType as 'infantry' | 'armor' }))
    .sort((a, b) => {
      if (a.unitType !== b.unitType) return a.unitType === 'armor' ? -1 : 1;
      return a.unitId.localeCompare(b.unitId);
    });
  const landTypeById = new Map(landOptions.map((o) => [o.unitId, o.unitType] as const));
  const assignments: { landUnitId: string; navalUnitId: string; landUnitType: 'infantry' | 'armor' }[] = [];
  for (const land of landSubs) {
    const e = land.embarkedOnSubUnitId;
    if (!e) continue;
    const naval = at.find((u) => u.id === e && (u.unitType === 'naval' || u.unitType === 'air'));
    if (!naval) continue;
    assignments.push({
      landUnitId: land.id,
      navalUnitId: naval.id,
      landUnitType: land.unitType as 'infantry' | 'armor',
    });
  }
  const navalIds = navalSubs.map((u) => u.id);
  const airIds = airSubs.map((unit) => unit.id);
  const carrierIds = [...navalIds, ...airIds];
  const slotsByNavalId = buildSealiftSlotsByNavalId(carrierIds, assignments);
  normalizeSealiftSlots(carrierIds, slotsByNavalId, landTypeById);
  const contextMode = getSealiftStackContextModeForHex(h3Index);
  const debarkAllowed = canManualDebarkFromHex(h3Index, HUMAN_SEAT_ID);
  const shipRows = buildSealiftNavalRows({
    navalIds,
    slotsByNavalId,
    landTypeById,
    contextMode,
    debarkAllowed,
  });
  const airRows = buildSealiftNavalRows({
    navalIds: airIds,
    slotsByNavalId,
    landTypeById,
    contextMode: 'coastal_port',
    debarkAllowed: true,
  }).map((row) => ({
    ...row,
    slot2UnitId: null,
    slot2Disabled: true,
    debarkSlot2Enabled: false,
  }));
  const navalRows = [...shipRows, ...airRows];
  return buildSealiftStackState({
    h3Index,
    contextMode,
    navalRows,
    landOptions,
    hasEmbarkedUnitsInStack: assignments.length > 0,
    debarkAllowedAtHex: debarkAllowed,
  });
}
