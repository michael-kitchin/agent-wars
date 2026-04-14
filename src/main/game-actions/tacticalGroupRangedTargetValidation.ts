/**
 * Tactical-only validation for grouped ranged orders against an active `TacticalBattleSnapshot`.
 */

import { logDebug, logError } from '../logger';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import {
  effectiveTacticalRangedMaxRangeForAttacker,
  tacticalMountainLosBlockedState,
  tacticalMovementTerrainAnchorH3,
} from '../../shared/tacticalTerrainCombatModifiers';
import { isWithinGridRangePure } from '../../shared/h3GridRangePure';
import { tacticalSubUnitLabelForUserMessage } from '../../shared/unitDisplayNames';

/**
 * Result shape for tactical grouped ranged validation (structurally matches `SubmitOrdersResult` from `submitOrders.ts`).
 *
 * Purpose: Avoid importing `./submitOrders` here — that module pulls `gameDb` and would extend an existing `gameActions` load cycle per `check:circular`.
 * When to use: Return type of `validateTacticalGroupRangedTarget` only.
 * Expected outcome: `{ success: true }` or `{ success: false, reason }` compatible with `validateGroupRangedTarget` callers.
 * Exceptions: None.
 */
export type TacticalGroupRangedTargetResult = { success: boolean; reason?: string };

/**
 * Validates that every selected sub-unit may order **tactical ranged** fire at `targetH3Index` (footprint, range cap, mountain LOS, enemy presence).
 *
 * Contract: Caller must pass a non-null `snap` with `res4ChildH3Indexes` and `subUnits` already aligned with the active tactical session.
 * When to use: `validateGroupRangedTarget` when `isTacticalBattleActive()` is true—keeps `gameActions.ts` as a thin coordinator.
 * Expected outcome: `{ success: true }` only when every unit passes range + LOS and at least one enemy occupies the target hex; otherwise `{ success: false, reason }` with per-unit labels in reasons.
 * Exceptions: Does not catch DB readiness; caller handles session missing and empty `uniqueUnitIds`.
 */
export function validateTacticalGroupRangedTarget(params: {
  snap: TacticalBattleSnapshot;
  uniqueUnitIds: string[];
  targetH3Index: string;
  tacticalAttackerPlayer: 'human' | 'opponent';
}): TacticalGroupRangedTargetResult {
  const { snap, uniqueUnitIds, targetH3Index, tacticalAttackerPlayer } = params;
  logDebug('tacticalGroupRangedTargetValidation validateTacticalGroupRangedTarget', {
    unitCount: uniqueUnitIds.length,
    targetH3Index,
    tacticalAttackerPlayer,
    battleId: snap.battleId,
  });
  const footprint = new Set(snap.res4ChildH3Indexes);
  if (!footprint.has(targetH3Index)) return { success: false, reason: 'Target is outside the tactical battle.' };
  for (const unitId of uniqueUnitIds) {
    const label = tacticalSubUnitLabelForUserMessage(snap.subUnits, unitId);
    const unit = snap.subUnits.find((u) => u.id === unitId);
    if (!unit || unit.player !== tacticalAttackerPlayer) {
      return { success: false, reason: `${label}: Unit not in tactical battle.` };
    }
    const anchor = tacticalMovementTerrainAnchorH3(unit, snap.subUnits);
    const range = effectiveTacticalRangedMaxRangeForAttacker(snap, unit.unitType, anchor);
    if (range < 1) return { success: false, reason: `${label}: Unit has no ranged attack.` };
    if (!isWithinGridRangePure(anchor, targetH3Index, range)) {
      return { success: false, reason: `${label}: Target out of range.` };
    }
    const los = tacticalMountainLosBlockedState(snap, anchor, targetH3Index, unit.unitType);
    if (los.traceFailed) {
      logError('validateGroupRangedTarget tactical: implicit LOS trace failed (treating as blocked)', {
        unitId,
        attackerH3: anchor,
        targetH3Index,
      });
    }
    if (los.blocked) {
      return { success: false, reason: `${label}: Line of sight blocked by mountains.` };
    }
  }
  const enemiesAtTarget = snap.subUnits.filter(
    (u) => u.h3Index === targetH3Index && u.player !== tacticalAttackerPlayer
  );
  if (enemiesAtTarget.length === 0) {
    return { success: false, reason: 'Target hex has no enemy units' };
  }
  return { success: true };
}
