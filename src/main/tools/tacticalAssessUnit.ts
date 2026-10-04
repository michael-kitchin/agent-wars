/**
 * Battle `assess_unit`: one sub-unit's tactical picture under battle range, terrain, and march rules.
 */

import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import {
  canDefenderReturnFireAtAttackerHex,
  type ReturnFireEligibilityContext,
} from '../../shared/returnFireEligibility';
import {
  effectiveRes4TerrainKindString,
  effectiveTacticalRangedMaxRangeForAttacker,
  tacticalMovementTerrainAnchorH3,
} from '../../shared/tacticalTerrainCombatModifiers';
import {
  buildTacticalReturnFireContext,
  tacticalEmbarkedLandExcludedFromRangedInput,
} from '../tacticalBattle/tacticalCombatInput';
import { logDebug } from '../logger';
import { gridHopDistanceBetween } from './assessUnitProximity';
import { h3ToLatLng, type LatLng, type LatLngMap } from './h3LatLng';
import { estimateTacticalMarch, type TacticalMarchEstimate } from './tacticalMarchEstimate';
import { tacticalOriginBonusUnitFields } from './originBonusAssessment';
import { weatherAttackPenalty, weatherBonusLevelOf } from '../../shared/weatherBonusRules';
import type { OriginBonusSettings } from '../../shared/originBonusTypes';

/**
 * Inputs for `executeTacticalAssessUnit`.
 *
 * Purpose: Parameter object for the battle assessment entry point.
 * When to use: From `executeAssessment` during a battle, after argument parsing.
 * Expected outcome: Validated unit id and radius plus the battle snapshot and coordinate map.
 * Exceptions: None.
 */
export interface TacticalAssessUnitArgs {
  /**
   * Sub-unit id to assess.
   *
   * Contract: Any side; normally an AI sub-unit.
   * When to use: Every call.
   * Expected outcome: Looked up in `battle.subUnits`.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * Search radius in cells.
   *
   * Contract: Positive integer.
   * When to use: Every call.
   * Expected outcome: Units farther than this many grid hops are left out.
   * Exceptions: None.
   */
  readonly radius: number;
  /**
   * Active battle snapshot.
   *
   * Contract: Same snapshot the tool loop uses for the beat.
   * When to use: Every call.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly battle: TacticalBattleSnapshot;
  /**
   * Cell-center lookup for result positions.
   *
   * Contract: Covers the battle footprint.
   * When to use: Every call.
   * Expected outcome: Positions encode to briefing hex codes for the model.
   * Exceptions: None.
   */
  readonly latLngByH3: LatLngMap;
  /**
   * Match origin bonus flags.
   *
   * Contract: Required, so every caller decides; pass `ORIGIN_BONUS_OFF` when bonuses do not apply.
   * When to use: Every call; the tool loop reads them from the plan state.
   * Expected outcome: Controls the origin bonus fields of the `unit` block.
   * Exceptions: None.
   */
  readonly originBonusSettings: OriginBonusSettings;
}

/**
 * Battle rules shared by every pairwise check in one assessment.
 *
 * Purpose: Builds the footprint and return-fire context once per call.
 * When to use: Only inside this module.
 * Expected outcome: Read-only lookups.
 * Exceptions: None.
 */
interface TacticalAssessContext {
  /**
   * Battle snapshot.
   *
   * Contract: Read only.
   * When to use: Every rule check.
   * Expected outcome: Unchanged.
   * Exceptions: None.
   */
  readonly battle: TacticalBattleSnapshot;
  /**
   * Battle return-fire rules, reused as the "can this unit fire at that cell" rule.
   *
   * Contract: From `buildTacticalReturnFireContext`.
   * When to use: `canTacticalUnitFireAtCell`.
   * Expected outcome: Tactical theater context.
   * Exceptions: None.
   */
  readonly fireContext: ReturnFireEligibilityContext;
}

/**
 * Returns the cell a sub-unit fights and is measured from.
 *
 * Purpose: Cargo shares its carrier's cell, matching the AI plan state.
 * When to use: Every distance, range, and march check.
 * Expected outcome: Carrier cell for embarked cargo; otherwise the sub-unit's own cell.
 * Exceptions: None.
 */
