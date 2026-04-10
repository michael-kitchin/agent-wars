/**
 * MCP Tool 2: Threat and Situation Assessment (assess_unit, assess_hex).
 * Implements the tool API per the MCP tools spec; uses pathfinding, combat constants, and game state.
 * All hex positions in tool responses are returned as [lat, lng]; H3 indices are never exposed.
 */

import { cellToLatLng, gridDistance, gridDisk } from 'h3-js';
import type { GameStateSnapshot } from '../gameDb';
import { getDistanceAndTurns, getMovementBudgetForUnit, terrainIsPassableForDomain } from '../pathfinding';
import type { PassableDomain } from '../pathfinding';
import { passabilityAllowsLandUnit, passabilityAllowsNavalUnit } from '../../shared/pipelineTerrain';
import { getRange } from '../combatConstants';
import { getStandingOrderForUnit } from './tool5StandingOrders';
import { logDebug, logError, logTrace } from '../logger';

/**
 * Documents the `LatLng` type alias (export type LatLng).

 * Purpose: Supports maintainability by documenting why `LatLng` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type LatLng = [number, number];

/**
 * Documents the `LatLngMap` type alias (type LatLngMap).

 * Purpose: Supports maintainability by documenting why `LatLngMap` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type LatLngMap = Map<string, LatLng>;

/**
 * Documents the `EnemyIntelEntry` interface as a named contract surface (interface EnemyIntelEntry).

 * Purpose: Supports maintainability by documenting why `EnemyIntelEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface EnemyIntelEntry {
    /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitId: string;
    /**
   * Specifies the contract for the `lastKnownH3Index` member (lastKnownH3Index: string;).

   * Contract: Describes stable behavior for callers of `lastKnownH3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
lastKnownH3Index: string;
    /**
   * Specifies the contract for the `intelState` member (intelState: 'current' | 'stale';).

   * Contract: Describes stable behavior for callers of `intelState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
intelState: 'current' | 'stale';
    /**
   * Specifies the contract for the `lastSeenTurn` member (lastSeenTurn: number;).

   * Contract: Describes stable behavior for callers of `lastSeenTurn` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
lastSeenTurn: number;
}

/**
 * Defines the `getEnemyIntelForPlayer` function shape (function getEnemyIntelForPlayer(state: GameStateSnapshot): EnemyIntelEntry[]).

 * Purpose: Supports maintainability by documenting why `getEnemyIntelForPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getEnemyIntelForPlayer(state: GameStateSnapshot): EnemyIntelEntry[] {
  const rows = Array.isArray(state.enemyIntel) ? state.enemyIntel : [];
  return rows
    .map((r) => ({
      unitId: r.unitId,
      lastKnownH3Index: r.lastKnownH3Index,
      intelState: r.intelState,
      lastSeenTurn: r.lastSeenTurn,
    }))
    .filter((r) => r.intelState === 'stale');
}

/**
 * Defines the `shouldIncludeStaleEnemyIntel` function shape (function shouldIncludeStaleEnemyIntel(state: GameStateSnapshot): boolean).

 * Purpose: Supports maintainability by documenting why `shouldIncludeStaleEnemyIntel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function shouldIncludeStaleEnemyIntel(state: GameStateSnapshot): boolean {
  return state.playerPerspective !== 'opponent';
}

/**
 * Defines the `h3ToLatLng` function shape (function h3ToLatLng(h3: string, latLngByH3: LatLngMap): LatLng).

 * Purpose: Supports maintainability by documenting why `h3ToLatLng` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function h3ToLatLng(h3: string, latLngByH3: LatLngMap): LatLng {
  const ll = latLngByH3.get(h3);
  if (ll) return ll;
  const [lat, lng] = cellToLatLng(h3);
  return [lat, lng];
}

/**
 * Defines the `getPathDistanceAndTurns` function shape (function getPathDistanceAndTurns( originH3: string, destH3: string, unitType: string, hexSet: Set<string>, terrainByH3: Map<string, string>, b).

 * Purpose: Supports maintainability by documenting why `getPathDistanceAndTurns` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getPathDistanceAndTurns(
  originH3: string,
  destH3: string,
  unitType: string,
  hexSet: Set<string>,
  terrainByH3: Map<string, string>,
  blocked?: Set<string>
): { hexDistance: number; estimatedTurns: number } | null {
  logTrace('tool2Assessment getPathDistanceAndTurns', { unitType });
  const passableFor: PassableDomain = unitType === 'naval' ? 'water' : 'land';
  const movementBudget = getMovementBudgetForUnit(unitType);
  return getDistanceAndTurns(originH3, destH3, hexSet, terrainByH3, passableFor, movementBudget, blocked);
}

/**
 * Defines the `getGridDistance` function shape (function getGridDistance(h3A: string, h3B: string): number).

 * Purpose: Supports maintainability by documenting why `getGridDistance` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getGridDistance(h3A: string, h3B: string): number {
  logTrace('tool2Assessment getGridDistance');
  return gridDistance(h3A, h3B);
}

/**
 * Documents the module-scope binding `TOOL2_NAMES` (TOOL2_NAMES).

 * Purpose: Supports maintainability by documenting why `TOOL2_NAMES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const TOOL2_NAMES = ['assess_unit', 'assess_hex'] as const;

/**
 * Defines the `executeTool2` function shape (export function executeTool2( toolName: string, args: unknown, state: GameStateSnapshot, latLngByH3: LatLngMap, resolveToH3: (lat: number, lng: n).

 * Purpose: Supports maintainability by documenting why `executeTool2` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function executeTool2(
  toolName: string,
  args: unknown,
  state: GameStateSnapshot,
  latLngByH3: LatLngMap,
  resolveToH3: (lat: number, lng: number) => string | undefined
): { status: string; error: string | null; [k: string]: unknown } {
  logDebug('tool2Assessment executeTool2', { toolName, stateTurn: state.turnNumber });
  if (toolName !== 'assess_unit' && toolName !== 'assess_hex') {
    return { status: 'error', error: `Unknown tool: ${toolName}` };
  }
  try {
    if (toolName === 'assess_unit') {
      const a = args as { unitId?: unknown; radius?: unknown };
      const unitId = typeof a?.unitId === 'string' ? a.unitId : undefined;
      if (!unitId) {
        return { status: 'error', error: 'assess_unit requires unitId (string)' };
      }
      let radius = 4;
      if (typeof a?.radius === 'number' && a.radius > 0 && Number.isFinite(a.radius)) {
        radius = Math.floor(a.radius);
      }
      return executeAssessUnit(unitId, radius, state, latLngByH3, resolveToH3);
    }
    if (toolName === 'assess_hex') {
      const a = args as { position?: unknown; forUnitType?: unknown };
      const posArr = Array.isArray(a?.position) && a.position.length >= 2 && a.position.every((n: unknown) => typeof n === 'number')
        ? [Number((a.position as number[])[0]), Number((a.position as number[])[1])]
        : undefined;
      if (!posArr) {
        return { status: 'error', error: 'assess_hex requires position as [lat, lng]' };
      }
      const pos: LatLng = [posArr[0]!, posArr[1]!];
      const forUnitType = typeof a?.forUnitType === 'string' ? a.forUnitType : undefined;
      return executeAssessHex(pos, forUnitType, state, latLngByH3, resolveToH3);
    }
  } catch (err) {
    logError('tool2Assessment executeTool2: exception', toolName, err);
    return { status: 'error', error: String(err) };
  }
  return { status: 'error', error: `Unknown tool: ${toolName}` };
}

/**
 * Defines the `executeAssessUnit` function shape (function executeAssessUnit( unitId: string, radius: number, state: GameStateSnapshot, latLngByH3: LatLngMap, // eslint-disable-next-line @typescr).

 * Purpose: Supports maintainability by documenting why `executeAssessUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function executeAssessUnit(
  unitId: string,
  radius: number,
  state: GameStateSnapshot,
  latLngByH3: LatLngMap,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature aligned with assess_hex path
  _resolveToH3: (lat: number, lng: number) => string | undefined
): { status: string; error: string | null; [k: string]: unknown } {
  logDebug('tool2Assessment executeAssessUnit', { unitId, radius, stateTurn: state.turnNumber });
  const hexList = state.hexes.map((h) => h.h3Index);
  const hexSet = new Set(hexList);
  const terrainByH3 = new Map(state.hexes.map((h) => [h.h3Index, h.terrain]));
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) {
    logError('tool2Assessment executeAssessUnit: unit not found', unitId);
    return { status: 'error', error: `Unit not found: ${unitId}` };
  }
  if (!hexSet.has(unit.h3Index)) {
    logError('tool2Assessment executeAssessUnit: unit not on map', unitId);
    return { status: 'error', error: `Unit not found: ${unitId}` };
  }
  const movementBudget = getMovementBudgetForUnit(unit.unitType);
  const terrain = terrainByH3.get(unit.h3Index) ?? 'land';
  const unitPosition = h3ToLatLng(unit.h3Index, latLngByH3);

  const nearbyEnemies: Array<{
    unitId: string;
    type: string;
    position: LatLng;
    hexDistance: number;
    estimatedTurnsToReach: number | null;
    inRangedRange: boolean;
    inMeleeRange: boolean;
    inEnemyRangedRange: boolean;
    confidence: string;
    lastSeen: number;
  }> = [];
  const nearbyFriendlies: Array<{
    unitId: string;
    type: string;
    position: LatLng;
    hexDistance: number;
    estimatedTurnsToReach: number;
  }> = [];
  const threats: Array<{ description: string; severity: string; sourceUnit: string }> = [];
  const canAttackThisTurn: Array<{ unitId: string; attackType: string; reason: string }> = [];

  const myRange = getRange(unit.unitType);
  let preFilteredCount = 0;
  for (const other of state.units) {
    if (other.id === unitId) continue;
    const gridDist = (() => {
      try {
        return getGridDistance(unit.h3Index, other.h3Index);
      } catch {
        return 999;
      }
    })();
    // Grid distance is a lower bound on BFS path distance, so units beyond the
    // radius at grid level can't be within radius by path either. 999 means the
    // h3 gridDistance call failed (cross-pentagon), so we conservatively keep those.
    if (gridDist > radius && gridDist !== 999) { preFilteredCount++; continue; }
    const distResult = getPathDistanceAndTurns(unit.h3Index, other.h3Index, unit.unitType, hexSet, terrainByH3);
    const pathWithinRadius = distResult !== null && distResult.hexDistance <= radius;
    const gridWithinRadius = gridDist <= radius;
    if (!pathWithinRadius && !gridWithinRadius) continue;
    const hexDistance = distResult !== null ? distResult.hexDistance : gridDist;
    const isEnemy = other.player !== unit.player;
    const enemyRange = getRange(other.unitType);
    const inRangedRange = gridDist <= myRange;
    const inMeleeRange = gridDist === 0;
    const enemyCanShootMe = gridDist <= enemyRange;

    if (isEnemy) {
      const estimatedTurnsToReach = distResult !== null
        ? distResult.estimatedTurns
        : null;
      const enemyToMe = getPathDistanceAndTurns(other.h3Index, unit.h3Index, other.unitType, hexSet, terrainByH3);
      const enemyTurnsToReachMe: number | null = enemyToMe
        ? enemyToMe.estimatedTurns
        : (distResult !== null ? Math.ceil(hexDistance / getMovementBudgetForUnit(other.unitType)) : null);
      nearbyEnemies.push({
        unitId: other.id,
        type: other.unitType,
        position: h3ToLatLng(other.h3Index, latLngByH3),
        hexDistance,
        estimatedTurnsToReach,
        inRangedRange,
        inMeleeRange,
        inEnemyRangedRange: enemyCanShootMe,
        confidence: 'current',
        lastSeen: state.turnNumber,
      });
      let severity: string;
      if (enemyCanShootMe || inMeleeRange) {
        severity = 'critical';
      } else if (enemyTurnsToReachMe !== null && enemyTurnsToReachMe <= 2) {
        severity = 'moderate';
      } else {
        severity = 'low';
      }
      threats.push({
        description: enemyTurnsToReachMe !== null
          ? `${other.id} (${other.unitType}) can reach your hex in ${enemyTurnsToReachMe} turns`
          : `${other.id} (${other.unitType}) at grid distance ${gridDist} (no path; e.g. different domain)`,
        severity,
        sourceUnit: other.id,
      });
      if (gridDist <= myRange) {
        const attackType = gridDist === 0 ? 'melee' : 'ranged';
        canAttackThisTurn.push({ unitId: other.id, attackType, reason: '' });
      } else {
        canAttackThisTurn.push({
          unitId: other.id,
          attackType: 'none',
          reason: `Out of range (distance ${gridDist}, ${unit.unitType} range ${myRange})`,
        });
      }
    } else {
      if (!pathWithinRadius) continue;
      const friendlyTurns = getPathDistanceAndTurns(other.h3Index, unit.h3Index, other.unitType, hexSet, terrainByH3);
      const estimatedTurnsToReach = friendlyTurns ? friendlyTurns.estimatedTurns : Math.ceil(hexDistance / getMovementBudgetForUnit(other.unitType));
      nearbyFriendlies.push({
        unitId: other.id,
        type: other.unitType,
        position: h3ToLatLng(other.h3Index, latLngByH3),
        hexDistance,
        estimatedTurnsToReach,
      });
    }
  }

  if (shouldIncludeStaleEnemyIntel(state)) {
    const staleIntel = getEnemyIntelForPlayer(state);
    const currentEnemyIds = new Set(nearbyEnemies.map((e) => e.unitId));
    for (const intel of staleIntel) {
      if (currentEnemyIds.has(intel.unitId)) continue;
      if (!hexSet.has(intel.lastKnownH3Index)) continue;
      const gridDist = (() => {
        try {
          return getGridDistance(unit.h3Index, intel.lastKnownH3Index);
        } catch {
          return 999;
        }
      })();
      if (gridDist > radius && gridDist !== 999) continue;
      const distResult = getPathDistanceAndTurns(unit.h3Index, intel.lastKnownH3Index, unit.unitType, hexSet, terrainByH3);
      const pathWithinRadius = distResult !== null && distResult.hexDistance <= radius;
      const gridWithinRadius = gridDist <= radius;
      if (!pathWithinRadius && !gridWithinRadius) continue;
      const hexDistance = distResult !== null ? distResult.hexDistance : gridDist;
      nearbyEnemies.push({
        unitId: intel.unitId,
        type: 'unknown',
        position: h3ToLatLng(intel.lastKnownH3Index, latLngByH3),
        hexDistance,
        estimatedTurnsToReach: distResult !== null ? distResult.estimatedTurns : null,
        inRangedRange: gridDist <= myRange,
        inMeleeRange: gridDist === 0,
        inEnemyRangedRange: false,
        confidence: 'stale',
        lastSeen: intel.lastSeenTurn,
      });
    }
  } else {
    logTrace('tool2Assessment executeAssessUnit: omitting stale enemy intel for opponent perspective', { unitId });
  }

  nearbyEnemies.sort((a, b) => a.hexDistance - b.hexDistance);
  nearbyFriendlies.sort((a, b) => a.hexDistance - b.hexDistance);
  logTrace('tool2Assessment executeAssessUnit: scan complete', {
    unitId, totalOtherUnits: state.units.length - 1, preFiltered: preFilteredCount,
    enemies: nearbyEnemies.length, friendlies: nearbyFriendlies.length,
  });

  const currentStandingOrder = getStandingOrderForUnit(unit.player, unit.id);

  return {
    status: 'ok',
    error: null,
    unit: {
      unitId: unit.id,
      type: unit.unitType,
      position: unitPosition,
      terrain,
      movementBudget,
      currentStandingOrder,
    },
    nearbyEnemies,
    nearbyFriendlies,
    threats,
    canAttackThisTurn,
  };
}

/**
 * Defines the `executeAssessHex` function shape (function executeAssessHex( position: LatLng, forUnitType: string | undefined, state: GameStateSnapshot, latLngByH3: LatLngMap, resolveToH3: (lat:).

 * Purpose: Supports maintainability by documenting why `executeAssessHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function executeAssessHex(
  position: LatLng,
  forUnitType: string | undefined,
  state: GameStateSnapshot,
  latLngByH3: LatLngMap,
  resolveToH3: (lat: number, lng: number) => string | undefined
): { status: string; error: string | null; [k: string]: unknown } {
  logDebug('tool2Assessment executeAssessHex', { position: position.join(','), forUnitType, stateTurn: state.turnNumber });
  const hexList = state.hexes.map((h) => h.h3Index);
  const hexSet = new Set(hexList);
  const terrainByH3 = new Map(state.hexes.map((h) => [h.h3Index, h.terrain]));
  const hexH3 = resolveToH3(position[0], position[1]);
  if (!hexH3 || !hexSet.has(hexH3)) {
    logError('tool2Assessment executeAssessHex: invalid hex', position);
    return { status: 'error', error: 'Invalid hex position' };
  }
  const terrain = terrainByH3.get(hexH3) ?? 'land';
  const passableBy: string[] = [];
  if (passabilityAllowsLandUnit(terrain)) passableBy.push('infantry', 'armor');
  if (passabilityAllowsNavalUnit(terrain)) passableBy.push('naval');
  if (passableBy.length === 0) passableBy.push('none');
  const unitsAtHex = state.units
    .filter((u) => u.h3Index === hexH3)
    .map((u) => ({ unitId: u.id, type: u.unitType, position: h3ToLatLng(u.h3Index, latLngByH3) as LatLng }));

  const aiPlayerId = 'opponent';
  const enemies = state.units.filter((u) => u.player !== aiPlayerId);
  const rangedRange1: Array<{ unitId: string; type: string; position: LatLng; hexDistance: number; confidence: string; lastSeen: number }> = [];
  const rangedRange2: Array<{ unitId: string; type: string; position: LatLng; hexDistance: number; confidence: string; lastSeen: number }> = [];
  const meleeRange: Array<{ unitId: string; type: string; position: LatLng; hexDistance: number; confidence: string; lastSeen: number }> = [];
  for (const e of enemies) {
    try {
      const d = getGridDistance(e.h3Index, hexH3);
      const r = getRange(e.unitType);
      const entry = {
        unitId: e.id,
        type: e.unitType,
        position: h3ToLatLng(e.h3Index, latLngByH3) as LatLng,
        hexDistance: d,
        confidence: 'current' as const,
        lastSeen: state.turnNumber,
      };
      if (d === 0) meleeRange.push(entry);
      else if (d === 1 && r >= 1) rangedRange1.push(entry);
      else if (d === 2 && r >= 2) rangedRange2.push(entry);
    } catch {
      continue;
    }
  }
  if (shouldIncludeStaleEnemyIntel(state)) {
    for (const intel of getEnemyIntelForPlayer(state)) {
      if (!hexSet.has(intel.lastKnownH3Index)) continue;
      try {
        const d = getGridDistance(intel.lastKnownH3Index, hexH3);
        const entry = {
          unitId: intel.unitId,
          type: 'unknown',
          position: h3ToLatLng(intel.lastKnownH3Index, latLngByH3) as LatLng,
          hexDistance: d,
          confidence: 'stale' as const,
          lastSeen: intel.lastSeenTurn,
        };
        if (d === 0) meleeRange.push(entry);
        else if (d === 1) rangedRange1.push(entry);
        else if (d === 2) rangedRange2.push(entry);
      } catch {
        continue;
      }
    }
  } else {
    logTrace('tool2Assessment executeAssessHex: omitting stale enemy intel for opponent perspective', { hexH3 });
  }

  let adjacentLand = 0;
  let adjacentWater = 0;
  let passableNeighbors = 0;
  const passableFor: PassableDomain =
    forUnitType != null ? (forUnitType === 'naval' ? 'water' : 'land') : terrain === 'water' ? 'water' : 'land';
  try {
    const ring = gridDisk(hexH3, 1);
    for (let i = 1; i < ring.length; i++) {
      const n = ring[i]!;
      if (!hexSet.has(n)) continue;
      const t = terrainByH3.get(n) ?? 'land';
      if (t === 'land') adjacentLand++;
      else if (t === 'water') adjacentWater++;
      else if (t === 'coastal' || t === 'wetlands') {
        adjacentLand++;
        adjacentWater++;
      }
      if (terrainIsPassableForDomain(t, passableFor)) passableNeighbors++;
    }
  } catch (err) {
    logError('tool2Assessment executeAssessHex: gridDisk threw', err);
  }
  const adjacentTerrain = { land: adjacentLand, water: adjacentWater };
  const strategicNotes: string[] = [];
  if (adjacentWater > 0) {
    strategicNotes.push('Adjacent to water - exposed to naval bombardment (range 2)');
  }
  if (passableNeighbors <= 3) {
    strategicNotes.push(`Chokepoint - only ${passableNeighbors} passable adjacent hexes`);
  }
  strategicNotes.splice(3);

  return {
    status: 'ok',
    error: null,
    position: h3ToLatLng(hexH3, latLngByH3),
    terrain,
    passableBy,
    unitsAtHex,
    unitsInRange: { rangedRange1, rangedRange2, meleeRange },
    adjacentTerrain,
    strategicNotes,
  };
}
