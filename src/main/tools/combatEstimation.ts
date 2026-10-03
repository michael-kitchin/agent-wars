/**
 * Combat outcome estimation (`estimate_combat`).
 * Exact analytical computation of combat outcome probabilities using the Poisson-Binomial
 * distribution over independent per-unit hit rolls. Internal payloads use lat/lng tuples; LLM-visible
 * tool results use briefing hex codes after `encodeOpenRouterToolResultForLlm`.
 */

import type { GameStateSnapshot } from '../gameDb';
import { getAttack, getDefense } from '../combatConstants';
import { type CombatUnit } from '../combatResolution';
import { logDebug, logError, logTrace } from '../logger';
import { canDefenderReturnFireAtAnyAttackerHex } from '../../shared/returnFireEligibility';
import { computeGridDistancePure } from '../../shared/h3GridRangePure';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { h3ToLatLng, type LatLngMap } from './h3LatLng';
import {
  buildStrategicCombatEstimationTheater,
  buildTacticalCombatEstimationTheater,
  type CombatEstimationEngagementType,
  type CombatEstimationTheater,
} from './combatEstimationTheater';
import {
  buildAttackers,
  buildDefenders,
  normalizeCombatSideArgs,
  type CombatSideArgs,
  type CombatSideContext,
} from './combatEstimationSides';

/**
 * Re-exports shared lat/lng tuple type for consumers that imported it from this module.
 *
 * Purpose: Preserves historical import paths after `LatLng` moved to `h3LatLng.ts`.
 * When to use: Prefer `./h3LatLng` for new code.
 * Expected outcome: Same `LatLng` alias as `h3LatLng`.
 * Exceptions: None.
 */
export type { LatLng } from './h3LatLng';

/**
 * Computes the exact distribution of hit counts for independent rolls with different hit chances.
 *
 * Purpose: Poisson-binomial probability mass function behind every `estimate_combat` prediction.
 * When to use: Per side, with one hit chance per rolling unit.
 * Expected outcome: Array of length `probs.length + 1`; entry k is the probability of exactly k hits.
 * Exceptions: None.
 */
export function poissonBinomialPMF(probs: number[]): number[] {
  let dp = [1.0];
  for (const p of probs) {
    const next = new Array(dp.length + 1).fill(0);
    for (let k = 0; k < dp.length; k++) {
      next[k] += dp[k]! * (1 - p);
      next[k + 1] += dp[k]! * p;
    }
    dp = next;
  }
  return dp;
}

/**
 * Tool names served by `executeCombatEstimation`.
 *
 * Purpose: Frozen LLM tool names for the estimation tool group and dispatcher routing.
 * When to use: Tool-group registry and prompt assembly.
 * Expected outcome: Contains only `estimate_combat`.
 * Exceptions: None.
 */
export const COMBAT_ESTIMATION_TOOL_NAMES = ['estimate_combat'] as const;

/**
 * Model-facing verdict for an engagement prediction.
 *
 * Purpose: One label the model can act on without reading every probability.
 * When to use: Prediction payloads.
 * Expected outcome: Five ordered categories from strongly favorable to strongly unfavorable.
 * Exceptions: None.
 */
export type CombatAssessmentCategory = 'strongly_favorable' | 'favorable' | 'even' | 'unfavorable' | 'strongly_unfavorable';

/**
 * Maps elimination and loss probabilities to an assessment category.
 *
 * Purpose: Stable thresholds so the model sees consistent verdicts across engagements.
 * When to use: After computing or averaging a prediction.
 * Expected outcome: Strong labels at the 0.75/0.25 extremes; otherwise favorable or unfavorable when the difference
 * is at least 0.2, else even.
 * Exceptions: None.
 */
