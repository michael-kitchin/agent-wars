import type { EmbarkOrder, SealiftContextMode, SealiftLandUnitOption, SealiftStackState } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { dbGetAll, dbGetOne, dbRun, isDbReady, listUnitsForSnapshot } from '../gameDb';
import { readHexEmbarkFacts } from '../hexEmbarkFacts';
import { describeDestroyedBattleParents } from '../tacticalBattle/destroyedBattleParents';
import type { DestroyedBattleParent } from '../../shared/destroyedBattleParent';
import type { CombatUnit } from '../combatUnitTypes';
import { logDebug, logTrace } from '../logger';
import { rememberStrategicHexBeforeMove } from '../strategicUnitPreviousHex';
import { normalizeMovementTerrain } from '../movementTerrain';
import { airliftEmbarkAllowed } from './airlift';
import { canEmbarkAtHex, canManualDebarkAtHex } from '../../shared/sealiftEmbarkEligibility';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import {
  buildSealiftNavalRows,
  buildSealiftSlotsByNavalId,
  buildSealiftStackState,
  normalizeSealiftSlots,
  type SealiftSlotPair,
} from './sealiftSlotAssignment';

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

type SealiftSlots = SealiftSlotPair;

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
   * Native hex terrain bucket before kind normalization.
   *
   * Contract: Must not be seaport-promoted coastal.
   * When to use: Sealift eligibility together with `terrainKind` and `seaportCount`.
   * Expected outcome: Distinguishes land seaports from native coastal.
   * Exceptions: None.
   */
nativeTerrain: string;
    /**
   * Optional pipeline terrain kind.
   *
   * Contract: `coastal` is native coastal embark terrain.
   * When to use: Pass `hexes.terrain_kind`.
   * Expected outcome: Combined with `nativeTerrain` for transit vs land seaport.
   * Exceptions: None.
   */
terrainKind?: string;
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
    .filter((unit) => unit.player === HUMAN_SEAT_ID && unit.unitType === 'naval')
    .map((unit) => unit.id)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Human air units on this hex that can show an airlift row.
 *
 * Purpose: An empty air unit appears only when infantry can board. An air unit that already has cargo always appears.
 * When to use: `readSealiftStackState`.
 * Expected outcome: Sorted air unit ids. Armor alone adds none.
 * Exceptions: None.
 */
