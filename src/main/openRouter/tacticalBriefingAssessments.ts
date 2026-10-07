/**
 * Lightweight tactical unit assessments for Commander briefing sections (no Tool 2).
 */

import { cellToLatLng } from 'h3-js';
import type { UnitAssessmentResult } from '../precomputation';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { tacticalRangedDirectFirePassesTerrainAndRange } from '../../shared/tacticalTerrainCombatModifiers';
import { gridHopDistanceBetween } from '../tools/assessUnitProximity';
import { pickClosestEnemyTacticalRangedTargetForSubUnit } from '../tacticalBattle/tacticalRangedTargetResolve';
import { logDebug, logTrace } from '../logger';
import { parseTacticalSubUnitId } from '../../shared/unitIds';
import { ORIGIN_BONUS_OFF } from '../../shared/originBonusRules';
import type { OriginBonusSettings } from '../../shared/originBonusTypes';
import { tacticalOriginBonusUnitFields, type OriginBonusUnitFields } from '../tools/originBonusAssessment';
import { techLevelAssessmentField } from '../techBonus/techLevelAssessmentField';

/**
 * Extracts the strategic parent unit id from a tactical sub-unit id.
 *
 * Purpose: Some callers still need the strategic parent key while the prompt uses sub-unit ids.
 * When to use: Lightweight tactical briefing helpers that bridge parent vs sub-unit identity.
 * Expected outcome: Compact `-s<slot>` prefix, else the prefix before the last `:`, else the input unchanged.
 * Exceptions: None.
 */
export function parentUnitIdFromTacticalSubUnitId(subUnitId: string): string {
  logTrace('tacticalBriefingAssessments parentUnitIdFromTacticalSubUnitId', { subUnitId });
  const compact = parseTacticalSubUnitId(subUnitId);
  if (compact) return compact.parentUnitId;
  const idx = subUnitId.lastIndexOf(':');
  return idx > 0 ? subUnitId.slice(0, idx) : subUnitId;
}

/**
 * Hex the sub-unit occupies for proximity scoring (cargo uses its naval host).
 *
 * Purpose: Stacked assessment cache keys and nearby-enemy distances must use the same cell the pawn fights from.
 * When to use: `tacticalAssessmentStackKey` and `assessTacticalOpponentUnit`.
 * Expected outcome: Host hex when `embarkedOnSubUnitId` resolves; otherwise the sub-unit's own `h3Index`.
 * Exceptions: None.
 */
function effectiveH3(unit: TacticalSubUnitSnapshot, byId: Map<string, TacticalSubUnitSnapshot>): string {
  logTrace('tacticalBriefingAssessments effectiveH3', { unitId: unit.id });
  if (unit.embarkedOnSubUnitId) {
    const naval = byId.get(unit.embarkedOnSubUnitId);
    if (naval) return naval.h3Index;
  }
  return unit.h3Index;
}

/**
 * Cache key for lightweight tactical assessments that share nearby-enemy geometry.
 *
 * Purpose: Same cell, type, and embark host see the same humans and threat ranks; only sub-unit id differs.
 * When to use: `buildLightweightTacticalUnitAssessments` before scanning humans.
 * Expected outcome: Distinct types or embark hosts on the same hex do not share a key (range and embark notes differ).
 * Exceptions: None.
 */
function tacticalAssessmentStackKey(
  unit: TacticalSubUnitSnapshot,
  byId: Map<string, TacticalSubUnitSnapshot>
): string {
  logTrace('tacticalBriefingAssessments tacticalAssessmentStackKey', { unitId: unit.id });
  return `${effectiveH3(unit, byId)}|${unit.unitType}|emb:${unit.embarkedOnSubUnitId ?? ''}`;
}

/**
 * Weather column fields for one tactical sub-unit.
 *
 * Purpose: Unit Status names the battle's weather and this sub-unit's tags while the weather option is on.
 * When to use: Lightweight assessments and stack clones.
 * Expected outcome: `{ weatherTags, weatherHere }` when the battle flag is on, otherwise `{}`.
 * Exceptions: None.
 */
function weatherFieldsForBriefing(
  battle: TacticalBattleSnapshot,
  unit: TacticalSubUnitSnapshot
): { weatherTags?: readonly string[]; weatherHere?: string } {
  if (battle.weatherBonusEnabled !== true) return {};
  return {
    weatherTags: unit.weatherTags ? [...unit.weatherTags] : [],
    ...(battle.weather ? { weatherHere: battle.weather } : {}),
  };
}