export function getAssessmentCategory(pDefenderEliminated: number, pAttackerLosesUnit: number): CombatAssessmentCategory {
  logTrace('combatEstimation getAssessmentCategory', { pDefenderEliminated, pAttackerLosesUnit });
  if (pDefenderEliminated > 0.75 && pAttackerLosesUnit < 0.25) return 'strongly_favorable';
  if (pAttackerLosesUnit > 0.75 && pDefenderEliminated < 0.25) return 'strongly_unfavorable';
  const diff = pDefenderEliminated - pAttackerLosesUnit;
  if (diff >= 0.2) return 'favorable';
  if (diff <= -0.2) return 'unfavorable';
  return 'even';
}

/**
 * Expected casualties and key probabilities for one engagement.
 *
 * Purpose: Numeric core of every `estimate_combat` prediction, shared by ranged and both melee role cases.
 * When to use: Returned by `computeEngagementPrediction`; averaged for melee.
 * Expected outcome: Probabilities in [0, 1]; expected values capped by unit counts.
 * Exceptions: None.
 */
export interface EngagementPrediction {
  /**
   * Expected attacker hits that remove a defender (capped at the defender count).
   *
   * Contract: Equals `defenderLossesExpected`.
   * When to use: Result payloads.
   * Expected outcome: Non-negative.
   * Exceptions: None.
   */
  readonly attackerHitsExpected: number;
  /**
   * Expected defender hits that remove an attacker (capped at the attacker count).
   *
   * Contract: Equals `attackerLossesExpected`.
   * When to use: Result payloads.
   * Expected outcome: Non-negative.
   * Exceptions: None.
   */
  readonly defenderHitsExpected: number;
  /**
   * Expected attacker units lost.
   *
   * Contract: At most the attacker count.
   * When to use: Result payloads and reasoning text.
   * Expected outcome: Non-negative.
   * Exceptions: None.
   */
  readonly attackerLossesExpected: number;
  /**
   * Expected defender units lost.
   *
   * Contract: At most the defender count.
   * When to use: Result payloads and reasoning text.
   * Expected outcome: Non-negative.
   * Exceptions: None.
   */
  readonly defenderLossesExpected: number;
  /**
   * Probability that every defender is removed.
   *
   * Contract: In [0, 1].
   * When to use: Assessment category.
   * Expected outcome: One when hits are certain to cover every defender.
   * Exceptions: None.
   */
  readonly probabilityDefenderEliminated: number;
  /**
   * Probability that at least one attacker is removed.
   *
   * Contract: In [0, 1].
   * When to use: Assessment category.
   * Expected outcome: Zero when defenders cannot roll.
   * Exceptions: None.
   */
  readonly probabilityAttackerLosesUnit: number;
}

/**
 * Computes an exact engagement prediction from per-unit hit chances.
 *
 * Purpose: Pure math shared by ranged estimates and each melee role case.
 * When to use: With one hit chance per rolling attacker and per rolling defender; pass an empty defender list when
 * no defender can fire back.
 * Expected outcome: An `EngagementPrediction`; hits beyond the opposing unit count are wasted, as in resolution.
 * Exceptions: None.
 */
export function computeEngagementPrediction(
  attackerHitProbs: readonly number[],
  defenderHitProbs: readonly number[],
  attackerCount: number,
  defenderCount: number
): EngagementPrediction {
  logTrace('combatEstimation computeEngagementPrediction', {
    attackerHitProbCount: attackerHitProbs.length,
    defenderHitProbCount: defenderHitProbs.length,
    attackerCount,
    defenderCount,
  });
  let defenderLossesExpected = 0;
  let probabilityDefenderEliminated = 0;
  poissonBinomialPMF([...attackerHitProbs]).forEach((p, k) => {
    defenderLossesExpected += Math.min(k, defenderCount) * p;
    if (k >= defenderCount) probabilityDefenderEliminated += p;
  });
  let attackerLossesExpected = 0;
  let probabilityAttackerLosesUnit = 0;
  poissonBinomialPMF([...defenderHitProbs]).forEach((p, k) => {
    attackerLossesExpected += Math.min(k, attackerCount) * p;
    if (k >= 1) probabilityAttackerLosesUnit += p;
  });
  return {
    attackerHitsExpected: defenderLossesExpected,
    defenderHitsExpected: attackerLossesExpected,
    attackerLossesExpected,
    defenderLossesExpected,
    probabilityDefenderEliminated,
    probabilityAttackerLosesUnit,
  };
}

