/**
 * Pre-computation pipeline for Milestone 0.6: runs assess_unit and assess_hex before the LLM is invoked,
 * so the briefing can inject results into the prompt. Used when usePrecomputation is true to validate the
 * hybrid AI architecture (fewer ad-hoc tool calls, lower latency/cost). Pre-computation calls the same tool
 * executors as the LLM loop; it does not duplicate tool logic. Combat estimates were removed in favor of
 * the structured "Possible unit actions" briefing section.
 */

import { isDbReady, type GameStateSnapshot } from './gameDb';
import { isEmbarkedLandUnit } from './gameActions/sealift';
import { executeAssessment } from './tools/assessment';
import { usesOmniscientGridProximity } from './tools/assessUnitProximity';
import { getStandingOrderForUnit } from './tools/standingOrders';
import { logDebug, logError, logTrace } from './logger';

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
 * Documents the module-scope binding `PRECOMPUTE_ASSESS_UNIT_RADIUS` (PRECOMPUTE_ASSESS_UNIT_RADIUS).
 *
 * Purpose: Matches the briefing assess_unit radius so cache keys and tool calls stay aligned.
 * When to use: `runUnitAssessments` tool args and same-hex cache keys.
 * Expected outcome: Every precomputed unit uses radius 4.
 * Exceptions: None.
 */
const PRECOMPUTE_ASSESS_UNIT_RADIUS = 4;

/**
 * Nearby-friendly payload cloned when reusing a stacked unit's assess_unit result.
 *
 * Purpose: Stack mates share enemy/threat geometry but each row must exclude itself from friendlies.
 * When to use: `cloneAssessmentForStackedUnit` only.
 * Expected outcome: Same fields assess_unit emits for co-located friendlies.
 * Exceptions: None.
 */
interface NearbyFriendlyClone {
  /**
   * Specifies the contract for the `unitId` member (unitId: string;).
   *
   * Contract: Id of a co-located or nearby friendly, never the unit this row is for.
   * When to use: Briefing/tool payloads that list nearby friendlies.
   * Expected outcome: Matches `assess_unit` nearbyFriendlies.unitId.
   * Exceptions: None.
   */
  unitId: string;
  /**
   * Specifies the contract for the `type` member (type: string;).
   *
   * Contract: Unit type of that friendly.
   * When to use: Clone of assess_unit nearbyFriendlies.
   * Expected outcome: Same string as the donor unit's type when hexDistance is 0.
   * Exceptions: None.
   */
  type: string;
  /**
   * Specifies the contract for the `position` member (position: [number, number];).
   *
   * Contract: Lat/lng of the friendly's hex center.
   * When to use: Clone of assess_unit nearbyFriendlies.
   * Expected outcome: Same tuple as the cached assessment's unit.position for the donor.
   * Exceptions: None.
   */
  position: [number, number];
  /**
   * Specifies the contract for the `hexDistance` member (hexDistance: number;).
   *
   * Contract: Path or grid hops from the assessed unit to this friendly.
   * When to use: Clone of assess_unit nearbyFriendlies.
   * Expected outcome: 0 when the friendly shares the assessed unit's hex.
   * Exceptions: None.
   */
  hexDistance: number;
  /**
   * Specifies the contract for the `estimatedTurnsToReach` member (estimatedTurnsToReach: number | null;).
   *
   * Contract: Turns for that friendly to reach the assessed unit.
   * When to use: Clone of assess_unit nearbyFriendlies.
   * Expected outcome: 0 for a co-located donor; null when path distance was unavailable.
   * Exceptions: None.
   */
  estimatedTurnsToReach: number | null;
}

/**
 * True when the unit has a sealift assignment, without throwing when tests run with no DB.
 *
 * Purpose: Assessment cache must not mix embarked cargo with an independent stack mate of the same type.
 * When to use: `unitAssessmentStackKey` only.
 * Expected outcome: False when the database is closed; otherwise `isEmbarkedLandUnit`.
 * Exceptions: None.
 */
function unitIsEmbarkedForAssessmentCache(unitId: string): boolean {
  logTrace('precomputation unitIsEmbarkedForAssessmentCache', { unitId });
  if (!isDbReady()) return false;
  return isEmbarkedLandUnit(unitId);
}

/**
 * Cache key for assess_unit results that share nearby-enemy geometry.
 *
 * Purpose: Same hex, type, player, radius, and embark state see the same enemies and threats; only unit id and standing order differ.
 * When to use: `runUnitAssessments` before calling executeAssessment.
 * Expected outcome: Distinct types or embark states on the same hex do not share a key.
 * Exceptions: None.
 */
