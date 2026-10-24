import { type SeatId } from '../../shared/seatIds';
import { dbGetAll, dbGetOne } from '../gameDb';

/**
 * Documents the `HumanMarchPreviewDiagnostics` type alias (export type HumanMarchPreviewDiagnostics).

 * Purpose: Supports maintainability by documenting why `HumanMarchPreviewDiagnostics` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type HumanMarchPreviewDiagnostics = {
    /**
   * Specifies the contract for the `requestCount` member (requestCount: number;).

   * Contract: Describes stable behavior for callers of `requestCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
requestCount: number;
    /**
   * Specifies the contract for the `routePlanCalls` member (routePlanCalls: number;).

   * Contract: Describes stable behavior for callers of `routePlanCalls` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
routePlanCalls: number;
    /**
   * Specifies the contract for the `routeCacheHitCount` member (routeCacheHitCount: number;).

   * Contract: Describes stable behavior for callers of `routeCacheHitCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
routeCacheHitCount: number;
    /**
   * Specifies the contract for the `routeCacheMissCount` member (routeCacheMissCount: number;).

   * Contract: Describes stable behavior for callers of `routeCacheMissCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
routeCacheMissCount: number;
    /**
   * Specifies the contract for the `fallbackAttemptCount` member (fallbackAttemptCount: number;).

   * Contract: Describes stable behavior for callers of `fallbackAttemptCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
fallbackAttemptCount: number;
    /**
   * Specifies the contract for the `fallbackBudgetAbortCount` member (fallbackBudgetAbortCount: number;).

   * Contract: Describes stable behavior for callers of `fallbackBudgetAbortCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
fallbackBudgetAbortCount: number;
    /**
   * Specifies the contract for the `sessionCreateCount` member (sessionCreateCount: number;).

   * Contract: Describes stable behavior for callers of `sessionCreateCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
sessionCreateCount: number;
    /**
   * Specifies the contract for the `sessionReuseCount` member (sessionReuseCount: number;).

   * Contract: Describes stable behavior for callers of `sessionReuseCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
sessionReuseCount: number;
    /**
   * Specifies the contract for the `sessionInvalidateCount` member (sessionInvalidateCount: number;).

   * Contract: Describes stable behavior for callers of `sessionInvalidateCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
sessionInvalidateCount: number;
};

/**
 * Defines the `createEmptyHumanMarchPreviewDiagnostics` function shape (export function createEmptyHumanMarchPreviewDiagnostics(): HumanMarchPreviewDiagnostics).

 * Purpose: Supports maintainability by documenting why `createEmptyHumanMarchPreviewDiagnostics` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function createEmptyHumanMarchPreviewDiagnostics(): HumanMarchPreviewDiagnostics {
  return {
    requestCount: 0,
    routePlanCalls: 0,
    routeCacheHitCount: 0,
    routeCacheMissCount: 0,
    fallbackAttemptCount: 0,
    fallbackBudgetAbortCount: 0,
    sessionCreateCount: 0,
    sessionReuseCount: 0,
    sessionInvalidateCount: 0,
  };
}

/**
 * Defines the `hashString` function shape (function hashString(text: string): number).

 * Purpose: Supports maintainability by documenting why `hashString` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function hashString(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Defines the `buildSelectionSignature` function shape (export function buildSelectionSignature(unitIds: readonly string[]): string).

 * Purpose: Supports maintainability by documenting why `buildSelectionSignature` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildSelectionSignature(unitIds: readonly string[]): string {
  return [...new Set(unitIds)].sort().join('|');
}

/**
 * Defines the `buildSelectedUnitPositionsSignature` function shape (export function buildSelectedUnitPositionsSignature(unitIds: readonly string[]): string).

 * Purpose: Supports maintainability by documenting why `buildSelectedUnitPositionsSignature` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildSelectedUnitPositionsSignature(unitIds: readonly string[]): string {
  if (unitIds.length === 0) return '';
  const placeholders = unitIds.map(() => '?').join(', ');
  const rows = dbGetAll<{ id: string; h3Index: string }>(
    `SELECT id, h3_index AS h3Index
     FROM units
     WHERE id IN (${placeholders})
     ORDER BY id`,
    [...unitIds]
  );
  return rows.map((row) => `${row.id}:${row.h3Index}`).join('|');
}

/**
 * Defines the `buildTurnPhaseSignature` function shape (function buildTurnPhaseSignature(): string).

 * Purpose: Supports maintainability by documenting why `buildTurnPhaseSignature` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildTurnPhaseSignature(): string {
  const turnState = dbGetOne<{ turnNumber: number; phase: string }>(
    'SELECT turn_number AS turnNumber, phase FROM turn_state WHERE id = 1'
  );
  const turnNumber = Number(turnState?.turnNumber ?? 0);
  const phase = String(turnState?.phase ?? '');
  return `t:${turnNumber}|p:${phase}`;
}

/**
 * Defines the `buildInfrastructureSignature` function shape (function buildInfrastructureSignature(): string).

 * Purpose: Supports maintainability by documenting why `buildInfrastructureSignature` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildInfrastructureSignature(): string {
  const infrastructure = dbGetOne<{ c: number; urban: number; airports: number; seaports: number }>(
    `SELECT COUNT(*) AS c,
            COALESCE(SUM(urban_hex_count), 0) AS urban,
            COALESCE(SUM(airport_count), 0) AS airports,
            COALESCE(SUM(seaport_count), 0) AS seaports
     FROM res_s_infrastructure`
  );
  return `i:${infrastructure?.c ?? 0}:${infrastructure?.urban ?? 0}:${infrastructure?.airports ?? 0}:${infrastructure?.seaports ?? 0}`;
}

/**
 * Defines the `buildIntelSignature` function shape (function buildIntelSignature(playerId: SeatId): string).

 * Purpose: Supports maintainability by documenting why `buildIntelSignature` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildIntelSignature(playerId: SeatId): string {
  const hexIntel = dbGetOne<{ c: number; lastSeen: number }>(
    `SELECT COUNT(*) AS c, COALESCE(SUM(last_seen_turn), 0) AS lastSeen
     FROM player_hex_intel
     WHERE player_id = ?`,
    [playerId]
  );
  const unitIntel = dbGetOne<{ c: number; lastSeen: number; staleUntil: number }>(
    `SELECT COUNT(*) AS c,
            COALESCE(SUM(last_seen_turn), 0) AS lastSeen,
            COALESCE(SUM(stale_until_turn), 0) AS staleUntil
     FROM player_unit_intel
     WHERE player_id = ?`,
    [playerId]
  );
  return `hx:${hexIntel?.c ?? 0}:${hexIntel?.lastSeen ?? 0}|ux:${unitIntel?.c ?? 0}:${unitIntel?.lastSeen ?? 0}:${unitIntel?.staleUntil ?? 0}`;
}

/**
 * Defines the `buildTerrainSignature` function shape (function buildTerrainSignature(): string).

 * Purpose: Supports maintainability by documenting why `buildTerrainSignature` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildTerrainSignature(): string {
  const terrainBreakdown = dbGetOne<{
    c: number;
    water: number;
    coastal: number;
    arctic: number;
    wetlands: number;
    kindWater: number;
    kindArctic: number;
  }>(
    `SELECT COUNT(*) AS c,
            COALESCE(SUM(CASE WHEN terrain = 'water' THEN 1 ELSE 0 END), 0) AS water,
            COALESCE(SUM(CASE WHEN terrain = 'coastal' THEN 1 ELSE 0 END), 0) AS coastal,
            COALESCE(SUM(CASE WHEN terrain = 'arctic' THEN 1 ELSE 0 END), 0) AS arctic,
            COALESCE(SUM(CASE WHEN terrain = 'wetlands' THEN 1 ELSE 0 END), 0) AS wetlands,
            COALESCE(SUM(CASE WHEN terrain_kind = 'water' THEN 1 ELSE 0 END), 0) AS kindWater,
            COALESCE(SUM(CASE WHEN terrain_kind = 'arctic' THEN 1 ELSE 0 END), 0) AS kindArctic
     FROM hexes`
  );
  return `tx:${terrainBreakdown?.c ?? 0}:${terrainBreakdown?.water ?? 0}:${terrainBreakdown?.coastal ?? 0}:${terrainBreakdown?.arctic ?? 0}:${terrainBreakdown?.wetlands ?? 0}:${terrainBreakdown?.kindWater ?? 0}:${terrainBreakdown?.kindArctic ?? 0}`;
}

/**
 * Defines the `buildOccupancySignature` function shape (function buildOccupancySignature(): string).

 * Purpose: Supports maintainability by documenting why `buildOccupancySignature` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildOccupancySignature(): string {
  const occupancyRows = dbGetAll<{ signature: string }>(
    `SELECT id || ':' || player || ':' || h3_index AS signature
     FROM units
     ORDER BY id`
  );
  const occupancySignature = hashString(occupancyRows.map((row) => row.signature).join('|'));
  return `ox:${occupancyRows.length}:${occupancySignature}`;
}

/**
 * Defines the `buildEnvironmentSignature` function shape (export function buildEnvironmentSignature(playerId: SeatId): string).

 * Purpose: Supports maintainability by documenting why `buildEnvironmentSignature` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildEnvironmentSignature(playerId: SeatId): string {
  return [
    buildTurnPhaseSignature(),
    buildInfrastructureSignature(),
    buildIntelSignature(playerId),
    buildTerrainSignature(),
    buildOccupancySignature(),
  ].join('|');
}

/**
 * Defines the `buildHoverSessionCacheKey` function shape (export function buildHoverSessionCacheKey(payload: { playerId: SeatId; selectionSignature: string; selectedPositionsSignature: string;).

 * Purpose: Supports maintainability by documenting why `buildHoverSessionCacheKey` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildHoverSessionCacheKey(payload: {
  playerId: SeatId;
  selectionSignature: string;
  selectedPositionsSignature: string;
  environmentSignature: string;
}): string {
  return `p:${payload.playerId}|sel:${hashString(payload.selectionSignature)}|pos:${hashString(payload.selectedPositionsSignature)}|env:${hashString(payload.environmentSignature)}`;
}