function airliftRowIds(unitsAtHex: UnitRow[], assignments: readonly { navalUnitId: string }[]): string[] {
  const infantryPresent = unitsAtHex.some(
    (unit) => unit.player === HUMAN_SEAT_ID && unit.unitType === 'infantry'
  );
  return unitsAtHex
    .filter((unit) => unit.player === HUMAN_SEAT_ID && unit.unitType === 'air')
    .filter((unit) => infantryPresent || assignments.some((row) => row.navalUnitId === unit.id))
    .map((unit) => unit.id)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/**
 * Defines the `getHumanLandOptions` function shape (function getHumanLandOptions(unitsAtHex: UnitRow[]): SealiftLandUnitOption[]).

 * Purpose: Supports maintainability by documenting why `getHumanLandOptions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getHumanLandOptions(unitsAtHex: UnitRow[]): SealiftLandUnitOption[] {
  const land = unitsAtHex.filter((unit) => unit.player === HUMAN_SEAT_ID && (unit.unitType === 'infantry' || unit.unitType === 'armor'));
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
  const facts = readHexEmbarkFacts(h3Index);
  if (!facts) return null;
  const normalizedMovementTerrain = normalizeMovementTerrain({
    h3Index,
    terrain: facts.nativeTerrain,
    terrainKind: facts.terrainKind,
  });
  return { normalizedMovementTerrain, ...facts };
}

/**
 * Returns whether the acting player may embark cargo at this hex.
 *
 * Purpose: Shared predicate for stack context mode, slot IPC, and LLM `applyEmbarkOrdersForPlayer`.
 * When to use: Before treating a hex as a valid embark port.
 * Expected outcome: True for native coastal, land seaports, and water seaports this player controls.
 * Exceptions: False when the hex is missing from `hexes`.
 */
function canPlayerEmbarkFromHex(h3Index: string, playerId: string): boolean {
  const context = getHexEmbarkContext(h3Index);
  if (!context) return false;
  return canEmbarkAtHex({
    nativeTerrain: context.nativeTerrain,
    terrainKind: context.terrainKind,
    hasSeaport: context.seaportCount > 0,
    hexControlledByPlayer: context.controllerPlayerId === playerId,
  });
}

/**
 * Returns whether a player may manually debark cargo at a hex (stack popup debark button).
 *
 * Purpose: Central debark eligibility for UI and `executeSealiftSlotUpdate`; coastal hexes always allow debark, water seaports allow debark when controlled.
 * When to use: Before enabling debark controls or accepting debark IPC (`landUnitId === null`).
 * Expected outcome: True for coastal stacks and controlled water seaports; false for open ocean.
 * Exceptions: None.
 */
export function canManualDebarkFromHex(h3Index: string, playerId: string): boolean {
  logTrace('sealift canManualDebarkFromHex', { h3Index, playerId });
  const context = getHexEmbarkContext(h3Index);
  if (!context) return false;
  return canManualDebarkAtHex({
    nativeTerrain: context.nativeTerrain,
    terrainKind: context.terrainKind,
    hasSeaport: context.seaportCount > 0,
    hexControlledByPlayer: context.controllerPlayerId === playerId,
  });
}

/**
 * Classifies a hex for the human stack sealift UI.
 *
 * Purpose: Embark dropdowns enable only where the human may embark; water means no valid embark on that hex.
 * When to use: `readSealiftStackState` and tactical stack state that reuses this classifier.
 * Expected outcome: `coastal_port` for native coastal, land seaports, and controlled water seaports; `water` for open ocean and enemy or uncontrolled water seaports; `coastal_no_port` when movement terrain is coastal but embark is not allowed; `unsupported` when the hex is missing or inland without a seaport.
 * Exceptions: None.
 */
export function getSealiftStackContextModeForHex(h3Index: string): SealiftContextMode {
  logTrace('sealift getSealiftStackContextModeForHex', { h3Index });
  const context = getHexEmbarkContext(h3Index);
  if (!context) return 'unsupported';
  if (canPlayerEmbarkFromHex(h3Index, HUMAN_SEAT_ID)) return 'coastal_port';
  if (context.normalizedMovementTerrain === 'water') return 'water';
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
       AND lu.player = ?
       AND nu.player = ?
       AND nu.unit_type IN ('naval', 'air')
       AND lu.unit_type IN ('infantry', 'armor')`,
    [h3Index, h3Index, HUMAN_SEAT_ID, HUMAN_SEAT_ID]
  );
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
       SELECT id FROM units WHERE h3_index = ? AND unit_type IN ('naval', 'air')
     ) AND land_unit_id NOT IN (
       SELECT id FROM units WHERE h3_index = ? AND unit_type IN ('infantry', 'armor')
     )`,
    [h3Index, h3Index]
  );
}