function anchorOf(ctx: TacticalAssessContext, u: TacticalSubUnitSnapshot): string {
  return tacticalMovementTerrainAnchorH3(u, ctx.battle.subUnits);
}

/**
 * Whether one sub-unit can fire at another this beat.
 *
 * Purpose: Same reach rules as battle ranged fire and air strikes: ground and naval use battle range, terrain, and
 * line of sight; air needs an intact airport and reaches the whole battle.
 * When to use: `inRangedRange` and `inEnemyRangedRange`.
 * Expected outcome: False when the shooter is cargo embarked at sea, or when a ground or naval shooter targets cargo
 * embarked at sea (battle ranged fire leaves that cargo out). Air checks may read the game database.
 * Exceptions: None.
 */
function canTacticalUnitFireAtCell(
  ctx: TacticalAssessContext,
  shooter: TacticalSubUnitSnapshot,
  target: TacticalSubUnitSnapshot
): boolean {
  const subs = ctx.battle.subUnits;
  if (tacticalEmbarkedLandExcludedFromRangedInput(ctx.battle, subs, shooter)) return false;
  if (shooter.unitType !== 'air' && tacticalEmbarkedLandExcludedFromRangedInput(ctx.battle, subs, target)) return false;
  return canDefenderReturnFireAtAttackerHex(
    { unitType: shooter.unitType, h3Index: anchorOf(ctx, shooter) },
    anchorOf(ctx, target),
    ctx.fireContext
  );
}

/**
 * March estimate from one sub-unit to another's cell, or null when the mover cannot march.
 *
 * Purpose: Beats-to-reach use the same planner as Ready movement.
 * When to use: `estimatedBeatsToReach`, `estimatedBeatsToReachYou`, and `canEnterCellThisBeat`.
 * Expected outcome: Null for air (no march) and for embarked cargo (cannot march until debarked); otherwise the
 * planner's estimate, which may be unreachable.
 * Exceptions: None.
 */
function marchBetween(
  ctx: TacticalAssessContext,
  mover: TacticalSubUnitSnapshot,
  target: TacticalSubUnitSnapshot
): TacticalMarchEstimate | null {
  if (mover.unitType === 'air' || mover.embarkedOnSubUnitId) return null;
  return estimateTacticalMarch(ctx.battle, mover, anchorOf(ctx, target));
}

/**
 * Beats from a march estimate, or null when the target cannot be reached.
 *
 * Purpose: One null rule for every beats field.
 * When to use: Formatting march estimates.
 * Expected outcome: Non-negative integer or null.
 * Exceptions: None.
 */
function beatsOf(estimate: TacticalMarchEstimate | null): number | null {
  return estimate?.reachable ? estimate.estimatedBeats : null;
}

/**
 * Explains why a unit cannot fire on one enemy this beat.
 *
 * Purpose: Names the rule that blocks the shot, so the model does not read a misleading range figure.
 * When to use: The `reason` of an `attackType: 'none'` row in `canAttackThisBeat`.
 * Expected outcome: Airport text for air, cargo text when either side is cargo embarked at sea, otherwise distance and
 * battle range with the terrain and line-of-sight caveat.
 * Exceptions: None.
 */
function outOfReachReason(
  ctx: TacticalAssessContext,
  self: TacticalSubUnitSnapshot,
  enemy: TacticalSubUnitSnapshot,
  geometry: { readonly hexDistance: number; readonly selfRange: number | null }
): string {
  if (self.unitType === 'air') return "No intact airport at this air unit's base, so it cannot strike this beat";
  const subs = ctx.battle.subUnits;
  if (tacticalEmbarkedLandExcludedFromRangedInput(ctx.battle, subs, self)) {
    return 'Embarked at sea; cargo cannot fire until it lands';
  }
  if (tacticalEmbarkedLandExcludedFromRangedInput(ctx.battle, subs, enemy)) {
    return 'Target is cargo embarked at sea, which ranged fire cannot hit';
  }
  return `Out of reach (distance ${geometry.hexDistance}, battle range ${geometry.selfRange ?? 0}, terrain and line of sight apply)`;
}