function unitAssessmentStackKey(unit: {
  id: string;
  h3Index: string;
  unitType: string;
  player: string;
}): string {
  logTrace('precomputation unitAssessmentStackKey', {
    unitId: unit.id,
    h3Index: unit.h3Index,
    unitType: unit.unitType,
    player: unit.player,
  });
  const embarked = unitIsEmbarkedForAssessmentCache(unit.id) ? '1' : '0';
  return `${unit.h3Index}|${unit.unitType}|${unit.player}|r${PRECOMPUTE_ASSESS_UNIT_RADIUS}|emb:${embarked}`;
}

/**
 * Rewrites a cached assess_unit payload for another unit stacked on the same hex.
 *
 * Purpose: Avoid repeating path BFS for 20 armor on one city while still emitting one briefing row per unit id.
 * When to use: Cache hit in `runUnitAssessments`.
 * Expected outcome: Cloned nearbyEnemies/threats; standing order and unit id belong to the stacked unit; donor appears as a distance-0 friendly.
 * Exceptions: None.
 */
function cloneAssessmentForStackedUnit(
  cached: UnitAssessmentResult,
  unit: { id: string; player: string }
): UnitAssessmentResult['result'] {
  logTrace('precomputation cloneAssessmentForStackedUnit', {
    cachedUnitId: cached.unitId,
    unitId: unit.id,
  });
  const cachedFriendlies = Array.isArray(cached.result.nearbyFriendlies)
    ? (cached.result.nearbyFriendlies as NearbyFriendlyClone[])
    : [];
  const unitPosition: [number, number] = [...cached.result.unit.position];
  const donorAsFriendly: NearbyFriendlyClone = {
    unitId: cached.unitId,
    type: cached.result.unit.type,
    position: [...cached.result.unit.position],
    hexDistance: 0,
    estimatedTurnsToReach: 0,
  };
  const nearbyFriendlies = [
    ...cachedFriendlies
      .filter((friendly) => friendly.unitId !== unit.id)
      .map((friendly) => ({
        ...friendly,
        position: [...friendly.position] as [number, number],
      })),
    donorAsFriendly,
  ].sort((a, b) => a.hexDistance - b.hexDistance);
  const canAttackThisTurn = Array.isArray(cached.result.canAttackThisTurn)
    ? cached.result.canAttackThisTurn.map((entry) =>
        entry && typeof entry === 'object' ? { ...entry } : entry
      )
    : cached.result.canAttackThisTurn;
  return {
    ...cached.result,
    unit: {
      ...cached.result.unit,
      unitId: unit.id,
      position: unitPosition,
      currentStandingOrder: getStandingOrderForUnit(unit.player, unit.id),
    },
    nearbyEnemies: cached.result.nearbyEnemies.map((enemy) => ({ ...enemy })),
    threats: cached.result.threats.map((threat) => ({ ...threat })),
    canAttackThisTurn,
    nearbyFriendlies,
  };
}

/**
 * Runs assess_unit for every opponent unit and collects successful payloads.
 *
 * Purpose: Feeds Unit Status / Attention Flags. When fog is off on res1, each call uses grid hops for all other units.
 * When to use: Strategic precomputation before formatBriefing.
 * Expected outcome: One result per opponent unit whose assess_unit returned ok with nearbyEnemies. Same-hex same-type stacks reuse one scan.
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
  const assessmentByStackKey = new Map<string, UnitAssessmentResult>();
  let uniqueAssessments = 0;
  let reusedAssessments = 0;
  for (const unit of opponentUnits) {
    const stackKey = unitAssessmentStackKey(unit);
    const cached = assessmentByStackKey.get(stackKey);
    if (cached) {
      reusedAssessments += 1;
      results.push({
        unitId: unit.id,
        result: cloneAssessmentForStackedUnit(cached, unit),
      });
      continue;
    }
    const out = executeAssessment(
      'assess_unit',
      { unitId: unit.id, radius: PRECOMPUTE_ASSESS_UNIT_RADIUS },
      state,
      latLngByH3,
      resolveToH3
    );
    if (out.status === 'ok' && out.unit && out.nearbyEnemies !== undefined) {
      const entry: UnitAssessmentResult = {
        unitId: unit.id,
        result: out as unknown as UnitAssessmentResult['result'],
      };
      assessmentByStackKey.set(stackKey, entry);
      uniqueAssessments += 1;
      results.push(entry);
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
    uniqueAssessments,
    reusedAssessments,
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
    const out = executeAssessment(
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
