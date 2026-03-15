/**
 * MCP Tool 3: Combat Outcome Estimation (estimate_combat).
 * Exact analytical computation of combat outcome probabilities using the Poisson-Binomial
 * distribution over independent per-unit hit rolls. All hex positions in tool responses are
 * [lat, lng]; H3 indices are internal only.
 */

import { cellToLatLng, gridDistance } from 'h3-js';
import type { GameStateSnapshot } from '../gameDb';
import { getAttack, getDefense, getRange } from '../combatConstants';
import { type CombatUnit } from '../combatResolution';
import { logDebug, logError, logTrace } from '../logger';

/** Coordinate pair [lat, lng] at the tool boundary. */
export type LatLng = [number, number];

type LatLngMap = Map<string, LatLng>;

/** Calling player id when not in state: AI is opponent, so enemy = human. */
const AI_PLAYER_ID = 'opponent';

function h3ToLatLng(h3: string, latLngByH3: LatLngMap): LatLng {
  const ll = latLngByH3.get(h3);
  if (ll) return ll;
  const [lat, lng] = cellToLatLng(h3);
  return [lat, lng];
}

/**
 * Computes the exact probability mass function for total successes from independent
 * Bernoulli trials with potentially different success probabilities (Poisson-Binomial
 * distribution). Returns array where element k = P(exactly k successes).
 * O(n^2) time and O(n) space; suitable for the small unit counts in this game.
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

/** Tool name for Tool 3. Exported so OpenRouter can route estimate_combat to this module. */
export const TOOL3_NAMES = ['estimate_combat'] as const;

/**
 * Returns the assessment category from probability of defender eliminated and probability attacker loses at least one unit.
 * Use for estimate_combat prediction; handle uncontested (no defenders) in the caller. Thresholds per MCP spec § Tool 3.
 */
export function getAssessmentCategory(
  pDefenderEliminated: number,
  pAttackerLosesUnit: number
): 'strongly_favorable' | 'favorable' | 'even' | 'unfavorable' | 'strongly_unfavorable' {
  logTrace('tool3CombatEstimation getAssessmentCategory', { pDefenderEliminated, pAttackerLosesUnit });
  if (pDefenderEliminated > 0.75 && pAttackerLosesUnit < 0.25) return 'strongly_favorable';
  if (pAttackerLosesUnit > 0.75 && pDefenderEliminated < 0.25) return 'strongly_unfavorable';
  const diff = pDefenderEliminated - pAttackerLosesUnit;
  if (diff >= 0.2) return 'favorable';
  if (diff <= -0.2) return 'unfavorable';
  return 'even';
}

/**
 * Implements estimate_combat: parses args, resolves or builds attacker/defender lists, computes exact
 * outcome probabilities via Poisson-Binomial PMFs, returns spec-shaped response. Call from executeTool3.
 * Exported for unit tests.
 */