/**
 * Builds one enemy row, its threat line, and its attack row.
 *
 * Purpose: Keeps the per-enemy rules in one place.
 * When to use: For each enemy inside the radius.
 * Expected outcome: Critical threat when the enemy can fire on the unit or enter its cell this beat; moderate when it
 * is at most two beats or two cells away; otherwise low.
 * Exceptions: None.
 */
function assessEnemy(
  ctx: TacticalAssessContext,
  self: TacticalSubUnitSnapshot,
  enemy: TacticalSubUnitSnapshot,
  geometry: { readonly hexDistance: number; readonly position: LatLng; readonly selfRange: number | null }
) {
  const inRangedRange = canTacticalUnitFireAtCell(ctx, self, enemy);
  const inEnemyRangedRange = canTacticalUnitFireAtCell(ctx, enemy, self);
  const myMarch = marchBetween(ctx, self, enemy);
  const theirMarch = marchBetween(ctx, enemy, self);
  const theirBeats = beatsOf(theirMarch);
  const enemyCanEnterMyCell = theirMarch?.reachableThisBeat === true;
  let severity = 'low';
  if (inEnemyRangedRange || enemyCanEnterMyCell) severity = 'critical';
  else if ((theirBeats !== null && theirBeats <= 2) || geometry.hexDistance <= 2) severity = 'moderate';
  const label = `${enemy.id} (${enemy.unitType})`;
  let description = `${label} is ${geometry.hexDistance} cell(s) away`;
  if (inEnemyRangedRange) description = `${label} can fire on this unit this beat`;
  else if (enemyCanEnterMyCell) description = `${label} can reach this unit's cell this beat`;
  else if (theirBeats !== null) description += `, about ${theirBeats} beat(s) from reaching this unit`;
  return {
    row: {
      unitId: enemy.id,
      type: enemy.unitType,
      position: geometry.position,
      hexDistance: geometry.hexDistance,
      inRangedRange,
      inEnemyRangedRange,
      canEnterCellThisBeat: myMarch?.reachableThisBeat === true,
      estimatedBeatsToReach: beatsOf(myMarch),
      estimatedBeatsToReachYou: theirBeats,
      embarkedOnSubUnitId: enemy.embarkedOnSubUnitId ?? null,
    },
    threat: { description, severity, sourceUnit: enemy.id },
    attack: inRangedRange
      ? { unitId: enemy.id, attackType: self.unitType === 'air' ? 'air_strike' : 'ranged', reason: '' }
      : {
          unitId: enemy.id,
          attackType: 'none',
          reason: outOfReachReason(ctx, self, enemy, geometry),
        },
  };
}

/**
 * Sort rank for threat severities.
 *
 * Purpose: Lists the most urgent threats first.
 * When to use: Sorting `threats`.
 * Expected outcome: Lower rank sorts first; unknown severities sort last.
 * Exceptions: None.
 */
const SEVERITY_RANK: Readonly<Record<string, number>> = { critical: 0, moderate: 1, low: 2 };

/**
 * Assesses one sub-unit's tactical picture inside a battle.
 *
 * Purpose: Battle `assess_unit`: which enemies this sub-unit can shoot and which can shoot it this beat, whether it can
 * make melee contact this beat, beats to reach each nearby unit, and its own movement and range this beat.
 * When to use: From `executeAssessment` when a tactical battle is active.
 * Expected outcome: `status: 'ok'` with `unit`, `nearbyEnemies`, `nearbyFriendlies`, `threats`, and
 * `canAttackThisBeat`, sorted by distance then id (threats by severity first). Units whose distance cannot be measured
 * are left out. Embarked cargo gets an extra threat line and no independent march.
 * Exceptions: None; an unknown unit id yields `status: 'error'`.
 */
