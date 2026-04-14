import type { EmbarkOrder, SealiftContextMode, SealiftLandUnitOption, SealiftNavalRow, SealiftStackState } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { dbGetAll, dbGetOne, dbRun, isDbReady } from '../gameDb';
import type { CombatUnit } from '../combatUnitTypes';
import { logDebug } from '../logger';
import { normalizeMovementTerrain } from '../movementTerrain';
import { rememberStrategicHexBeforeMove } from '../strategicUnitPreviousHex';

/**
 * Documents the `UnitRow` interface as a named contract surface (interface UnitRow).

 * Purpose: Supports maintainability by documenting why `UnitRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface UnitRow {
    /**
   * Specifies the contract for the `id` member (id: string;).

   * Contract: Describes stable behavior for callers of `id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
id: string;
    /**
   * Specifies the contract for the `player` member (player: string;).

   * Contract: Describes stable behavior for callers of `player` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
player: string;
    /**
   * Specifies the contract for the `unitType` member (unitType: string;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: string;
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
}

/**
 * Documents the `AssignmentRow` interface as a named contract surface (interface AssignmentRow).

 * Purpose: Supports maintainability by documenting why `AssignmentRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface AssignmentRow {
    /**
   * Specifies the contract for the `landUnitId` member (landUnitId: string;).

   * Contract: Describes stable behavior for callers of `landUnitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
landUnitId: string;
    /**
   * Specifies the contract for the `navalUnitId` member (navalUnitId: string;).

   * Contract: Describes stable behavior for callers of `navalUnitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
navalUnitId: string;
    /**
   * Specifies the contract for the `landUnitType` member (landUnitType: 'infantry' | 'armor';).

   * Contract: Describes stable behavior for callers of `landUnitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
landUnitType: 'infantry' | 'armor';
}

/**
 * Documents the `SealiftSlots` interface as a named contract surface (interface SealiftSlots).

 * Purpose: Supports maintainability by documenting why `SealiftSlots` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface SealiftSlots {
    /**
   * Specifies the contract for the `slot1UnitId` member (slot1UnitId: string | null;).

   * Contract: Describes stable behavior for callers of `slot1UnitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
slot1UnitId: string | null;
    /**
   * Specifies the contract for the `slot2UnitId` member (slot2UnitId: string | null;).

   * Contract: Describes stable behavior for callers of `slot2UnitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
slot2UnitId: string | null;
}

/**
 * Documents the `HexEmbarkContext` interface as a named contract surface (interface HexEmbarkContext).

 * Purpose: Supports maintainability by documenting why `HexEmbarkContext` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface HexEmbarkContext {
    /**
   * Specifies the contract for the `normalizedMovementTerrain` member (normalizedMovementTerrain: string;).

   * Contract: Describes stable behavior for callers of `normalizedMovementTerrain` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
normalizedMovementTerrain: string;
    /**
   * Specifies the contract for the `seaportCount` member (seaportCount: number;).

   * Contract: Describes stable behavior for callers of `seaportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seaportCount: number;
    /**
   * Specifies the contract for the `controllerPlayerId` member (controllerPlayerId: string | null;).

   * Contract: Describes stable behavior for callers of `controllerPlayerId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
controllerPlayerId: string | null;
}

/**
 * Defines the `getUnitsAtHex` function shape (function getUnitsAtHex(h3Index: string): UnitRow[]).

 * Purpose: Supports maintainability by documenting why `getUnitsAtHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getUnitsAtHex(h3Index: string): UnitRow[] {
  return dbGetAll<{ id: string; player: string; unitType: string; h3Index: string }>(
    'SELECT id, player, unit_type AS unitType, h3_index AS h3Index FROM units WHERE h3_index = ?',
    [h3Index]
  );
}

/**
 * Defines the `getHumanNavalIds` function shape (function getHumanNavalIds(unitsAtHex: UnitRow[]): string[]).

 * Purpose: Supports maintainability by documenting why `getHumanNavalIds` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getHumanNavalIds(unitsAtHex: UnitRow[]): string[] {
  return unitsAtHex
    .filter((unit) => unit.player === 'human' && unit.unitType === 'naval')
    .map((unit) => unit.id)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Defines the `getHumanLandOptions` function shape (function getHumanLandOptions(unitsAtHex: UnitRow[]): SealiftLandUnitOption[]).

 * Purpose: Supports maintainability by documenting why `getHumanLandOptions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getHumanLandOptions(unitsAtHex: UnitRow[]): SealiftLandUnitOption[] {
  const land = unitsAtHex.filter((unit) => unit.player === 'human' && (unit.unitType === 'infantry' || unit.unitType === 'armor'));
  return land
    .map((unit) => ({ unitId: unit.id, unitType: unit.unitType as 'infantry' | 'armor' }))
    .sort((a, b) => {
      if (a.unitType !== b.unitType) return a.unitType === 'armor' ? -1 : 1;
      return a.unitId.localeCompare(b.unitId);
    });
}

/**
 * Defines the `getHexEmbarkContext` function shape (function getHexEmbarkContext(h3Index: string): HexEmbarkContext | null).

 * Purpose: Supports maintainability by documenting why `getHexEmbarkContext` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getHexEmbarkContext(h3Index: string): HexEmbarkContext | null {
  const terrainRow = dbGetOne<{ terrain: string; terrainKind: string | null }>(
    'SELECT terrain, terrain_kind AS terrainKind FROM hexes WHERE h3_index = ?',
    [h3Index]
  );
  if (!terrainRow) return null;
  const infra = dbGetOne<{ seaportCount: number }>(
    'SELECT seaport_count AS seaportCount FROM res1_infrastructure WHERE h3_index = ?',
    [h3Index]
  );
  const control = dbGetOne<{ controllerPlayerId: string | null }>(
    'SELECT controller_player_id AS controllerPlayerId FROM res1_control WHERE h3_index = ?',
    [h3Index]
  );
  const normalizedMovementTerrain = normalizeMovementTerrain({
    h3Index,
    terrain: terrainRow.terrain,
    terrainKind: terrainRow.terrainKind ?? undefined,
  });
  return {
    normalizedMovementTerrain,
    seaportCount: infra?.seaportCount ?? 0,
    controllerPlayerId: control?.controllerPlayerId ?? null,
  };
}

/**
 * Defines the `canPlayerEmbarkFromHex` function shape (function canPlayerEmbarkFromHex(h3Index: string, playerId: string): boolean).

 * Purpose: Supports maintainability by documenting why `canPlayerEmbarkFromHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function canPlayerEmbarkFromHex(h3Index: string, playerId: string): boolean {
  const context = getHexEmbarkContext(h3Index);
  if (!context) return false;
  // Coastal embark/debark is always allowed for units already occupying the stack hex.
  if (context.normalizedMovementTerrain === 'coastal') return true;
  // Keep the existing controlled-seaport rule for non-coastal terrain labels.
  return context.seaportCount > 0 && context.controllerPlayerId === playerId;
}

/**
 * Defines the `getSealiftStackContextModeForHex` function shape (export function getSealiftStackContextModeForHex(h3Index: string): SealiftContextMode).

 * Purpose: Supports maintainability by documenting why `getSealiftStackContextModeForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getSealiftStackContextModeForHex(h3Index: string): SealiftContextMode {
  const context = getHexEmbarkContext(h3Index);
  if (!context) return 'unsupported';
  if (context.normalizedMovementTerrain === 'water') return 'water';
  if (canPlayerEmbarkFromHex(h3Index, 'human')) return 'coastal_port';
  if (context.normalizedMovementTerrain === 'coastal') return 'coastal_no_port';
  return 'unsupported';
}

/**
 * Defines the `loadAssignmentsAtHex` function shape (function loadAssignmentsAtHex(h3Index: string): AssignmentRow[]).

 * Purpose: Supports maintainability by documenting why `loadAssignmentsAtHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function loadAssignmentsAtHex(h3Index: string): AssignmentRow[] {
  return dbGetAll<{ landUnitId: string; navalUnitId: string; landUnitType: 'infantry' | 'armor' }>(
    `SELECT uta.land_unit_id AS landUnitId,
            uta.naval_unit_id AS navalUnitId,
            lu.unit_type AS landUnitType
     FROM unit_transport_assignments uta
     JOIN units lu ON lu.id = uta.land_unit_id
     JOIN units nu ON nu.id = uta.naval_unit_id
     WHERE lu.h3_index = ?
       AND nu.h3_index = ?
       AND lu.player = 'human'
       AND nu.player = 'human'
       AND nu.unit_type = 'naval'
       AND lu.unit_type IN ('infantry', 'armor')`,
    [h3Index, h3Index]
  );
}

/**
 * Defines the `buildSlotsByNavalId` function shape (function buildSlotsByNavalId(navalIds: string[], assignments: AssignmentRow[]): Map<string, SealiftSlots>).

 * Purpose: Supports maintainability by documenting why `buildSlotsByNavalId` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildSlotsByNavalId(navalIds: string[], assignments: AssignmentRow[]): Map<string, SealiftSlots> {
  const slotsByNavalId = new Map<string, SealiftSlots>();
  for (const navalUnitId of navalIds) {
    slotsByNavalId.set(navalUnitId, { slot1UnitId: null, slot2UnitId: null });
  }
  const grouped = new Map<string, AssignmentRow[]>();
  for (const row of assignments) {
    const list = grouped.get(row.navalUnitId) ?? [];
    list.push(row);
    grouped.set(row.navalUnitId, list);
  }
  for (const navalUnitId of navalIds) {
    const slots = slotsByNavalId.get(navalUnitId)!;
    const rows = grouped.get(navalUnitId) ?? [];
    const armor = rows.find((row) => row.landUnitType === 'armor');
    if (armor) {
      slots.slot1UnitId = armor.landUnitId;
      slots.slot2UnitId = null;
      continue;
    }
    const infantry = rows
      .filter((row) => row.landUnitType === 'infantry')
      .map((row) => row.landUnitId)
      .sort((a, b) => a.localeCompare(b));
    slots.slot1UnitId = infantry[0] ?? null;
    slots.slot2UnitId = infantry[1] ?? null;
  }
  return slotsByNavalId;
}

/**
 * Defines the `normalizeSlots` function shape (function normalizeSlots().

 * Purpose: Supports maintainability by documenting why `normalizeSlots` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function normalizeSlots(
  navalIds: string[],
  slotsByNavalId: Map<string, SealiftSlots>,
  landTypeById: Map<string, 'infantry' | 'armor'>
): void {
  const seen = new Set<string>();
  for (const navalUnitId of navalIds) {
    const slots = slotsByNavalId.get(navalUnitId);
    if (!slots) continue;
    for (const key of ['slot1UnitId', 'slot2UnitId'] as const) {
      const unitId = slots[key];
      if (!unitId) continue;
      if (!landTypeById.has(unitId) || seen.has(unitId)) {
        slots[key] = null;
        continue;
      }
      seen.add(unitId);
    }
    if (!slots.slot1UnitId && slots.slot2UnitId) {
      slots.slot1UnitId = slots.slot2UnitId;
      slots.slot2UnitId = null;
    }
    if (slots.slot1UnitId && landTypeById.get(slots.slot1UnitId) === 'armor') {
      slots.slot2UnitId = null;
    } else if (slots.slot2UnitId && landTypeById.get(slots.slot2UnitId) === 'armor') {
      slots.slot1UnitId = slots.slot2UnitId;
      slots.slot2UnitId = null;
    }
  }
}

/**
 * Defines the `writeAssignmentsForHex` function shape (function writeAssignmentsForHex().

 * Purpose: Supports maintainability by documenting why `writeAssignmentsForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function writeAssignmentsForHex(
  h3Index: string,
  landOptions: SealiftLandUnitOption[],
  slotsByNavalId: Map<string, SealiftSlots>
): void {
  const landIds = landOptions.map((option) => option.unitId);
  if (landIds.length > 0) {
    const placeholders = landIds.map(() => '?').join(', ');
    dbRun(`DELETE FROM unit_transport_assignments WHERE land_unit_id IN (${placeholders})`, landIds);
  }
  for (const [navalUnitId, slots] of slotsByNavalId.entries()) {
    if (slots.slot1UnitId) {
      dbRun(
        'INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)',
        [slots.slot1UnitId, navalUnitId]
      );
    }
    if (slots.slot2UnitId) {
      dbRun(
        'INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)',
        [slots.slot2UnitId, navalUnitId]
      );
    }
  }
  // Defensive cleanup when stale records still point at this hex via naval id.
  dbRun(
    `DELETE FROM unit_transport_assignments
     WHERE naval_unit_id IN (
       SELECT id FROM units WHERE h3_index = ? AND unit_type = 'naval'
     ) AND land_unit_id NOT IN (
       SELECT id FROM units WHERE h3_index = ? AND unit_type IN ('infantry', 'armor')
     )`,
    [h3Index, h3Index]
  );
}

/**
 * Defines the `buildNavalRows` function shape (function buildNavalRows( contextMode: SealiftContextMode, navalIds: string[], slotsByNavalId: Map<string, SealiftSlots>, landTypeById: Map<string, ').

 * Purpose: Supports maintainability by documenting why `buildNavalRows` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildNavalRows(
  contextMode: SealiftContextMode,
  navalIds: string[],
  slotsByNavalId: Map<string, SealiftSlots>,
  landTypeById: Map<string, 'infantry' | 'armor'>
): SealiftNavalRow[] {
  const controlsDisabled = contextMode === 'water' || contextMode === 'coastal_no_port';
  return navalIds.map((navalUnitId) => {
    const slots = slotsByNavalId.get(navalUnitId) ?? { slot1UnitId: null, slot2UnitId: null };
    const slot1Armor = !!slots.slot1UnitId && landTypeById.get(slots.slot1UnitId) === 'armor';
    return {
      navalUnitId,
      slot1UnitId: slots.slot1UnitId,
      slot2UnitId: slots.slot2UnitId,
      slot2Disabled: controlsDisabled || slot1Armor,
      controlsDisabled,
      debarkSlot1Enabled: contextMode !== 'water' && !!slots.slot1UnitId,
      debarkSlot2Enabled: contextMode !== 'water' && !!slots.slot2UnitId,
    };
  });
}

/**
 * Defines the `getSealiftStackStateImpl` function shape (export function getSealiftStackStateImpl(h3Index: string): SealiftStackState).

 * Purpose: Supports maintainability by documenting why `getSealiftStackStateImpl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getSealiftStackStateImpl(h3Index: string): SealiftStackState {
  const unitsAtHex = getUnitsAtHex(h3Index);
  const contextMode = getSealiftStackContextModeForHex(h3Index);
  const navalIds = getHumanNavalIds(unitsAtHex);
  const landOptions = getHumanLandOptions(unitsAtHex);
  const landTypeById = new Map(landOptions.map((option) => [option.unitId, option.unitType] as const));
  const assignments = loadAssignmentsAtHex(h3Index);
  const slotsByNavalId = buildSlotsByNavalId(navalIds, assignments);
  normalizeSlots(navalIds, slotsByNavalId, landTypeById);
  const navalRows = buildNavalRows(contextMode, navalIds, slotsByNavalId, landTypeById);
  const hasEmbarkedUnitsInStack = assignments.length > 0;
  const hasMixedStack = navalIds.length > 0 && landOptions.length > 0;
  return {
    h3Index,
    showSealiftSection: hasMixedStack || hasEmbarkedUnitsInStack,
    contextMode,
    controlsDisabled: contextMode === 'water' || contextMode === 'coastal_no_port',
    hasEmbarkedUnitsInStack,
    navalRows,
    landOptions,
  };
}

/**
 * Defines the `updateSealiftSlotImpl` function shape (export function updateSealiftSlotImpl(args: { h3Index: string; navalUnitId: string; slotIndex: 1 | 2; landUnitId: string | null; }): { success: boo).

 * Purpose: Supports maintainability by documenting why `updateSealiftSlotImpl` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateSealiftSlotImpl(args: {
  h3Index: string;
  navalUnitId: string;
  slotIndex: 1 | 2;
  landUnitId: string | null;
}): { success: boolean; reason?: string; state?: SealiftStackState } {
  if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
  const state = getSealiftStackStateImpl(args.h3Index);
  const navalIds = state.navalRows.map((row) => row.navalUnitId);
  if (!navalIds.includes(args.navalUnitId)) return { success: false, reason: 'Selected naval unit is not in this stack.' };
  if (state.contextMode === 'water') return { success: false, reason: 'Sealift assignments cannot be changed while at sea.' };
  if (args.landUnitId && !canPlayerEmbarkFromHex(args.h3Index, 'human')) {
    return { success: false, reason: 'Embarkation requires a valid port.' };
  }
  if (args.landUnitId && !state.landOptions.some((option) => option.unitId === args.landUnitId)) {
    return { success: false, reason: 'Selected land unit is not available for this stack.' };
  }

  const landTypeById = new Map(state.landOptions.map((option) => [option.unitId, option.unitType] as const));
  const slotsByNavalId = new Map(
    state.navalRows.map((row) => [
      row.navalUnitId,
      { slot1UnitId: row.slot1UnitId, slot2UnitId: row.slot2UnitId } satisfies SealiftSlots,
    ])
  );

  if (args.landUnitId) {
    for (const slots of slotsByNavalId.values()) {
      if (slots.slot1UnitId === args.landUnitId) slots.slot1UnitId = null;
      if (slots.slot2UnitId === args.landUnitId) slots.slot2UnitId = null;
    }
  }

  const targetSlots = slotsByNavalId.get(args.navalUnitId);
  if (!targetSlots) return { success: false, reason: 'Selected naval unit is not available.' };
  const targetKey = args.slotIndex === 1 ? 'slot1UnitId' : 'slot2UnitId';
  targetSlots[targetKey] = args.landUnitId;
  if (args.slotIndex === 2 && args.landUnitId && targetSlots.slot1UnitId && landTypeById.get(targetSlots.slot1UnitId) === 'armor') {
    return { success: false, reason: 'This naval unit already carries armor and has no second slot.' };
  }

  normalizeSlots(navalIds, slotsByNavalId, landTypeById);
  writeAssignmentsForHex(args.h3Index, state.landOptions, slotsByNavalId);
  return { success: true, state: getSealiftStackStateImpl(args.h3Index) };
}

/**
 * Defines the `getEmbarkedNavalForLandUnit` function shape (export function getEmbarkedNavalForLandUnit(unitId: string): string | null).

 * Purpose: Supports maintainability by documenting why `getEmbarkedNavalForLandUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getEmbarkedNavalForLandUnit(unitId: string): string | null {
  const row = dbGetOne<{ navalUnitId: string }>(
    'SELECT naval_unit_id AS navalUnitId FROM unit_transport_assignments WHERE land_unit_id = ?',
    [unitId]
  );
  return row?.navalUnitId ?? null;
}

/**
 * Defines the `isEmbarkedLandUnitOnWater` function shape (export function isEmbarkedLandUnitOnWater(unitId: string): boolean).

 * Purpose: Supports maintainability by documenting why `isEmbarkedLandUnitOnWater` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isEmbarkedLandUnitOnWater(unitId: string): boolean {
  const row = dbGetOne<{ terrain: string }>(
    `SELECT hx.terrain AS terrain
     FROM unit_transport_assignments uta
     JOIN units lu ON lu.id = uta.land_unit_id
     JOIN hexes hx ON hx.h3_index = lu.h3_index
     WHERE uta.land_unit_id = ?`,
    [unitId]
  );
  return row?.terrain === 'water';
}

/**
 * Defines the `autoDisembarkIndependentLandMoves` function shape (export function autoDisembarkIndependentLandMoves(movementOrders: Array<).

 * Purpose: Supports maintainability by documenting why `autoDisembarkIndependentLandMoves` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function autoDisembarkIndependentLandMoves(movementOrders: Array<{ unitId: string; toH3Index: string }>): void {
  for (const order of movementOrders) {
    const assignment = dbGetOne<{ navalUnitId: string }>(
      'SELECT naval_unit_id AS navalUnitId FROM unit_transport_assignments WHERE land_unit_id = ?',
      [order.unitId]
    );
    if (!assignment) continue;
    const pair = dbGetOne<{ landH3Index: string; navalH3Index: string; terrain: string }>(
      `SELECT lu.h3_index AS landH3Index,
              nu.h3_index AS navalH3Index,
              hx.terrain AS terrain
       FROM units lu
       JOIN units nu ON nu.id = ?
       JOIN hexes hx ON hx.h3_index = lu.h3_index
       WHERE lu.id = ?`,
      [assignment.navalUnitId, order.unitId]
    );
    if (!pair) {
      dbRun('DELETE FROM unit_transport_assignments WHERE land_unit_id = ?', [order.unitId]);
      continue;
    }
    if (pair.landH3Index !== pair.navalH3Index) {
      dbRun('DELETE FROM unit_transport_assignments WHERE land_unit_id = ?', [order.unitId]);
      continue;
    }
    if (pair.terrain === 'water') continue;
    if (order.toH3Index !== pair.navalH3Index) {
      dbRun('DELETE FROM unit_transport_assignments WHERE land_unit_id = ?', [order.unitId]);
    }
  }
}

/**
 * Defines the `syncEmbarkedLandUnitPositionsWithNaval` function shape (export function syncEmbarkedLandUnitPositionsWithNaval(): void).

 * Purpose: Supports maintainability by documenting why `syncEmbarkedLandUnitPositionsWithNaval` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function syncEmbarkedLandUnitPositionsWithNaval(): void {
  const rows = dbGetAll<{ landUnitId: string; navalH3Index: string; landH3Index: string }>(
    `SELECT lu.id AS landUnitId,
            lu.h3_index AS landH3Index,
            nu.h3_index AS navalH3Index
     FROM unit_transport_assignments uta
     JOIN units lu ON lu.id = uta.land_unit_id
     JOIN units nu ON nu.id = uta.naval_unit_id`
  );
  for (const row of rows) {
    if (row.landH3Index === row.navalH3Index) continue;
    rememberStrategicHexBeforeMove(row.landUnitId, row.landH3Index, row.navalH3Index);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [row.navalH3Index, row.landUnitId]);
  }
}

/**
 * Defines the `applyEmbarkOrdersForPlayer` function shape (export function applyEmbarkOrdersForPlayer(orders: EmbarkOrder[], playerId: string): void).

 * Purpose: Supports maintainability by documenting why `applyEmbarkOrdersForPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/**
 * Writes human sealift rows for tactical sub-unit embark orders using strategic parent ids (no res4 hex co-location check).
 *
 * Purpose: Mirrors strategic slot assignment during tactical Ready commits while parent `units.h3_index` may still anchor at res1; tactical validation already ensured legality on the snapshot.
 * When to use: After a successful human tactical commit or support-only apply that includes `embarkOrders` with tactical sub-unit ids.
 * Expected outcome: `unit_transport_assignments` rows updated for the involved land parents; other carriers lose exclusive claim on that land row via `DELETE` before insert.
 * Exceptions: None; skips silently when parent rows or types are missing or not human infantry/armor + naval.
 */
