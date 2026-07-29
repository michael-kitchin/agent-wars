/**
 * Lightweight tactical unit assessments for Commander briefing sections (no Tool 2).
 */

import { cellToLatLng, gridDistance } from 'h3-js';
import type { UnitAssessmentResult } from '../precomputation';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { RANGED_RANGE_BY_UNIT_TYPE } from '../../shared/tacticalRanges';
import { logDebug, logTrace } from '../logger';

/**
 * Extracts the strategic parent unit id from a tactical sub-unit id (`parent:slot`).
 *
 * Purpose: Some callers still need the strategic parent key while the prompt uses sub-unit ids.
 * When to use: Lightweight tactical briefing helpers that bridge parent vs sub-unit identity.
 * Expected outcome: Parent prefix before the last `:`; full id when no colon is present.
 * Exceptions: None.
 */
export function parentUnitIdFromTacticalSubUnitId(subUnitId: string): string {
  logTrace('tacticalBriefingAssessments parentUnitIdFromTacticalSubUnitId', { subUnitId });
  const idx = subUnitId.lastIndexOf(':');
  return idx > 0 ? subUnitId.slice(0, idx) : subUnitId;
}

function effectiveH3(unit: TacticalSubUnitSnapshot, byId: Map<string, TacticalSubUnitSnapshot>): string {
  if (unit.embarkedOnSubUnitId) {
    const naval = byId.get(unit.embarkedOnSubUnitId);
    if (naval) return naval.h3Index;
  }
  return unit.h3Index;
}

/**
 * Builds Tool-2-shaped assessments for opponent tactical sub-units from the battle snapshot.
 *
 * Purpose: Feeds Unit Status, Attention Flags, and narrative at strategic table density without precomputation.
 * When to use: `formatTacticalBriefing` before assembling Commander sections.
 * Expected outcome: One assessment per opponent sub-unit with nearest enemy and threat severity; `currentStandingOrder` is always null (standing orders do not apply in tactical beats).
 * Exceptions: None.
 */
export function buildLightweightTacticalUnitAssessments(
  tacticalBattle: TacticalBattleSnapshot
): UnitAssessmentResult[] {
  logDebug('tacticalBriefingAssessments buildLightweightTacticalUnitAssessments', {
    battleId: tacticalBattle.battleId,
    subUnitCount: tacticalBattle.subUnits.length,
  });
  const byId = new Map(tacticalBattle.subUnits.map((u) => [u.id, u]));
  const humans = tacticalBattle.subUnits.filter((u) => u.player === 'human');
  const opponents = tacticalBattle.subUnits.filter((u) => u.player === 'opponent');

  return opponents.map((unit) => {
    const selfH3 = effectiveH3(unit, byId);
    const [lat, lng] = cellToLatLng(selfH3);
    const rangedCap = RANGED_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 0;

    const nearby = humans
      .map((enemy) => {
        const enemyH3 = effectiveH3(enemy, byId);
        let hexDistance = 99;
        try {
          hexDistance = gridDistance(selfH3, enemyH3);
        } catch {
          hexDistance = 99;
        }
        return {
          unitId: enemy.id,
          hexDistance,
          inRangedRange: rangedCap > 0 && hexDistance <= rangedCap,
          inMeleeRange: hexDistance <= 1,
          confidence: 'current' as const,
        };
      })
      .sort((a, b) => a.hexDistance - b.hexDistance);

    const nearest = nearby[0];
    const threats: Array<{ description: string; severity: string; sourceUnit: string }> = [];
    if (nearest) {
      let severity = 'low';
      if (nearest.inMeleeRange) severity = 'critical';
      else if (nearest.inRangedRange || nearest.hexDistance <= 2) severity = 'moderate';
      threats.push({
        description: `Enemy ${nearest.unitId} at distance ${nearest.hexDistance}`,
        severity,
        sourceUnit: nearest.unitId,
      });
    }
    if (unit.embarkedOnSubUnitId) {
      threats.push({
        description: `Embarked on ${unit.embarkedOnSubUnitId}; cannot march independently until debarked`,
        severity: 'low',
        sourceUnit: unit.embarkedOnSubUnitId,
      });
    }

    return {
      unitId: unit.id,
      result: {
        status: 'ok' as const,
        unit: {
          unitId: unit.id,
          type: unit.unitType,
          position: [lat, lng] as [number, number],
          currentStandingOrder: null,
        },
        nearbyEnemies: nearby,
        threats,
        canAttackThisTurn: [],
      },
    };
  });
}

/**
 * Builds the short Commander's Briefing narrative for a tactical beat (strategic style/density).
 *
 * Purpose: Mirrors strategic narrative sentence patterns using lightweight assessments and full visibility.
 * When to use: `formatTacticalBriefing` opener after the H1 title.
 * Expected outcome: Up to five sentences covering force counts, contact, critical threats, and a review CTA (no standing-order language).
 * Exceptions: None.
 */
export function buildTacticalBriefingNarrative(
  tacticalBattle: TacticalBattleSnapshot,
  unitAssessments: UnitAssessmentResult[]
): string {
  const aiUnits = tacticalBattle.subUnits.filter((u) => u.player === 'opponent');
  const humanUnits = tacticalBattle.subUnits.filter((u) => u.player === 'human');
  const inContact = unitAssessments.filter(
    (a) =>
      (a.result.threats?.length ?? 0) > 0 &&
      a.result.nearbyEnemies?.some((e) => e.inRangedRange || e.inMeleeRange)
  ).length;
  const critical = unitAssessments.filter((a) =>
    (a.result.threats ?? []).some((t) => t.severity === 'critical')
  ).length;
  const sentences: string[] = [];
  sentences.push(
    `Tactical beat ${tacticalBattle.tacticalTurnNumber}: you command ${aiUnits.length} sub-unit(s); human sub-units in this battle: ${humanUnits.length} (full visibility).`
  );
  if (inContact > 0) {
    sentences.push(`${inContact} of your sub-units are in or near direct combat range.`);
  }
  if (critical > 0) {
    sentences.push(`${critical} sub-unit(s) face a critical threat and require immediate attention.`);
  }
  sentences.push(
    'Review the unit status table, attention flags, and operational map below, then issue explicit_move, ranged_attack, and air strikes as needed this beat.'
  );
  return sentences.slice(0, 5).join(' ');
}
