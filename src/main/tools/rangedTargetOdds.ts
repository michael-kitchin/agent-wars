/**
 * Ranged-attack odds for the effects tooltip.
 *
 * Purpose: Turns the units the player can see on a legal ranged target into the same Kill, Hurt, and
 * Loss chances the commander briefing calls Odds, without letting one rejected defender fail the shot.
 * When to use: From the main-process handler while the human is aiming a ranged attack.
 * Expected outcome: Rounded percents and the defender ids that entered the estimate, or null when
 * no defender remains or the estimate throws.
 * Exceptions: None. A thrown estimate is logged and returned as null.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logError } from '../logger';
import { originBonusSettingsFromSnapshot } from '../../shared/originBonusRules';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { executeEstimateCombat } from './combatEstimation';
import {
  buildStrategicCombatEstimationTheater,
  buildTacticalCombatEstimationTheater,
} from './combatEstimationTheater';
import type { LatLngMap } from './h3LatLng';

/**
 * Kill, Hurt, and Loss percents for one ranged target.
 *
 * Purpose: The tooltip prints these three numbers, and lists only the defenders that were counted.
 * When to use: The return value of `previewRangedTargetOdds` when at least one defender remains.
 * Expected outcome: All three percents are numbers, or all three are null. `countedDefenderIds` is the ids
 * that entered the estimate.
 * Exceptions: None.
 */
export interface RangedTargetOdds {
  /**
   * Chance the shot wipes the counted defenders, as a whole percent.
   *
   * Contract: The Kill number.
   * When to use: Read after a completed estimate.
   * Expected outcome: `Math.round(probabilityDefenderEliminated * 100)`, or null when the estimate
   * cannot supply all three chances.
   * Exceptions: None.
   */
  readonly killPercent: number | null;
  /**
   * Chance the attackers lose at least one unit, as a whole percent.
   *
   * Contract: The Loss number.
   * When to use: Read after a completed estimate.
   * Expected outcome: `Math.round(probabilityAttackerLosesUnit * 100)`, or null when the estimate cannot supply all three chances.
   * Exceptions: None.
   */
  readonly lossPercent: number | null;
  /**
   * Chance the attackers score at least one hit, as a whole percent.
   *
   * Contract: The Hurt number on the odds line.
   * When to use: Read after a completed estimate.
   * Expected outcome: `Math.round(probabilityAtLeastOneHit * 100)`, or null when the estimate cannot supply all three chances.
   * Exceptions: None.
   */
  readonly hurtPercent: number | null;
  /**
   * Defender ids that were eligible for the ranged estimate.
   *
   * Contract: The roster lists opponent seats among these ids only.
   * When to use: After `previewRangedTargetOdds` returns a result.
   * Expected outcome: The ids passed to the estimator, in the caller's order, with rejected ids removed.
   * Exceptions: None.
   */
  readonly countedDefenderIds: readonly string[];
}

/**
 * Inputs for one ranged-target odds preview.
 *
 * Purpose: Keeps the database and the estimator outside this function so tests can pass a fixture.
 * When to use: The main-process handler fills the snapshot, battle, and coordinate map.
 * Expected outcome: `estimate` defaults to `executeEstimateCombat` when omitted.
 * Exceptions: None.
 */
export interface PreviewRangedTargetOddsInput {
  /**
   * Unit ids the ranged validator just accepted.
   *
   * Contract: Every accepted shooter fires in the one estimate.
   * When to use: The selection `validateGroupRangedTarget` accepted.
   * Expected outcome: Passed through as the attacker unit list.
   * Exceptions: None.
   */
  readonly attackerIds: readonly string[];
  /**
   * Defender ids the renderer can see on the hovered cell.
   *
   * Contract: Limits the estimate to units the player already sees, including Neutral.
   * When to use: Occupants of the hovered cell other than the human seat.
   * Expected outcome: Rejected ids are dropped before the estimate.
   * Exceptions: None.
   */
  readonly defenderIds: readonly string[];
  /**
   * Hovered cell the shot is aimed at.
   *
   * Contract: The estimate's target, already the battle cell when a battle is open.
   * When to use: The same h3 the ranged validator used.
   * Expected outcome: Looked up in `latLngByH3`.
   * Exceptions: None.
   */
  readonly targetH3: string;
  /**
   * Match snapshot whose hex list contains `targetH3`.
   *
   * Contract: Strategic rules read `state.units`. A battle passes the tactical plan state so the
   * target cell is one of `state.hexes`.
   * When to use: `getGameState()` on the strategic map, or `buildTacticalAiPlanState` in a battle.
   * Expected outcome: Forwarded to the estimator unchanged.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * Centers for the hexes in `state`.
   *
   * Contract: The estimator takes a lat/lng target and snaps it back with `resolveToH3`.
   * When to use: The map from `buildLatLngCoordinateMap` over `state.hexes`.
   * Expected outcome: `targetH3` is present.
   * Exceptions: None.
   */
  readonly latLngByH3: LatLngMap;
  /**
   * Nearest-cell snap for a lat/lng.
   *
   * Contract: Same resolver the estimator uses to check the target is in `state.hexes`.
   * When to use: The resolver paired with `latLngByH3`.
   * Expected outcome: Returns an h3 from that map.
   * Exceptions: None.
   */
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
  /**
   * Open battle, when the target is a battle cell.
   *
   * Contract: Selects battle ranged rules, including infantry return fire.
   * When to use: Only while a battle snapshot is the one the renderer is aiming in.
   * Expected outcome: Omitted on the strategic map.
   * Exceptions: None.
   */
  readonly tacticalBattle?: TacticalBattleSnapshot;
  /**
   * Estimator to call once defenders remain.
   *
   * Contract: Tests replace this to see whether the call happened and which ids it received.
   * When to use: Omit in production.
   * Expected outcome: Defaults to `executeEstimateCombat`.
   * Exceptions: A throw is caught by `previewRangedTargetOdds`.
   */
  readonly estimate?: typeof executeEstimateCombat;
}

