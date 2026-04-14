import type { EmbarkOrder, SealiftStackState } from '../../shared/ipcTypes';

/**
 * Applies renderer-local tactical embark drafts on top of committed tactical sealift stack state.
 *
 * Purpose: Stack callouts show pending slot selections before Ready without mutating the main-process tactical snapshot.
 * When to use: After `getTacticalSealiftStackState` returns base rows from `embarkedOnSubUnitId`, before binding `<select>` values.
 * Expected outcome: Any land sub-unit id mentioned in `pendingEmbark` is removed from all carrier slots, then each pending row is applied to its naval carrier with simple infantry/armor slot fill rules.
 * Exceptions: None.
 */
export function mergePendingTacticalEmbarkOrdersIntoSealiftState(
  base: SealiftStackState,
  pendingEmbark: readonly EmbarkOrder[]
): SealiftStackState {
  if (pendingEmbark.length === 0) {
    return { ...base, navalRows: base.navalRows.map((r) => ({ ...r })) };
  }
  const landType = new Map(base.landOptions.map((o) => [o.unitId, o.unitType] as const));
  const rows = base.navalRows.map((r) => ({ ...r }));
  const pendingLand = new Set(pendingEmbark.map((e) => e.unitId));
  for (const row of rows) {
    if (row.slot1UnitId && pendingLand.has(row.slot1UnitId)) row.slot1UnitId = null;
    if (row.slot2UnitId && pendingLand.has(row.slot2UnitId)) row.slot2UnitId = null;
  }
  const sorted = [...pendingEmbark].sort((a, b) => a.navalUnitId.localeCompare(b.navalUnitId) || a.unitId.localeCompare(b.unitId));
  for (const e of sorted) {
    const row = rows.find((r) => r.navalUnitId === e.navalUnitId);
    if (!row) continue;
    const t = landType.get(e.unitId);
    if (t === 'armor') {
      row.slot1UnitId = e.unitId;
      row.slot2UnitId = null;
      continue;
    }
    if (!row.slot1UnitId) row.slot1UnitId = e.unitId;
    else if (!row.slot2UnitId && !row.slot2Disabled) row.slot2UnitId = e.unitId;
    else row.slot1UnitId = e.unitId;
  }
  return { ...base, navalRows: rows };
}

/**
 * Updates tactical embark draft rows after a sealift `<select>` change (tactical sub-unit ids).
 *
 * Purpose: Mirrors strategic `updateSealiftSlot` dedupe semantics: reassigned land clears its prior pending carrier; empty selection drops pending rows for the previous occupant only.
 * When to use: Tactical stack callout sealift controls; pass the prior `<select>` value as `previousLandId` (may be empty).
 * Expected outcome: Pending list stays aligned with the latest slot edit until tactical Ready commits it.
 * Exceptions: None.
 */
export function updatePendingEmbarkAfterTacticalSealiftSelect(args: {
  pending: EmbarkOrder[];
  navalUnitId: string;
  newLandId: string;
  previousLandId: string;
}): EmbarkOrder[] {
  let next = args.pending.filter((p) => p.unitId !== args.previousLandId);
  if (args.newLandId.trim().length > 0) {
    next = next.filter((p) => p.unitId !== args.newLandId);
    next.push({ unitId: args.newLandId, navalUnitId: args.navalUnitId });
  }
  return next;
}
