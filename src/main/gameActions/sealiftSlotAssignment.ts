import { logDebug, logTrace } from '../logger';
import {
  carrierCarriesType,
  carrierCargoSlots,
  carrierFullReason,
  cargoSlotsUsed,
  layoutCargoSlots,
} from '../../shared/carrierCargoRules';
import type {
  SealiftCargoSlot,
  SealiftContextMode,
  SealiftLandUnitOption,
  SealiftNavalRow,
  SealiftStackState,
} from '../../shared/ipc/sealiftTypes';

/**
 * One land unit currently assigned to a naval carrier for slot reconstruction.
 *
 * Purpose: Lets assignment builders accept strategic DB rows or tactical embark pairs without sharing table types.
 * When to use: Input to `buildCargoByCarrierId`.
 * Expected outcome: `landUnitType` is infantry or armor; ids are the land and naval unit identifiers.
 * Exceptions: None.
 */
export type SealiftSlotAssignmentRow = {
  landUnitId: string;
  navalUnitId: string;
  landUnitType: 'infantry' | 'armor';
};

/**
 * The facts the cargo rules need about a stack's carriers and land units.
 *
 * Purpose: One input for normalizing cargo, applying a slot edit, and building rows.
 * When to use: Strategic stacks (unit ids) and tactical stacks (sub-unit ids).
 * Expected outcome: Plain read-only values.
 * Exceptions: None.
 */
export type CarrierCargoQuery = {
  /**
   * The carriers in stack order.
   *
   * Contract: Unique ids. Order decides which carrier keeps a unit listed on two.
   * When to use: Iterating carriers.
   * Expected outcome: Every key of `cargoByCarrierId` that matters.
   * Exceptions: None.
   */
  readonly carrierIds: readonly string[];
  /**
   * Each carrier's unit type.
   *
   * Contract: `naval` or `air`. A missing id is treated as a carrier with no slots.
   * When to use: Counting slots and checking what a carrier carries.
   * Expected outcome: One entry per carrier id.
   * Exceptions: None.
   */
  readonly carrierTypeById: ReadonlyMap<string, string>;
  /**
   * The land unit ids aboard each carrier.
   *
   * Contract: Not necessarily in layout order. A carrier with no entry holds nothing.
   * When to use: Reading current cargo.
   * Expected outcome: Ids of units that exist in `landTypeById`, after normalizing.
   * Exceptions: None.
   */
  readonly cargoByCarrierId: ReadonlyMap<string, readonly string[]>;
  /**
   * The type of each land unit that may be placed.
   *
   * Contract: `infantry` or `armor`.
   * When to use: Costing and placing cargo.
   * Expected outcome: Every aboard or selectable land unit.
   * Exceptions: None.
   */
  readonly landTypeById: ReadonlyMap<string, 'infantry' | 'armor'>;
};

/**
 * The result of a slot edit.
 *
 * Purpose: Carries the new cargo or the refusal reason.
 * When to use: The return of `applySealiftSlotEdit`.
 * Expected outcome: `ok` with a normalized map, or `ok: false` with a reason sentence.
 * Exceptions: None.
 */
export type SealiftSlotEditOutcome =
  | { readonly ok: true; readonly cargoByCarrierId: Map<string, string[]> }
  | { readonly ok: false; readonly reason: string };

/**
 * Lists a carrier's cargo as typed units.
 *
 * Purpose: `layoutCargoSlots` needs ids with types.
 * When to use: Laying out a carrier's cargo.
 * Expected outcome: One entry per id, with an unknown type as the empty string.
 * Exceptions: None.
 */
function cargoUnits(
  ids: readonly string[],
  landTypeById: ReadonlyMap<string, string>
): { unitId: string; unitType: string }[] {
  return ids.map((unitId) => ({ unitId, unitType: landTypeById.get(unitId) ?? '' }));
}

/**
 * Groups assignment rows by carrier.
 *
 * Purpose: Strategic and tactical readers both start from assignment rows.
 * When to use: Building a `CarrierCargoQuery`.
 * Expected outcome: One entry per carrier id, holding the ids assigned to it. Rows for other carriers are ignored.
 * Exceptions: None.
 */