export function applyTacticalEmbarkCommittedOrdersToStrategicDb(
  orders: readonly EmbarkOrder[],
  resolveParentUnitIdForSubUnit: (subUnitId: string) => string | null
): void {
  logDebug('applyTacticalEmbarkCommittedOrdersToStrategicDb', { orderCount: orders.length });
  if (orders.length <= 0 || !isDbReady()) return;
  for (const order of orders) {
    const landParent = resolveParentUnitIdForSubUnit(order.unitId);
    const navalParent = resolveParentUnitIdForSubUnit(order.navalUnitId);
    if (!landParent || !navalParent) continue;
    const land = dbGetOne<{ unitType: string; player: string }>(
      'SELECT unit_type AS unitType, player FROM units WHERE id = ?',
      [landParent]
    );
    const naval = dbGetOne<{ unitType: string; player: string }>(
      'SELECT unit_type AS unitType, player FROM units WHERE id = ?',
      [navalParent]
    );
    if (!land || !naval) continue;
    if (land.player !== 'human' || naval.player !== 'human') continue;
    if (!((land.unitType === 'infantry' || land.unitType === 'armor') && naval.unitType === 'naval')) continue;
    dbRun('DELETE FROM unit_transport_assignments WHERE land_unit_id = ?', [landParent]);
    dbRun(
      'INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)',
      [landParent, navalParent]
    );
  }
}