/**
 * Rewrites a cached tactical assessment for another sub-unit stacked on the same cell.
 *
 * Purpose: Avoid repeating grid-distance scans for stacked same-type pawns while still emitting one Unit Status row each.
 * When to use: Cache hit in `buildLightweightTacticalUnitAssessments`.
 * Expected outcome: Cloned nearby rows; unit id, position, origin bonus, tech tier, and weather tags belong to the stacked sub-unit.
 * Exceptions: None.
 */
function cloneTacticalAssessmentForStackedUnit(
  cached: UnitAssessmentResult,
  unit: TacticalSubUnitSnapshot,
  byId: Map<string, TacticalSubUnitSnapshot>,
  originBonusFor: (unit: TacticalSubUnitSnapshot) => OriginBonusUnitFields,
  battle: TacticalBattleSnapshot
): UnitAssessmentResult {
  logTrace('tacticalBriefingAssessments cloneTacticalAssessmentForStackedUnit', {
    cachedUnitId: cached.unitId,
    unitId: unit.id,
  });
  const selfH3 = effectiveH3(unit, byId);
  const [lat, lng] = cellToLatLng(selfH3);
  return {
    unitId: unit.id,
    result: {
      ...cached.result,
      unit: {
        ...cached.result.unit,
        unitId: unit.id,
        position: [lat, lng],
        ...originBonusFor(unit),
        ...techLevelAssessmentField(unit.techLevel),
        ...weatherFieldsForBriefing(battle, unit),
      },
      nearbyEnemies: cached.result.nearbyEnemies.map((enemy) => ({ ...enemy })),
      threats: cached.result.threats.map((threat) => ({ ...threat })),
      // The stack key pins hex, type, and embark state, so every pawn in the stack shoots from the same anchor
      // with the same reach and therefore has the same legal targets.
      canAttackThisTurn: (cached.result.canAttackThisTurn as ReadonlyArray<Record<string, unknown>>).map(
        (row) => ({ ...row })
      ),
    },
  };
}

/**
 * Lists the shot a tactical sub-unit could legally take this beat, in Tool 2's `canAttackThisTurn` shape.
 *
 * Purpose: Unit Status decides `Action needed` from this list. Leaving it empty in tactical, as it was, meant the
 * briefing never told the model which pawns had a shot, so a model that skipped the beat lost those attacks silently.
 * Legality comes from the same resolver the tactical auto-fire sweep uses, so the flag and the fallback agree.
 * When to use: Building a tactical opponent assessment.
 * Expected outcome: One row naming the nearest legal enemy sub-unit, typed `air_strike` for air and `ranged`
 * otherwise; an empty list when nothing is in reach.
 * Exceptions: None.
 */
function tacticalCanAttackRows(
  unit: TacticalSubUnitSnapshot,
  battle: TacticalBattleSnapshot
): Array<{ unitId: string; attackType: string; reason: string }> {
  const targetH3 = pickClosestEnemyTacticalRangedTargetForSubUnit(battle, unit.id);
  if (!targetH3) return [];
  const enemy = battle.subUnits.find((s) => s.h3Index === targetH3 && s.player !== unit.player);
  if (!enemy) return [];
  return [{ unitId: enemy.id, attackType: unit.unitType === 'air' ? 'air_strike' : 'ranged', reason: '' }];
}

/**
 * Builds one Tool-2-shaped assessment for a single opponent tactical sub-unit.
 *
 * Purpose: Shared scan used by the first unit in a same-hex same-type stack.
 * When to use: Cache miss in `buildLightweightTacticalUnitAssessments`.
 * Expected outcome: Nearby humans scored by grid hops from the unit's effective hex; embarked cargo gets an extra
 * threat; `canAttackThisTurn` names the nearest legally shootable enemy so Unit Status can flag the shot.
 * `inRangedRange` uses the same range-plus-mountain-LOS helper as apply-phase fire, not the baseline hop cap.
 * Exceptions: None. Humans whose distance stays unmeasurable are omitted rather than given a placeholder distance, so
 * threat severity and the in-range flags never describe a hex pairing the grid could not confirm.
 */
