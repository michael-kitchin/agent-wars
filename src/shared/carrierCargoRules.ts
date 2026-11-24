/**
 * How many land units a carrier may hold, where they sit, and whether that cargo can fight.
 *
 * Purpose: Ships and air units share one capacity check and one slot layout so a second copy of the numbers cannot drift.
 * When to use: Embark validation, the stack slot editor, lift planning, prompts, and combat filters.
 * Expected outcome: A ship has 4 slots and an air unit 2. Infantry takes 1 and armor 2; air takes infantry only. Air cargo never fights.
 * Exceptions: None.
 */

import { compareCodeUnits } from './codeUnitOrder';

/**
 * Cargo slots on a ship, and on a naval sub-unit in a battle.
 *
 * Purpose: The ship's whole load, counted in slots.
 * When to use: Capacity checks, the slot editor, ship counts, and prompts.
 * Expected outcome: 4.
 * Exceptions: None.
 */
export const NAVAL_CARGO_SLOTS = 4;

/**
 * Cargo slots on an air unit, and on an air sub-unit in a battle.
 *
 * Purpose: The air unit's whole load, counted in slots. Only infantry may use them.
 * When to use: Capacity checks, the slot editor, and prompts.
 * Expected outcome: 2.
 * Exceptions: None.
 */
export const AIR_CARGO_SLOTS = 2;

/**
 * The most slots any carrier has.
 *
 * Purpose: Bounds a slot index before the carrier is known.
 * When to use: The IPC boundary, which checks the carrier's own count afterwards.
 * Expected outcome: `NAVAL_CARGO_SLOTS`.
 * Exceptions: None.
 */
export const MAX_CARRIER_CARGO_SLOTS = NAVAL_CARGO_SLOTS;

/**
 * Slots one infantry unit takes.
 *
 * Purpose: The cost of the lighter land type.
 * When to use: Slot sums and prompts.
 * Expected outcome: 1.
 * Exceptions: None.
 */
export const INFANTRY_CARGO_SLOT_COST = 1;

/**
 * Slots one armor unit takes.
 *
 * Purpose: The cost of the heavier land type.
 * When to use: Slot sums and prompts.
 * Expected outcome: 2.
 * Exceptions: None.
 */
export const ARMOR_CARGO_SLOT_COST = 2;

/**
 * Infantry an air unit can carry.
 *
 * Purpose: The airlift load, derived from the slots.
 * When to use: Prompts, air operations, and tests that need the count. Callers should prefer `carrierAcceptsLandUnit`.
 * Expected outcome: 2.
 * Exceptions: None.
 */
export const AIRLIFT_INFANTRY_CAPACITY = AIR_CARGO_SLOTS / INFANTRY_CARGO_SLOT_COST;

/**
 * Infantry a ship can carry when it holds nothing else.
 *
 * Purpose: The ship's infantry-only load, derived from the slots.
 * When to use: Posture fit and any estimate that counts infantry per ship.
 * Expected outcome: 4.
 * Exceptions: None.
 */
export const NAVAL_INFANTRY_CAPACITY = NAVAL_CARGO_SLOTS / INFANTRY_CARGO_SLOT_COST;

/**
 * Cargo slots a carrier has.
 *
 * Purpose: One lookup from carrier type to slot count.
 * When to use: Capacity checks and slot rows.
 * Expected outcome: 4 for `naval`, 2 for `air`, and 0 for any other type.
 * Exceptions: None.
 */
export function carrierCargoSlots(carrierUnitType: string): number {
  if (carrierUnitType === 'naval') return NAVAL_CARGO_SLOTS;
  if (carrierUnitType === 'air') return AIR_CARGO_SLOTS;
  return 0;
}

/**
 * Slots one land unit takes.
 *
 * Purpose: One lookup from land type to slot cost.
 * When to use: Capacity checks and slot sums.
 * Expected outcome: 1 for infantry, 2 for armor, and 0 for any other type.
 * Exceptions: None.
 */
