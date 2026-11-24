/**
 * The stack popup's sealift rows for the human, and its slot edits.
 *
 * Purpose: Reads who is aboard what at a hex and writes the human's slot changes to `unit_transport_assignments`.
 * When to use: Stack popup IPC, strategic and in a battle.
 * Expected outcome: A refreshed `SealiftStackState` after each accepted edit.
 * Exceptions: None.
 */
import type {
  SealiftLandUnitOption,
  SealiftSlotEdit,
  SealiftSlotEditResult,
  SealiftStackState,
} from '../../shared/ipcTypes';
import { sealiftRowCargoIds } from '../../shared/sealiftStackState';
import { dbGetAll, dbGetOne, dbRun, isDbReady } from '../gameDb';
import { logDebug } from '../logger';
import { compareCodeUnits } from '../../shared/codeUnitOrder';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { isLandUnitType } from '../../shared/landUnitType';
import {
  applySealiftSlotEdit,
  buildCargoByCarrierId,
  buildSealiftNavalRows,
  buildSealiftStackState,
  normalizeCarrierCargo,
  type CarrierCargoQuery,
  type SealiftSlotAssignmentRow,
} from './sealiftSlotAssignment';
import {
  canManualDebarkFromHex,
  canPlayerEmbarkFromHex,
  getSealiftStackContextModeForHex,
} from './sealiftHexEligibility';

/**
 * One unit row read at the stack's hex.
 *
 * Purpose: The stack builders need only the id, owner, type, and hex of each unit there.
 * When to use: `getUnitsAtHex` and the helpers that filter its rows.
 * Expected outcome: `unitType` is a raw unit type string and `player` a seat id.
 * Exceptions: None.
 */
type UnitRow = Record<'id' | 'player' | 'unitType' | 'h3Index', string>;

/**
 * One land-to-carrier transport assignment read at the stack's hex.
 *
 * Purpose: Lets the cargo builders group assignments by carrier.
 * When to use: `loadAssignmentsAtHex` and `readSealiftStackState`.
 * Expected outcome: `landUnitType` is infantry or armor; the ids name the land unit and its carrier.
 * Exceptions: None.
 */
type AssignmentRow = SealiftSlotAssignmentRow;

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
    .sort(compareCodeUnits);
}

/**
 * Defines the `getHumanLandOptions` function shape (function getHumanLandOptions(unitsAtHex: UnitRow[]): SealiftLandUnitOption[]).

 * Purpose: Supports maintainability by documenting why `getHumanLandOptions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getHumanLandOptions(unitsAtHex: UnitRow[]): SealiftLandUnitOption[] {
  const land = unitsAtHex.filter((unit) => unit.player === HUMAN_SEAT_ID && (isLandUnitType(unit.unitType)));
  return land
    .map((unit) => ({ unitId: unit.id, unitType: unit.unitType as 'infantry' | 'armor' }))
    .sort((a, b) => {
      if (a.unitType !== b.unitType) return a.unitType === 'armor' ? -1 : 1;
      return a.unitId.localeCompare(b.unitId);
    });
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
 * Stores a stack's cargo after an accepted slot edit.
 *
 * Purpose: Replaces every assignment of the stack's land units with the normalized cargo of each carrier.
 * When to use: `executeSealiftSlotUpdate`, once the edit is accepted.
 * Expected outcome: One `unit_transport_assignments` row per id in `cargoByCarrierId`. A land unit in `landOptions` that is in no carrier's list is left debarked. Stale rows whose carrier is on the hex but whose land unit is not are removed.
 * Exceptions: None.
 */
