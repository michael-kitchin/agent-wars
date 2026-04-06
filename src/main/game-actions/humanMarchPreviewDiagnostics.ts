import { dbGetAll, dbGetOne } from '../gameDb';

export type HumanMarchPreviewDiagnostics = {
  requestCount: number;
  routePlanCalls: number;
  routeCacheHitCount: number;
  routeCacheMissCount: number;
  fallbackAttemptCount: number;
  fallbackBudgetAbortCount: number;
  sessionCreateCount: number;
  sessionReuseCount: number;
  sessionInvalidateCount: number;
};

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

function hashString(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return hash;
}

export function buildSelectionSignature(unitIds: readonly string[]): string {
  return [...new Set(unitIds)].sort().join('|');
}

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

function buildTurnPhaseSignature(): string {
  const turnState = dbGetOne<{ turnNumber: number; phase: string }>(
    'SELECT turn_number AS turnNumber, phase FROM turn_state WHERE id = 1'
  );
  const turnNumber = Number(turnState?.turnNumber ?? 0);
  const phase = String(turnState?.phase ?? '');
  return `t:${turnNumber}|p:${phase}`;
}

function buildInfrastructureSignature(): string {
  const infrastructure = dbGetOne<{ c: number; urban: number; airports: number; seaports: number }>(
    `SELECT COUNT(*) AS c,
            COALESCE(SUM(urban_hex_count), 0) AS urban,
            COALESCE(SUM(airport_count), 0) AS airports,
            COALESCE(SUM(seaport_count), 0) AS seaports
     FROM res1_infrastructure`
  );
  return `i:${infrastructure?.c ?? 0}:${infrastructure?.urban ?? 0}:${infrastructure?.airports ?? 0}:${infrastructure?.seaports ?? 0}`;
}

function buildIntelSignature(playerId: 'human' | 'opponent'): string {
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

function buildOccupancySignature(): string {
  const occupancyRows = dbGetAll<{ signature: string }>(
    `SELECT id || ':' || player || ':' || h3_index AS signature
     FROM units
     ORDER BY id`
  );
  const occupancySignature = hashString(occupancyRows.map((row) => row.signature).join('|'));
  return `ox:${occupancyRows.length}:${occupancySignature}`;
}

export function buildEnvironmentSignature(playerId: 'human' | 'opponent'): string {
  return [
    buildTurnPhaseSignature(),
    buildInfrastructureSignature(),
    buildIntelSignature(playerId),
    buildTerrainSignature(),
    buildOccupancySignature(),
  ].join('|');
}

export function buildHoverSessionCacheKey(payload: {
  playerId: 'human' | 'opponent';
  selectionSignature: string;
  selectedPositionsSignature: string;
  environmentSignature: string;
}): string {
  return `p:${payload.playerId}|sel:${hashString(payload.selectionSignature)}|pos:${hashString(payload.selectedPositionsSignature)}|env:${hashString(payload.environmentSignature)}`;
}
