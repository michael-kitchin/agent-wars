/**
 * Pre-computation pipeline for Milestone 0.6: runs assess_unit, assess_hex, and estimate_combat
 * before the LLM is invoked, so the briefing can inject results into the prompt. Used when
 * usePrecomputation is true to validate the hybrid AI architecture (fewer ad-hoc tool calls,
 * lower latency/cost). Pre-computation calls the same tool executors as the LLM loop; it does
 * not duplicate tool logic.
 */

import type { GameStateSnapshot } from './gameDb';
import { executeTool2 } from './tools/tool2Assessment';
import { executeTool3 } from './tools/tool3CombatEstimation';
import { getRange } from './combatConstants';
import { gridDistance } from 'h3-js';
import { getMovementBudgetForUnit } from './pathfinding';
import { logDebug, logError } from './logger';

/** Coordinate map built from buildLatLngCoordinateMap; pre-computation uses the same map as requestOrders. */
export interface PrecomputationCoordMap {
  latLngByH3: Map<string, [number, number]>;
  resolveToH3: (lat: number, lng: number) => string | undefined;
}

/** One successful assess_unit result: unit id plus the ok response from executeTool2. */
export interface UnitAssessmentResult {
  unitId: string;
  result: {
    status: 'ok';
    unit: { unitId: string; type: string; position: [number, number]; currentStandingOrder: unknown };
    nearbyEnemies: Array<{
      unitId: string;
      hexDistance: number;
      inRangedRange: boolean;
      inMeleeRange: boolean;
      confidence?: string;
      lastSeen?: number;
    }>;
    threats: Array<{ description: string; severity: string; sourceUnit: string }>;
    canAttackThisTurn: unknown[];
    [k: string]: unknown;
  };
}

/**
 * Runs assess_unit for every AI unit and returns successful results in stable order (by unitId).
 * Uses the same executeTool2 as the LLM tool loop. Call from the pre-computation orchestrator
 * or when only unit assessments are needed.
 */
export function runUnitAssessments(
  state: GameStateSnapshot,
  coordMap: PrecomputationCoordMap
): UnitAssessmentResult[] {
  logDebug('precomputation runUnitAssessments', {
    turnNumber: state.turnNumber,
    aiUnitCount: state.units.filter((u) => u.player === 'opponent').length,
  });
  const { latLngByH3, resolveToH3 } = coordMap;
  const opponentUnits = state.units
    .filter((u) => u.player === 'opponent')
    .sort((a, b) => a.id.localeCompare(b.id));
  const results: UnitAssessmentResult[] = [];
  for (const unit of opponentUnits) {
    const out = executeTool2(
      'assess_unit',
      { unitId: unit.id, radius: 4 },
      state,
      latLngByH3,
      resolveToH3
    );
    if (out.status === 'ok' && out.unit && out.nearbyEnemies !== undefined) {
      results.push({
        unitId: unit.id,
        result: out as unknown as UnitAssessmentResult['result'],
      });
    } else {
      if (out.status === 'error') {
        logError('precomputation runUnitAssessments: assess_unit error', {
          unitId: unit.id,
          error: out.error,
        });
      }
    }
  }
  logDebug('precomputation runUnitAssessments complete', {
    requested: opponentUnits.length,
    successful: results.length,
  });
  return results;
}

/** One pre-computed combat estimate (estimate_combat ok response summarized). */
export interface CombatEstimateEntry {
  aiUnitId: string;
  enemyUnitId: string;
  targetHex: [number, number];
  assessment: string;
  probabilityDefenderEliminated: number;
  probabilityAttackerLosesUnit: number;
  note: string;
}

const DEFAULT_MAX_COMBAT_ESTIMATES = 15;

/**
 * Builds likely (AI unit, human unit) pairs that are in combat range this turn, sorted by distance (closest first),
 * then runs estimate_combat for each up to the cap. Returns only successful results.
 */
