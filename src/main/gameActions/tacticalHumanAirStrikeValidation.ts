/**
 * Validates human tactical air strike orders against the active battle footprint and strategic infrastructure rows.
 */

import { strategicParentOf } from '../../shared/h3Resolutions';

import type { AirStrikeTargetType } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { tacticalSubUnitLabelForUserMessage } from '../../shared/unitDisplayNames';
import { getStrategicInfrastructureForHex, isDbReady } from '../gameDb';
import { tacticalFootprintContains } from '../tacticalBattle/tacticalSnapshotGuards';
import { logDebug } from '../logger';

/**
 * Validates one or more human air sub-units striking a tactical target with airport and payload rules aligned to strategic `validateAirStrikeOrder`, but **without** the strategic grid-distance cap — any tactical cell in the tactical footprint is in range.
 *
 * Purpose: Tactical strikes use sub-unit ids and tactical hexes while infrastructure lives on the parent strategic cell; this module keeps those lookups consistent.
 * When to use: `validateGroupAirStrikeTarget` in `gameActions` when a tactical battle session is active.
 * Expected outcome: `{ success: true }` when every selected air unit may strike the target; otherwise a single human-readable `reason`.
 * Exceptions: None; returns failure when the DB is unavailable for infrastructure reads.
 */
export function validateTacticalHumanAirStrikeGroup(
  snap: TacticalBattleSnapshot,
  unitIds: readonly string[],
  targetH3Index: string,
  targetType: AirStrikeTargetType,
  /**
   * Which tactical player owns the striking air sub-units (`human` for human drafts, `opponent` for buffered AI plans).
   */
  attackerPlayer: 'human' | 'opponent' = 'human'
): { success: true } | { success: false; reason: string } {
  logDebug('tacticalHumanAirStrikeValidation validateTacticalHumanAirStrikeGroup', {
    unitCount: unitIds.length,
    targetH3Index,
    targetType,
    attackerPlayer,
  });
  if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
  const footprint = new Set(snap.tacticalChildH3Indexes);
  if (!tacticalFootprintContains(footprint, targetH3Index)) {
    return { success: false, reason: 'Target is outside the tactical battle.' };
  }
  const targetParent = strategicParentOf(targetH3Index);
  if (targetParent !== snap.enclosingStrategicH3Index) {
    return { success: false, reason: 'Air strikes may only target the contested strategic hex.' };
  }

  for (const unitId of unitIds) {
    const label = tacticalSubUnitLabelForUserMessage(snap.subUnits, unitId);
    const unit = snap.subUnits.find((u) => u.id === unitId);
    if (!unit || unit.player !== attackerPlayer) {
      return { success: false, reason: `${label}: Unit not in tactical battle.` };
    }
    if (unit.unitType !== 'air') return { success: false, reason: `${label}: Only air units can strike.` };
    if (!tacticalFootprintContains(footprint, unit.h3Index)) {
      return { success: false, reason: `${label}: Air unit is outside the tactical battle footprint.` };
    }
    const baseInfra = getStrategicInfrastructureForHex(strategicParentOf(unit.h3Index));
    if (baseInfra.airportCount <= 0) {
      return { success: false, reason: `${label}: Air unit must be based at an intact airport to strike` };
    }
    if (targetType === 'units') {
      const enemiesAtTarget = snap.subUnits.some((u) => u.h3Index === targetH3Index && u.player !== unit.player);
      if (!enemiesAtTarget) return { success: false, reason: `${label}: Target hex has no enemy units` };
      continue;
    }
    const targetInfra = getStrategicInfrastructureForHex(targetParent);
    if (targetType === 'urban' && targetInfra.urbanHexCount <= 0) {
      return { success: false, reason: `${label}: Target hex has no urban infrastructure` };
    }
    if (targetType === 'airport' && targetInfra.airportCount <= 0) {
      return { success: false, reason: `${label}: Target hex has no airport` };
    }
    if (targetType === 'seaport' && targetInfra.seaportCount <= 0) {
      return { success: false, reason: `${label}: Target hex has no seaport` };
    }
  }
  return { success: true };
}
