/**
 * Sealift stack UI state derived from the active tactical snapshot (sub-unit ids) instead of strategic `units` rows.
 */

import type { SealiftLandUnitOption, SealiftNavalRow, SealiftStackState } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { emptySealiftStackState } from '../../shared/sealiftStackState';
import { buildSealiftSlotsByNavalId, normalizeSealiftSlots } from '../game-actions/sealiftSlotAssignment';
import { canManualDebarkFromHex, getSealiftStackContextModeForHex } from '../game-actions/sealift';
import { getActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import { tacticalLogQuery } from './tacticalLogging';

/**
 * Returns sealift UI state for one res4 stack hex from the committed tactical snapshot (human sub-units only).
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
  const footprint = new Set(snap.res4ChildH3Indexes);
  if (!footprint.has(h3Index)) return empty;
  return buildTacticalSealiftStackStateFromSnapshot(snap, h3Index);
}

/**
 * Builds `SealiftStackState` rows for human mixed land/naval stacks at one tactical res4 hex.
 *
 * Purpose: Shared implementation for tactical sealift IPC without coupling sealift DB assignment readers to sub-unit ids.
 * When to use: `getTacticalSealiftStackStateForHex` and tactical sealift slot IPC after session and footprint guards succeed.
 * Expected outcome: Populated `navalRows` / `landOptions` when human infantry or armor shares a cell with human naval units.
 * Exceptions: None.
 */
export function buildTacticalSealiftStackStateFromSnapshot(snap: TacticalBattleSnapshot, h3Index: string): SealiftStackState {
  const at = snap.subUnits.filter((u) => u.h3Index === h3Index && u.player === 'human');
  const navalSubs = at.filter((u) => u.unitType === 'naval').sort((a, b) => a.id.localeCompare(b.id));
  const landSubs = at.filter((u) => u.unitType === 'infantry' || u.unitType === 'armor');
  const landOptions: SealiftLandUnitOption[] = landSubs
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
    const naval = at.find((u) => u.id === e && u.unitType === 'naval');
    if (!naval) continue;
    assignments.push({
      landUnitId: land.id,
      navalUnitId: naval.id,
      landUnitType: land.unitType as 'infantry' | 'armor',
    });
  }
  const navalIds = navalSubs.map((u) => u.id);
  const slotsByNavalId = buildSealiftSlotsByNavalId(navalIds, assignments);
  normalizeSealiftSlots(navalIds, slotsByNavalId, landTypeById);
  const contextMode = getSealiftStackContextModeForHex(h3Index);
  const debarkAllowed = canManualDebarkFromHex(h3Index, 'human');
  const navalRows: SealiftNavalRow[] = navalIds.map((navalUnitId) => {
    const slots = slotsByNavalId.get(navalUnitId) ?? { slot1UnitId: null, slot2UnitId: null };
    const controlsDisabled = contextMode === 'water' || contextMode === 'coastal_no_port';
    const slot1Armor = !!slots.slot1UnitId && landTypeById.get(slots.slot1UnitId) === 'armor';
    return {
      navalUnitId,
      slot1UnitId: slots.slot1UnitId,
      slot2UnitId: slots.slot2UnitId,
      slot2Disabled: controlsDisabled || slot1Armor,
      controlsDisabled,
      debarkSlot1Enabled: debarkAllowed && !!slots.slot1UnitId,
      debarkSlot2Enabled: debarkAllowed && !!slots.slot2UnitId,
    };
  });
  const hasEmbarkedUnitsInStack = assignments.length > 0;
  const hasMixedStack = navalIds.length > 0 && landOptions.length > 0;
  return {
    h3Index,
    showSealiftSection: hasMixedStack || hasEmbarkedUnitsInStack,
    contextMode,
    controlsDisabled: contextMode === 'water' || contextMode === 'coastal_no_port',
    hasEmbarkedUnitsInStack,
    debarkAllowedAtHex: debarkAllowed,
    navalRows,
    landOptions,
  };
}