export function buildCargoByCarrierId(args: {
  readonly carrierIds: readonly string[];
  readonly assignments: readonly SealiftSlotAssignmentRow[];
}): Map<string, string[]> {
  logDebug('buildCargoByCarrierId', { carrierCount: args.carrierIds.length, assignmentCount: args.assignments.length });
  const cargo = new Map<string, string[]>(args.carrierIds.map((id) => [id, []]));
  for (const row of args.assignments) cargo.get(row.navalUnitId)?.push(row.landUnitId);
  return cargo;
}

/**
 * Cleans every carrier's cargo.
 *
 * Purpose: Stored or edited cargo may name a missing unit, a unit on two carriers, or more than a carrier can hold.
 * When to use: After reading assignments and after each edit.
 * Expected outcome: A new map. Per carrier, in `carrierIds` order: ids missing from `landTypeById` are dropped, ids already kept on an earlier carrier are dropped, and the ids `layoutCargoSlots` places are kept in layout order.
 * Exceptions: None. The input is not changed.
 */
export function normalizeCarrierCargo(query: CarrierCargoQuery): Map<string, string[]> {
  logDebug('normalizeCarrierCargo', { carrierCount: query.carrierIds.length });
  const seen = new Set<string>();
  const result = new Map<string, string[]>();
  for (const carrierId of query.carrierIds) {
    const kept: string[] = [];
    for (const unitId of query.cargoByCarrierId.get(carrierId) ?? []) {
      if (!query.landTypeById.has(unitId) || seen.has(unitId)) continue;
      seen.add(unitId);
      kept.push(unitId);
    }
    const positions = layoutCargoSlots({
      carrierUnitType: query.carrierTypeById.get(carrierId) ?? '',
      cargo: cargoUnits(kept, query.landTypeById),
    });
    result.set(carrierId, positions.flatMap((position) => (position.unitId === null ? [] : [position.unitId])));
  }
  return result;
}

/**
 * Applies one slot edit to a stack's cargo.
 *
 * Purpose: One rule for strategic and tactical slot edits: replace a slot's unit, move a unit between carriers, or empty a slot.
 * When to use: After the caller's eligibility checks pass.
 * Expected outcome: The new normalized cargo, or a refusal: `That carrier has only N cargo slots.` for an index outside the carrier's slots, `That slot is filled by the armor in the slot before it.` for a covered slot, `An air unit can carry only infantry.` for armor on an air unit, or `carrierFullReason` when the unit does not fit. Emptying an empty slot changes nothing.
 * Exceptions: None.
 */
export function applySealiftSlotEdit(args: {
  readonly edit: { readonly navalUnitId: string; readonly slotIndex: number; readonly landUnitId: string | null };
  readonly cargo: CarrierCargoQuery;
}): SealiftSlotEditOutcome {
  const { edit, cargo } = args;
  logDebug('applySealiftSlotEdit', { navalUnitId: edit.navalUnitId, slotIndex: edit.slotIndex });
  const type = cargo.carrierTypeById.get(edit.navalUnitId) ?? '';
  const slots = carrierCargoSlots(type);
  if (!Number.isInteger(edit.slotIndex) || edit.slotIndex < 1 || edit.slotIndex > slots) {
    return { ok: false, reason: `That carrier has only ${slots} cargo slots.` };
  }
  const positions = layoutCargoSlots({
    carrierUnitType: type,
    cargo: cargoUnits(cargo.cargoByCarrierId.get(edit.navalUnitId) ?? [], cargo.landTypeById),
  });
  const position = positions[edit.slotIndex - 1];
  if (position?.coveredByUnitId) {
    return { ok: false, reason: 'That slot is filled by the armor in the slot before it.' };
  }
  const landUnitId = edit.landUnitId;
  if (landUnitId !== null && !carrierCarriesType(type, cargo.landTypeById.get(landUnitId) ?? '')) {
    return { ok: false, reason: 'An air unit can carry only infantry.' };
  }
  const next = new Map<string, string[]>();
  for (const carrierId of cargo.carrierIds) {
    next.set(
      carrierId,
      (cargo.cargoByCarrierId.get(carrierId) ?? []).filter((id) => id !== landUnitId)
    );
  }
  const target = (next.get(edit.navalUnitId) ?? []).filter((id) => id !== position?.unitId);
  if (landUnitId !== null) target.push(landUnitId);
  next.set(edit.navalUnitId, target);
  if (landUnitId !== null && cargoSlotsUsed(target.map((id) => cargo.landTypeById.get(id) ?? '')) > slots) {
    return { ok: false, reason: carrierFullReason(type) };
  }
  return { ok: true, cargoByCarrierId: normalizeCarrierCargo({ ...cargo, cargoByCarrierId: next }) };
}

