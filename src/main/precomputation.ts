/**
 * Pre-computation pipeline for Milestone 0.6: runs assess_unit and assess_hex before the LLM is invoked,
 * so the briefing can inject results into the prompt. Used when usePrecomputation is true to validate the
 * hybrid AI architecture (fewer ad-hoc tool calls, lower latency/cost). Pre-computation calls the same tool
 * executors as the LLM loop; it does not duplicate tool logic. Combat estimates were removed in favor of
 * the structured "Possible unit actions" briefing section.
 */

import type { GameStateSnapshot } from './gameDb';
import { executeTool2 } from './tools/tool2Assessment';
import { usesOmniscientGridProximity } from './tools/assessUnitProximity';
import { logDebug, logError } from './logger';

/**
 * Documents the `PrecomputationCoordMap` interface as a named contract surface (export interface PrecomputationCoordMap).

 * Purpose: Supports maintainability by documenting why `PrecomputationCoordMap` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface PrecomputationCoordMap {
    /**
   * Specifies the contract for the `latLngByH3` member (latLngByH3: Map<string, [number, number]>;).

   * Contract: Describes stable behavior for callers of `latLngByH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
latLngByH3: Map<string, [number, number]>;
    /**
   * Specifies the contract for the `resolveToH3` member (resolveToH3: (lat: number, lng: number) => string | undefined;).

   * Contract: Describes stable behavior for callers of `resolveToH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
resolveToH3: (lat: number, lng: number) => string | undefined;
}

/**
 * Documents the `UnitAssessmentResult` interface as a named contract surface (export interface UnitAssessmentResult).

 * Purpose: Supports maintainability by documenting why `UnitAssessmentResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface UnitAssessmentResult {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `result` member (result: { status: 'ok'; unit: { unitId: string; type: string; position: [number, number]; currentStandingOrder: unknown }; nearbyEnemies: Array<{).

   * Contract: Describes stable behavior for callers of `result` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
result: {
    status: 'ok';
    unit: { unitId: string; type: string; position: [number, number]; currentStandingOrder: unknown };
    nearbyEnemies: Array<{
      unitId: string;
      hexDistance: number;
      estimatedTurnsToReach?: number | null;
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
 * Runs assess_unit for every opponent unit and collects successful payloads.
 *
 * Purpose: Feeds Unit Status / Attention Flags. When fog is off on res1, each call uses grid hops for all other units.
 * When to use: Strategic precomputation before formatBriefing.
 * Expected outcome: One result per opponent unit whose assess_unit returned ok with nearbyEnemies.
 * Exceptions: Failed assessments are logged and omitted.
 */
export function runUnitAssessments(
  state: GameStateSnapshot,
  coordMap: PrecomputationCoordMap
): UnitAssessmentResult[] {
  const { latLngByH3, resolveToH3 } = coordMap;
  const opponentUnits = state.units
    .filter((u) => u.player === 'opponent')
    .sort((a, b) => a.id.localeCompare(b.id));
  const representativeH3 = state.hexes[0]?.h3Index ?? opponentUnits[0]?.h3Index ?? '';
  logDebug('precomputation runUnitAssessments', {
    turnNumber: state.turnNumber,
    aiUnitCount: opponentUnits.length,
    omniscientGridProximity: usesOmniscientGridProximity({
      fogOfWarEnabled: state.fogOfWarEnabled,
      h3Index: representativeH3,
    }),
  });
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

/**
 * Documents the `HexAssessmentEntry` interface as a named contract surface (export interface HexAssessmentEntry).

 * Purpose: Supports maintainability by documenting why `HexAssessmentEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface HexAssessmentEntry {
    /**
   * Specifies the contract for the `position` member (position: [number, number];).

   * Contract: Describes stable behavior for callers of `position` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
position: [number, number];
    /**
   * Specifies the contract for the `result` member (result: Record<string, unknown>;).

   * Contract: Describes stable behavior for callers of `result` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
result: Record<string, unknown>;
}

/**
 * Defines the `runHexAssessments` function shape (function runHexAssessments().

 * Purpose: Supports maintainability by documenting why `runHexAssessments` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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

/**
 * Documents the `PrecomputationResult` interface as a named contract surface (export interface PrecomputationResult).

 * Purpose: Supports maintainability by documenting why `PrecomputationResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface PrecomputationResult {
    /**
   * Specifies the contract for the `unitAssessments` member (unitAssessments: UnitAssessmentResult[];).

   * Contract: Describes stable behavior for callers of `unitAssessments` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitAssessments: UnitAssessmentResult[];
    /**
   * Specifies the contract for the `hexAssessments` member (hexAssessments: HexAssessmentEntry[];).

   * Contract: Describes stable behavior for callers of `hexAssessments` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexAssessments: HexAssessmentEntry[];
}

/**
 * Documents the `RunPrecomputationOptions` interface as a named contract surface (export interface RunPrecomputationOptions).

 * Purpose: Supports maintainability by documenting why `RunPrecomputationOptions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface RunPrecomputationOptions {
    /**
   * Specifies the contract for the `skipHexAssessments` member (skipHexAssessments?: boolean;).

   * Contract: Describes stable behavior for callers of `skipHexAssessments` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
skipHexAssessments?: boolean;
}

/**
 * Defines the `runPrecomputation` function shape (export function runPrecomputation( state: GameStateSnapshot, coordMap: PrecomputationCoordMap, options?: RunPrecomputationOptions ): PrecomputationRes).

 * Purpose: Supports maintainability by documenting why `runPrecomputation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function runPrecomputation(
  state: GameStateSnapshot,
  coordMap: PrecomputationCoordMap,
  options?: RunPrecomputationOptions
): PrecomputationResult {
  const start = Date.now();
  logDebug('precomputation runPrecomputation start', { turnNumber: state.turnNumber });
  const unitAssessments = runUnitAssessments(state, coordMap);
  const hexAssessments =
    options?.skipHexAssessments === true ? [] : runHexAssessments(state, coordMap);
  const elapsed = Date.now() - start;
  logDebug('precomputation runPrecomputation complete', {
    elapsedMs: elapsed,
    unitAssessments: unitAssessments.length,
    hexAssessments: hexAssessments.length,
  });
  return { unitAssessments, hexAssessments };
}