/**
 * Averages two equally likely predictions field by field.
 *
 * Purpose: Melee resolution picks which side rolls attack values at random, so the honest forecast is the mean of
 * both role cases.
 * When to use: Melee estimates only.
 * Expected outcome: Exact mixture prediction (expectations and probabilities are linear in the mixture).
 * Exceptions: None.
 */
function averagePredictions(a: EngagementPrediction, b: EngagementPrediction): EngagementPrediction {
  const mean = (key: keyof EngagementPrediction): number => (a[key] + b[key]) / 2;
  return {
    attackerHitsExpected: mean('attackerHitsExpected'),
    defenderHitsExpected: mean('defenderHitsExpected'),
    attackerLossesExpected: mean('attackerLossesExpected'),
    defenderLossesExpected: mean('defenderLossesExpected'),
    probabilityDefenderEliminated: mean('probabilityDefenderEliminated'),
    probabilityAttackerLosesUnit: mean('probabilityAttackerLosesUnit'),
  };
}

/**
 * Compact role-case summary returned in `meleeRoleOutcomes`.
 *
 * Purpose: Shows the model how lopsided each random melee role case is without repeating every field.
 * When to use: Melee results.
 * Expected outcome: Subset of `EngagementPrediction`.
 * Exceptions: None.
 */
function summarizeRoleCase(p: EngagementPrediction): Record<string, number> {
  return {
    probabilityDefenderEliminated: p.probabilityDefenderEliminated,
    probabilityAttackerLosesUnit: p.probabilityAttackerLosesUnit,
    attackerLossesExpected: p.attackerLossesExpected,
    defenderLossesExpected: p.defenderLossesExpected,
  };
}

/**
 * Return-fire evaluation for a ranged estimate.
 *
 * Purpose: Hit chances of defenders that may legally fire back, plus model-facing details.
 * When to use: Returned by `evaluateReturnFire`.
 * Expected outcome: Empty probabilities when nobody can fire back.
 * Exceptions: None.
 */
interface ReturnFireEvaluation {
  /**
   * Whether at least one defender may fire back.
   *
   * Contract: True iff `hitProbs` is non-empty.
   * When to use: `defenderSummary.canReturnFire`.
   * Expected outcome: Boolean.
   * Exceptions: None.
   */
  readonly canReturnFire: boolean;
  /**
   * One line per eligible defender, joined with semicolons.
   *
   * Contract: Null when nobody can fire back.
   * When to use: `defenderSummary.returnFireDetails` and reasoning text.
   * Expected outcome: Model-facing text.
   * Exceptions: None.
   */
  readonly details: string | null;
  /**
   * Attack-value hit chance per eligible defender.
   *
   * Contract: Values in [0, 1].
   * When to use: Defender side of the ranged prediction.
   * Expected outcome: Defender order.
   * Exceptions: None.
   */
  readonly hitProbs: number[];
}

/**
 * Determines which defenders can return fire at the attackers' cells.
 *
 * Purpose: Uses the theater's return-fire context, the same predicate ranged resolution applies.
 * When to use: Ranged estimates with real attackers; assumed attackers have no known position.
 * Expected outcome: One attack-value hit chance per eligible defender, and a detail line per eligible defender.
 * Exceptions: None.
 */
