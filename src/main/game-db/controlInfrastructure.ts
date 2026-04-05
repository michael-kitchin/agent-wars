import { getRes4TerrainOverridesForRenderer as getRes4TerrainOverridesFromCache } from '../terrainClassificationCache';
import { logDebug, logTrace } from '../logger';
import type { BuildUnitType } from '../productionRules';
import type { BasicDbOps } from './dbOps';

export interface HexControlRow {
  h3Index: string;
  controllerPlayerId: string | null;
}

export interface BuildQueueRow {
  id: number;
  h3Index: string;
  queueIndex: number;
  unitType: BuildUnitType;
  remainingCount: number;
}

export interface Res1InfrastructureRow {
  h3Index: string;
  urbanHexCount: number;
  airportCount: number;
  seaportCount: number;
}

export interface Res4FeatureOverrideRow {
  h3Index: string;
  parentH3Index: string;
  terrainKind: string;
  isUrban: boolean;
  isAirport: boolean;
  isSeaport: boolean;
  isRubble: boolean;
}

type ControlDbOps = BasicDbOps;

interface Res1InfrastructureDbRow extends Record<string, unknown> {
  h3Index: string;
  urbanHexCount: number;
  airportCount: number;
  seaportCount: number;
}

function mapRes1InfrastructureDbRow(row: Res1InfrastructureDbRow): Res1InfrastructureRow {
  return {
    h3Index: row.h3Index,
    urbanHexCount: Math.max(0, row.urbanHexCount),
    airportCount: Math.max(0, row.airportCount),
    seaportCount: Math.max(0, row.seaportCount),
  };
}

function listRes1InfrastructureRowsInternal(
  ops: ControlDbOps,
  options?: { whereClause?: string; params?: unknown[]; orderByClause?: string }
): Res1InfrastructureRow[] {
  const whereClause = options?.whereClause ? ` ${options.whereClause}` : '';
  const orderByClause = options?.orderByClause ? ` ${options.orderByClause}` : '';
  return ops.getAll<Res1InfrastructureDbRow>(
    `SELECT h3_index AS h3Index,
            urban_hex_count AS urbanHexCount,
            airport_count AS airportCount,
            seaport_count AS seaportCount
     FROM res1_infrastructure${whereClause}${orderByClause}`,
    options?.params ?? []
  ).map(mapRes1InfrastructureDbRow);
}

export function getHexController(ops: ControlDbOps, h3Index: string): string | null {
  logTrace('gameDb getHexController', { h3Index });
  const row = ops.getOne<{ controllerPlayerId: string | null }>(
    'SELECT controller_player_id AS controllerPlayerId FROM res1_control WHERE h3_index = ?',
    [h3Index]
  );
  return row?.controllerPlayerId ?? null;
}

export function setHexController(ops: ControlDbOps, h3Index: string, controllerPlayerId: string | null): void {
  logDebug('gameDb setHexController', { h3Index, controllerPlayerId });
  if (controllerPlayerId === null) {
    ops.run('DELETE FROM res1_control WHERE h3_index = ?', [h3Index]);
    return;
  }
  ops.run(
    `INSERT INTO res1_control (h3_index, controller_player_id)
     VALUES (?, ?)
     ON CONFLICT(h3_index) DO UPDATE SET controller_player_id = excluded.controller_player_id`,
    [h3Index, controllerPlayerId]
  );
}

export function listAllHexControls(ops: ControlDbOps): HexControlRow[] {
  logTrace('gameDb listAllHexControls');
  return ops.getAll<{ h3Index: string; controllerPlayerId: string | null }>(
    'SELECT h3_index AS h3Index, controller_player_id AS controllerPlayerId FROM res1_control ORDER BY h3_index ASC'
  );
}

export function listBuildQueueRowsForHex(ops: ControlDbOps, h3Index: string): BuildQueueRow[] {
  logTrace('gameDb listBuildQueueRowsForHex', { h3Index });
  const rows = ops.getAll<{
    id: number;
    h3Index: string;
    queueIndex: number;
    unitType: BuildUnitType;
    remainingCount: number;
  }>(
    `SELECT id, h3_index AS h3Index, queue_index AS queueIndex, unit_type AS unitType, remaining_count AS remainingCount
     FROM res1_build_queue
     WHERE h3_index = ?
     ORDER BY queue_index ASC, id ASC`,
    [h3Index]
  );
  return rows.map((row) => ({
    id: row.id,
    h3Index: row.h3Index,
    queueIndex: row.queueIndex,
    unitType: row.unitType,
    remainingCount: row.remainingCount,
  }));
}