/**
 * Defines the `readSealiftStackState` function shape (export function readSealiftStackState(h3Index: string): SealiftStackState).

 * Purpose: Supports maintainability by documenting why `readSealiftStackState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function readSealiftStackState(h3Index: string): SealiftStackState {
  const unitsAtHex = getUnitsAtHex(h3Index);
  const contextMode = getSealiftStackContextModeForHex(h3Index);
  const navalIds = getHumanNavalIds(unitsAtHex);
  const assignments = loadAssignmentsAtHex(h3Index);
  const airIds = airliftRowIds(unitsAtHex, assignments);
  const carrierIds = [...navalIds, ...airIds];
  const landOptions = navalIds.length > 0
    ? getHumanLandOptions(unitsAtHex)
    : getHumanLandOptions(unitsAtHex).filter((option) => option.unitType === 'infantry');
  const landTypeById = new Map(landOptions.map((option) => [option.unitId, option.unitType] as const));
  const slotsByNavalId = buildSealiftSlotsByNavalId(carrierIds, assignments);
  normalizeSealiftSlots(carrierIds, slotsByNavalId, landTypeById);
  const shipRows = buildSealiftNavalRows({
    navalIds,
    slotsByNavalId,
    landTypeById,
    contextMode,
    debarkAllowed: canManualDebarkFromHex(h3Index, HUMAN_SEAT_ID),
  });
  const airRows = buildSealiftNavalRows({
    navalIds: airIds,
    slotsByNavalId,
    landTypeById,
    contextMode: 'coastal_port',
    debarkAllowed: true,
  }).map((row) => ({
    ...row,
    slot2UnitId: null,
    slot2Disabled: true,
    debarkSlot2Enabled: false,
  }));
  const navalRows = [...shipRows, ...airRows];
  const hasEmbarkedUnitsInStack = assignments.length > 0;
  const debarkAllowedAtHex = canManualDebarkFromHex(h3Index, HUMAN_SEAT_ID);
  return buildSealiftStackState({
    h3Index,
    contextMode,
    navalRows,
    landOptions,
    hasEmbarkedUnitsInStack,
    debarkAllowedAtHex,
  });
}

/**
 * Applies one human sealift slot edit (embark, reassign, or debark) at a strategic hex.
 *
 * Purpose: Stack popup IPC writes `unit_transport_assignments` after eligibility and capacity checks.
 * When to use: Human sealift slot IPC only; LLM cargo uses `applyEmbarkOrdersForPlayer`.
 * Expected outcome: Success with refreshed stack state, or a reason when the hex, units, or slot rules forbid the edit. Embark requires `canPlayerEmbarkFromHex`; debark requires `canManualDebarkFromHex`.
 * Exceptions: None; returns `success: false` instead of throwing.
 */