/**
 * Clears strategic sealift rows for all human land parents with infantry/armor sub-units at a tactical res4 hex, then applies sub-unit embark pairs.
 *
 * Purpose: Keeps `unit_transport_assignments` aligned with immediate tactical sealift UI edits, mirroring strategic `writeAssignmentsForHex` for that cohort.
 * When to use: Only after `projectTacticalSealiftSlotChange` succeeds in `applyTacticalSealiftSlotChangeInSession`.
 * Expected outcome: Prior parent-level assignments for those land units are removed; each valid `embarkPairs` row is written via `applyTacticalEmbarkCommittedOrdersToStrategicDb`.
 * Exceptions: None; skips all SQLite work when the database handle is missing.
 */
export function syncStrategicSealiftFromTacticalHexEmbarkPairs(args: {
  battle: Pick<TacticalBattleSnapshot, 'subUnits'>;
  h3Index: string;
  embarkPairs: readonly EmbarkOrder[];
}): void {
  logDebug('syncStrategicSealiftFromTacticalHexEmbarkPairs', {
    h3Index: args.h3Index,
    pairCount: args.embarkPairs.length,
  });
  if (!isDbReady()) return;
  const landParents: string[] = [];
  for (const u of args.battle.subUnits) {
    if (u.h3Index !== args.h3Index || u.player !== 'human') continue;
    if (u.unitType !== 'infantry' && u.unitType !== 'armor') continue;
    landParents.push(u.parentUnitId);
  }
  const unique = [...new Set(landParents)];
  if (unique.length > 0) {
    const ph = unique.map(() => '?').join(', ');
    dbRun(`DELETE FROM unit_transport_assignments WHERE land_unit_id IN (${ph})`, unique);
  }
  applyTacticalEmbarkCommittedOrdersToStrategicDb(args.embarkPairs, (subId) => {
    const row = args.battle.subUnits.find((s) => s.id === subId);
    return row?.parentUnitId ?? null;
  });
}