export function getBuildProgressPointsForHex(ops: ControlDbOps, h3Index: string): number {
  logTrace('gameDb getBuildProgressPointsForHex', { h3Index });
  const row = ops.getOne<{ storedPoints: number }>(
    'SELECT stored_points AS storedPoints FROM res1_build_progress WHERE h3_index = ?',
    [h3Index]
  );
  return Math.max(0, row?.storedPoints ?? 0);
}

export function setBuildProgressPointsForHex(ops: ControlDbOps, h3Index: string, storedPoints: number): void {
  const safePoints = Math.max(0, Math.trunc(storedPoints));
  logDebug('gameDb setBuildProgressPointsForHex', { h3Index, storedPoints: safePoints });
  ops.run(
    `INSERT INTO res1_build_progress (h3_index, stored_points)
     VALUES (?, ?)
     ON CONFLICT(h3_index) DO UPDATE SET stored_points = excluded.stored_points`,
    [h3Index, safePoints]
  );
}

export function clearBuildQueueAndProgressForHex(ops: ControlDbOps, h3Index: string): void {
  logDebug('gameDb clearBuildQueueAndProgressForHex', { h3Index });
  ops.run('DELETE FROM res1_build_queue WHERE h3_index = ?', [h3Index]);
  ops.run('DELETE FROM res1_build_progress WHERE h3_index = ?', [h3Index]);
}

export function replaceBuildQueueForHex(
  ops: ControlDbOps,
  h3Index: string,
  entries: Array<{ unitType: BuildUnitType; remainingCount: number }>
): void {
  logDebug('gameDb replaceBuildQueueForHex', { h3Index, entryCount: entries.length });
  ops.run('DELETE FROM res1_build_queue WHERE h3_index = ?', [h3Index]);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    ops.run(
      `INSERT INTO res1_build_queue (h3_index, queue_index, unit_type, remaining_count)
       VALUES (?, ?, ?, ?)`,
      [h3Index, i, entry.unitType, Math.max(1, Math.trunc(entry.remainingCount))]
    );
  }
}

export function getRes1InfrastructureForHex(ops: ControlDbOps, h3Index: string): Res1InfrastructureRow {
  logTrace('gameDb getRes1InfrastructureForHex', { h3Index });
  const row = listRes1InfrastructureRowsInternal(ops, {
    whereClause: 'WHERE h3_index = ?',
    params: [h3Index],
  })[0];
  return row ?? { h3Index, urbanHexCount: 0, airportCount: 0, seaportCount: 0 };
}

export function listRes1InfrastructureRows(ops: ControlDbOps): Res1InfrastructureRow[] {
  logTrace('gameDb listRes1InfrastructureRows');
  return listRes1InfrastructureRowsInternal(ops, { orderByClause: 'ORDER BY h3_index ASC' });
}

export function setRes1InfrastructureForHex(
  ops: ControlDbOps,
  h3Index: string,
  counts: { urbanHexCount: number; airportCount: number; seaportCount: number }
): void {
  logDebug('gameDb setRes1InfrastructureForHex', { h3Index, ...counts });
  ops.run(
    `INSERT INTO res1_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(h3_index) DO UPDATE SET
       urban_hex_count = excluded.urban_hex_count,
       airport_count = excluded.airport_count,
       seaport_count = excluded.seaport_count`,
    [
      h3Index,
      Math.max(0, Math.trunc(counts.urbanHexCount)),
      Math.max(0, Math.trunc(counts.airportCount)),
      Math.max(0, Math.trunc(counts.seaportCount)),
    ]
  );
}

export function listRes4FeatureOverridesForGame(ops: ControlDbOps): Res4FeatureOverrideRow[] {
  logTrace('gameDb listRes4FeatureOverridesForGame');
  return ops.getAll<{
    h3Index: string;
    parentH3Index: string;
    terrainKind: string;
    isUrban: number;
    isAirport: number;
    isSeaport: number;
    isRubble: number;
  }>(
    `SELECT h3_index AS h3Index,
            parent_h3_index AS parentH3Index,
            terrain_kind AS terrainKind,
            is_urban AS isUrban,
            is_airport AS isAirport,
            is_seaport AS isSeaport,
            is_rubble AS isRubble
     FROM res4_feature_overrides
     ORDER BY h3_index ASC`
  ).map((row) => ({
    h3Index: row.h3Index,
    parentH3Index: row.parentH3Index,
    terrainKind: row.terrainKind,
    isUrban: row.isUrban === 1,
    isAirport: row.isAirport === 1,
    isSeaport: row.isSeaport === 1,
    isRubble: row.isRubble === 1,
  }));
}