export function executeSealiftSlotUpdate(args: {
  h3Index: string;
  navalUnitId: string;
  slotIndex: 1 | 2;
  landUnitId: string | null;
}): { success: boolean; reason?: string; state?: SealiftStackState } {
  logDebug('sealift executeSealiftSlotUpdate', {
    h3Index: args.h3Index,
    navalUnitId: args.navalUnitId,
    slotIndex: args.slotIndex,
    hasLand: args.landUnitId != null,
  });
  if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
  const carrier = dbGetOne<{ unitType: string }>(
    'SELECT unit_type AS unitType FROM units WHERE id = ?',
    [args.navalUnitId]
  );
  const carrierIsAir = carrier?.unitType === 'air';
  if (carrierIsAir && args.slotIndex === 2) {
    return { success: false, reason: 'An air unit has only one infantry slot.' };
  }
  const state = readSealiftStackState(args.h3Index);
  const navalIds = state.navalRows.map((row) => row.navalUnitId);
  if (!navalIds.includes(args.navalUnitId)) return { success: false, reason: 'Selected naval unit is not in this stack.' };
  const isDebark = args.landUnitId === null;
  if (isDebark) {
    if (!carrierIsAir && !canManualDebarkFromHex(args.h3Index, HUMAN_SEAT_ID)) {
      return { success: false, reason: 'Debark is not available at this location.' };
    }
  } else if (!carrierIsAir && !canPlayerEmbarkFromHex(args.h3Index, HUMAN_SEAT_ID)) {
    const atSea = state.contextMode === 'water';
    return {
      success: false,
      reason: atSea ? 'Sealift assignments cannot be changed while at sea.' : 'Embarkation requires a valid port.',
    };
  }
  if (carrierIsAir && args.landUnitId) {
    const landType = state.landOptions.find((option) => option.unitId === args.landUnitId)?.unitType
      ?? dbGetOne<{ unitType: string }>('SELECT unit_type AS unitType FROM units WHERE id = ?', [args.landUnitId])?.unitType;
    if (landType !== 'infantry') return { success: false, reason: 'An air unit can carry only infantry.' };
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

  normalizeSealiftSlots(navalIds, slotsByNavalId, landTypeById);
  writeAssignmentsForHex(args.h3Index, state.landOptions, slotsByNavalId);
  return { success: true, state: readSealiftStackState(args.h3Index) };
}

/**
 * Defines the `getEmbarkedNavalForLandUnit` function shape (export function getEmbarkedNavalForLandUnit(unitId: string): string | null).

 * Purpose: Supports maintainability by documenting why `getEmbarkedNavalForLandUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getEmbarkedNavalForLandUnit(unitId: string): string | null {
  logTrace('sealift getEmbarkedNavalForLandUnit', { unitId });
  const row = dbGetOne<{ navalUnitId: string }>(
    'SELECT naval_unit_id AS navalUnitId FROM unit_transport_assignments WHERE land_unit_id = ?',
    [unitId]
  );
  return row?.navalUnitId ?? null;
}

/**
 * Returns whether a land unit currently has an active sealift assignment row.
 *
 * Purpose: Shared predicate for movement validation, Ready filtering, and selection guards.
 * When to use: Before accepting independent march orders for infantry or armor.
 * Expected outcome: True when `unit_transport_assignments` contains the unit id.
 * Exceptions: None.
 */
export function isEmbarkedLandUnit(unitId: string): boolean {
  logTrace('sealift isEmbarkedLandUnit', { unitId });
  return getEmbarkedNavalForLandUnit(unitId) !== null;
}

/**
 * Returns the naval carrier hex for an embarked land unit, or null when not embarked.
 *
 * Purpose: Supports stay-aboard movement validation and Ready pipeline skip logic.
 * When to use: When comparing a movement destination to the carrier position.
 * Expected outcome: Carrier `h3_index` when assigned; otherwise null.
 * Exceptions: None.
 */
export function getEmbarkedNavalH3IndexForLandUnit(unitId: string): string | null {
  logTrace('sealift getEmbarkedNavalH3IndexForLandUnit', { unitId });
  const row = dbGetOne<{ navalH3Index: string }>(
    `SELECT nu.h3_index AS navalH3Index
     FROM unit_transport_assignments uta
     JOIN units nu ON nu.id = uta.naval_unit_id
     WHERE uta.land_unit_id = ?`,
    [unitId]
  );
  return row?.navalH3Index ?? null;
}

/**
 * Clears the sealift assignment for one land unit without moving it (manual or LLM debark).
 *
 * Purpose: Single debark primitive for stack popup, LLM `disembark` ingest, and tests.
 * When to use: When cargo should become co-located independent land at the current hex.
 * Expected outcome: Assignment row removed; land unit row unchanged.
 * Exceptions: None.
 */
export function clearEmbarkAssignmentForLandUnit(unitId: string): void {
  logDebug('sealift clearEmbarkAssignmentForLandUnit', { unitId });
  dbRun('DELETE FROM unit_transport_assignments WHERE land_unit_id = ?', [unitId]);
}

/**
 * Lists land unit ids with active sealift assignments co-located at a hex.
 *
 * Purpose: Stack popup non-selectable filtering when sealift UI is loading or absent.
 * When to use: Renderer stack callout after fetching sealift state or as fallback from game snapshot.
 * Expected outcome: Distinct human land unit ids assigned to naval units at `h3Index`.
 * Exceptions: None.
 */
export function getEmbarkedLandUnitIdsAtHex(h3Index: string): string[] {
  logTrace('sealift getEmbarkedLandUnitIdsAtHex', { h3Index });
  const rows = dbGetAll<{ landUnitId: string }>(
    `SELECT uta.land_unit_id AS landUnitId
     FROM unit_transport_assignments uta
     JOIN units lu ON lu.id = uta.land_unit_id
     JOIN units nu ON nu.id = uta.naval_unit_id
     WHERE lu.h3_index = ?
       AND nu.h3_index = ?`,
    [h3Index, h3Index]
  );
  return rows.map((row) => row.landUnitId);
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
 * Clears sealift assignment when a non-human land unit receives an independent movement order off its carrier.
 *
 * Purpose: Commanders auto-debark before marching. The human must debark manually instead.
 * When to use: Ready pipeline immediately before applying movement.
 * Expected outcome: Assignment row removed when cargo of any owner other than the human would move independently.
 * Exceptions: None. Humans, units that are not embarked, and stay-aboard orders are unchanged.
 */
export function autoDebarkNonHumanLandUnitIfMovingIndependently(unitId: string, toH3Index: string): void {
  const row = dbGetOne<{ player: string }>('SELECT player FROM units WHERE id = ?', [unitId]);
  if (!row || row.player === HUMAN_SEAT_ID) return;
  if (!isEmbarkedLandUnit(unitId)) return;
  const carrierHex = getEmbarkedNavalH3IndexForLandUnit(unitId);
  if (!carrierHex || toH3Index === carrierHex) return;
  logDebug('sealift autoDebarkNonHumanLandUnitIfMovingIndependently', { unitId, toH3Index, carrierHex, player: row.player });
  clearEmbarkAssignmentForLandUnit(unitId);
}

/**
 * Returns whether an independent movement order for an embarked human land unit should be skipped at Ready resolution.
 *
 * Purpose: Human cargo cannot march independently until manual debark. Other owners are handled by `autoDebarkNonHumanLandUnitIfMovingIndependently`.
 * When to use: Ready pipeline after opponent auto-debark, before applying `UPDATE units SET h3_index` for each movement order.
 * Expected outcome: True when human cargo would move independently off its carrier; false for opponents, stay-aboard no-ops, and non-embarked units.
 * Exceptions: None.
 */
export function shouldSkipEmbarkedLandIndependentMove(unitId: string, toH3Index: string): boolean {
  const row = dbGetOne<{ player: string }>('SELECT player FROM units WHERE id = ?', [unitId]);
  if (row?.player !== HUMAN_SEAT_ID) return false;
  if (!isEmbarkedLandUnit(unitId)) return false;
  const carrierHex = getEmbarkedNavalH3IndexForLandUnit(unitId);
  if (!carrierHex) return true;
  if (toH3Index === carrierHex) return false;
  logDebug('sealift shouldSkipEmbarkedLandIndependentMove', { unitId, toH3Index, carrierHex });
  return true;
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
 * Writes human sealift rows for tactical sub-unit embark orders using strategic parent ids (no tactical hex co-location check).
 *
 * Purpose: Mirrors strategic slot assignment during tactical Ready commits while parent `units.h3_index` may still anchor at strategic; tactical validation already ensured legality on the snapshot.
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
    if (land.player !== HUMAN_SEAT_ID || naval.player !== HUMAN_SEAT_ID) continue;
    if (naval.unitType === 'air') {
      if (land.unitType !== 'infantry') {
        logDebug('applyTacticalEmbarkCommittedOrdersToStrategicDb skip non-infantry on air', { landParent });
        continue;
      }
      const already = dbGetOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM unit_transport_assignments uta
         JOIN units lu ON lu.id = uta.land_unit_id
         WHERE uta.naval_unit_id = ? AND uta.land_unit_id != ? AND lu.unit_type = 'infantry'`,
        [navalParent, landParent]
      );
      if ((already?.count ?? 0) >= 1) {
        logDebug('applyTacticalEmbarkCommittedOrdersToStrategicDb skip extra infantry on air', { navalParent, landParent });
        continue;
      }
    } else if (!((land.unitType === 'infantry' || land.unitType === 'armor') && naval.unitType === 'naval')) {
      continue;
    }
    dbRun('DELETE FROM unit_transport_assignments WHERE land_unit_id = ?', [landParent]);
    dbRun(
      'INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)',
      [landParent, navalParent]
    );
  }
}

/**
 * Clears strategic sealift rows for all human land parents with infantry/armor sub-units at a tactical hex, then applies sub-unit embark pairs.
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
    if (u.h3Index !== args.h3Index || u.player !== HUMAN_SEAT_ID) continue;
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

/**
 * Stores embark orders for one owner when the land unit and the ship already share a hex.
 *
 * Purpose: Ready applies each non-human owner's embark list. The human embarks from the sealift popup, not from this call.
 * When to use: Once per owner, in seat order, with Neutral last.
 * Expected outcome: A legal pair is stored in `unit_transport_assignments`. A pair that fails a check is skipped.
 * Exceptions: Propagates SQLite errors.
 */
export function applyEmbarkOrdersForPlayer(orders: EmbarkOrder[], playerId: string): void {
  logDebug('sealift applyEmbarkOrdersForPlayer', { playerId, orderCount: orders.length });
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
    if (land.h3Index !== naval.h3Index) continue;
    const existingCargo = dbGetAll<{ unitType: string }>(
      `SELECT lu.unit_type AS unitType
       FROM unit_transport_assignments uta
       JOIN units lu ON lu.id = uta.land_unit_id
       WHERE uta.naval_unit_id = ?
         AND uta.land_unit_id != ?`,
      [order.navalUnitId, order.unitId]
    );
    if (naval.unitType === 'air') {
      if (!airliftEmbarkAllowed({
        landPlayer: land.player,
        landUnitType: land.unitType,
        landH3Index: land.h3Index,
        carrierPlayer: naval.player,
        carrierUnitType: naval.unitType,
        carrierH3Index: naval.h3Index,
        embarkedLandUnitTypes: existingCargo.map((cargo) => cargo.unitType),
      })) continue;
    } else {
      if (!(land.unitType === 'infantry' || land.unitType === 'armor') || naval.unitType !== 'naval') continue;
      if (!canPlayerEmbarkFromHex(land.h3Index, playerId)) continue;
      const existingArmor = existingCargo.some((cargo) => cargo.unitType === 'armor');
      const existingInfantryCount = existingCargo.filter((cargo) => cargo.unitType === 'infantry').length;
      if (land.unitType === 'armor' && existingCargo.length > 0) continue;
      if (land.unitType === 'infantry' && (existingArmor || existingInfantryCount >= 2)) continue;
    }

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
 * Expected outcome: The parent, and any land unit removed because that parent was a naval carrier, each described from the roster before the delete. An empty list when the parent row is already gone. Transport tables stay consistent with `applyTransportOutcomeForRemovedStrategicUnits`.
 * Exceptions: None. A missing parent deletes nothing more.
 */
export function deleteStrategicParentUnitAndApplyTransportOutcome(parentUnitId: string): DestroyedBattleParent[] {
  logDebug('deleteStrategicParentUnitAndApplyTransportOutcome', { parentUnitId });
  const roster = listUnitsForSnapshot();
  const parent = roster.find((unit) => unit.id === parentUnitId);
  if (!parent) {
    logDebug('deleteStrategicParentUnitAndApplyTransportOutcome missing row', { parentUnitId });
    return [];
  }
  const removed = parent.unitType === 'naval' || parent.unitType === 'air'
    ? [parent, ...roster.filter((unit) => unit.embarkedOnCarrierUnitId === parent.id)]
    : [parent];
  const described = describeDestroyedBattleParents(removed, roster);
  const cu: CombatUnit = {
    id: parent.id,
    player: parent.player,
    unitType: parent.unitType,
    h3Index: parent.h3Index,
    displayOrder: parent.displayOrder,
  };
  dbRun('DELETE FROM units WHERE id = ?', [parentUnitId]);
  applyTransportOutcomeForRemovedStrategicUnits([parentUnitId], [cu]);
  return described;
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
  const removedCarriers = removedUnits.filter((unit) => unit.unitType === 'naval' || unit.unitType === 'air');
  for (const naval of removedCarriers) {
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
  }
  return removedCargo;
}