export function executeTacticalAssessUnit(args: TacticalAssessUnitArgs): {
  status: string;
  error: string | null;
  [k: string]: unknown;
} {
  const { unitId, radius, battle, latLngByH3 } = args;
  logDebug('tacticalAssessUnit executeTacticalAssessUnit', { battleId: battle.battleId, unitId, radius });
  const self = battle.subUnits.find((u) => u.id === unitId);
  if (!self) return { status: 'error', error: `Unit not found: ${unitId}` };
  const ctx: TacticalAssessContext = { battle, fireContext: buildTacticalReturnFireContext(battle) };
  const selfH3 = anchorOf(ctx, self);
  const embarkedAtSea = tacticalEmbarkedLandExcludedFromRangedInput(battle, battle.subUnits, self);
  const selfRange =
    self.unitType === 'air' ? null : embarkedAtSea ? 0 : effectiveTacticalRangedMaxRangeForAttacker(battle, self.unitType, selfH3);
  const selfBudget =
    self.unitType === 'air' || self.embarkedOnSubUnitId ? 0 : estimateTacticalMarch(battle, self, selfH3).movementPointBudget;

  const nearby = battle.subUnits
    .filter((u) => u.id !== self.id)
    .flatMap((other) => {
      const otherH3 = anchorOf(ctx, other);
      const hexDistance = gridHopDistanceBetween(selfH3, otherH3);
      if (hexDistance === null) {
        logDebug('tacticalAssessUnit executeTacticalAssessUnit: distance unmeasurable, omitting', {
          battleId: battle.battleId,
          unitId,
          otherUnitId: other.id,
          selfH3,
          otherH3,
        });
        return [];
      }
      return hexDistance <= radius ? [{ other, hexDistance, position: h3ToLatLng(otherH3, latLngByH3, 'cellCenter') }] : [];
    })
    .sort((a, b) => a.hexDistance - b.hexDistance || a.other.id.localeCompare(b.other.id));

  const enemies = nearby
    .filter((n) => n.other.player !== self.player)
    .map((n) => assessEnemy(ctx, self, n.other, { hexDistance: n.hexDistance, position: n.position, selfRange }));
  const nearbyFriendlies = nearby
    .filter((n) => n.other.player === self.player)
    .map((n) => ({
      unitId: n.other.id,
      type: n.other.unitType,
      position: n.position,
      hexDistance: n.hexDistance,
      estimatedBeatsToReachYou: beatsOf(marchBetween(ctx, n.other, self)),
    }));
  const threats = enemies
    .map((e) => e.threat)
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
  if (self.embarkedOnSubUnitId) {
    threats.push({
      description: `Embarked on ${self.embarkedOnSubUnitId}; cannot march independently until debarked`,
      severity: 'low',
      sourceUnit: self.embarkedOnSubUnitId,
    });
  }

  logDebug('tacticalAssessUnit executeTacticalAssessUnit: done', {
    battleId: battle.battleId,
    unitId,
    enemyCount: enemies.length,
    friendlyCount: nearbyFriendlies.length,
    criticalThreats: threats.filter((t) => t.severity === 'critical').length,
  });
  return {
    status: 'ok',
    error: null,
    unit: {
      unitId: self.id,
      type: self.unitType,
      position: h3ToLatLng(selfH3, latLngByH3, 'cellCenter'),
      terrain: effectiveRes4TerrainKindString(battle, selfH3),
      movementPointsThisBeat: selfBudget,
      rangedRangeThisBeat: selfRange,
      embarkedOnSubUnitId: self.embarkedOnSubUnitId ?? null,
      ...tacticalOriginBonusUnitFields(args.originBonusSettings, battle, self),
      ...(battle.weatherBonusEnabled === true
        ? {
            weatherTags: self.weatherTags ?? [],
            weatherHere: battle.weather ?? null,
            rangedAttackPenalized: weatherAttackPenalty({
              unitType: self.unitType,
              kind: 'ranged',
              weatherAtUnit: battle.weather,
              tags: self.weatherTags,
              level: weatherBonusLevelOf(battle),
            }) > 0,
            airStrikePenalizedAtBase: weatherAttackPenalty({
              unitType: self.unitType,
              kind: 'airStrike',
              weatherAtUnit: battle.weather,
              weatherAtTarget: battle.weather,
              tags: self.weatherTags,
              level: weatherBonusLevelOf(battle),
            }) > 0,
          }
        : {}),
    },
    nearbyEnemies: enemies.map((e) => e.row),
    nearbyFriendlies,
    threats,
    canAttackThisBeat: enemies.map((e) => e.attack),
  };
}
