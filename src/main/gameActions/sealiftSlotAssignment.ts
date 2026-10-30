import { logDebug, logTrace } from '../logger';
import type { SealiftContextMode, SealiftLandUnitOption, SealiftNavalRow, SealiftStackState } from '../../shared/ipc/sealiftTypes';

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

/**
 * Reports whether sealift controls are disabled for a stack context.
 *
 * Purpose: Open water and a coast without a port disable embark controls. A port does not.
 * When to use: Naval rows and the stack state share this test.
 * Expected outcome: True for `water` and `coastal_no_port`. False otherwise.
 * Exceptions: None.
 */
function controlsDisabledFor(contextMode: SealiftContextMode): boolean {
  return contextMode === 'water' || contextMode === 'coastal_no_port';
}

/**
 * Builds one sealift row per naval unit.
 *
 * Purpose: Strategic and tactical stacks share slot occupancy, the armor lock on slot 2, and the debark flags.
 * When to use: After slots are normalized for the naval units at a hex.
 * Expected outcome: One row per naval id. Slot 2 is disabled when controls are disabled or slot 1 holds armor. A debark flag is true only when debark is allowed and that slot is occupied.
 * Exceptions: None.
 */
export function buildSealiftNavalRows(args: {
  readonly navalIds: readonly string[];
  readonly slotsByNavalId: ReadonlyMap<string, SealiftSlotPair>;
  readonly landTypeById: ReadonlyMap<string, 'infantry' | 'armor'>;
  readonly contextMode: SealiftContextMode;
  readonly debarkAllowed: boolean;
}): SealiftNavalRow[] {
  logTrace('sealiftSlotAssignment buildSealiftNavalRows', {
    navalCount: args.navalIds.length,
    contextMode: args.contextMode,
  });
  const controlsDisabled = controlsDisabledFor(args.contextMode);
  return args.navalIds.map((navalUnitId) => {
    const slots = args.slotsByNavalId.get(navalUnitId) ?? { slot1UnitId: null, slot2UnitId: null };
    const slot1Armor = !!slots.slot1UnitId && args.landTypeById.get(slots.slot1UnitId) === 'armor';
    return {
      navalUnitId,
      slot1UnitId: slots.slot1UnitId,
      slot2UnitId: slots.slot2UnitId,
      slot2Disabled: controlsDisabled || slot1Armor,
      controlsDisabled,
      debarkSlot1Enabled: args.debarkAllowed && !!slots.slot1UnitId,
      debarkSlot2Enabled: args.debarkAllowed && !!slots.slot2UnitId,
    };
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