function runCombatEstimates(
  state: GameStateSnapshot,
  coordMap: PrecomputationCoordMap,
  maxEstimates: number
): CombatEstimateEntry[] {
  logDebug('precomputation runCombatEstimates', { turnNumber: state.turnNumber, maxEstimates });
  const { latLngByH3, resolveToH3 } = coordMap;
  const opponentUnits = state.units.filter((u) => u.player === 'opponent');
  const humanUnits = state.units.filter((u) => u.player === 'human');
  const pairs: Array<{
    ai: (typeof state.units)[0];
    human: (typeof state.units)[0];
    distance: number;
    engagementType: 'ranged' | 'melee';
  }> = [];
  for (const ai of opponentUnits) {
    const aiRange = getRange(ai.unitType as 'infantry' | 'armor' | 'naval');
    const moveBudget = getMovementBudgetForUnit(ai.unitType);
    for (const human of humanUnits) {
      try {
        const d = gridDistance(ai.h3Index, human.h3Index);
        // Current-position ranged attack candidates.
        if (d <= aiRange && d !== 0) {
          pairs.push({ ai, human, distance: d, engagementType: 'ranged' });
          continue;
        }
        // Melee now (same hex).
        if (d === 0) {
          pairs.push({ ai, human, distance: d, engagementType: 'melee' });
          continue;
        }
        // Melee after move (can reach the enemy hex this turn, but not shoot this turn).
        if (d <= moveBudget && d > aiRange) {
          pairs.push({ ai, human, distance: d, engagementType: 'melee' });
        }
      } catch {
        // skip invalid pair
      }
    }
  }
  pairs.sort((a, b) => a.distance - b.distance);

  const results: CombatEstimateEntry[] = [];
  for (let i = 0; i < Math.min(pairs.length, maxEstimates); i++) {
    const { ai, human, engagementType } = pairs[i]!;
    const targetLatLng = latLngByH3.get(human.h3Index);
    if (!targetLatLng) continue;
    const out = executeTool3(
      'estimate_combat',
      {
        engagementType,
        attackers: { units: [ai.id] },
        targetHex: targetLatLng,
        defenders: { units: [human.id] },
      },
      state,
      latLngByH3,
      resolveToH3
    );
    if (out.status === 'ok' && out.prediction) {
      const p = out.prediction as {
        assessment?: string;
        probabilityDefenderEliminated?: number;
        probabilityAttackerLosesUnit?: number;
        reasoning?: string;
      };
      const defSummary = out.defenderSummary as { returnFireDetails?: string } | undefined;
      results.push({
        aiUnitId: ai.id,
        enemyUnitId: human.id,
        targetHex: targetLatLng,
        assessment: p.assessment ?? 'even',
        probabilityDefenderEliminated: p.probabilityDefenderEliminated ?? 0,
        probabilityAttackerLosesUnit: p.probabilityAttackerLosesUnit ?? 0,
        note: p.reasoning ?? defSummary?.returnFireDetails ?? '',
      });
    }
  }

  logDebug('precomputation runCombatEstimates complete', {
    pairsConsidered: pairs.length,
    returned: results.length,
  });
  return results;
}

/** One successful assess_hex result, keyed by hex position for the briefing. */
export interface HexAssessmentEntry {
  position: [number, number];
  result: Record<string, unknown>;
}

/**
 * Runs assess_hex for every hex that contains at least one human unit (one call per such hex).
 * Returns only successful results. Option skipHexAssessments skips this step entirely.
 */
function runHexAssessments(
  state: GameStateSnapshot,
  coordMap: PrecomputationCoordMap
): HexAssessmentEntry[] {
  logDebug('precomputation runHexAssessments', { turnNumber: state.turnNumber });
  const { latLngByH3, resolveToH3 } = coordMap;
  const humanUnits = state.units.filter((u) => u.player === 'human');
  const hexesWithHuman = [...new Set(humanUnits.map((u) => u.h3Index))];
  const results: HexAssessmentEntry[] = [];
  for (const h3 of hexesWithHuman) {
    const position = latLngByH3.get(h3);
    if (!position) continue;
    const out = executeTool2(
      'assess_hex',
      { position },
      state,
      latLngByH3,
      resolveToH3
    );
    if (out.status === 'ok') {
      results.push({ position, result: out as Record<string, unknown> });
    } else {
      logError('precomputation runHexAssessments: assess_hex error', { h3, error: out.error });
    }
  }
  logDebug('precomputation runHexAssessments complete', {
    hexesWithHuman: hexesWithHuman.length,
    successful: results.length,
  });
  return results;
}

export interface PrecomputationResult {
  unitAssessments: UnitAssessmentResult[];
  combatEstimates: CombatEstimateEntry[];
  hexAssessments: HexAssessmentEntry[];
}

export interface RunPrecomputationOptions {
  /** When true, skip assess_hex for enemy-occupied hexes (default false). */
  skipHexAssessments?: boolean;
  /** Max number of estimate_combat calls (default 15). */
  maxCombatEstimates?: number;
}

/**
 * Orchestrates full pre-computation: unit assessments, combat estimates (capped), and hex assessments.
 * Returns a single object for use by the briefing formatter. Logs total time at debug.
 */
export function runPrecomputation(
  state: GameStateSnapshot,
  coordMap: PrecomputationCoordMap,
  options?: RunPrecomputationOptions
): PrecomputationResult {
  const start = Date.now();
  logDebug('precomputation runPrecomputation start', { turnNumber: state.turnNumber });
  const unitAssessments = runUnitAssessments(state, coordMap);
  const maxCombat = options?.maxCombatEstimates ?? DEFAULT_MAX_COMBAT_ESTIMATES;
  const combatEstimates = runCombatEstimates(state, coordMap, maxCombat);
  const hexAssessments =
    options?.skipHexAssessments === true ? [] : runHexAssessments(state, coordMap);
  const elapsed = Date.now() - start;
  logDebug('precomputation runPrecomputation complete', {
    elapsedMs: elapsed,
    unitAssessments: unitAssessments.length,
    combatEstimates: combatEstimates.length,
    hexAssessments: hexAssessments.length,
  });
  return { unitAssessments, combatEstimates, hexAssessments };
}