export function executeEstimateCombat(
  args: unknown,
  state: GameStateSnapshot,
  latLngByH3: LatLngMap,
  resolveToH3: (lat: number, lng: number) => string | undefined
): { status: string; error: string | null; [k: string]: unknown } {
  const a = args as {
    engagementType?: unknown;
    attackers?: { units?: string[]; assumed?: { type: string; count: number }[] };
    targetHex?: unknown;
    defenders?: { units?: string[]; assumed?: { type: string; count: number }[] };
  };
  const engagementType = a?.engagementType === 'ranged' || a?.engagementType === 'melee' ? a.engagementType : undefined;
  const targetArr = Array.isArray(a?.targetHex) && a.targetHex.length >= 2 && a.targetHex.every((x: unknown) => typeof x === 'number')
    ? [Number(a.targetHex[0]), Number(a.targetHex[1])]
    : undefined;
  if (!engagementType || !targetArr || !a?.attackers) {
    return { status: 'error', error: 'estimate_combat requires engagementType ("ranged"|"melee"), attackers, and targetHex [lat, lng]' };
  }

  const attackersRaw = a.attackers;
  const useAttackerUnits = Array.isArray(attackersRaw?.units) && attackersRaw.units.length > 0;
  const useAttackerAssumed = Array.isArray(attackersRaw?.assumed) && attackersRaw.assumed.length > 0;
  const attackerSource: 'units' | 'assumed' = useAttackerUnits ? 'units' : useAttackerAssumed ? 'assumed' : (null as never);
  if (!useAttackerUnits && !useAttackerAssumed) {
    return { status: 'error', error: 'attackers must have units (string[]) or assumed ({ type, count }[])' };
  }

  logDebug('tool3CombatEstimation executeEstimateCombat', {
    engagementType,
    targetHex: targetArr,
    attackersSource: attackerSource,
    defendersProvided: !!a.defenders,
  });

  const targetHexH3 = resolveToH3(targetArr[0], targetArr[1]);
  if (!targetHexH3) {
    return { status: 'error', error: 'Invalid hex position' };
  }

  const hexSet = new Set(state.hexes.map((h) => h.h3Index));
  if (!hexSet.has(targetHexH3)) {
    return { status: 'error', error: 'Invalid hex position' };
  }

  const warnings: string[] = [];

  let attackerCombat: CombatUnit[] = [];
  const attackerSummaryUnits: { unitId: string; type: string; attackValue: number; position?: LatLng }[] = [];
  if (attackerSource === 'units') {
    const ids = attackersRaw!.units!;
    for (const id of ids) {
      const u = state.units.find((x) => x.id === id);
      if (!u) return { status: 'error', error: `Unit not found: ${id}` };
      attackerCombat.push({ id: u.id, player: u.player, unitType: u.unitType, h3Index: u.h3Index });
      attackerSummaryUnits.push({
        unitId: u.id,
        type: u.unitType,
        attackValue: getAttack(u.unitType),
        position: h3ToLatLng(u.h3Index, latLngByH3),
      });
    }
    if (engagementType === 'ranged') {
      const inRange: CombatUnit[] = [];
      const excluded: string[] = [];
      for (const u of attackerCombat) {
        try {
          const dist = gridDistance(u.h3Index, targetHexH3);
          if (getRange(u.unitType) >= dist) inRange.push(u);
          else excluded.push(u.id);
        } catch {
          excluded.push(u.id);
        }
      }
      if (inRange.length === 0 && attackerCombat.length > 0) {
        const u = attackerCombat[0]!;
        const dist = (() => { try { return gridDistance(u.h3Index, targetHexH3); } catch { return 999; } })();
        return {
          status: 'error',
          error: `Attacker ${u.id} (range ${getRange(u.unitType)}) cannot reach target hex at distance ${dist}`,
        };
      }
      if (excluded.length > 0) warnings.push(`Excluded out-of-range attackers: ${excluded.join(', ')}`);
      attackerCombat = inRange;
    }
  } else {
    let idx = 0;
    for (const { type, count } of attackersRaw!.assumed!) {
      for (let c = 0; c < count; c++) {
        const id = `assumed-attacker-${idx++}`;
        attackerCombat.push({
          id,
          player: AI_PLAYER_ID,
          unitType: type,
          h3Index: targetHexH3,
        });
        attackerSummaryUnits.push({ unitId: id, type, attackValue: getAttack(type) });
      }
    }
  }

  const defendersRaw = a.defenders;
  const useDefenderUnits = Array.isArray(defendersRaw?.units) && defendersRaw.units.length > 0;
  const useDefenderAssumed = Array.isArray(defendersRaw?.assumed) && defendersRaw.assumed.length > 0;
  const defenderSource: 'auto' | 'units' | 'assumed' = useDefenderUnits
    ? 'units'
    : useDefenderAssumed
      ? 'assumed'
      : 'auto';

  let defenderCombat: CombatUnit[] = [];
  const defenderSummaryUnits: { unitId: string; type: string; defenseValue: number }[] = [];
  if (defenderSource === 'auto') {
    defenderCombat = state.units.filter(
      (u) => u.h3Index === targetHexH3 && u.player !== AI_PLAYER_ID
    ).map((u) => ({ id: u.id, player: u.player, unitType: u.unitType, h3Index: u.h3Index }));
    for (const u of defenderCombat) {
      defenderSummaryUnits.push({ unitId: u.id, type: u.unitType, defenseValue: getDefense(u.unitType) });
    }
  } else if (defenderSource === 'units') {
    const ids = defendersRaw!.units!;
    for (const id of ids) {
      const u = state.units.find((x) => x.id === id);
      if (!u) return { status: 'error', error: `Unit not found: ${id}` };
      defenderCombat.push({ id: u.id, player: u.player, unitType: u.unitType, h3Index: targetHexH3 });
      defenderSummaryUnits.push({ unitId: u.id, type: u.unitType, defenseValue: getDefense(u.unitType) });
    }
  } else {
    let idx = 0;
    for (const { type, count } of defendersRaw!.assumed!) {
      for (let c = 0; c < count; c++) {
        const id = `assumed-defender-${idx++}`;
        defenderCombat.push({
          id,
          player: 'human',
          unitType: type,
          h3Index: targetHexH3,
        });
        defenderSummaryUnits.push({ unitId: id, type, defenseValue: getDefense(type) });
      }
    }
  }

  if (defenderCombat.length === 0 && defenderSource === 'auto') {
    const targetLatLng = h3ToLatLng(targetHexH3, latLngByH3);
    return {
      status: 'ok',
      error: null,
      engagementType,
      targetHex: targetLatLng,
      attackerSummary: { units: attackerSummaryUnits, totalUnits: attackerCombat.length },
      defenderSummary: {
        units: [],
        totalUnits: 0,
        canReturnFire: false,
        returnFireDetails: null,
      },
      prediction: {
        trials: 0,
        attackerHitsExpected: 0,
        defenderHitsExpected: 0,
        attackerLossesExpected: 0,
        defenderLossesExpected: 0,
        probabilityDefenderEliminated: 0,
        probabilityAttackerLosesUnit: 0,
        assessment: 'uncontested',
        reasoning: 'No defenders at target hex',
      },
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  let canReturnFire = false;
  let returnFireDetails: string | null = null;
  const defenderReturnFireProbs: number[] = [];
  if (engagementType === 'ranged') {
    if (attackerSource === 'assumed') {
      warnings.push('Using assumed attackers - return fire not evaluated (attacker position unknown)');
    } else {
      const attackerHexes = [...new Set(attackerCombat.map((u) => u.h3Index))];
      const whoCan: string[] = [];
      for (const u of defenderCombat) {
        const r = getRange(u.unitType);
        if (r < 1) continue;
        const inRange = attackerHexes.some((h) => {
          try { return gridDistance(targetHexH3, h) <= r; } catch { return false; }
        });
        if (inRange) {
          canReturnFire = true;
          defenderReturnFireProbs.push(getAttack(u.unitType) / 6);
          try {
            const dist = attackerHexes.length ? gridDistance(targetHexH3, attackerHexes[0]!) : 0;
            whoCan.push(`${u.id} (${u.unitType}, range ${r}) can return fire - attacker at distance ${dist}, within range`);
          } catch {
            whoCan.push(`${u.id} (${u.unitType}, range ${r}) can return fire`);
          }
        }
      }
      returnFireDetails = whoCan.length > 0 ? whoCan.join('; ') : null;
    }
  }

  const attackerHitProbs = attackerCombat.map((u) => getAttack(u.unitType) / 6);
  const defenderHitProbs = engagementType === 'ranged'
    ? defenderReturnFireProbs
    : defenderCombat.map((u) => getDefense(u.unitType) / 6);

  const atkPMF = poissonBinomialPMF(attackerHitProbs);
  const defPMF = poissonBinomialPMF(defenderHitProbs);
  const defenderCount = defenderCombat.length;
  const attackerCount = attackerCombat.length;

  logTrace('tool3CombatEstimation: exact PMF computed', {
    engagementType, attackerCount, defenderCount,
    attackerHitProbCount: attackerHitProbs.length,
    defenderHitProbCount: defenderHitProbs.length,
  });

  let defenderLossesExpected = 0;
  let probabilityDefenderEliminated = 0;
  for (let k = 0; k < atkPMF.length; k++) {
    defenderLossesExpected += Math.min(k, defenderCount) * atkPMF[k]!;
    if (k >= defenderCount) probabilityDefenderEliminated += atkPMF[k]!;
  }

  let attackerLossesExpected = 0;
  let probabilityAttackerLosesUnit = 0;
  for (let k = 0; k < defPMF.length; k++) {
    attackerLossesExpected += Math.min(k, attackerCount) * defPMF[k]!;
    if (k >= 1) probabilityAttackerLosesUnit += defPMF[k]!;
  }

  const attackerHitsExpected = defenderLossesExpected;
  const defenderHitsExpected = attackerLossesExpected;
  const assessment = getAssessmentCategory(probabilityDefenderEliminated, probabilityAttackerLosesUnit);

  const hitPct = attackerCount > 0
    ? Math.round((getAttack(attackerCombat[0]!.unitType) / 6) * 100)
    : 0;
  const returnFrag = canReturnFire && returnFireDetails
    ? ` ${returnFireDetails}.`
    : '';
  const expectedFrag = `Expected outcome: ${attackerLossesExpected.toFixed(2)} attacker losses, ${defenderLossesExpected.toFixed(2)} defender losses.`;
  const reasoning = defenderCombat.length > 0
    ? `${attackerCombat[0]?.unitType ?? 'attacker'} attacks at value ${attackerCount > 0 ? getAttack(attackerCombat[0]!.unitType) : 0} (${hitPct}% hit chance).${returnFrag} ${expectedFrag}`
    : expectedFrag;

  const targetLatLng = h3ToLatLng(targetHexH3, latLngByH3);
  return {
    status: 'ok',
    error: null,
    engagementType,
    targetHex: targetLatLng,
    attackerSummary: { units: attackerSummaryUnits, totalUnits: attackerCombat.length },
    defenderSummary: {
      units: defenderSummaryUnits,
      totalUnits: defenderCombat.length,
      canReturnFire,
      returnFireDetails,
    },
    prediction: {
      attackerHitsExpected,
      defenderHitsExpected,
      attackerLossesExpected,
      defenderLossesExpected,
      probabilityDefenderEliminated,
      probabilityAttackerLosesUnit,
      assessment,
      reasoning,
    },
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * Dispatcher for Tool 3 (Combat Outcome Estimation). Given tool name and parsed arguments, runs estimate_combat
 * and returns a JSON-serializable response. Use from the OpenRouter tool-calling loop when the model requests estimate_combat.
 * Every response has status ("ok" or "error") and error (null when ok). Throws are caught and returned as status "error".
 */
export function executeTool3(
  toolName: string,
  args: unknown,
  state: GameStateSnapshot,
  latLngByH3: LatLngMap,
  resolveToH3: (lat: number, lng: number) => string | undefined
): { status: string; error: string | null; [k: string]: unknown } {
  logDebug('tool3CombatEstimation executeTool3', { toolName, stateTurn: state.turnNumber });
  if (toolName !== 'estimate_combat') {
    return { status: 'error', error: `Unknown tool: ${toolName}` };
  }
  try {
    return executeEstimateCombat(args, state, latLngByH3, resolveToH3);
  } catch (err) {
    logError('tool3CombatEstimation executeTool3', err);
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}