/**
 * Reports whether sealift controls are disabled for a stack context.
 *
 * Purpose: Open water, a coast without a port, and a land seaport with no sea access disable embark controls. A port where boarding is allowed does not.
 * When to use: Naval rows and the stack state share this test.
 * Expected outcome: True for `water`, `coastal_no_port`, and `port_no_sea_access`. False otherwise.
 * Exceptions: None.
 */
function controlsDisabledFor(contextMode: SealiftContextMode): boolean {
  return contextMode === 'water' || contextMode === 'coastal_no_port' || contextMode === 'port_no_sea_access';
}

/**
 * Builds one carrier row per carrier from its cargo.
 *
 * Purpose: The renderer draws every slot of every carrier from these rows.
 * When to use: Strategic and tactical stack state builders.
 * Expected outcome: One row per carrier id, with `carrierCargoSlots` slots in layout order. A slot is disabled when the row's controls are or armor covers it. Debark is enabled when `debarkAllowed` and the slot holds a unit.
 * Exceptions: None.
 */
export function buildSealiftNavalRows(args: {
  readonly cargo: CarrierCargoQuery;
  readonly contextMode: SealiftContextMode;
  readonly debarkAllowed: boolean;
}): SealiftNavalRow[] {
  const { cargo } = args;
  logTrace('sealiftSlotAssignment buildSealiftNavalRows', {
    navalCount: cargo.carrierIds.length,
    contextMode: args.contextMode,
  });
  const controlsDisabled = controlsDisabledFor(args.contextMode);
  return cargo.carrierIds.map((navalUnitId) => {
    const carrierUnitType = cargo.carrierTypeById.get(navalUnitId) === 'air' ? 'air' : 'naval';
    const positions = layoutCargoSlots({
      carrierUnitType,
      cargo: cargoUnits(cargo.cargoByCarrierId.get(navalUnitId) ?? [], cargo.landTypeById),
    });
    const slots: SealiftCargoSlot[] = positions.map((position) => ({
      unitId: position.unitId,
      coveredByUnitId: position.coveredByUnitId,
      disabled: controlsDisabled || position.coveredByUnitId !== null,
      debarkEnabled: args.debarkAllowed && position.unitId !== null,
    }));
    return { navalUnitId, carrierUnitType, slots, controlsDisabled };
  });
}

/**
 * Builds the sealift section of a stack.
 *
 * Purpose: Strategic and tactical callers share the visibility rule and the disabled-control flag.
 * When to use: After naval rows and land options are known for one hex.
 * Expected outcome: The section is shown when a naval unit shares the hex with land, or when cargo is already embarked. `controlsDisabled` follows the context mode.
 * Exceptions: None.
 */
export function buildSealiftStackState(args: {
  readonly h3Index: string;
  readonly contextMode: SealiftContextMode;
  readonly navalRows: readonly SealiftNavalRow[];
  readonly landOptions: readonly SealiftLandUnitOption[];
  readonly hasEmbarkedUnitsInStack: boolean;
  readonly debarkAllowedAtHex: boolean;
}): SealiftStackState {
  logTrace('sealiftSlotAssignment buildSealiftStackState', {
    h3Index: args.h3Index,
    contextMode: args.contextMode,
    navalCount: args.navalRows.length,
  });
  return {
    h3Index: args.h3Index,
    showSealiftSection: (args.navalRows.length > 0 && args.landOptions.length > 0) || args.hasEmbarkedUnitsInStack,
    contextMode: args.contextMode,
    controlsDisabled: controlsDisabledFor(args.contextMode),
    hasEmbarkedUnitsInStack: args.hasEmbarkedUnitsInStack,
    debarkAllowedAtHex: args.debarkAllowedAtHex,
    navalRows: [...args.navalRows],
    landOptions: [...args.landOptions],
  };
}