function evaluateReturnFire(
  theater: CombatEstimationTheater,
  attackers: readonly CombatUnit[],
  defenders: readonly CombatUnit[],
  targetHexH3: string
): ReturnFireEvaluation {
  const attackerHexes = [...new Set(attackers.map((u) => u.h3Index))];
  const dist = attackerHexes.length ? computeGridDistancePure(targetHexH3, attackerHexes[0]!) : 0;
  const distLabel = dist === null ? 'unknown' : String(dist);
  const eligible = defenders.filter((u) =>
    canDefenderReturnFireAtAnyAttackerHex(
      { unitType: u.unitType, h3Index: u.h3Index || targetHexH3 },
      attackerHexes,
      theater.returnFireContext
    )
  );
  const whoCan = eligible.map((u) => {
    const reach = theater.describeFireReach(u.unitType, u.h3Index || targetHexH3);
    const suffix = u.unitType === 'air' ? '' : ', within range';
    return `${u.id} (${u.unitType}, ${reach}) can return fire - attacker at distance ${distLabel}${suffix}`;
  });
  logDebug('combatEstimation return fire eligibility', {
    theater: theater.theater,
    canReturnFire: eligible.length > 0,
    defenderCount: defenders.length,
    eligibleCount: eligible.length,
  });
  return {
    canReturnFire: eligible.length > 0,
    details: whoCan.length > 0 ? whoCan.join('; ') : null,
    hitProbs: eligible.map((u) => getAttack(u.unitType) / 6),
  };
}

/**
 * Parsed `estimate_combat` arguments.
 *
 * Purpose: Typed view after validation.
 * When to use: Returned by `parseEstimateCombatArgs`.
 * Expected outcome: Engagement, target lat/lng, and side arguments.
 * Exceptions: None.
 */
interface EstimateCombatArgs {
  /**
   * Engagement to predict.
   *
   * Contract: `ranged` or `melee`.
   * When to use: Every estimate.
   * Expected outcome: Validated value.
   * Exceptions: None.
   */
  readonly engagementType: CombatEstimationEngagementType;
  /**
   * Target cell center after hex-code decoding.
   *
   * Contract: Two finite numbers.
   * When to use: Resolving the target cell.
   * Expected outcome: Lat/lng tuple.
   * Exceptions: None.
   */
  readonly targetLatLng: readonly [number, number];
  /**
   * Attacker argument.
   *
   * Contract: Has non-empty `units` or `assumed`.
   * When to use: `buildAttackers`.
   * Expected outcome: Model input after `normalizeCombatSideArgs`.
   * Exceptions: None.
   */
  readonly attackers: CombatSideArgs;
  /**
   * Optional defender argument; omitted means "units on the target cell".
   *
   * Contract: May be empty.
   * When to use: `buildDefenders`.
   * Expected outcome: Model input after `normalizeCombatSideArgs`.
   * Exceptions: None.
   */
  readonly defenders?: CombatSideArgs;
}

/**
 * Validates raw `estimate_combat` arguments.
 *
 * Purpose: Keeps argument checks out of the estimator body.
 * When to use: First step of `executeEstimateCombat`.
 * Expected outcome: Parsed arguments, or a model-facing error string.
 * Exceptions: None.
 */
function parseEstimateCombatArgs(args: unknown): EstimateCombatArgs | string {
  const a = args as { engagementType?: unknown; attackers?: unknown; targetHex?: unknown; defenders?: unknown };
  const engagementType = a?.engagementType === 'ranged' || a?.engagementType === 'melee' ? a.engagementType : undefined;
  const target =
    Array.isArray(a?.targetHex) && a.targetHex.length >= 2 && a.targetHex.every((x: unknown) => typeof x === 'number')
      ? ([Number(a.targetHex[0]), Number(a.targetHex[1])] as const)
      : undefined;
  const attackers = normalizeCombatSideArgs(a?.attackers);
  if (!engagementType || !target || !attackers) {
    return 'estimate_combat requires engagementType ("ranged"|"melee"), attackers, and targetHex (briefing hex code).';
  }
  if (!attackers.units && !attackers.assumed) return 'attackers must have units (string[]) or assumed ({ type, count }[])';
  return { engagementType, targetLatLng: target, attackers, defenders: normalizeCombatSideArgs(a.defenders) };
}