export function landCargoSlotCost(landUnitType: string): number {
  if (landUnitType === 'infantry') return INFANTRY_CARGO_SLOT_COST;
  if (landUnitType === 'armor') return ARMOR_CARGO_SLOT_COST;
  return 0;
}

/**
 * Whether a carrier type can hold a land type at all, ignoring room.
 *
 * Purpose: Air takes infantry only; a ship takes infantry or armor.
 * When to use: Before counting slots, and when filtering cargo for a layout.
 * Expected outcome: True for a ship with infantry or armor, and for an air unit with infantry. False otherwise.
 * Exceptions: None.
 */
export function carrierCarriesType(carrierUnitType: string, landUnitType: string): boolean {
  if (carrierUnitType === 'naval') return landUnitType === 'infantry' || landUnitType === 'armor';
  if (carrierUnitType === 'air') return landUnitType === 'infantry';
  return false;
}

/**
 * Slots the given cargo takes.
 *
 * Purpose: The load already aboard, counted in slots.
 * When to use: Capacity checks, ship counts, and the Capacity Used cell.
 * Expected outcome: The sum of `landCargoSlotCost`. Types that are not land add nothing.
 * Exceptions: None.
 */
export function cargoSlotsUsed(aboardUnitTypes: readonly string[]): number {
  return aboardUnitTypes.reduce((sum, unitType) => sum + landCargoSlotCost(unitType), 0);
}

/**
 * One capacity question: can this carrier take one more land unit?
 *
 * Purpose: One parameter object for `carrierAcceptsLandUnit`.
 * When to use: Every embark path.
 * Expected outcome: Names the carrier, the unit to add, and what is already aboard.
 * Exceptions: None.
 */
export type CarrierLoadQuery = {
  /**
   * The carrier's unit type.
   *
   * Contract: `naval` or `air`; any other type holds nothing.
   * When to use: Every query.
   * Expected outcome: A unit type string.
   * Exceptions: None.
   */
  readonly carrierUnitType: string;
  /**
   * The land unit to add.
   *
   * Contract: A unit type string.
   * When to use: Every query.
   * Expected outcome: `infantry` or `armor` for a yes.
   * Exceptions: None.
   */
  readonly landUnitType: string;
  /**
   * Cargo already aboard, not counting the unit to add.
   *
   * Contract: Unit type strings of the units aboard now.
   * When to use: Every query.
   * Expected outcome: Possibly empty.
   * Exceptions: None.
   */
  readonly aboardUnitTypes: readonly string[];
};

/**
 * Whether this carrier can take the land unit given what is already aboard.
 *
 * Purpose: One gate for a ship and an air unit, for units and for battle sub-units.
 * When to use: Before inserting a `unit_transport_assignments` row, or accepting a battle embark.
 * Expected outcome: True when the carrier can carry that type and the slots used plus the unit's cost are at most the carrier's slots.
 * Exceptions: None.
 */
export function carrierAcceptsLandUnit(query: CarrierLoadQuery): boolean {
  if (!carrierCarriesType(query.carrierUnitType, query.landUnitType)) return false;
  const used = cargoSlotsUsed(query.aboardUnitTypes);
  return used + landCargoSlotCost(query.landUnitType) <= carrierCargoSlots(query.carrierUnitType);
}

/**
 * The sentence shown when a carrier has no room.
 *
 * Purpose: One refusal text for the slot editor, battle embark orders, and commanders.
 * When to use: When `carrierAcceptsLandUnit` is false for a carrier that can carry the type.
 * Expected outcome: A sentence naming the carrier's capacity.
 * Exceptions: None.
 */
export function carrierFullReason(carrierUnitType: string): string {
  if (carrierUnitType === 'naval') {
    return `That naval unit has no room for it. A naval unit has ${NAVAL_CARGO_SLOTS} cargo slots: infantry takes ${INFANTRY_CARGO_SLOT_COST} and armor ${ARMOR_CARGO_SLOT_COST}.`;
  }
  if (carrierUnitType === 'air') {
    return `That air unit has no room for it. An air unit carries up to ${AIRLIFT_INFANTRY_CAPACITY} infantry.`;
  }
  return 'That unit cannot carry land units.';
}