function writeAssignmentsForHex(args: {
  /**
   * The stack's hex.
   *
   * Contract: An H3 index on the strategic map.
   * When to use: Scoping the stale-row cleanup.
   * Expected outcome: Only carriers and land units on this hex are touched by the cleanup.
   * Exceptions: None.
   */
  h3Index: string;
  /**
   * The land units the stack may place.
   *
   * Contract: The human's land units on the hex, from `getHumanLandOptions`.
   * When to use: Clearing old assignments before the new cargo is written.
   * Expected outcome: Every unit listed loses its old assignment; units outside the list keep theirs.
   * Exceptions: None.
   */
  landOptions: SealiftLandUnitOption[];
  /**
   * The ids to store aboard each carrier.
   *
   * Contract: Normalized cargo: each list fits its carrier's slots and holds only ids from `landOptions`.
   * When to use: Writing the new assignments.
   * Expected outcome: One assignment row per id, keyed by the carrier id.
   * Exceptions: None.
   */
  cargoByCarrierId: ReadonlyMap<string, readonly string[]>;
}): void {
  const { h3Index, landOptions, cargoByCarrierId } = args;
  const landIds = landOptions.map((option) => option.unitId);
  if (landIds.length > 0) {
    const placeholders = landIds.map(() => '?').join(', ');
    dbRun(`DELETE FROM unit_transport_assignments WHERE land_unit_id IN (${placeholders})`, landIds);
  }
  for (const [navalUnitId, ids] of cargoByCarrierId.entries()) {
    for (const landUnitId of ids) {
      dbRun(
        'INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)',
        [landUnitId, navalUnitId]
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
 * Reads the strategic sealift popup state for one hex.
 *
 * Purpose: Lays out each human ship and air unit on the hex as cargo slots the stack popup can edit.
 * When to use: `getSealiftStackState` and after every accepted slot edit.
 * Expected outcome: Ship rows come before air rows. Each row has `NAVAL_CARGO_SLOTS` or `AIR_CARGO_SLOTS` slots, filled from the stored assignments after `normalizeCarrierCargo` drops any that no longer fit. Air units take infantry only, and with no ship on the hex the land options are infantry only.
 * Exceptions: Propagates SQLite errors.
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
  const carrierTypeById = new Map<string, string>([
    ...navalIds.map((id) => [id, 'naval'] as const),
    ...airIds.map((id) => [id, 'air'] as const),
  ]);
  const cargo: CarrierCargoQuery = {
    carrierIds,
    carrierTypeById,
    cargoByCarrierId: normalizeCarrierCargo({
      carrierIds,
      carrierTypeById,
      cargoByCarrierId: buildCargoByCarrierId({ carrierIds, assignments }),
      landTypeById,
    }),
    landTypeById,
  };
  const shipRows = buildSealiftNavalRows({
    cargo: { ...cargo, carrierIds: navalIds },
    contextMode,
    debarkAllowed: canManualDebarkFromHex(h3Index, HUMAN_SEAT_ID),
  });
  const airRows = buildSealiftNavalRows({
    cargo: { ...cargo, carrierIds: airIds },
    contextMode: 'coastal_port',
    debarkAllowed: true,
  });
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
export function executeSealiftSlotUpdate(edit: SealiftSlotEdit): SealiftSlotEditResult {
  logDebug('sealift executeSealiftSlotUpdate', {
    h3Index: edit.h3Index,
    navalUnitId: edit.navalUnitId,
    slotIndex: edit.slotIndex,
    hasLand: edit.landUnitId != null,
  });
  if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
  const state = readSealiftStackState(edit.h3Index);
  const carrierRow = state.navalRows.find((row) => row.navalUnitId === edit.navalUnitId);
  if (!carrierRow) return { success: false, reason: 'Selected naval unit is not in this stack.' };
  const carrierIsAir = carrierRow.carrierUnitType === 'air';
  const isDebark = edit.landUnitId === null;
  if (isDebark) {
    if (!carrierIsAir && !canManualDebarkFromHex(edit.h3Index, HUMAN_SEAT_ID)) {
      return { success: false, reason: 'Debark is not available at this location.' };
    }
  } else if (!carrierIsAir && !canPlayerEmbarkFromHex(edit.h3Index, HUMAN_SEAT_ID)) {
    const atSea = state.contextMode === 'water';
    return {
      success: false,
      reason: atSea ? 'Sealift assignments cannot be changed while at sea.' : 'Embarkation requires a valid port.',
    };
  }
  if (carrierIsAir && edit.landUnitId) {
    const landType = state.landOptions.find((option) => option.unitId === edit.landUnitId)?.unitType
      ?? dbGetOne<{ unitType: string }>('SELECT unit_type AS unitType FROM units WHERE id = ?', [edit.landUnitId])?.unitType;
    if (landType !== 'infantry') return { success: false, reason: 'An air unit can carry only infantry.' };
  }
  if (edit.landUnitId && !state.landOptions.some((option) => option.unitId === edit.landUnitId)) {
    return { success: false, reason: 'Selected land unit is not available for this stack.' };
  }
  const outcome = applySealiftSlotEdit({
    edit,
    cargo: {
      carrierIds: state.navalRows.map((row) => row.navalUnitId),
      carrierTypeById: new Map(state.navalRows.map((row) => [row.navalUnitId, row.carrierUnitType] as const)),
      cargoByCarrierId: new Map(state.navalRows.map((row) => [row.navalUnitId, sealiftRowCargoIds(row)] as const)),
      landTypeById: new Map(state.landOptions.map((option) => [option.unitId, option.unitType] as const)),
    },
  });
  if (!outcome.ok) return { success: false, reason: outcome.reason };
  writeAssignmentsForHex({
    h3Index: edit.h3Index,
    landOptions: state.landOptions,
    cargoByCarrierId: outcome.cargoByCarrierId,
  });
  return { success: true, state: readSealiftStackState(edit.h3Index) };
}