/**
 * Uncontested prediction payload for an empty automatic defender list.
 *
 * Purpose: Keeps the historical zero-filled shape when the target cell holds no enemy.
 * When to use: `executeEstimateCombat` before any math.
 * Expected outcome: Assessment `uncontested`.
 * Exceptions: None.
 */
const UNCONTESTED_PREDICTION = {
  trials: 0,
  attackerHitsExpected: 0,
  defenderHitsExpected: 0,
  attackerLossesExpected: 0,
  defenderLossesExpected: 0,
  probabilityDefenderEliminated: 0,
  probabilityAttackerLosesUnit: 0,
  assessment: 'uncontested',
  reasoning: 'No defenders at target hex',
} as const;

/**
 * Predicts the outcome of one ranged or melee engagement.
 *
 * Purpose: `estimate_combat` implementation for strategic turns and, when `tacticalBattle` is set, battles. Battle
 * estimates use battle range, terrain, and line-of-sight rules and reject air attackers.
 * When to use: Through `executeCombatEstimation` from the tool loop.
 * Expected outcome: `status: 'ok'` with attacker and defender summaries and a `prediction`. Melee predictions average
 * both random role assignments and add `meleeRoleOutcomes`. Ranged return fire is evaluated only for real attackers.
 * An empty automatic defender list yields an `uncontested` prediction.
 * Exceptions: None; invalid input yields `status: 'error'`.
 */
