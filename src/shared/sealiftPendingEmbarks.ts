/**
 * Pending embark drafts laid over a stack's sealift rows.
 *
 * Purpose: The stack callout shows slot choices made before Ready without changing the committed snapshot.
 * When to use: The renderer, after it reads a tactical stack state and before it binds the selects.
 * Expected outcome: One pure function, `mergePendingEmbarksIntoSealiftState`.
 * Exceptions: None.
 */

import { compareCodeUnits } from './codeUnitOrder';
import { layoutCargoSlots } from './carrierCargoRules';
import type { EmbarkOrder } from './ipc/ordersTypes';
import type { SealiftCargoSlot, SealiftStackState } from './ipc/sealiftTypes';
import { sealiftRowCargoIds } from './sealiftStackState';

/**
 * Applies pending embark orders to a stack state.
 *
 * Purpose: Shows the slots a carrier will have once the pending orders apply.
 * When to use: After `getTacticalSealiftStackState` returns the committed rows.
 * Expected outcome: With no pending orders, a deep copy of `base`. Otherwise, per row: the committed cargo minus every pending land id, plus this row's pending land ids sorted by `compareCodeUnits`, laid out with `layoutCargoSlots` using the land types in `base.landOptions`. A slot is disabled when the row's controls are or armor covers it. Debark is enabled when the slot holds a unit and the carrier is an air unit or debark is allowed at the hex.
 * Exceptions: None. `base` is not changed.
 */
export function mergePendingEmbarksIntoSealiftState(args: {
  readonly base: SealiftStackState;
  readonly pendingEmbark: readonly EmbarkOrder[];
}): SealiftStackState {
  const { base, pendingEmbark } = args;
  if (pendingEmbark.length === 0) {
    return {
      ...base,
      navalRows: base.navalRows.map((row) => ({ ...row, slots: row.slots.map((slot) => ({ ...slot })) })),
      landOptions: base.landOptions.map((option) => ({ ...option })),
    };
  }
  const landTypeById = new Map(base.landOptions.map((option) => [option.unitId, option.unitType] as const));
  const pendingLand = new Set(pendingEmbark.map((order) => order.unitId));
  const navalRows = base.navalRows.map((row) => {
    const added = pendingEmbark
      .filter((order) => order.navalUnitId === row.navalUnitId)
      .map((order) => order.unitId)
      .sort(compareCodeUnits);
    const cargo = [...sealiftRowCargoIds(row).filter((id) => !pendingLand.has(id)), ...added];
    const positions = layoutCargoSlots({
      carrierUnitType: row.carrierUnitType,
      cargo: cargo.map((unitId) => ({ unitId, unitType: landTypeById.get(unitId) ?? '' })),
    });
    const slots: SealiftCargoSlot[] = positions.map((position) => ({
      unitId: position.unitId,
      coveredByUnitId: position.coveredByUnitId,
      disabled: row.controlsDisabled || position.coveredByUnitId !== null,
      debarkEnabled: position.unitId !== null && (row.carrierUnitType === 'air' || base.debarkAllowedAtHex),
    }));
    return { ...row, slots };
  });
  return { ...base, navalRows, landOptions: base.landOptions.map((option) => ({ ...option })) };
}