export function applyEmbarkOrdersForPlayer(orders: EmbarkOrder[], playerId: string): void {
  if (orders.length <= 0) return;
  for (const order of orders) {
    const land = dbGetOne<{ id: string; player: string; unitType: string; h3Index: string }>(
      'SELECT id, player, unit_type AS unitType, h3_index AS h3Index FROM units WHERE id = ?',
      [order.unitId]
    );
    const naval = dbGetOne<{ id: string; player: string; unitType: string; h3Index: string }>(
      'SELECT id, player, unit_type AS unitType, h3_index AS h3Index FROM units WHERE id = ?',
      [order.navalUnitId]
    );
    if (!land || !naval) continue;
    if (land.player !== playerId || naval.player !== playerId) continue;
    if (!(land.unitType === 'infantry' || land.unitType === 'armor') || naval.unitType !== 'naval') continue;
    if (land.h3Index !== naval.h3Index) continue;
    if (!canPlayerEmbarkFromHex(land.h3Index, playerId)) continue;

    const existingCargo = dbGetAll<{ unitType: string }>(
      `SELECT lu.unit_type AS unitType
       FROM unit_transport_assignments uta
       JOIN units lu ON lu.id = uta.land_unit_id
       WHERE uta.naval_unit_id = ?
         AND uta.land_unit_id != ?`,
      [order.navalUnitId, order.unitId]
    );
    const existingArmor = existingCargo.some((cargo) => cargo.unitType === 'armor');
    const existingInfantryCount = existingCargo.filter((cargo) => cargo.unitType === 'infantry').length;
    if (land.unitType === 'armor' && existingCargo.length > 0) continue;
    if (land.unitType === 'infantry' && (existingArmor || existingInfantryCount >= 2)) continue;

    dbRun(
      'INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)',
      [order.unitId, order.navalUnitId]
    );
  }
}