export function updateRes4FeatureOverrideRow(
  ops: ControlDbOps,
  h3Index: string,
  patch: Partial<Pick<Res4FeatureOverrideRow, 'isUrban' | 'isAirport' | 'isSeaport' | 'isRubble'>>
): void {
  logDebug('gameDb updateRes4FeatureOverrideRow', { h3Index, patch });
  const row = ops.getOne<{
    parentH3Index: string;
    isUrban: number;
    isAirport: number;
    isSeaport: number;
    isRubble: number;
  }>(
    `SELECT parent_h3_index AS parentH3Index,
            is_urban AS isUrban,
            is_airport AS isAirport,
            is_seaport AS isSeaport,
            is_rubble AS isRubble
     FROM res4_feature_overrides
     WHERE h3_index = ?`,
    [h3Index]
  );
  if (!row) return;
  ops.run(
    `UPDATE res4_feature_overrides
     SET is_urban = ?, is_airport = ?, is_seaport = ?, is_rubble = ?
     WHERE h3_index = ?`,
    [
      patch.isUrban === undefined ? row.isUrban : patch.isUrban ? 1 : 0,
      patch.isAirport === undefined ? row.isAirport : patch.isAirport ? 1 : 0,
      patch.isSeaport === undefined ? row.isSeaport : patch.isSeaport ? 1 : 0,
      patch.isRubble === undefined ? row.isRubble : patch.isRubble ? 1 : 0,
      h3Index,
    ]
  );
  const parentCounts = ops.getAll<{ urbanHexCount: number; airportCount: number; seaportCount: number }>(
    `SELECT SUM(CASE WHEN is_urban = 1 THEN 1 ELSE 0 END) AS urbanHexCount,
            SUM(CASE WHEN is_airport = 1 THEN 1 ELSE 0 END) AS airportCount,
            SUM(CASE WHEN is_seaport = 1 THEN 1 ELSE 0 END) AS seaportCount
     FROM res4_feature_overrides
     WHERE parent_h3_index = ?`,
    [row.parentH3Index]
  )[0] ?? { urbanHexCount: 0, airportCount: 0, seaportCount: 0 };
  setRes1InfrastructureForHex(ops, row.parentH3Index, {
    urbanHexCount: parentCounts.urbanHexCount,
    airportCount: parentCounts.airportCount,
    seaportCount: parentCounts.seaportCount,
  });
}

export function getRes4TerrainOverridesForRendererFromGame(ops: ControlDbOps): Array<{
  h3Index: string;
  terrainKind: string;
  isUrban: boolean;
  isAirport?: boolean;
  isSeaport?: boolean;
  isRubble?: boolean;
}> {
  logDebug('gameDb getRes4TerrainOverridesForRendererFromGame');
  const baseRows = getRes4TerrainOverridesFromCache();
  const mergedByH3 = new Map(
    baseRows.map((row) => [
      row.h3Index,
      {
        h3Index: row.h3Index,
        terrainKind: row.terrainKind,
        isUrban: row.isUrban,
        isAirport: false,
        isSeaport: false,
        isRubble: !!row.isRubble,
      },
    ])
  );
  for (const feature of listRes4FeatureOverridesForGame(ops)) {
    const current = mergedByH3.get(feature.h3Index);
    mergedByH3.set(feature.h3Index, {
      h3Index: feature.h3Index,
      terrainKind: current?.terrainKind ?? (feature.terrainKind as (typeof baseRows)[number]['terrainKind']),
      isUrban: feature.isUrban,
      isAirport: feature.isAirport,
      isSeaport: feature.isSeaport,
      isRubble: feature.isRubble,
    });
  }
  const rows = [...mergedByH3.values()].sort((a, b) => a.h3Index.localeCompare(b.h3Index));
  let airportCount = 0;
  let seaportCount = 0;
  for (const row of rows) {
    if (row.isAirport) airportCount += 1;
    if (row.isSeaport) seaportCount += 1;
  }
  logDebug('gameDb getRes4TerrainOverridesForRendererFromGame: prepared rows', {
    rowCount: rows.length,
    airportCount,
    seaportCount,
  });
  return rows;
}
