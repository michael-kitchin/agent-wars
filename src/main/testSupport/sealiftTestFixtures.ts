import * as assert from 'assert';
import { type SeatId } from '../../shared/seatIds';
import { dbGetAll, dbRun, getGameState } from '../gameDb';
import { withTempGameDb } from './withTempGameDb';

/**
 * Defines the `withTempDb` function shape (function withTempDb(runCase: () => void): void).

 * Purpose: Supports maintainability by documenting why `withTempDb` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function withTempDb(runCase: () => void): void {
  withTempGameDb('aw-sealift-', runCase);
}

/**
 * Defines the `pickHex` function shape (function pickHex(index: number): string).

 * Purpose: Supports maintainability by documenting why `pickHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function pickHex(index: number): string {
  const state = getGameState();
  const hex = state.hexes[index];
  assert.ok(hex, 'expected seeded hex');
  return hex.h3Index;
}

/**
 * Defines the `insertUnit` function shape (function insertUnit(id: string, player: SeatId, unitType: string, h3Index: string): void).

 * Purpose: Supports maintainability by documenting why `insertUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function insertUnit(id: string, player: SeatId, unitType: string, h3Index: string): void {
  dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, player, unitType, h3Index]);
}

/**
 * Defines the `setHexTerrain` function shape (function setHexTerrain(h3Index: string, terrain: 'land' | 'coastal' | 'water'): void).

 * Purpose: Supports maintainability by documenting why `setHexTerrain` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: `terrain` and `terrain_kind` both match the requested bucket. Land uses kind `plains`; a later statement can replace that kind.
 * Exceptions: None.
 */
export function setHexTerrain(h3Index: string, terrain: 'land' | 'coastal' | 'water'): void {
  const terrainKind = terrain === 'water' ? 'water' : terrain === 'coastal' ? 'coastal' : 'plains';
  dbRun('UPDATE hexes SET terrain = ?, terrain_kind = ? WHERE h3_index = ?', [terrain, terrainKind, h3Index]);
}

/**
 * Defines the `setPortControl` function shape (function setPortControl(h3Index: string, controllerPlayerId: SeatId, seaportCount = 1): void).

 * Purpose: Supports maintainability by documenting why `setPortControl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setPortControl(h3Index: string, controllerPlayerId: SeatId, seaportCount = 1): void {
  dbRun(
    `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
     VALUES (?, 0, 0, ?)
     ON CONFLICT(h3_index) DO UPDATE SET seaport_count = excluded.seaport_count`,
    [h3Index, seaportCount]
  );
  dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [h3Index, controllerPlayerId]);
}

/**
 * Forces a native water hex with a known seaport count and optional controller.
 *
 * Purpose: Seeded `terrain_kind` of coastal would otherwise make water hexes embarkable without a port; `terrain_kind` is NOT NULL.
 * When to use: Open-water and water-seaport stack/IPC fixtures in this file.
 * Expected outcome: `hexes.terrain` is water, `terrain_kind` is non-coastal, infrastructure seaport count matches, control row set or removed.
 * Exceptions: None.
 */
export function prepareWaterHex(
  h3Index: string,
  options: { seaportCount: number; controllerPlayerId?: SeatId }
): void {
  dbRun('UPDATE hexes SET terrain = ?, terrain_kind = ? WHERE h3_index = ?', ['water', 'water', h3Index]);
  dbRun(
    `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
     VALUES (?, 0, 0, ?)
     ON CONFLICT(h3_index) DO UPDATE SET seaport_count = excluded.seaport_count`,
    [h3Index, options.seaportCount]
  );
  if (options.controllerPlayerId) {
    dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [
      h3Index,
      options.controllerPlayerId,
    ]);
    return;
  }
  dbRun('DELETE FROM res_s_control WHERE h3_index = ?', [h3Index]);
}

/**
 * Defines the `loadAssignments` function shape (function loadAssignments(): Array<).

 * Purpose: Supports maintainability by documenting why `loadAssignments` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadAssignments(): Array<{ landUnitId: string; navalUnitId: string }> {
  return dbGetAll<{ landUnitId: string; navalUnitId: string }>(
    'SELECT land_unit_id AS landUnitId, naval_unit_id AS navalUnitId FROM unit_transport_assignments ORDER BY land_unit_id'
  );
}