/**
 * Prediction fields this preview reads from an estimate result.
 *
 * Purpose: Narrows the estimator's open result without depending on its full prediction type.
 * When to use: Only inside `readRangedTargetOdds`.
 * Expected outcome: The three probabilities and the assessment label.
 * Exceptions: None.
 */
interface RangedTargetOddsPrediction {
  /**
   * Estimator label for whether the shot is a fight.
   *
   * Contract: `uncontested` clears Kill, Hurt, and Loss together.
   * When to use: After the estimator returns a prediction.
   * Expected outcome: Any other label leaves the three probabilities to be checked.
   * Exceptions: None.
   */
  readonly assessment?: string;
  /**
   * Chance the shot wipes the counted defenders.
   *
   * Contract: A finite probability from 0 through 1, or omitted.
   * When to use: After the estimator returns a prediction.
   * Expected outcome: Rounded to `killPercent` only when all three probabilities are finite numbers.
   * Exceptions: None.
   */
  readonly probabilityDefenderEliminated?: number;
  /**
   * Chance the attackers lose at least one unit.
   *
   * Contract: A finite probability from 0 through 1, or omitted.
   * When to use: After the estimator returns a prediction.
   * Expected outcome: Rounded to `lossPercent` only when all three probabilities are finite numbers.
   * Exceptions: None.
   */
  readonly probabilityAttackerLosesUnit?: number;
  /**
   * Chance the attackers score at least one hit, including a hit that only removes a fortification.
   *
   * Contract: A finite probability from 0 through 1, or omitted.
   * When to use: After the estimator returns a prediction.
   * Expected outcome: Rounded to `hurtPercent` only when all three probabilities are finite numbers.
   * Exceptions: None.
   */
  readonly probabilityAtLeastOneHit?: number;
}

/**
 * Reads Kill, Hurt, and Loss from one estimate result.
 *
 * Purpose: The three numbers appear together, so a missing or uncontested prediction clears all three.
 * When to use: After the estimator returns without throwing.
 * Expected outcome: Rounded percents, or all three null, plus the ids that were passed in.
 * Exceptions: None.
 */
function readRangedTargetOdds(
  result: { status: string; prediction?: RangedTargetOddsPrediction },
  countedDefenderIds: readonly string[],
): RangedTargetOdds {
  const prediction = result.prediction;
  const kill = prediction?.probabilityDefenderEliminated;
  const hurt = prediction?.probabilityAtLeastOneHit;
  const loss = prediction?.probabilityAttackerLosesUnit;
  if (
    result.status !== 'ok' ||
    !prediction ||
    prediction.assessment === 'uncontested' ||
    typeof kill !== 'number' ||
    typeof hurt !== 'number' ||
    typeof loss !== 'number' ||
    !Number.isFinite(kill) ||
    !Number.isFinite(hurt) ||
    !Number.isFinite(loss)
  ) {
    return { killPercent: null, hurtPercent: null, lossPercent: null, countedDefenderIds };
  }
  return {
    killPercent: Math.round(kill * 100),
    hurtPercent: Math.round(hurt * 100),
    lossPercent: Math.round(loss * 100),
    countedDefenderIds,
  };
}

/**
 * Estimates Kill, Hurt, and Loss for one ranged target.
 *
 * Purpose: One call covers every accepted attacker and every defender the theater accepts.
 * When to use: After ranged validation succeeds, with the defender ids the renderer sent.
 * Expected outcome: Null when no defender remains or the estimate throws. Otherwise the rounded
 * percents, or all three percents null when the estimate cannot supply them, with the counted ids.
 * Exceptions: None. Estimator exceptions are logged and returned as null.
 */
export function previewRangedTargetOdds(input: PreviewRangedTargetOddsInput): RangedTargetOdds | null {
  logDebug('rangedTargetOdds previewRangedTargetOdds', {
    attackerCount: input.attackerIds.length,
    defenderCount: input.defenderIds.length,
    targetH3: input.targetH3,
  });
  try {
    const theater = input.tacticalBattle
      ? buildTacticalCombatEstimationTheater(input.tacticalBattle, originBonusSettingsFromSnapshot(input.state))
      : buildStrategicCombatEstimationTheater(input.state);
    const countedDefenderIds = input.defenderIds.filter((id) => theater.findUnit(id, 'ranged').unit != null);
    if (countedDefenderIds.length === 0) return null;
    const target = input.latLngByH3.get(input.targetH3);
    if (!target) {
      logError('rangedTargetOdds previewRangedTargetOdds missing target coordinate', { targetH3: input.targetH3 });
      return { killPercent: null, hurtPercent: null, lossPercent: null, countedDefenderIds };
    }
    const estimate = input.estimate ?? executeEstimateCombat;
    const result = estimate(
      {
        engagementType: 'ranged',
        attackers: { units: [...input.attackerIds] },
        defenders: { units: [...countedDefenderIds] },
        targetHex: [target[0], target[1]],
      },
      input.state,
      input.latLngByH3,
      input.resolveToH3,
      input.tacticalBattle,
    );
    return readRangedTargetOdds(result, countedDefenderIds);
  } catch (err) {
    logError('rangedTargetOdds previewRangedTargetOdds failed', err);
    return null;
  }
}