/**
 * One land unit that may sit in a carrier.
 *
 * Purpose: The input row for `layoutCargoSlots`.
 * When to use: Building slot rows.
 * Expected outcome: An id and a unit type.
 * Exceptions: None.
 */
export type CargoUnit = {
  /**
   * The land unit's id.
   *
   * Contract: Unique among the cargo.
   * When to use: Ordering and placing the unit.
   * Expected outcome: A strategic unit id or a battle sub-unit id.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * The land unit's type.
   *
   * Contract: A unit type string.
   * When to use: Cost and eligibility.
   * Expected outcome: `infantry` or `armor` for cargo the carrier keeps.
   * Exceptions: None.
   */
  readonly unitType: string;
};

/**
 * One slot of a carrier, as laid out.
 *
 * Purpose: Tells the slot editor which unit sits here, or which armor covers it.
 * When to use: The result of `layoutCargoSlots`.
 * Expected outcome: `unitId` set for a unit that starts here; `coveredByUnitId` set for the second slot of an armor unit; both null when empty.
 * Exceptions: None.
 */
export type CargoSlotPosition = {
  /**
   * The unit that starts in this slot.
   *
   * Contract: Null when the slot is empty or covered.
   * When to use: Showing the slot's unit.
   * Expected outcome: A cargo unit id or null.
   * Exceptions: None.
   */
  readonly unitId: string | null;
  /**
   * The armor unit that also fills this slot.
   *
   * Contract: Set only on the slot after an armor unit's first slot.
   * When to use: Disabling the slot and showing the armor's label.
   * Expected outcome: An armor unit id or null.
   * Exceptions: None.
   */
  readonly coveredByUnitId: string | null;
};

/**
 * Lays cargo out in a carrier's slots, armor first.
 *
 * Purpose: Strategic rows, battle rows, and pending embarks all show one packing.
 * When to use: Building slot rows and checking a slot edit.
 * Expected outcome: `carrierCargoSlots` positions. Armor comes first and then infantry, each by `compareCodeUnits` on the id, placed at the next free slot. Armor also covers the slot after it. A unit that is not carried or does not fit is left out.
 * Exceptions: None. The input is not changed.
 */
export function layoutCargoSlots(query: {
  readonly carrierUnitType: string;
  readonly cargo: readonly CargoUnit[];
}): CargoSlotPosition[] {
  const slotCount = carrierCargoSlots(query.carrierUnitType);
  const positions: CargoSlotPosition[] = Array.from({ length: slotCount }, () => ({ unitId: null, coveredByUnitId: null }));
  const carried = query.cargo.filter((unit) => carrierCarriesType(query.carrierUnitType, unit.unitType));
  const ordered = [
    ...carried.filter((unit) => unit.unitType === 'armor').sort((a, b) => compareCodeUnits(a.unitId, b.unitId)),
    ...carried.filter((unit) => unit.unitType !== 'armor').sort((a, b) => compareCodeUnits(a.unitId, b.unitId)),
  ];
  let next = 0;
  for (const unit of ordered) {
    const cost = landCargoSlotCost(unit.unitType);
    if (next + cost > slotCount) continue;
    positions[next] = { unitId: unit.unitId, coveredByUnitId: null };
    if (cost === ARMOR_CARGO_SLOT_COST) positions[next + 1] = { unitId: null, coveredByUnitId: unit.unitId };
    next += cost;
  }
  return positions;
}

/**
 * Whether embarked land still fights on this carrier and terrain.
 *
 * Purpose: Air cargo is out of every fight. Ship cargo sits out combat only on water.
 * When to use: Ranged fire, melee, and anti-air eligibility.
 * Expected outcome: False for air on any terrain. False for a ship on water. True for a ship on any other terrain.
 * Exceptions: None.
 */
export function landUnitFightsWhileEmbarked(carrierUnitType: string, terrain: string): boolean {
  if (carrierUnitType === 'air') return false;
  if (carrierUnitType === 'naval') return terrain !== 'water';
  return true;
}