/**
 * Defines the `deleteTransportAssignmentsForRemovedUnits` function shape (export function deleteTransportAssignmentsForRemovedUnits(unitIds: string[]): void).

 * Purpose: Supports maintainability by documenting why `deleteTransportAssignmentsForRemovedUnits` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function deleteTransportAssignmentsForRemovedUnits(unitIds: string[]): void {
  if (unitIds.length <= 0) return;
  const placeholders = unitIds.map(() => '?').join(', ');
  dbRun(
    `DELETE FROM unit_transport_assignments
     WHERE land_unit_id IN (${placeholders}) OR naval_unit_id IN (${placeholders})`,
    [...unitIds, ...unitIds]
  );
}

/**
 * Applies sealift transport cleanup after strategic unit rows are deleted from combat (ranged, melee, or tactical parent deletes).
 *
 * Purpose: Centralizes the paired `applyTransportLossForRemovedNavalUnits` + `deleteTransportAssignmentsForRemovedUnits` sequence used by Ready resolution and tactical DB parity.
 * When to use: After callers issue `DELETE FROM units` for every id in `removedUnitIds`, passing the same units as `CombatUnit` rows captured before deletion.
 * Expected outcome: Returns any extra land units removed because a deleted naval carrier was at sea with embarked cargo.
 * Exceptions: None; delegates to existing helpers without additional validation.
 */