export function executeEstimateCombat(
  args: unknown,
  state: GameStateSnapshot,
  latLngByH3: LatLngMap,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  tacticalBattle?: TacticalBattleSnapshot
): { status: string; error: string | null; [k: string]: unknown } {
  const parsed = parseEstimateCombatArgs(args);
  if (typeof parsed === 'string') return { status: 'error', error: parsed };
  const { engagementType, targetLatLng } = parsed;
  const realAttackers = !!parsed.attackers.units && parsed.attackers.units.length > 0;
  logDebug('combatEstimation executeEstimateCombat', {
    engagementType,
    targetHex: targetLatLng,
    attackersSource: realAttackers ? 'units' : 'assumed',
    defendersProvided: !!parsed.defenders,
    tacticalBattleId: tacticalBattle?.battleId ?? null,
  });

  const targetHexH3 = resolveToH3(targetLatLng[0], targetLatLng[1]);
  if (!targetHexH3 || !state.hexes.some((h) => h.h3Index === targetHexH3)) {
    return { status: 'error', error: 'Invalid hex position' };
  }

  const theater = tacticalBattle
    ? buildTacticalCombatEstimationTheater(tacticalBattle)
    : buildStrategicCombatEstimationTheater(state);
  const warnings: string[] = [];
  const ctx: CombatSideContext = { theater, engagementType, targetHexH3, latLngByH3, warnings };
  const attackers = buildAttackers(parsed.attackers, ctx);
  if (attackers.error !== undefined) return { status: 'error', error: attackers.error };
  const defenders = buildDefenders(parsed.defenders, ctx);
  if (defenders.error !== undefined) return { status: 'error', error: defenders.error };

  const base = {
    status: 'ok',
    error: null,
    engagementType,
    targetHex: h3ToLatLng(targetHexH3, latLngByH3, 'cellCenter'),
    attackerSummary: { units: attackers.summary, totalUnits: attackers.combat.length },
  };
  if (defenders.combat.length === 0 && defenders.automatic) {
    return {
      ...base,
      defenderSummary: { units: [], totalUnits: 0, canReturnFire: false, returnFireDetails: null },
      prediction: UNCONTESTED_PREDICTION,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  const attackerCount = attackers.combat.length;
  const defenderCount = defenders.combat.length;
  const attackProbs = (units: readonly CombatUnit[]) => units.map((u) => getAttack(u.unitType) / 6);
  const defenseProbs = (units: readonly CombatUnit[]) => units.map((u) => getDefense(u.unitType) / 6);
  const expectedFrag = (p: EngagementPrediction) =>
    `Expected outcome: ${p.attackerLossesExpected.toFixed(2)} attacker losses, ${p.defenderLossesExpected.toFixed(2)} defender losses.`;

  let prediction: EngagementPrediction;
  let reasoning: string;
  let returnFire: ReturnFireEvaluation = { canReturnFire: false, details: null, hitProbs: [] };
  let meleeRoleOutcomes: Record<string, Record<string, number>> | undefined;
  if (engagementType === 'ranged') {
    if (realAttackers) {
      returnFire = evaluateReturnFire(theater, attackers.combat, defenders.combat, targetHexH3);
    } else {
      warnings.push('Using assumed attackers - return fire not evaluated (attacker position unknown)');
    }
    prediction = computeEngagementPrediction(attackProbs(attackers.combat), returnFire.hitProbs, attackerCount, defenderCount);
    const leadType = attackers.combat[0]?.unitType ?? 'attacker';
    const leadAttack = attackerCount > 0 ? getAttack(attackers.combat[0]!.unitType) : 0;
    const hitPct = Math.round((leadAttack / 6) * 100);
    const returnFrag = returnFire.canReturnFire && returnFire.details ? ` ${returnFire.details}.` : '';
    reasoning = `${leadType} attacks at value ${leadAttack} (${hitPct}% hit chance).${returnFrag} ${expectedFrag(prediction)}`;
  } else {
    const attackersRollAttack = computeEngagementPrediction(
      attackProbs(attackers.combat),
      defenseProbs(defenders.combat),
      attackerCount,
      defenderCount
    );
    const attackersRollDefense = computeEngagementPrediction(
      defenseProbs(attackers.combat),
      attackProbs(defenders.combat),
      attackerCount,
      defenderCount
    );
    prediction = averagePredictions(attackersRollAttack, attackersRollDefense);
    meleeRoleOutcomes = {
      attackersRollAttack: summarizeRoleCase(attackersRollAttack),
      attackersRollDefense: summarizeRoleCase(attackersRollDefense),
    };
    reasoning =
      'Melee roles are random: half the time the attackers roll attack values and the defenders roll defense values, ' +
      `otherwise the roles swap; this prediction averages both cases. ${expectedFrag(prediction)}`;
  }

  return {
    ...base,
    defenderSummary: {
      units: defenders.summary,
      totalUnits: defenderCount,
      canReturnFire: returnFire.canReturnFire,
      returnFireDetails: returnFire.details,
    },
    prediction: {
      ...prediction,
      assessment: getAssessmentCategory(prediction.probabilityDefenderEliminated, prediction.probabilityAttackerLosesUnit),
      reasoning,
    },
    ...(meleeRoleOutcomes ? { meleeRoleOutcomes } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * Dispatches combat-estimation tool calls.
 *
 * Purpose: Tool-loop entry point for the estimation group with uniform error handling.
 * When to use: From the tool loop for `estimate_combat`; pass `tacticalBattle` during a battle so battle rules apply.
 * Expected outcome: The estimator's result, or `status: 'error'` for unknown tools and unexpected exceptions.
 * Exceptions: None; exceptions are logged and converted to error results.
 */
export function executeCombatEstimation(
  toolName: string,
  args: unknown,
  state: GameStateSnapshot,
  latLngByH3: LatLngMap,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  tacticalBattle?: TacticalBattleSnapshot
): { status: string; error: string | null; [k: string]: unknown } {
  logDebug('combatEstimation executeCombatEstimation', {
    toolName,
    stateTurn: state.turnNumber,
    tacticalBattleId: tacticalBattle?.battleId ?? null,
  });
  if (toolName !== 'estimate_combat') {
    return { status: 'error', error: `Unknown tool: ${toolName}` };
  }
  try {
    return executeEstimateCombat(args, state, latLngByH3, resolveToH3, tacticalBattle);
  } catch (err) {
    logError('combatEstimation executeCombatEstimation', err);
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}
