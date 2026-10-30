/**
 * Moves embarked land cargo onto its naval carrier's hex.
 *
 * Purpose: Embark, ferry, march projection, and plan-state projection share one snap from cargo to carrier.
 * When to use: After a phase has updated carrier or cargo rows and before the snapshot is returned.
 * Expected outcome: A new array. A row whose carrier exists and is naval gets that carrier's `h3Index`. Every other row is the same object. Carriers are read from the input, and the input is not mutated.
 * Exceptions: None.
 */

import { tacticalLogQuery } from './tacticalLogging';

/**
 * Returns rows with embarked cargo placed on a naval carrier's hex.
 *
 * Purpose: One projection replaces the copied cargo loops in tactical order application.
 * When to use: On a tactical sub-unit list or a plan-state unit list after movement, embark, or ferry.
 * Expected outcome: Cargo aboard a naval carrier shares the carrier hex from the input list. Missing and non-naval carriers leave the row unchanged.
 * Exceptions: None.
 */
export function syncEmbarkedLandToNavalHex<
  T extends {
    readonly id: string;
    readonly unitType: string;
    readonly h3Index: string;
    readonly embarkedOnSubUnitId?: string | null;
  },
>(units: readonly T[]): T[] {
  tacticalLogQuery('syncEmbarkedLandToNavalHex', { unitCount: units.length });
  const byId = new Map(units.map((u) => [u.id, u] as const));
  return units.map((u) => {
    if (!u.embarkedOnSubUnitId) return u;
    const carrier = byId.get(u.embarkedOnSubUnitId);
    if (!carrier || carrier.unitType !== 'naval') return u;
    return { ...u, h3Index: carrier.h3Index };
  });
}