export function applyTransportOutcomeForRemovedStrategicUnits(
  removedUnitIds: string[],
  removedUnits: CombatUnit[]
): CombatUnit[] {
  logDebug('applyTransportOutcomeForRemovedStrategicUnits', {
    removedUnitCount: removedUnitIds.length,
    removedCombatRowCount: removedUnits.length,
  });
  const transportLosses = applyTransportLossForRemovedNavalUnits(removedUnits);
  deleteTransportAssignmentsForRemovedUnits(removedUnitIds);
  if (transportLosses.length > 0) {
    deleteTransportAssignmentsForRemovedUnits(transportLosses.map((unit) => unit.id));
  }
  return transportLosses;
}

/**
 * Deletes one strategic `units` parent row and runs the standard transport follow-up (naval sink / assignment cleanup).
 *
 * Purpose: Lets tactical air-vs-units resolution mirror strategic strike DB effects without duplicating transport edge-case logic at each callsite.
 * When to use: When a tactical strike eliminates an entire strategic parent stack identified by `parentUnitId` and the row may still exist in SQLite.
 * Expected outcome: Row removed when present; transport tables stay consistent with `applyTransportOutcomeForRemovedStrategicUnits`.
 * Exceptions: None; no-op when the parent row is already absent.
 */
export function deleteStrategicParentUnitAndApplyTransportOutcome(parentUnitId: string): void {
  logDebug('deleteStrategicParentUnitAndApplyTransportOutcome', { parentUnitId });
  const row = dbGetOne<{
    id: string;
    player: string;
    unitType: string;
    h3Index: string;
    displayOrder: number | null;
  }>(
    'SELECT id, player, unit_type AS unitType, h3_index AS h3Index, display_order AS displayOrder FROM units WHERE id = ?',
    [parentUnitId]
  );
  if (!row) return;
  const cu: CombatUnit = {
    id: row.id,
    player: row.player,
    unitType: row.unitType,
    h3Index: row.h3Index,
    displayOrder: row.displayOrder ?? undefined,
  };
  dbRun('DELETE FROM units WHERE id = ?', [parentUnitId]);
  applyTransportOutcomeForRemovedStrategicUnits([parentUnitId], [cu]);
}