function assessTacticalOpponentUnit(
  unit: TacticalSubUnitSnapshot,
  byId: Map<string, TacticalSubUnitSnapshot>,
  humans: TacticalSubUnitSnapshot[],
  battle: TacticalBattleSnapshot
): UnitAssessmentResult {
  logTrace('tacticalBriefingAssessments assessTacticalOpponentUnit', {
    unitId: unit.id,
    humanCount: humans.length,
  });
  const selfH3 = effectiveH3(unit, byId);
  const [lat, lng] = cellToLatLng(selfH3);
  const footprint = new Set(battle.tacticalChildH3Indexes);

  const nearby = humans
    .flatMap((enemy) => {
      const enemyH3 = effectiveH3(enemy, byId);
      const hexDistance = gridHopDistanceBetween(selfH3, enemyH3);
      if (hexDistance === null) {
        logDebug('tacticalBriefingAssessments assessTacticalOpponentUnit: enemy distance unmeasurable, omitting', {
          unitId: unit.id,
          selfH3,
          enemyUnitId: enemy.id,
          enemyH3,
        });
        return [];
      }
      return [
        {
          unitId: enemy.id,
          hexDistance,
          inRangedRange: tacticalRangedDirectFirePassesTerrainAndRange(
            battle,
            footprint,
            unit.unitType,
            selfH3,
            enemyH3
          ),
          inMeleeRange: hexDistance <= 1,
          confidence: 'current' as const,
        },
      ];
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
        position: [lat, lng],
        currentStandingOrder: null,
        ...weatherFieldsForBriefing(battle, unit),
      },
      nearbyEnemies: nearby,
      threats,
      canAttackThisTurn: tacticalCanAttackRows(unit, battle),
    },
  };
}

/**
 * Builds Tool-2-shaped assessments for opponent tactical sub-units from the battle snapshot.
 *
 * Purpose: Feeds Unit Status, Attention Flags, and narrative at strategic table density without precomputation.
 * When to use: `formatTacticalBriefing` before assembling Commander sections.
 * Expected outcome: One assessment per opponent sub-unit with nearest enemy, threat severity, and any legal shot;
 * `currentStandingOrder` is always null (standing orders do not apply in tactical beats). Same-hex same-type stacks
 * reuse one scan. With an origin bonus flag on, each `unit` block also carries the same origin bonus fields `assess_unit`
 * reports, which turns on the Unit Status Bonus column.
 * Exceptions: None.
 */
export function buildLightweightTacticalUnitAssessments(
  tacticalBattle: TacticalBattleSnapshot,
  originBonusSettings: OriginBonusSettings = ORIGIN_BONUS_OFF
): UnitAssessmentResult[] {
  logDebug('tacticalBriefingAssessments buildLightweightTacticalUnitAssessments', {
    battleId: tacticalBattle.battleId,
    subUnitCount: tacticalBattle.subUnits.length,
    ...originBonusSettings,
  });
  const originBonusFor = (unit: TacticalSubUnitSnapshot): OriginBonusUnitFields =>
    tacticalOriginBonusUnitFields(originBonusSettings, tacticalBattle, unit);
  const byId = new Map(tacticalBattle.subUnits.map((u) => [u.id, u]));
  const humans = tacticalBattle.subUnits.filter((u) => u.player === 'human');
  const opponents = tacticalBattle.subUnits.filter((u) => u.player === 'opponent');
  const assessmentByStackKey = new Map<string, UnitAssessmentResult>();
  const results: UnitAssessmentResult[] = [];
  let uniqueAssessments = 0;
  let reusedAssessments = 0;
  for (const unit of opponents) {
    const stackKey = tacticalAssessmentStackKey(unit, byId);
    const cached = assessmentByStackKey.get(stackKey);
    if (cached) {
      reusedAssessments += 1;
      results.push(cloneTacticalAssessmentForStackedUnit(cached, unit, byId, originBonusFor, tacticalBattle));
      continue;
    }
    const scanned = assessTacticalOpponentUnit(unit, byId, humans, tacticalBattle);
    const entry: UnitAssessmentResult = {
      ...scanned,
      result: {
        ...scanned.result,
        unit: { ...scanned.result.unit, ...originBonusFor(unit), ...techLevelAssessmentField(unit.techLevel) },
      },
    };
    assessmentByStackKey.set(stackKey, entry);
    uniqueAssessments += 1;
    results.push(entry);
  }
  logDebug('tacticalBriefingAssessments buildLightweightTacticalUnitAssessments complete', {
    battleId: tacticalBattle.battleId,
    requested: opponents.length,
    uniqueAssessments,
    reusedAssessments,
  });
  return results;
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
    `Review the unit status table, attention flags, and operational map below, then issue ${
      aiUnits.some((u) => u.unitType === 'air')
        ? 'explicit_move, ranged_attack, and air strikes'
        : 'explicit_move and ranged_attack'
    } as needed this beat.`
  );
  return sentences.slice(0, 5).join(' ');
}
