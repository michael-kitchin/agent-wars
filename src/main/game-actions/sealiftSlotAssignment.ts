import { logDebug } from '../logger';

/**
 * One naval carrier's two land-unit slots.
 *
 * Purpose: Shared occupancy pair used by strategic DB sealift and tactical snapshot sealift.
 * When to use: Maps keyed by naval unit id and slot-normalization helpers.
 * Expected outcome: `slot1UnitId` / `slot2UnitId` are land unit ids or null.
 * Exceptions: None.
 */
export type SealiftSlotPair = { slot1UnitId: string | null; slot2UnitId: string | null };

/**
 * One land unit currently assigned to a naval carrier for slot reconstruction.
 *
 * Purpose: Lets assignment builders accept strategic DB rows or tactical embark pairs without sharing table types.
 * When to use: Input to `buildSealiftSlotsByNavalId`.
 * Expected outcome: `landUnitType` is infantry or armor; ids are the land and naval unit identifiers.
 * Exceptions: None.
 */
export type SealiftSlotAssignmentRow = {
  landUnitId: string;
  navalUnitId: string;
  landUnitType: 'infantry' | 'armor';
};

/**
 * Fills slot1/slot2 per naval id from assignment rows.
 *
 * Purpose: Armor occupies slot 1 alone; otherwise up to two infantry in lexicographic id order.
 * When to use: After gathering embark/assignment rows for the naval units at a hex.
 * Expected outcome: Every naval id has a pair; unused carriers have both slots null.
 * Exceptions: None.
 */
export function buildSealiftSlotsByNavalId(
  navalIds: readonly string[],
  assignments: readonly SealiftSlotAssignmentRow[]
): Map<string, SealiftSlotPair> {
  logDebug('buildSealiftSlotsByNavalId', { navalCount: navalIds.length, assignmentCount: assignments.length });
  const slotsByNavalId = new Map<string, SealiftSlotPair>();
  for (const navalUnitId of navalIds) {
    slotsByNavalId.set(navalUnitId, { slot1UnitId: null, slot2UnitId: null });
  }
  const grouped = new Map<string, SealiftSlotAssignmentRow[]>();
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
 * Clears duplicate or illegal slot occupancy in place.
 *
 * Purpose: At most one slot reference per land id; armor occupies slot 1 only; empty slot 1 promotes slot 2.
 * When to use: After building raw slots from assignments or after a slot-editor mutation.
 * Expected outcome: Mutates `slotsByNavalId`; callers must pass the same map they will read afterward.
 * Exceptions: None.
 */
export function normalizeSealiftSlots(
  navalIds: readonly string[],
  slotsByNavalId: Map<string, SealiftSlotPair>,
  landTypeById: ReadonlyMap<string, 'infantry' | 'armor'>
): void {
  logDebug('normalizeSealiftSlots', { navalCount: navalIds.length });
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