/**
 * Defines the `applyTransportLossForRemovedNavalUnits` function shape (export function applyTransportLossForRemovedNavalUnits(removedUnits: CombatUnit[]): CombatUnit[]).

 * Purpose: Supports maintainability by documenting why `applyTransportLossForRemovedNavalUnits` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function applyTransportLossForRemovedNavalUnits(removedUnits: CombatUnit[]): CombatUnit[] {
  const removedCargo: CombatUnit[] = [];
  const removedNaval = removedUnits.filter((unit) => unit.unitType === 'naval');
  for (const naval of removedNaval) {
    const assignments = dbGetAll<{ id: string; player: string; unitType: string; h3Index: string; displayOrder: number | null }>(
      `SELECT lu.id AS id,
              lu.player AS player,
              lu.unit_type AS unitType,
              lu.h3_index AS h3Index,
              lu.display_order AS displayOrder
       FROM unit_transport_assignments uta
       JOIN units lu ON lu.id = uta.land_unit_id
       WHERE uta.naval_unit_id = ?`,
      [naval.id]
    );
    if (assignments.length <= 0) continue;
    const terrain = dbGetOne<{ terrain: string }>('SELECT terrain FROM hexes WHERE h3_index = ?', [naval.h3Index])?.terrain;
    if (terrain === 'water') {
      for (const land of assignments) {
        dbRun('DELETE FROM units WHERE id = ?', [land.id]);
        removedCargo.push({
          id: land.id,
          player: land.player,
          unitType: land.unitType,
          h3Index: land.h3Index,
          displayOrder: typeof land.displayOrder === 'number' ? land.displayOrder : undefined,
        });
      }
      dbRun('DELETE FROM unit_transport_assignments WHERE naval_unit_id = ?', [naval.id]);
      continue;
    }
    dbRun('DELETE FROM unit_transport_assignments WHERE naval_unit_id = ?', [naval.id]);
  }
  return removedCargo;
}
